import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { etiquetaCuotaRecibo, type ContenidoRecibo } from '../abonos/recibo-contenido.js';
import { generarPdfDeReciboDeAbono } from '../abonos/pdf-recibo-abono.js';
import { filtroVenta } from '../auth/alcance.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { evaluarCuotaPendiente, type ParametrosMora } from '../cartera/mora.js';
import { sumarDias } from '../cierres-caja/periodo.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { formatearCOP } from '../common/formato.util.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { EmailService, type AdjuntoCorreo } from '../email/email.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { CanalNotificacion, EstadoAbono, EstadoNotificacion, EstadoVenta, TipoNotificacion } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { ListarNotificacionesQueryDto, PrepararWhatsAppDto } from './dto/notificaciones.dto.js';
import { enlaceWhatsApp, fechaCorta, mensajeMora, mensajeRecibo, mensajeRecordatorio } from './mensajes.js';
import { generarHtmlRecibo } from './plantillas-correo.js';
import { normalizarTelefonoWhatsApp } from './telefono.js';

const LIMITE_POR_DEFECTO = 100;
const MAX_DETALLE = 300;

// Solo cuenta lo aplicado por abonos ACTIVOS: un abono anulado ya no reduce lo que se debe.
export const APLICACIONES_ACTIVAS = { where: { abono: { estado: EstadoAbono.ACTIVO } }, select: { valor: true } } as const;

export interface DatosEnvioCorreo {
  tipo: TipoNotificacion;
  clienteId: string;
  ventaId: string;
  cuotaId?: string;
  abonoId?: string;
  destinatario: string | null;
  asunto: string;
  html: string;
  adjuntos?: AdjuntoCorreo[];
  // Nulo cuando lo dispara el sistema (cron).
  usuarioId?: string | null;
  // Si ya hay una omisión igual registrada desde esta fecha, no se vuelve a anotar (evita llenar el historial día tras día).
  noRepetirOmisionDesde?: Date;
}

export interface ResultadoEnvioCorreo {
  estado: EstadoNotificacion;
  detalle: string | null;
}

