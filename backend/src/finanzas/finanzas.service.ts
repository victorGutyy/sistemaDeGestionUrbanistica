import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { registrarAuditoria } from '../auditoria/auditoria.js';
import { formatearCOP } from '../common/formato.util.js';
import { exigirAlcanceTotal, exigirProyecto, filtroMovimiento, filtroProyecto, filtroVenta, tieneAlcanceTotal } from '../auth/alcance.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { exigirFechaNoFutura, validarCuentaDestino } from '../abonos/validar-pago.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { CONTENT_TYPE_DOCUMENTO, detectarTipoDocumento, type TipoDocumento } from '../common/tipo-archivo.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoAbono, EstadoMovimiento, EstadoVenta, TipoMovimiento } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { diaDeColumnaDate } from '../cierres-caja/periodo.js';
import { calcularConsolidado, fechaEnRango } from './consolidado.js';
import { crearMovimientoEnTx } from './crear-movimiento-tx.js';
import { AnularMovimientoDto } from './dto/anular-movimiento.dto.js';
import { CrearMovimientoDto } from './dto/crear-movimiento.dto.js';
import { FiltroPeriodoDto } from './dto/filtro-periodo.dto.js';
import { ListarMovimientosQueryDto } from './dto/listar-movimientos-query.dto.js';
import { resumirFinanzasProyecto, type FilaFinanza } from './proyecto-finanzas.js';

function construirRangoFechas(filtro: FiltroPeriodoDto): Prisma.DateTimeFilter | undefined {
  if (!filtro.desde && !filtro.hasta) {
    return undefined;
  }
  return {
    gte: filtro.desde ? parsearFechaLocal(filtro.desde) : undefined,
    lte: filtro.hasta ? parsearFechaLocal(filtro.hasta) : undefined,
  };
}

// Lo que se necesita para mostrar un movimiento, sin exponer la ruta interna del archivo del soporte.
const INCLUIR_MOVIMIENTO = {
  proyecto: { select: { id: true, nombre: true } },
  categoriaGasto: { select: { id: true, nombre: true } },
  categoriaIngreso: { select: { id: true, nombre: true } },
  cuenta: { select: { id: true, banco: true, alias: true } },
  equipo: { select: { id: true, nombre: true, placaSerie: true } },
  registradoPor: { select: { nombre: true } },
  anuladoPor: { select: { nombre: true } },
} satisfies Prisma.MovimientoFinancieroInclude;

type MovimientoConRelaciones = Prisma.MovimientoFinancieroGetPayload<{ include: typeof INCLUIR_MOVIMIENTO }>;

function presentarMovimiento(movimiento: MovimientoConRelaciones) {
  const { soporteRuta, categoriaGasto, categoriaIngreso, periodoDesde, periodoHasta, ...resto } = movimiento;
  return {
    ...resto,
    // Período alquilado como día calendario "aaaa-mm-dd".
    periodoDesde: periodoDesde ? diaDeColumnaDate(periodoDesde) : null,
    periodoHasta: periodoHasta ? diaDeColumnaDate(periodoHasta) : null,
    categoria: categoriaGasto ?? categoriaIngreso,
    tieneSoporte: soporteRuta !== null,
  };
}

