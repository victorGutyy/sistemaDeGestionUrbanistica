import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { registrarAuditoria, soloCampos } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoTrabajador } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ActualizarElementoEppDto,
  AnularEntregaEppDto,
  CrearElementoEppDto,
  ListarEntregasEppQueryDto,
  ListarReposicionesQueryDto,
  RegistrarEntregaEppDto,
} from './dto/epp.dto.js';
import { calcularProximaReposicion, estadosDeReposicion, inicioDelDia, type EstadoReposicion } from './epp.js';

const CAMPOS_ELEMENTO = ['nombre', 'vidaUtilDias', 'activo'] as const;
const LIMITE_ENTREGAS = 500;

const ETIQUETA_MOTIVO: Record<string, string> = {
  DOTACION_INICIAL: 'dotación inicial',
  REPOSICION_VIDA_UTIL: 'reposición por vida útil',
  REPOSICION_DANO: 'reposición por daño o deterioro',
  PERDIDA: 'pérdida',
  CAMBIO_CARGO: 'cambio de cargo',
};

// Elementos de protección personal (RF-SST-12, 13 y 14): el catálogo con su vida útil, las entregas a cada trabajador y
// cuándo toca reponer. Las entregas no se editan ni se borran: un error se corrige anulándola con motivo.
@Injectable()
export class EppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  // ---------- Catálogo (RF-SST-12) ----------

  listarElementos(incluirInactivos = false) {
    return this.prisma.elementoEpp.findMany({ where: incluirInactivos ? {} : { activo: true }, orderBy: { nombre: 'asc' } });
  }

  async crearElemento(dto: CrearElementoEppDto, usuario: UsuarioAutenticado) {
    const nombre = dto.nombre.trim();
    await this.exigirNombreLibre(nombre);
    return this.prisma.$transaction(async (tx) => {
      const elemento = await tx.elementoEpp.create({ data: { nombre, vidaUtilDias: dto.vidaUtilDias } });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'ELEMENTO_EPP_CREAR',
        entidad: 'ELEMENTO_EPP',
        entidadId: elemento.id,
        resumen: `Creó el elemento de protección "${elemento.nombre}" con vida útil de ${elemento.vidaUtilDias} días`,
        despues: soloCampos(elemento, CAMPOS_ELEMENTO),
      });
      return elemento;
    });
  }

  // Cambiar la vida útil NO altera las entregas ya hechas: cada una guardó la suya el día que se entregó.
  async actualizarElemento(id: string, dto: ActualizarElementoEppDto, usuario: UsuarioAutenticado) {
    const actual = await this.prisma.elementoEpp.findUnique({ where: { id } });
    if (!actual) {
      throw new NotFoundException(`No existe el elemento ${id}`);
    }
    const nombre = dto.nombre?.trim();
    if (nombre !== undefined && nombre !== actual.nombre) {
      await this.exigirNombreLibre(nombre, id);
    }
    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.elementoEpp.update({ where: { id }, data: { nombre, vidaUtilDias: dto.vidaUtilDias, activo: dto.activo } });
      const cambios = [
        dto.vidaUtilDias !== undefined && dto.vidaUtilDias !== actual.vidaUtilDias ? `vida útil de ${actual.vidaUtilDias} a ${actualizado.vidaUtilDias} días` : null,
        dto.activo !== undefined && dto.activo !== actual.activo ? (actualizado.activo ? 'lo activó' : 'lo desactivó') : null,
        nombre !== undefined && nombre !== actual.nombre ? `nombre a "${actualizado.nombre}"` : null,
      ].filter(Boolean);
      await registrarAuditoria(tx, {
        usuario,
        accion: 'ELEMENTO_EPP_EDITAR',
        entidad: 'ELEMENTO_EPP',
        entidadId: id,
        resumen: `Cambió el elemento de protección "${actual.nombre}"${cambios.length > 0 ? `: ${cambios.join(', ')}` : ''}`,
        antes: soloCampos(actual, CAMPOS_ELEMENTO),
        despues: soloCampos(actualizado, CAMPOS_ELEMENTO),
      });
      return actualizado;
    });
  }

  private async exigirNombreLibre(nombre: string, ignorarId?: string) {
    const existente = await this.prisma.elementoEpp.findFirst({ where: { nombre: { equals: nombre, mode: 'insensitive' } } });
    if (existente && existente.id !== ignorarId) {
      throw new ConflictException(`Ya existe el elemento "${existente.nombre}"`);
    }
  }

  // ---------- Entregas (RF-SST-13) ----------

  async registrarEntrega(dto: RegistrarEntregaEppDto, usuario: UsuarioAutenticado, hoy = new Date()) {
    const trabajador = await this.prisma.trabajador.findUnique({ where: { id: dto.trabajadorId } });
    if (!trabajador) {
      throw new NotFoundException(`No existe el trabajador ${dto.trabajadorId}`);
    }
    if (trabajador.estado === EstadoTrabajador.INACTIVO) {
      throw new BadRequestException('El trabajador está retirado: no se le pueden registrar entregas');
    }
    const elemento = await this.prisma.elementoEpp.findUnique({ where: { id: dto.elementoId } });
    if (!elemento) {
      throw new NotFoundException(`No existe el elemento ${dto.elementoId}`);
    }
    if (!elemento.activo) {
      throw new BadRequestException(`El elemento "${elemento.nombre}" está desactivado: elige otro`);
    }

    const fecha = parsearFechaLocal(dto.fecha);
    if (Number.isNaN(fecha.getTime())) {
      throw new BadRequestException('La fecha de entrega no es válida');
    }
    if (fecha.getTime() > inicioDelDia(hoy).getTime()) {
      throw new BadRequestException('La fecha de entrega no puede ser futura');
    }
    if (fecha.getTime() < inicioDelDia(trabajador.fechaIngreso).getTime()) {
      throw new BadRequestException('La entrega no puede ser anterior a la fecha de ingreso del trabajador');
    }

    // La vida útil y la reposición quedan como foto del día de la entrega.
    const vidaUtilDias = elemento.vidaUtilDias;
    const proximaReposicion = calcularProximaReposicion(fecha, vidaUtilDias);
    const entregadoPor = dto.entregadoPor?.trim() || usuario.nombre;

    return this.prisma.$transaction(async (tx) => {
      const entrega = await tx.entregaEpp.create({
        data: {
          trabajadorId: trabajador.id,
          elementoId: elemento.id,
          fecha,
          cantidad: dto.cantidad,
          tallaReferencia: dto.tallaReferencia?.trim() || null,
          motivo: dto.motivo,
          entregadoPor,
          registradaPorId: usuario.id,
          firmoRecibido: dto.firmoRecibido ?? false,
          vidaUtilDias,
          proximaReposicion,
        },
        include: { trabajador: { select: { nombre: true, documento: true } }, elemento: { select: { nombre: true } } },
      });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'ENTREGA_EPP_REGISTRAR',
        entidad: 'ENTREGA_EPP',
        entidadId: entrega.id,
        resumen: `Registró la entrega de ${entrega.cantidad} × ${elemento.nombre} a ${trabajador.nombre} (${ETIQUETA_MOTIVO[dto.motivo]})`,
        despues: {
          trabajadorId: trabajador.id,
          elementoId: elemento.id,
          elemento: elemento.nombre,
          fecha: entrega.fecha,
          cantidad: entrega.cantidad,
          motivo: entrega.motivo,
          entregadoPor,
          firmoRecibido: entrega.firmoRecibido,
          vidaUtilDias,
          proximaReposicion,
        },
      });
      return entrega;
    });
  }

  // Un error en una entrega no se edita: se anula con motivo y se registra la correcta. La base de datos lo exige.
  async anularEntrega(id: string, dto: AnularEntregaEppDto, usuario: UsuarioAutenticado) {
    const entrega = await this.buscarEntregaSimple(id);
    if (entrega.anulada) {
      throw new ConflictException('La entrega ya está anulada');
    }
    return this.prisma.$transaction(async (tx) => {
      const anulada = await tx.entregaEpp.update({
        where: { id },
        data: { anulada: true, anuladaEn: new Date(), anuladaPorId: usuario.id, motivoAnulacion: dto.motivo.trim() },
        include: { trabajador: { select: { nombre: true, documento: true } }, elemento: { select: { nombre: true } } },
      });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'ENTREGA_EPP_ANULAR',
        entidad: 'ENTREGA_EPP',
        entidadId: id,
        resumen: `Anuló la entrega de ${entrega.cantidad} × ${anulada.elemento.nombre} a ${anulada.trabajador.nombre}: ${anulada.motivoAnulacion}`,
        antes: { anulada: false },
        despues: { anulada: true, motivoAnulacion: anulada.motivoAnulacion },
      });
      return anulada;
    });
  }

  // El trabajador firma el recibido después de la entrega (la base solo permite pasar de "no firmó" a "firmó").
  async marcarFirma(id: string, usuario: UsuarioAutenticado) {
    const entrega = await this.buscarEntregaSimple(id);
    if (entrega.anulada) {
      throw new BadRequestException('La entrega está anulada');
    }
    if (entrega.firmoRecibido) {
      return entrega;
    }
    return this.prisma.$transaction(async (tx) => {
      const firmada = await tx.entregaEpp.update({ where: { id }, data: { firmoRecibido: true } });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'ENTREGA_EPP_FIRMA',
        entidad: 'ENTREGA_EPP',
        entidadId: id,
        resumen: 'Marcó que el trabajador firmó el recibido de la entrega',
        antes: { firmoRecibido: false },
        despues: { firmoRecibido: true },
      });
      return firmada;
    });
  }

  listarEntregas(filtro: ListarEntregasEppQueryDto) {
    const fecha: Prisma.DateTimeFilter = {};
    if (filtro.desde) fecha.gte = parsearFechaLocal(filtro.desde);
    if (filtro.hasta) fecha.lte = parsearFechaLocal(filtro.hasta);
    return this.prisma.entregaEpp.findMany({
      where: {
        trabajadorId: filtro.trabajadorId,
        elementoId: filtro.elementoId,
        ...(Object.keys(fecha).length > 0 ? { fecha } : {}),
        ...(filtro.incluirAnuladas === 'true' ? {} : { anulada: false }),
      },
      orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
      take: LIMITE_ENTREGAS,
      include: {
        trabajador: { select: { id: true, nombre: true, documento: true } },
        elemento: { select: { id: true, nombre: true } },
        _count: { select: { documentos: true } },
      },
    });
  }

  async buscarEntrega(id: string) {
    const entrega = await this.prisma.entregaEpp.findUnique({
      where: { id },
      include: {
        trabajador: { select: { id: true, nombre: true, documento: true } },
        elemento: { select: { id: true, nombre: true } },
        registradaPor: { select: { nombre: true } },
        anuladaPor: { select: { nombre: true } },
        documentos: { orderBy: { createdAt: 'desc' }, include: { subidoPor: { select: { nombre: true } } } },
      },
    });
    if (!entrega) {
      throw new NotFoundException(`No existe la entrega ${id}`);
    }
    return entrega;
  }

  private async buscarEntregaSimple(id: string) {
    const entrega = await this.prisma.entregaEpp.findUnique({ where: { id } });
    if (!entrega) {
      throw new NotFoundException(`No existe la entrega ${id}`);
    }
    return entrega;
  }

  // ---------- Reposición (RF-SST-14) ----------

  // La última entrega de cada trabajador activo y elemento activo, con su estado. Sin filtro de estado, solo lo que pide
  // atención (por reponer y vencidas). La anticipación es el parámetro "días de alerta SST" de la configuración.
  async reposiciones(filtro: ListarReposicionesQueryDto = {}, hoy = new Date()) {
    const [empresa, entregas] = await Promise.all([
      this.configuracion.obtenerEmpresa(),
      this.prisma.entregaEpp.findMany({
        where: {
          anulada: false,
          trabajador: { estado: EstadoTrabajador.ACTIVO, ...(filtro.trabajadorId ? { id: filtro.trabajadorId } : {}) },
          elemento: { activo: true },
        },
        include: { trabajador: { select: { id: true, nombre: true, documento: true } }, elemento: { select: { id: true, nombre: true } } },
      }),
    ]);

    const estados = estadosDeReposicion(entregas, inicioDelDia(hoy), empresa.diasAlertaSst);
    const pedido = filtro.estado ?? 'ATENCION';
    const visibles = estados.filter((e) => (pedido === 'ATENCION' ? e.estado !== 'VIGENTE' : pedido === 'TODOS' || e.estado === (pedido as EstadoReposicion)));

    return {
      diasAlerta: empresa.diasAlertaSst,
      resumen: {
        vencidos: estados.filter((e) => e.estado === 'VENCIDO').length,
        porReponer: estados.filter((e) => e.estado === 'POR_REPONER').length,
        vigentes: estados.filter((e) => e.estado === 'VIGENTE').length,
      },
      reposiciones: visibles.map((e) => ({
        entregaId: e.id,
        trabajador: e.trabajador,
        elemento: e.elemento,
        ultimaEntrega: e.fecha,
        proximaReposicion: e.proximaReposicion,
        diasRestantes: e.diasRestantes,
        estado: e.estado,
      })),
    };
  }
}