// Único lugar que envía avisos a clientes y deja constancia de cada intento (RF-NOT-06): quien llama arma el
// mensaje; aquí se decide si se puede enviar, se envía y se registra el resultado (enviada, fallida u omitida).
@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly configuracion: ConfiguracionService,
    private readonly storage: StorageService,
  ) {}

  // Por qué no se puede enviar un correo (null = se puede).
  motivoDeOmision(destinatario: string | null | undefined): string | null {
    if (!destinatario?.trim()) return 'El cliente no tiene correo registrado';
    if (!this.email.estaConfigurado()) return 'El correo de la empresa no está configurado';
    return null;
  }

  async enviarCorreo(datos: DatosEnvioCorreo): Promise<ResultadoEnvioCorreo> {
    const motivo = this.motivoDeOmision(datos.destinatario);
    if (motivo) {
      await this.registrarOmision(datos, motivo);
      return { estado: EstadoNotificacion.OMITIDA, detalle: motivo };
    }

    let resultado: ResultadoEnvioCorreo = { estado: EstadoNotificacion.ENVIADA, detalle: null };
    try {
      await this.email.enviar({ to: datos.destinatario as string, subject: datos.asunto, html: datos.html, adjuntos: datos.adjuntos });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.warn(`No se pudo enviar el correo a ${datos.destinatario}: ${mensaje}`);
      resultado = { estado: EstadoNotificacion.FALLIDA, detalle: mensaje.slice(0, MAX_DETALLE) };
    }

    // El correo ya salió (o falló): si anotarlo falla no se debe deshacer ni repetir nada, solo avisar en el log.
    try {
      await this.registrar(datos, resultado.estado, resultado.detalle);
    } catch (error) {
      this.logger.error(`No se pudo registrar la notificación (${resultado.estado}) a ${datos.destinatario}: ${String(error)}`);
    }
    return resultado;
  }

  private async registrarOmision(datos: DatosEnvioCorreo, motivo: string): Promise<void> {
    if (datos.noRepetirOmisionDesde) {
      const yaAnotada = await this.prisma.notificacion.findFirst({
        where: {
          tipo: datos.tipo,
          ventaId: datos.ventaId,
          cuotaId: datos.cuotaId ?? null,
          canal: CanalNotificacion.CORREO,
          estado: EstadoNotificacion.OMITIDA,
          detalle: motivo,
          createdAt: { gte: datos.noRepetirOmisionDesde },
        },
        select: { id: true },
      });
      if (yaAnotada) return;
    }
    await this.registrar(datos, EstadoNotificacion.OMITIDA, motivo);
  }

  private registrar(datos: DatosEnvioCorreo, estado: EstadoNotificacion, detalle: string | null) {
    return this.prisma.notificacion.create({
      data: {
        tipo: datos.tipo,
        canal: CanalNotificacion.CORREO,
        estado,
        clienteId: datos.clienteId,
        ventaId: datos.ventaId,
        cuotaId: datos.cuotaId ?? null,
        abonoId: datos.abonoId ?? null,
        destinatario: datos.destinatario?.trim() || null,
        asunto: datos.asunto,
        detalle,
        usuarioId: datos.usuarioId ?? null,
      },
    });
  }

  // ---------- Recibo por correo (RF-NOT-01) ----------

  // Se llama al guardar un abono. Nunca lanza: el abono ya está guardado y cualquier falla queda en el historial.
  async enviarReciboAlRegistrar(abonoId: string, usuarioId: string): Promise<void> {
    try {
      const empresa = await this.configuracion.obtenerEmpresa();
      if (!empresa.enviarReciboPorCorreo) return;
      await this.enviarReciboDeAbono({ id: abonoId }, usuarioId);
    } catch (error) {
      this.logger.error(`No se pudo enviar el recibo del abono ${abonoId}: ${String(error)}`);
    }
  }

  // Reenvío manual desde la pantalla (con el alcance del usuario).
  async reenviarRecibo(abonoId: string, usuario: UsuarioAutenticado): Promise<ResultadoEnvioCorreo> {
    return this.enviarReciboDeAbono({ id: abonoId, venta: filtroVenta(usuario) }, usuario.id);
  }

  private async enviarReciboDeAbono(donde: Prisma.AbonoWhereInput, usuarioId: string): Promise<ResultadoEnvioCorreo> {
    const abono = await this.prisma.abono.findFirst({
      where: donde,
      include: { venta: { include: { cliente: true } }, recibo: { select: { numeroTexto: true } } },
    });
    if (!abono?.recibo) {
      throw new NotFoundException('No existe el abono o no tiene recibo');
    }
    if (abono.estado === EstadoAbono.ANULADO) {
      throw new ConflictException('El recibo está anulado: no se envía por correo');
    }

    const pdf = await generarPdfDeReciboDeAbono(this.prisma, this.storage, { id: abono.id });
    if (!pdf) {
      throw new NotFoundException('No existe el abono o no tiene recibo');
    }
    const contenido = pdf.contenido;
    const cliente = abono.venta.cliente;

    return this.enviarCorreo({
      tipo: TipoNotificacion.RECIBO,
      clienteId: cliente.id,
      ventaId: abono.ventaId,
      abonoId: abono.id,
      destinatario: cliente.email,
      asunto: `Recibo de pago ${contenido.numeroTexto} — ${contenido.empresa.nombreComercial}`,
      html: generarHtmlRecibo({
        nombreCliente: cliente.nombre,
        numeroRecibo: contenido.numeroTexto,
        proyecto: contenido.proyecto,
        lote: contenido.lote,
        fechaAbono: new Date(contenido.fechaAbono),
        valor: contenido.valor,
        saldoNuevo: contenido.saldoNuevo,
        empresa: {
          nombreComercial: contenido.empresa.nombreComercial,
          colorPrimario: contenido.empresa.colorPrimario,
          telefonos: contenido.empresa.telefonos,
          correo: contenido.empresa.correo,
        },
      }),
      adjuntos: [{ nombre: pdf.nombreArchivo, contenido: pdf.buffer }],
      usuarioId,
    });
  }

  // ---------- WhatsApp (RF-NOT-04) ----------

  // Arma el mensaje y el enlace de WhatsApp de un aviso y deja constancia de que se abrió. El sistema no envía nada:
  // la persona revisa el texto y lo manda desde su WhatsApp (el PDF del recibo se adjunta a mano).
  async prepararWhatsApp(dto: PrepararWhatsAppDto, usuario: UsuarioAutenticado) {
    const venta = await this.prisma.venta.findFirst({
      where: { id: dto.ventaId, ...filtroVenta(usuario) },
      include: {
        cliente: true,
        lote: { include: { proyecto: true } },
        cuotas: {
          where: { estado: { not: 'PAGADA' } },
          include: { aplicaciones: APLICACIONES_ACTIVAS },
          orderBy: [{ fechaVencimiento: 'asc' }, { numero: 'asc' }],
        },
      },
    });
    if (!venta) {
      throw new NotFoundException(`No existe la venta ${dto.ventaId}`);
    }

    const telefono = normalizarTelefonoWhatsApp(venta.cliente.telefono);
    if (!telefono) {
      throw new BadRequestException('El cliente no tiene un teléfono celular válido para WhatsApp');
    }

    const empresa = await this.configuracion.obtenerEmpresa();
    const base = {
      empresa: empresa.nombreComercial,
      cliente: venta.cliente.nombre,
      proyecto: venta.lote.proyecto.nombre,
      lote: venta.lote.numero,
    };
    const hoy = new Date();
    const mora: ParametrosMora = { tasaMoraMensual: empresa.tasaMoraMensual, diasGracia: empresa.diasGraciaMora };

    let mensaje: string;
    let cuotaId: string | undefined;
    let abonoId: string | undefined;

    if (dto.tipo === TipoNotificacion.RECIBO) {
      if (!dto.abonoId) throw new BadRequestException('Falta el abono del recibo');
      const abono = await this.prisma.abono.findFirst({ where: { id: dto.abonoId, ventaId: venta.id }, include: { recibo: true } });
      if (!abono?.recibo) throw new NotFoundException('No existe el abono o no tiene recibo');
      if (abono.estado === EstadoAbono.ANULADO) throw new ConflictException('El recibo está anulado: no se avisa por WhatsApp');
      const contenido = abono.recibo.contenido as unknown as ContenidoRecibo;
      abonoId = abono.id;
      mensaje = mensajeRecibo({
        ...base,
        numeroRecibo: contenido.numeroTexto,
        valor: formatearCOP(contenido.valor),
        fecha: fechaCorta(new Date(contenido.fechaAbono)),
        saldoNuevo: formatearCOP(contenido.saldoNuevo),
      });
    } else {
      if (venta.estado !== EstadoVenta.ACTIVA) {
        throw new ConflictException('Solo se avisa de cuotas en una venta activa');
      }
      if (dto.tipo === TipoNotificacion.RECORDATORIO) {
        const cuota = dto.cuotaId ? venta.cuotas.find((c) => c.id === dto.cuotaId) : venta.cuotas[0];
        if (!cuota) throw new NotFoundException('No hay una cuota pendiente para recordar');
        const evaluacion = evaluarCuotaPendiente(cuota, cuota.aplicaciones, hoy, mora);
        cuotaId = cuota.id;
        mensaje = mensajeRecordatorio({
          ...base,
          etiquetaCuota: etiquetaCuotaRecibo(cuota.numero),
          fechaVencimiento: fechaCorta(cuota.fechaVencimiento),
          valor: formatearCOP(evaluacion?.saldo ?? cuota.valor),
        });
      } else {
        const vencidas = venta.cuotas
          .map((cuota) => ({ cuota, evaluacion: evaluarCuotaPendiente(cuota, cuota.aplicaciones, hoy, mora) }))
          .filter((fila) => fila.evaluacion?.vencida);
        if (vencidas.length === 0) throw new ConflictException('La venta no tiene cuotas vencidas');
        const total = vencidas.reduce((suma, fila) => suma.plus(fila.evaluacion?.saldo ?? 0), new Prisma.Decimal(0));
        mensaje = mensajeMora({
          ...base,
          cuotas: vencidas.map((fila) => ({
            etiqueta: etiquetaCuotaRecibo(fila.cuota.numero),
            fechaVencimiento: fechaCorta(fila.cuota.fechaVencimiento),
            saldo: formatearCOP(fila.evaluacion?.saldo ?? 0),
          })),
          saldoVencido: formatearCOP(total),
        });
      }
    }

    await this.prisma.notificacion.create({
      data: {
        tipo: dto.tipo,
        canal: CanalNotificacion.WHATSAPP,
        estado: EstadoNotificacion.ENLACE_ABIERTO,
        clienteId: venta.clienteId,
        ventaId: venta.id,
        cuotaId: cuotaId ?? null,
        abonoId: abonoId ?? null,
        destinatario: telefono,
        usuarioId: usuario.id,
      },
    });

    return { url: enlaceWhatsApp(telefono, mensaje), mensaje, telefono, cliente: venta.cliente.nombre };
  }

  // ---------- Historial (RF-NOT-06) ----------

  async listar(filtro: ListarNotificacionesQueryDto, usuario: UsuarioAutenticado) {
    const base: Prisma.NotificacionWhereInput = {
      venta: filtroVenta(usuario),
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
      ...(filtro.ventaId ? { ventaId: filtro.ventaId } : {}),
      ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
      ...(filtro.canal ? { canal: filtro.canal } : {}),
      ...(filtro.desde || filtro.hasta
        ? {
            createdAt: {
              ...(filtro.desde ? { gte: parsearFechaLocal(filtro.desde) } : {}),
              ...(filtro.hasta ? { lt: parsearFechaLocal(sumarDias(filtro.hasta, 1)) } : {}),
            },
          }
        : {}),
    };
    const donde: Prisma.NotificacionWhereInput = { ...base, ...(filtro.estado ? { estado: filtro.estado } : {}) };
    const limite = filtro.limite ?? LIMITE_POR_DEFECTO;
    const pagina = filtro.pagina ?? 1;

    const [total, filas, porEstado] = await Promise.all([
      this.prisma.notificacion.count({ where: donde }),
      this.prisma.notificacion.findMany({
        where: donde,
        include: {
          cliente: { select: { id: true, nombre: true } },
          venta: { select: { id: true, lote: { select: { numero: true, proyecto: { select: { nombre: true } } } } } },
          cuota: { select: { numero: true } },
          abono: { select: { recibo: { select: { numeroTexto: true } } } },
          usuario: { select: { nombre: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limite,
        skip: (pagina - 1) * limite,
      }),
      // Los conteos por estado ignoran el filtro de estado: sirven para ver de un vistazo cuántos fallaron u omitieron.
      this.prisma.notificacion.groupBy({ by: ['estado'], where: base, _count: { _all: true } }),
    ]);

    return {
      total,
      pagina,
      limite,
      porEstado: Object.fromEntries(porEstado.map((fila) => [fila.estado, fila._count._all])) as Partial<Record<EstadoNotificacion, number>>,
      notificaciones: filas.map((fila) => ({
        id: fila.id,
        fecha: fila.createdAt,
        tipo: fila.tipo,
        canal: fila.canal,
        estado: fila.estado,
        destinatario: fila.destinatario,
        asunto: fila.asunto,
        detalle: fila.detalle,
        cliente: fila.cliente,
        ventaId: fila.venta.id,
        lote: fila.venta.lote.numero,
        proyecto: fila.venta.lote.proyecto.nombre,
        cuota: fila.cuota?.numero ?? null,
        recibo: fila.abono?.recibo?.numeroTexto ?? null,
        usuario: fila.usuario?.nombre ?? null,
      })),
    };
  }
}
