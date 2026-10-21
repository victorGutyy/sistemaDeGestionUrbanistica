import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { filtroVenta } from '../auth/alcance.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { exigirFechaNoFutura, validarCuentaDestino } from '../abonos/validar-pago.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { detectarTipoDocumento, type TipoDocumento } from '../common/tipo-archivo.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoComision } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { anularComisionEnTx, pagarComisionEnTx } from './comision-tx.js';
import { AnularComisionDto, ListarComisionesQueryDto, PagarComisionDto } from './dto/comision.dto.js';
import { generarExcelComisiones } from './generar-excel-comisiones.js';
import { ETIQUETA_ESTADO_COMISION, puedeCambiar } from './reglas-comision.js';

// Lo que se necesita para mostrar una comisión, sin exponer la ruta interna del soporte del egreso.
const INCLUIR_COMISION = {
  vendedor: { select: { id: true, nombre: true, documento: true, tipo: true } },
  venta: {
    select: {
      id: true,
      fechaVenta: true,
      estado: true,
      cliente: { select: { id: true, nombre: true } },
      lote: { select: { id: true, numero: true, manzana: { select: { nombre: true } }, proyecto: { select: { id: true, nombre: true } } } },
    },
  },
  movimiento: {
    select: { id: true, fecha: true, medioPago: true, referencia: true, estado: true, soporteRuta: true, motivoSinSoporte: true, cuenta: { select: { id: true, banco: true, alias: true } } },
  },
  pagadaPor: { select: { nombre: true } },
  anuladaPor: { select: { nombre: true } },
} satisfies Prisma.ComisionInclude;

type ComisionConRelaciones = Prisma.ComisionGetPayload<{ include: typeof INCLUIR_COMISION }>;

function presentar(comision: ComisionConRelaciones) {
  const { movimiento, ...resto } = comision;
  return {
    ...resto,
    movimiento: movimiento ? (({ soporteRuta, ...datos }) => ({ ...datos, tieneSoporte: soporteRuta !== null }))(movimiento) : null,
  };
}

