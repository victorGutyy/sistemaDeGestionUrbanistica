import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { validarCuentaDestino } from '../abonos/validar-pago.js';
import { registrarAuditoria } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { formatearCOP } from '../common/formato.util.js';
import { exigirFechaAbiertaEnTx } from '../cierres-caja/fecha-abierta.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { calcularValorPagado } from './calculo-pago.js';
import { ActualizarCargoNominaDto, CrearCargoNominaDto } from './dto/cargo-nomina.dto.js';
import { CrearPagoNominaDto } from './dto/crear-pago-nomina.dto.js';
import type { LiquidarQuincenaDto } from './dto/liquidar-quincena.dto.js';
import { liquidarQuincenaEnTx, prepararLiquidacion } from './liquidar-quincena.js';

@Injectable()
export class NominaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  async crearPago(dto: CrearPagoNominaDto, usuario: UsuarioAutenticado) {
    const trabajador = await this.prisma.trabajador.findUnique({ where: { id: dto.trabajadorId } });
    if (!trabajador) {
      throw new NotFoundException(`No existe el trabajador ${dto.trabajadorId}`);
    }

    // El medio y la cuenta de salida quedan registrados: el cierre de caja necesita saber cuánto salió en efectivo.
    await this.configuracion.exigirMedioPagoActivo(dto.medioPago);
    const cuentaId = await validarCuentaDestino(this.prisma, dto.medioPago, dto.cuentaId, 'de donde salió el dinero');

    const novedades = (dto.novedades ?? []).map((novedad) => ({
      tipo: novedad.tipo,
      valor: new Prisma.Decimal(novedad.valor),
      descripcion: novedad.descripcion,
    }));

    const valorPagado = calcularValorPagado(trabajador.salarioBase, novedades);

