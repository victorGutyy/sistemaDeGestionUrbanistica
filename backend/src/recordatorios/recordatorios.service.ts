import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { evaluarCuotaPendiente, type ParametrosMora } from '../cartera/mora.js';
import { ZONA_HORARIA } from '../common/zona-horaria.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoCuota, EstadoNotificacion, EstadoVenta, TipoNotificacion } from '../generated/prisma/enums.js';
import { cuotaParaAvisoDeMora, tocaAvisoDeMora } from '../notificaciones/aviso-mora.js';
import { APLICACIONES_ACTIVAS, NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { generarHtmlMora } from '../notificaciones/plantillas-correo.js';
import { etiquetaCuotaRecibo } from '../abonos/recibo-contenido.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generarHtmlRecordatorio } from './plantilla-correo.js';
import { necesitaRecordatorio } from './recordatorio.js';

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface ConteoEnvios {
  enviados: number;
  fallidos: number;
  omitidos: number;
}

export interface ResultadoAvisos {
  recordatorios: ConteoEnvios;
  mora: ConteoEnvios;
}

// Avisos automáticos por correo a los clientes: recordatorio antes del vencimiento de una cuota (RF-NOT-02 y 05) y
// aviso periódico de cuotas vencidas (RF-NOT-03). Cada intento queda en el historial de notificaciones (RF-NOT-06).
@Injectable()
export class RecordatoriosService {
  private readonly logger = new Logger(RecordatoriosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificaciones: NotificacionesService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  // Cada proceso en su propio cron (hora de Bogotá, no la del servidor) y a distinta hora, para que un fallo en uno
  // no arrastre al otro.
  @Cron('0 0 8 * * *', { timeZone: ZONA_HORARIA })
  async ejecutarProgramado() {
    const resultado = await this.enviarRecordatoriosPendientes();
    this.logger.log(`Recordatorios de pago: ${resultado.enviados} enviados, ${resultado.fallidos} fallidos, ${resultado.omitidos} omitidos`);
  }

  @Cron('0 5 8 * * *', { timeZone: ZONA_HORARIA })
  async ejecutarMoraProgramado() {
    const resultado = await this.enviarAvisosMora();
    this.logger.log(`Avisos de mora: ${resultado.enviados} enviados, ${resultado.fallidos} fallidos, ${resultado.omitidos} omitidos`);
  }

  // Disparo manual desde el panel: corre los dos procesos (cada uno respeta sus propias reglas para no repetir).
  async ejecutarTodo(): Promise<ResultadoAvisos> {
    const recordatorios = await this.enviarRecordatoriosPendientes();
    const mora = await this.enviarAvisosMora();
    return { recordatorios, mora };
  }

  async enviarRecordatoriosPendientes(): Promise<ConteoEnvios> {
    const hoy = new Date();
    const empresa = await this.configuracion.obtenerEmpresa();
    const parametrosMora: ParametrosMora = { tasaMoraMensual: empresa.tasaMoraMensual, diasGracia: empresa.diasGraciaMora };
    const datosEmpresa = {
      nombreComercial: empresa.nombreComercial,
      colorPrimario: empresa.colorPrimario,
      telefonos: empresa.telefonos,
      correo: empresa.correo,
    };

    const ventas = await this.prisma.venta.findMany({
      where: { estado: EstadoVenta.ACTIVA, cuotas: { some: { estado: { not: EstadoCuota.PAGADA }, recordatorioEnviadoEn: null } } },
      include: {
        cliente: true,
        lote: { include: { proyecto: true } },
        cuotas: { where: { estado: { not: EstadoCuota.PAGADA } }, include: { aplicaciones: APLICACIONES_ACTIVAS } },
      },
    });

    const conteo: ConteoEnvios = { enviados: 0, fallidos: 0, omitidos: 0 };

    for (const venta of ventas) {
      for (const cuota of venta.cuotas) {
        if (!necesitaRecordatorio(cuota, empresa.diasAntesRecordatorio, hoy)) continue;

        const saldo = evaluarCuotaPendiente(cuota, cuota.aplicaciones, hoy, parametrosMora)?.saldo ?? cuota.valor;
        const aviso = {
          tipo: TipoNotificacion.RECORDATORIO,
          clienteId: venta.clienteId,
          ventaId: venta.id,
          cuotaId: cuota.id,
          destinatario: venta.cliente.email,
          asunto: `Recordatorio de pago — Lote ${venta.lote.numero}`,
          html: generarHtmlRecordatorio({
            nombreCliente: venta.cliente.nombre,
            nombreProyecto: venta.lote.proyecto.nombre,
            numeroLote: venta.lote.numero,
            numeroCuota: cuota.numero,
            fechaVencimiento: cuota.fechaVencimiento,
            valor: saldo,
            empresa: datosEmpresa,
          }),
        };

        // Sin correo (o sin servidor de correo) no se reclama la cuota: queda lista para cuando se pueda enviar.
        if (this.notificaciones.motivoDeOmision(venta.cliente.email)) {
          await this.notificaciones.enviarCorreo({ ...aviso, noRepetirOmisionDesde: new Date(0) });
          conteo.omitidos++;
          continue;
        }

        // Se reclama la cuota antes de enviar (una sola escritura atómica): si otro proceso corre a la vez, solo uno
        // la gana y el cliente no recibe el mismo recordatorio dos veces (RF-NOT-05).
        const reclamada = await this.prisma.cuota.updateMany({
          where: { id: cuota.id, recordatorioEnviadoEn: null },
          data: { recordatorioEnviadoEn: hoy },
        });
        if (reclamada.count === 0) continue;

        const resultado = await this.notificaciones.enviarCorreo(aviso);
        if (resultado.estado === EstadoNotificacion.ENVIADA) {
          conteo.enviados++;
        } else {
          // No salió: se libera la cuota para reintentarlo en la próxima ejecución, y sigue con las demás.
          await this.prisma.cuota.updateMany({ where: { id: cuota.id }, data: { recordatorioEnviadoEn: null } });
          conteo.fallidos++;
        }
      }
    }

    return conteo;
  }

  async enviarAvisosMora(): Promise<ConteoEnvios> {
    const hoy = new Date();
    const empresa = await this.configuracion.obtenerEmpresa();
    const parametrosMora: ParametrosMora = { tasaMoraMensual: empresa.tasaMoraMensual, diasGracia: empresa.diasGraciaMora };
    const datosEmpresa = {
      nombreComercial: empresa.nombreComercial,
      colorPrimario: empresa.colorPrimario,
      telefonos: empresa.telefonos,
      correo: empresa.correo,
    };

    const ventas = await this.prisma.venta.findMany({
      where: { estado: EstadoVenta.ACTIVA, cuotas: { some: { estado: { not: EstadoCuota.PAGADA }, fechaVencimiento: { lt: hoy } } } },
      include: {
        cliente: true,
        lote: { include: { proyecto: true } },
        cuotas: { where: { estado: { not: EstadoCuota.PAGADA } }, include: { aplicaciones: APLICACIONES_ACTIVAS } },
      },
    });

    // Cuándo se le avisó por última vez a cada venta: solo cuenta lo que de verdad salió por correo.
    const ultimos = await this.prisma.notificacion.groupBy({
      by: ['ventaId'],
      where: { tipo: TipoNotificacion.MORA, canal: 'CORREO', estado: EstadoNotificacion.ENVIADA, ventaId: { in: ventas.map((venta) => venta.id) } },
      _max: { createdAt: true },
    });
    const ultimoAviso = new Map(ultimos.map((fila) => [fila.ventaId, fila._max.createdAt]));

    const conteo: ConteoEnvios = { enviados: 0, fallidos: 0, omitidos: 0 };

    for (const venta of ventas) {
      const vencidas = venta.cuotas
        .map((cuota) => ({ cuota, evaluacion: evaluarCuotaPendiente(cuota, cuota.aplicaciones, hoy, parametrosMora) }))
        .filter((fila) => fila.evaluacion?.vencida && cuotaParaAvisoDeMora(fila.evaluacion.diasAtraso, empresa.diasGraciaMora));
      if (vencidas.length === 0) continue;
      if (!tocaAvisoDeMora(ultimoAviso.get(venta.id) ?? null, empresa.diasEntreAvisosMora, hoy)) continue;

      const saldoVencido = vencidas.reduce((suma, fila) => suma.plus(fila.evaluacion?.saldo ?? 0), new Prisma.Decimal(0));
      const resultado = await this.notificaciones.enviarCorreo({
        tipo: TipoNotificacion.MORA,
        clienteId: venta.clienteId,
        ventaId: venta.id,
        destinatario: venta.cliente.email,
        asunto: `Aviso de cuotas vencidas — Lote ${venta.lote.numero}`,
        html: generarHtmlMora({
          nombreCliente: venta.cliente.nombre,
          proyecto: venta.lote.proyecto.nombre,
          lote: venta.lote.numero,
          cuotas: vencidas.map((fila) => ({
            etiqueta: etiquetaCuotaRecibo(fila.cuota.numero),
            fechaVencimiento: fila.cuota.fechaVencimiento,
            saldo: (fila.evaluacion?.saldo ?? 0).toString(),
          })),
          saldoVencido: saldoVencido.toString(),
          empresa: datosEmpresa,
        }),
        // Una venta sin correo se anota una vez por intervalo, no cada día.
        noRepetirOmisionDesde: new Date(hoy.getTime() - empresa.diasEntreAvisosMora * MS_POR_DIA),
      });

      if (resultado.estado === EstadoNotificacion.ENVIADA) conteo.enviados++;
      else if (resultado.estado === EstadoNotificacion.FALLIDA) conteo.fallidos++;
      else conteo.omitidos++;
    }

    return conteo;
  }
}