@Injectable()
export class ComisionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  private dondeDelFiltro(filtro: ListarComisionesQueryDto, usuario: UsuarioAutenticado): Prisma.ComisionWhereInput {
    const rango: Prisma.DateTimeFilter | undefined =
      filtro.desde || filtro.hasta
        ? { gte: filtro.desde ? parsearFechaLocal(filtro.desde) : undefined, lte: filtro.hasta ? parsearFechaLocal(filtro.hasta) : undefined }
        : undefined;
    const porPago = filtro.fechaPor === 'pago';
    return {
      vendedorId: filtro.vendedorId,
      estado: filtro.estado,
      AND: [
        { venta: filtroVenta(usuario) },
        ...(filtro.proyectoId ? [{ venta: { lote: { proyectoId: filtro.proyectoId } } }] : []),
        ...(rango ? [porPago ? { movimiento: { fecha: rango } } : { venta: { fechaVenta: rango } }] : []),
      ],
    };
  }

  // Listado con totales por estado (RF-REP-08).
  async listar(filtro: ListarComisionesQueryDto, usuario: UsuarioAutenticado) {
    const comisiones = await this.prisma.comision.findMany({
      where: this.dondeDelFiltro(filtro, usuario),
      include: INCLUIR_COMISION,
      orderBy: [{ createdAt: 'desc' }],
    });

    const totales = Object.fromEntries(
      Object.values(EstadoComision).map((estado) => {
        const delEstado = comisiones.filter((c) => c.estado === estado);
        return [estado, { cantidad: delEstado.length, valor: delEstado.reduce((suma, c) => suma.plus(c.valor), new Prisma.Decimal(0)) }];
      }),
    ) as Record<EstadoComision, { cantidad: number; valor: Prisma.Decimal }>;

    return { comisiones: comisiones.map(presentar), totales };
  }

  async obtener(id: string, usuario: UsuarioAutenticado) {
    const comision = await this.prisma.comision.findFirst({
      where: { id, AND: [{ venta: filtroVenta(usuario) }] },
      include: INCLUIR_COMISION,
    });
    if (!comision) {
      throw new NotFoundException(`No existe la comisión ${id}`);
    }
    return presentar(comision);
  }

  // Pago (RF-COM-02 y 03): crea el egreso en la categoría Comisiones del proyecto de la venta, en la misma
  // transacción que marca la comisión como pagada. Un día de caja ya cerrado no admite el pago.
  async pagar(id: string, dto: PagarComisionDto, usuario: UsuarioAutenticado, soporte?: Express.Multer.File) {
    const previa = await this.prisma.comision.findFirst({
      where: { id, AND: [{ venta: filtroVenta(usuario) }] },
      select: { id: true, estado: true },
    });
    if (!previa) {
      throw new NotFoundException(`No existe la comisión ${id}`);
    }
    if (!puedeCambiar(previa.estado, EstadoComision.PAGADA)) {
      throw new ConflictException(`La comisión ya está ${ETIQUETA_ESTADO_COMISION[previa.estado]}`);
    }

    await this.configuracion.exigirMedioPagoActivo(dto.medioPago);
    const cuentaId = await validarCuentaDestino(this.prisma, dto.medioPago, dto.cuentaId, 'de donde salió el dinero');
    const fecha = parsearFechaLocal(dto.fecha);
    exigirFechaNoFutura(fecha);

    let tipoSoporte: TipoDocumento | null = null;
    if (soporte) {
      tipoSoporte = detectarTipoDocumento(soporte.buffer);
      if (!tipoSoporte) {
        throw new BadRequestException('El soporte debe ser una imagen (JPG/PNG) o un PDF');
      }
    }
    if (!soporte && !dto.motivoSinSoporte?.trim()) {
      throw new BadRequestException('Adjunta el soporte del pago o explica por qué no hay soporte');
    }

    let soporteRuta: string | undefined;
    if (soporte && tipoSoporte) {
      // El nombre en disco lo fija el servidor según el tipo real; el original no se usa.
      const { rutaRelativa } = await this.storage.guardar('finanzas', `soporte.${tipoSoporte}`, soporte.buffer);
      soporteRuta = rutaRelativa;
    }

    await this.prisma.$transaction((tx) =>
      pagarComisionEnTx(tx, id, { fecha, medioPago: dto.medioPago, cuentaId, referencia: dto.referencia, soporteRuta, motivoSinSoporte: dto.motivoSinSoporte }, usuario),
    );

    return this.obtener(id, usuario);
  }

  // Anulación (RF-COM-02): solo el gerente. Una pagada anula también su egreso.
  async anular(id: string, dto: AnularComisionDto, usuario: UsuarioAutenticado) {
    const existente = await this.prisma.comision.findFirst({ where: { id, AND: [{ venta: filtroVenta(usuario) }] }, select: { id: true } });
    if (!existente) {
      throw new NotFoundException(`No existe la comisión ${id}`);
    }
    await this.prisma.$transaction((tx) => anularComisionEnTx(tx, id, dto.motivo, usuario));
    return this.obtener(id, usuario);
  }

  // Reporte en Excel con los mismos filtros del listado (RF-REP-08).
  async exportarExcel(filtro: ListarComisionesQueryDto, usuario: UsuarioAutenticado): Promise<Buffer> {
    const [comisiones, empresa] = await Promise.all([
      this.prisma.comision.findMany({ where: this.dondeDelFiltro(filtro, usuario), include: INCLUIR_COMISION, orderBy: [{ createdAt: 'desc' }] }),
      this.configuracion.obtenerEmpresa(),
    ]);
    return generarExcelComisiones(comisiones, empresa, { desde: filtro.desde, hasta: filtro.hasta });
  }

  // Comisiones por pagar, para el tablero (RF-REP-02).
  async pendientes(usuario: UsuarioAutenticado, proyectoId?: string) {
    const resultado = await this.prisma.comision.aggregate({
      where: { estado: EstadoComision.PENDIENTE, venta: { AND: [filtroVenta(usuario), ...(proyectoId ? [{ lote: { proyectoId } }] : [])] } },
      _count: true,
      _sum: { valor: true },
    });
    return { cantidad: resultado._count, valor: resultado._sum.valor ?? new Prisma.Decimal(0) };
  }
}