    const fechaPago = parsearFechaLocal(dto.fechaPago);
    return this.prisma.$transaction(async (tx) => {
      // Un día que ya pertenece a un cierre de caja cerrado o aprobado no admite pagos nuevos.
      await exigirFechaAbiertaEnTx(tx, fechaPago);
      const pago = await tx.pagoNomina.create({
        data: {
          trabajadorId: dto.trabajadorId,
          periodoInicio: parsearFechaLocal(dto.periodoInicio),
          periodoFin: parsearFechaLocal(dto.periodoFin),
          fechaPago,
          salarioBase: trabajador.salarioBase,
          valorPagado,
          medioPago: dto.medioPago,
          cuentaId,
          novedades: { create: novedades },
        },
        include: { novedades: true, trabajador: true },
      });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'NOMINA_REGISTRAR_PAGO',
        entidad: 'NOMINA',
        entidadId: pago.id,
        resumen: `Registró un pago de nómina de ${formatearCOP(valorPagado)} a ${trabajador.nombre}`,
        despues: {
          trabajadorId: dto.trabajadorId,
          periodoInicio: dto.periodoInicio,
          periodoFin: dto.periodoFin,
          fechaPago: dto.fechaPago,
          salarioBase: trabajador.salarioBase,
          valorPagado,
          medioPago: dto.medioPago,
          cuentaId,
          novedades: novedades.map((novedad) => ({ tipo: novedad.tipo, valor: novedad.valor, descripcion: novedad.descripcion })),
        },
      });
      return pago;
    });
  }

  // CC-05: los pagos de una obra durante una quincena, en una sola operación (o se guardan todos o ninguno).
  async liquidarQuincena(dto: LiquidarQuincenaDto, usuario: UsuarioAutenticado) {
    // El medio y la cuenta de salida quedan registrados: el cierre de caja necesita saber cuánto salió en efectivo.
    await this.configuracion.exigirMedioPagoActivo(dto.medioPago);
    const cuentaId = await validarCuentaDestino(this.prisma, dto.medioPago, dto.cuentaId, 'de donde salió el dinero');
    const liquidacion = prepararLiquidacion(dto, cuentaId);
    return this.prisma.$transaction((tx) => liquidarQuincenaEnTx(tx, liquidacion, usuario));
  }

  // ---------- Cargos de nómina (CC-05, RF-PER-19) ----------
  // Los administran el gerente y el administrador (permiso de nómina): el administrador es quien liquida la nómina y debe
  // poder ajustar los valores sin esperar al gerente. Se desactivan en vez de borrarse. El valor día es una sugerencia
  // para el trabajador; los pagos ya hechos no cambian porque guardan su propia foto del valor.

  // Para los formularios del trabajador y la liquidación solo hacen falta los activos; la pantalla de administración pide todos.
  listarCargos(todos = false) {
    return this.prisma.cargoNomina.findMany({ where: todos ? undefined : { activo: true }, orderBy: { nombre: 'asc' } });
  }

  async crearCargo(dto: CrearCargoNominaDto, usuario: UsuarioAutenticado) {
    const nombre = dto.nombre.trim();
    const valorDia = this.exigirValorDia(dto.valorDia);
    await this.exigirNombreDeCargoLibre(nombre);
    return this.prisma.$transaction(async (tx) => {
      const cargo = await tx.cargoNomina.create({ data: { nombre, valorDia } });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'CONFIGURACION_CARGO_NOMINA',
        entidad: 'CONFIGURACION',
        entidadId: cargo.id,
        resumen: `Creó el cargo de nómina "${cargo.nombre}" con valor día sugerido de ${formatearCOP(cargo.valorDia)}`,
        despues: { nombre: cargo.nombre, valorDia: cargo.valorDia, activo: cargo.activo },
      });
      return cargo;
    });
  }

  async actualizarCargo(id: string, dto: ActualizarCargoNominaDto, usuario: UsuarioAutenticado) {
    const cargo = await this.prisma.cargoNomina.findUnique({ where: { id } });
    if (!cargo) {
      throw new NotFoundException(`No existe el cargo de nómina ${id}`);
    }
    const nombre = dto.nombre?.trim();
    if (nombre !== undefined && nombre !== cargo.nombre) {
      await this.exigirNombreDeCargoLibre(nombre, id);
    }
    const valorDia = dto.valorDia === undefined ? undefined : this.exigirValorDia(dto.valorDia);
    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.cargoNomina.update({ where: { id }, data: { nombre, valorDia, activo: dto.activo } });
      const cambios: string[] = [];
      if (nombre !== undefined && nombre !== cargo.nombre) cambios.push('el nombre');
      if (valorDia !== undefined && !valorDia.equals(cargo.valorDia)) cambios.push(`el valor día sugerido (de ${formatearCOP(cargo.valorDia)} a ${formatearCOP(actualizado.valorDia)})`);
      if (dto.activo !== undefined && dto.activo !== cargo.activo) cambios.push(actualizado.activo ? 'lo activó' : 'lo desactivó');
      await registrarAuditoria(tx, {
        usuario,
        accion: 'CONFIGURACION_CARGO_NOMINA',
        entidad: 'CONFIGURACION',
        entidadId: id,
        resumen: `Cambió el cargo de nómina "${cargo.nombre}"${cambios.length ? `: ${cambios.join(', ')}` : ''}`,
        antes: { nombre: cargo.nombre, valorDia: cargo.valorDia, activo: cargo.activo },
        despues: { nombre: actualizado.nombre, valorDia: actualizado.valorDia, activo: actualizado.activo },
      });
      return actualizado;
    });
  }

  private exigirValorDia(texto: string): Prisma.Decimal {
    const valor = new Prisma.Decimal(texto);
    if (valor.lessThanOrEqualTo(0)) {
      throw new BadRequestException('El valor día debe ser mayor a cero');
    }
    return valor;
  }

  private async exigirNombreDeCargoLibre(nombre: string, ignorarId?: string) {
    const existente = await this.prisma.cargoNomina.findFirst({ where: { nombre: { equals: nombre, mode: 'insensitive' } } });
    if (existente && existente.id !== ignorarId) {
      throw new ConflictException(`Ya existe el cargo "${existente.nombre}"`);
    }
  }

  listarPagos(filtros: { trabajadorId?: string; proyectoId?: string; periodoInicio?: string; periodoFin?: string } = {}) {
    const formato = /^\d{4}-\d{2}-\d{2}$/;
    for (const [campo, valor] of [['periodoInicio', filtros.periodoInicio], ['periodoFin', filtros.periodoFin]] as const) {
      if (valor !== undefined && !formato.test(valor)) throw new BadRequestException(`${campo} debe tener el formato YYYY-MM-DD`);
    }
    return this.prisma.pagoNomina.findMany({
      where: {
        trabajadorId: filtros.trabajadorId,
        proyectoId: filtros.proyectoId,
        periodoInicio: filtros.periodoInicio ? parsearFechaLocal(filtros.periodoInicio) : undefined,
        periodoFin: filtros.periodoFin ? parsearFechaLocal(filtros.periodoFin) : undefined,
      },
      include: { novedades: true, trabajador: true, proyecto: { select: { id: true, nombre: true } } },
      orderBy: { fechaPago: 'desc' },
    });
  }
}
