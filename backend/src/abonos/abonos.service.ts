import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { filtroVenta } from '../auth/alcance.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { CONTENT_TYPE_DOCUMENTO, detectarTipoDocumento, type TipoDocumento } from '../common/tipo-archivo.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoVenta } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { anularAbonoEnTx, crearAbonoEnTx } from './crear-abono-tx.js';
import { AnularAbonoDto } from './dto/anular-abono.dto.js';
import { BuscarRecibosQueryDto } from './dto/buscar-recibos-query.dto.js';
import { CrearAbonoDto } from './dto/crear-abono.dto.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { generarPdfDeReciboDeAbono } from './pdf-recibo-abono.js';
import { exigirFechaNoFutura, validarCuentaDestino } from './validar-pago.js';

const LIMITE_RECIBOS = 200;

@Injectable()
export class AbonosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly configuracion: ConfiguracionService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  // Registra un abono y emite su recibo en una sola operación (RF-REC-01, 02 y 03).
  async crear(dto: CrearAbonoDto, usuario: UsuarioAutenticado, comprobante?: Express.Multer.File) {
    const venta = await this.prisma.venta.findFirst({ where: { id: dto.ventaId, ...filtroVenta(usuario) } });
    if (!venta) {
      throw new NotFoundException(`No existe la venta ${dto.ventaId}`);
    }
    if (venta.estado !== EstadoVenta.ACTIVA) {
      throw new ConflictException('Solo se pueden registrar abonos en una venta activa');
    }

    await this.configuracion.exigirMedioPagoActivo(dto.medioPago);
    const cuentaDestinoId = await validarCuentaDestino(this.prisma, dto.medioPago, dto.cuentaDestinoId);
    const fecha = parsearFechaLocal(dto.fecha);
    exigirFechaNoFutura(fecha);

    // El soporte es opcional, pero si llega se valida por su contenido real y no por lo que declare el navegador.
    let tipoSoporte: TipoDocumento | null = null;
    if (comprobante) {
      tipoSoporte = detectarTipoDocumento(comprobante.buffer);
      if (!tipoSoporte) {
        throw new BadRequestException('El soporte debe ser una imagen (JPG/PNG) o un PDF');
      }
    }

    const contexto = await this.configuracion.contextoRecibo(usuario);

    let comprobanteUrl: string | undefined;
    if (comprobante && tipoSoporte) {
      const { rutaRelativa } = await this.storage.guardar(
        `${venta.clienteId}/${venta.id}`,
        `soporte.${tipoSoporte}`,
        comprobante.buffer,
      );
      comprobanteUrl = rutaRelativa;
    }

    const { abono, recibo, partes } = await this.prisma.$transaction((tx) =>
      crearAbonoEnTx(
        tx,
        {
          ventaId: dto.ventaId,
          fecha,
          valor: new Prisma.Decimal(dto.valor),
          medioPago: dto.medioPago,
          cuentaDestinoId,
          referencia: dto.referencia,
          comprobanteUrl,
          registradoPorId: usuario.id,
        },
        contexto,
      ),
    );

    // El recibo sale por correo sin hacer esperar a quien registra el abono; si falla, el abono ya quedó guardado y
    // la falla queda en el historial de notificaciones (RF-NOT-01 y 06).
    void this.notificaciones.enviarReciboAlRegistrar(abono.id, usuario.id);

    return {
      ...abono,
      recibo: { id: recibo.id, numeroTexto: recibo.numeroTexto },
      cuotasCubiertas: partes.map((parte) => ({ numero: parte.numero, valor: parte.valor, completa: parte.cubreCompleta })),
    };
  }

  async listarPorVenta(ventaId: string, usuario: UsuarioAutenticado) {
    const venta = await this.prisma.venta.findFirst({
      where: { id: ventaId, ...filtroVenta(usuario) },
      select: { id: true },
    });
    if (!venta) {
      throw new NotFoundException(`No existe la venta ${ventaId}`);
    }

    return this.prisma.abono.findMany({
      where: { ventaId },
      include: {
        recibo: { select: { id: true, numeroTexto: true, esHistorico: true } },
        cuentaDestino: { select: { id: true, banco: true, alias: true } },
        registradoPor: { select: { nombre: true } },
        anuladoPor: { select: { nombre: true } },
      },
      orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }],
    });
  }

  // Anulación (RF-REC-07): solo el gerente. El abono y el recibo quedan marcados, no se borran.
  async anular(id: string, dto: AnularAbonoDto, usuario: UsuarioAutenticado) {
    const abono = await this.prisma.abono.findFirst({ where: { id, venta: filtroVenta(usuario) }, select: { id: true } });
    if (!abono) {
      throw new NotFoundException(`No existe el abono ${id}`);
    }
    return this.prisma.$transaction((tx) => anularAbonoEnTx(tx, id, dto.motivo.trim(), usuario));
  }

  // El soporte solo se entrega con sesión válida y permiso sobre el proyecto de la venta (RNF-SEG-05).
  async obtenerComprobante(id: string, usuario: UsuarioAutenticado) {
    const abono = await this.prisma.abono.findFirst({ where: { id, venta: filtroVenta(usuario) } });
    if (!abono?.comprobanteUrl) {
      throw new NotFoundException(`El abono ${id} no tiene soporte adjunto`);
    }

    const buffer = await this.storage.leer(abono.comprobanteUrl);
    const tipo = detectarTipoDocumento(buffer);
    return { buffer, contentType: tipo ? CONTENT_TYPE_DOCUMENTO[tipo] : 'application/octet-stream' };
  }

  // PDF del recibo (RF-REC-04). Se dibuja siempre desde la fotografía guardada al emitirlo: reimprimirlo da
  // el mismo documento aunque hoy haya cambiado el cliente, el lote o la configuración de la empresa.
  async obtenerPdfRecibo(abonoId: string, usuario: UsuarioAutenticado) {
    const pdf = await generarPdfDeReciboDeAbono(this.prisma, this.storage, { id: abonoId, venta: filtroVenta(usuario) });
    if (!pdf) {
      throw new NotFoundException(`El abono ${abonoId} no tiene recibo`);
    }
    return { buffer: pdf.buffer, nombreArchivo: pdf.nombreArchivo };
  }

  // Búsqueda de recibos por número, cliente, documento, lote o referencia (RF-REC-05).
  async buscarRecibos(query: BuscarRecibosQueryDto, usuario: UsuarioAutenticado) {
    const texto = query.buscar?.trim();
    const where: Prisma.AbonoWhereInput = {
      recibo: { isNot: null },
      venta: filtroVenta(usuario),
      ...(query.estado ? { estado: query.estado } : {}),
      ...(query.desde || query.hasta
        ? {
            fecha: {
              ...(query.desde ? { gte: parsearFechaLocal(query.desde) } : {}),
              ...(query.hasta ? { lte: parsearFechaLocal(query.hasta) } : {}),
            },
          }
        : {}),
      ...(texto
        ? {
            OR: [
              { recibo: { numeroTexto: { contains: texto, mode: 'insensitive' } } },
              { referencia: { contains: texto, mode: 'insensitive' } },
              { venta: { cliente: { nombre: { contains: texto, mode: 'insensitive' } } } },
              { venta: { cliente: { documento: { contains: texto, mode: 'insensitive' } } } },
              { venta: { lote: { numero: { contains: texto, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const abonos = await this.prisma.abono.findMany({
      where,
      include: {
        recibo: { select: { id: true, numeroTexto: true, esHistorico: true } },
        cuentaDestino: { select: { banco: true, alias: true } },
        venta: {
          select: {
            id: true,
            cliente: { select: { nombre: true, documento: true } },
            lote: { select: { numero: true, proyecto: { select: { nombre: true } } } },
          },
        },
      },
      orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
      take: LIMITE_RECIBOS,
    });

    return abonos.map((abono) => ({
      abonoId: abono.id,
      ventaId: abono.venta.id,
      recibo: abono.recibo,
      fecha: abono.fecha,
      valor: abono.valor,
      medioPago: abono.medioPago,
      cuenta: abono.cuentaDestino,
      referencia: abono.referencia,
      estado: abono.estado,
      cliente: abono.venta.cliente,
      lote: abono.venta.lote.numero,
      proyecto: abono.venta.lote.proyecto.nombre,
    }));
  }
}