@Injectable()
export class FinanzasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  // Registra un egreso o un ingreso (RF-EGR-01, 02, 03 y 09). Un egreso exige soporte adjunto o el motivo de
  // por qué no lo hay; el soporte se valida por su contenido y no por lo que declare el navegador.
  async crear(dto: CrearMovimientoDto, usuario: UsuarioAutenticado, soporte?: Express.Multer.File) {
    // Un movimiento general (sin proyecto) no es de ningún proyecto: solo con alcance total.
    if (dto.proyectoId) {
      exigirProyecto(usuario, dto.proyectoId, `No existe el proyecto ${dto.proyectoId}`);
      const proyecto = await this.prisma.proyecto.findUnique({ where: { id: dto.proyectoId }, select: { id: true } });
      if (!proyecto) {
        throw new NotFoundException(`No existe el proyecto ${dto.proyectoId}`);
      }
    } else {
      exigirAlcanceTotal(usuario);
    }

    const esGasto = dto.tipo === TipoMovimiento.GASTO;
    await this.configuracion.exigirMedioPagoActivo(dto.medioPago);
    const cuentaId = await validarCuentaDestino(
      this.prisma,
      dto.medioPago,
      dto.cuentaId,
      esGasto ? 'de donde salió el dinero' : 'donde entró el dinero',
    );
    const fecha = parsearFechaLocal(dto.fecha);
    exigirFechaNoFutura(fecha);

    let tipoSoporte: TipoDocumento | null = null;
    if (soporte) {
      tipoSoporte = detectarTipoDocumento(soporte.buffer);
      if (!tipoSoporte) {
        throw new BadRequestException('El soporte debe ser una imagen (JPG/PNG) o un PDF');
      }
    }
    if (esGasto && !soporte && !dto.motivoSinSoporte?.trim()) {
      throw new BadRequestException('Adjunta el soporte del egreso o explica por qué no hay soporte');
    }

    let soporteRuta: string | undefined;
    if (soporte && tipoSoporte) {
      // El nombre en disco lo fija el servidor según el tipo real; el original no se usa.
      const { rutaRelativa } = await this.storage.guardar('finanzas', `soporte.${tipoSoporte}`, soporte.buffer);
      soporteRuta = rutaRelativa;
    }

    const creado = await this.prisma.$transaction((tx) =>
      crearMovimientoEnTx(tx, {
        tipo: dto.tipo,
        fecha,
        valor: new Prisma.Decimal(dto.valor),
        descripcion: dto.descripcion,
        proyectoId: dto.proyectoId,
        categoriaId: dto.categoriaId,
        medioPago: dto.medioPago,
        cuentaId,
        referencia: dto.referencia,
        terceroNombre: dto.terceroNombre,
        terceroDocumento: dto.terceroDocumento,
        numeroDocumento: dto.numeroDocumento,
        soporteRuta,
        motivoSinSoporte: dto.motivoSinSoporte,
        equipoId: dto.equipoId,
        flota: dto.flota === 'true',
        periodoDesde: dto.periodoDesde ? parsearFechaLocal(dto.periodoDesde) : null,
        periodoHasta: dto.periodoHasta ? parsearFechaLocal(dto.periodoHasta) : null,
        usuario,
      }),
    );

    return this.obtener(creado.id, usuario);
  }

  async obtener(id: string, usuario: UsuarioAutenticado) {
    const movimiento = await this.prisma.movimientoFinanciero.findFirst({
      where: { id, AND: [filtroMovimiento(usuario)] },
      include: INCLUIR_MOVIMIENTO,
    });
    if (!movimiento) {
      throw new NotFoundException(`No existe el movimiento ${id}`);
    }
    return presentarMovimiento(movimiento);
  }

  async listar(filtro: ListarMovimientosQueryDto, usuario: UsuarioAutenticado) {
    const movimientos = await this.prisma.movimientoFinanciero.findMany({
      where: {
        proyectoId: filtro.proyectoId,
        tipo: filtro.tipo,
        estado: filtro.estado,
        AND: [filtroMovimiento(usuario)],
        fecha: construirRangoFechas(filtro),
      },
      include: INCLUIR_MOVIMIENTO,
      orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
    });
    return movimientos.map(presentarMovimiento);
  }

  // Anulación (RF-EGR-04): solo el gerente. El movimiento se conserva, marcado con quién, cuándo y por qué,
  // y deja de sumar en los totales.
  async anular(id: string, dto: AnularMovimientoDto, usuario: UsuarioAutenticado) {
    const existente = await this.prisma.movimientoFinanciero.findFirst({
      where: { id, AND: [filtroMovimiento(usuario)] },
      select: { id: true, tipo: true, valor: true, descripcion: true, fecha: true },
    });
    if (!existente) {
      throw new NotFoundException(`No existe el movimiento ${id}`);
    }

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.movimientoFinanciero.updateMany({
        where: { id, estado: EstadoMovimiento.ACTIVO },
        data: { estado: EstadoMovimiento.ANULADO, anuladoPorId: usuario.id, anuladoEn: new Date(), motivoAnulacion: dto.motivo.trim() },
      });
      if (count === 0) {
        throw new ConflictException('Este movimiento ya está anulado');
      }
      await registrarAuditoria(tx, {
        usuario,
        accion: 'MOVIMIENTO_ANULAR',
        entidad: 'MOVIMIENTO',
        entidadId: id,
        resumen: `Anuló ${existente.tipo === TipoMovimiento.GASTO ? 'el egreso' : 'el ingreso'} de ${formatearCOP(existente.valor)} (${existente.descripcion}): ${dto.motivo.trim()}`,
        antes: { estado: EstadoMovimiento.ACTIVO, valor: existente.valor, fecha: existente.fecha },
        despues: { estado: EstadoMovimiento.ANULADO, motivoAnulacion: dto.motivo.trim() },
      });
    });
    return this.obtener(id, usuario);
  }

  // El soporte solo se entrega con sesión válida y permiso sobre el proyecto del movimiento (RNF-SEG-05).
  async obtenerSoporte(id: string, usuario: UsuarioAutenticado) {
    const movimiento = await this.prisma.movimientoFinanciero.findFirst({
      where: { id, AND: [filtroMovimiento(usuario)] },
      select: { soporteRuta: true },
    });
    if (!movimiento?.soporteRuta) {
      throw new NotFoundException(`El movimiento ${id} no tiene soporte adjunto`);
    }
    const buffer = await this.storage.leer(movimiento.soporteRuta);
    const tipo = detectarTipoDocumento(buffer);
    return { buffer, contentType: tipo ? CONTENT_TYPE_DOCUMENTO[tipo] : 'application/octet-stream' };
  }

  async consolidado(filtro: FiltroPeriodoDto, usuario: UsuarioAutenticado) {
    const [movimientosRegistrados, ventas, pagosNomina, proyectos] = await Promise.all([
      this.prisma.movimientoFinanciero.findMany({
        // Un movimiento anulado se conserva, pero no entra a ningún total.
        where: { estado: EstadoMovimiento.ACTIVO, fecha: construirRangoFechas(filtro), ...filtroMovimiento(usuario) },
      }),
      this.prisma.venta.findMany({
        // Una venta desistida conserva sus abonos: ese dinero se recibió y consta en la caja.
        where: { estado: { in: [EstadoVenta.ACTIVA, EstadoVenta.DESISTIDA] }, ...filtroVenta(usuario) },
        // Un abono anulado no entra a la caja (su recibo se conserva, pero el dinero se revirtió).
        include: { lote: true, abonos: { where: { estado: EstadoAbono.ACTIVO } } },
      }),
      // La nómina no pertenece a ningún proyecto: con alcance restringido no se incluye.
      tieneAlcanceTotal(usuario) ? this.prisma.pagoNomina.findMany() : Promise.resolve([]),
      this.prisma.proyecto.findMany({ where: filtroProyecto(usuario), select: { id: true, nombre: true } }),
    ]);

    // La cuota inicial es la cuota 0 de la venta y se paga con abonos como las demás cuotas,
    // así que basta con sumar los abonos.
    const abonos: { valor: Prisma.Decimal; proyectoId: string }[] = [];
    for (const venta of ventas) {
      for (const abono of venta.abonos) {
        if (fechaEnRango(abono.fecha, filtro)) {
          abonos.push({ valor: abono.valor, proyectoId: venta.lote.proyectoId });
        }
      }
    }

    // Los pagos de nómina son un gasto real de la empresa, igual que un
    // MovimientoFinanciero tipo GASTO, pero viven en su propia tabla
    // (ver Nomina) y no están ligados a ningún proyecto.
    const movimientos = [
      ...movimientosRegistrados,
      ...pagosNomina
        .filter((pago) => fechaEnRango(pago.fechaPago, filtro))
        .map((pago) => ({ tipo: TipoMovimiento.GASTO, valor: pago.valorPagado, proyectoId: null })),
    ];

    return calcularConsolidado({ movimientos, abonos, proyectos });
  }

  // Sección de finanzas de un proyecto (RF-EGR-05, 06 y 08): totales, utilidad y el detalle de ingresos y egresos,
  // incluidos los abonos de los clientes como ingresos con su número de recibo.
  async finanzasDeProyecto(proyectoId: string, filtro: FiltroPeriodoDto, usuario: UsuarioAutenticado) {
    exigirProyecto(usuario, proyectoId, `No existe el proyecto ${proyectoId}`);
    const proyecto = await this.prisma.proyecto.findUnique({ where: { id: proyectoId }, select: { id: true, nombre: true, tipo: true } });
    if (!proyecto) {
      throw new NotFoundException(`No existe el proyecto ${proyectoId}`);
    }

    const [movimientos, ventas] = await Promise.all([
      this.prisma.movimientoFinanciero.findMany({
        where: { proyectoId, fecha: construirRangoFechas(filtro) },
        include: INCLUIR_MOVIMIENTO,
      }),
      this.prisma.venta.findMany({
        where: { lote: { proyectoId }, estado: { in: [EstadoVenta.ACTIVA, EstadoVenta.DESISTIDA] } },
        include: {
          cliente: { select: { nombre: true } },
          lote: { select: { numero: true } },
          abonos: {
            include: {
              recibo: { select: { numeroTexto: true } },
              cuentaDestino: { select: { banco: true, alias: true } },
              registradoPor: { select: { nombre: true } },
            },
          },
        },
      }),
    ]);

    const filas: FilaFinanza[] = movimientos.map((movimiento) => ({
      origen: 'MOVIMIENTO',
      id: movimiento.id,
      fecha: movimiento.fecha,
      tipo: movimiento.tipo,
      categoria: (movimiento.categoriaGasto ?? movimiento.categoriaIngreso)?.nombre ?? '—',
      descripcion: movimiento.descripcion,
      valor: movimiento.valor,
      medioPago: movimiento.medioPago,
      cuenta: movimiento.cuenta ? movimiento.cuenta.alias : null,
      referencia: movimiento.referencia,
      tercero: movimiento.terceroNombre,
      numeroDocumento: movimiento.numeroDocumento,
      tieneSoporte: movimiento.soporteRuta !== null,
      registradoPor: movimiento.registradoPor?.nombre ?? null,
      estado: movimiento.estado,
      recibo: null,
      ventaId: movimiento.ventaId,
      equipo: movimiento.equipo ? movimiento.equipo.nombre : movimiento.flota ? 'Flota (general)' : null,
    }));

    for (const venta of ventas) {
      for (const abono of venta.abonos) {
        if (!fechaEnRango(abono.fecha, filtro)) continue;
        filas.push({
          origen: 'ABONO',
          id: abono.id,
          fecha: abono.fecha,
          tipo: TipoMovimiento.INGRESO,
          categoria: 'Cuotas y abonos de lotes',
          descripcion: `Abono de ${venta.cliente.nombre} · Lote ${venta.lote.numero}`,
          valor: abono.valor,
          medioPago: abono.medioPago,
          cuenta: abono.cuentaDestino ? abono.cuentaDestino.alias : null,
          referencia: abono.referencia,
          tercero: venta.cliente.nombre,
          numeroDocumento: abono.recibo?.numeroTexto ?? null,
          tieneSoporte: abono.comprobanteUrl !== null,
          registradoPor: abono.registradoPor?.nombre ?? null,
          estado: abono.estado === EstadoAbono.ACTIVO ? EstadoMovimiento.ACTIVO : EstadoMovimiento.ANULADO,
          recibo: abono.recibo?.numeroTexto ?? null,
          ventaId: venta.id,
          equipo: null,
        });
      }
    }
    filas.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

    // Lo vendido y lo que falta cobrar se miran sobre toda la vida del proyecto, no solo sobre el período.
    const ventasActivas = ventas
      .filter((venta) => venta.estado === EstadoVenta.ACTIVA)
      .map((venta) => ({
        valorTotal: venta.valorTotal,
        pagado: venta.abonos
          .filter((abono) => abono.estado === EstadoAbono.ACTIVO)
          .reduce((total, abono) => total.plus(abono.valor), new Prisma.Decimal(0)),
      }));

    return { proyecto, resumen: resumirFinanzasProyecto(filas, ventasActivas), movimientos: filas };
  }
}
