import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailService } from '../email/email.service.js';
import { EstadoVenta } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generarHtmlRecordatorio } from './plantilla-correo.js';
import { necesitaRecordatorio } from './recordatorio.js';

const DIAS_ANTES = Number(process.env.RECORDATORIO_DIAS_ANTES ?? 3);

export interface ResultadoRecordatorios {
  enviados: number;
  omitidosSinCorreo: number;
}

@Injectable()
export class RecordatoriosService {
  private readonly logger = new Logger(RecordatoriosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async ejecutarProgramado() {
    const resultado = await this.enviarRecordatoriosPendientes();
    this.logger.log(
      `Recordatorios de pago: ${resultado.enviados} enviados, ${resultado.omitidosSinCorreo} omitidos (sin correo)`,
    );
  }

  async enviarRecordatoriosPendientes(): Promise<ResultadoRecordatorios> {
    const hoy = new Date();

    const ventas = await this.prisma.venta.findMany({
      where: { estado: EstadoVenta.ACTIVA },
      include: {
        cliente: true,
        lote: { include: { proyecto: true } },
        cuotas: true,
      },
    });

    let enviados = 0;
    let omitidosSinCorreo = 0;

    for (const venta of ventas) {
      for (const cuota of venta.cuotas) {
        if (!necesitaRecordatorio(cuota, DIAS_ANTES, hoy)) {
          continue;
        }

        if (!venta.cliente.email) {
          omitidosSinCorreo++;
          continue;
        }

        await this.emailService.enviar({
          to: venta.cliente.email,
          subject: `Recordatorio de pago — Lote ${venta.lote.numero}`,
          html: generarHtmlRecordatorio({
            nombreCliente: venta.cliente.nombre,
            nombreProyecto: venta.lote.proyecto.nombre,
            numeroLote: venta.lote.numero,
            numeroCuota: cuota.numero,
            fechaVencimiento: cuota.fechaVencimiento,
            valor: cuota.valor,
          }),
        });

        await this.prisma.cuota.update({
          where: { id: cuota.id },
          data: { recordatorioEnviadoEn: hoy },
        });

        enviados++;
      }
    }

    return { enviados, omitidosSinCorreo };
  }
}
