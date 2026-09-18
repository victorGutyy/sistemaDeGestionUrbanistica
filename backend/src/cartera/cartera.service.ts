import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoCuota, EstadoVenta } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  calcularDiasHastaVencer,
  calcularSemaforo,
  evaluarCuotaVencida,
  type Semaforo,
} from './mora.js';

// Configuración de negocio, no un secreto: por eso vive en el mismo .env
// que el resto, pero se lee aparte de ConfigService porque estas dos
// constantes se necesitan también en cálculos que no pasan por Nest DI
// (los tests unitarios de mora.ts, por ejemplo).
const TASA_MORA_MENSUAL = new Prisma.Decimal(process.env.MORA_TASA_MENSUAL ?? '3');
const DIAS_ALERTA_AMARILLA = Number(process.env.MORA_DIAS_ALERTA_AMARILLA ?? 5);

@Injectable()
export class CarteraService {
  constructor(private readonly prisma: PrismaService) {}

  async listarPorCliente() {
    const clientes = await this.prisma.cliente.findMany({
      include: {
        ventas: {
          where: { estado: EstadoVenta.ACTIVA },
          include: { cuotas: { include: { abonos: true } } },
        },
      },
      orderBy: { nombre: 'asc' },
    });

    const hoy = new Date();

    return clientes
      .filter((cliente) => cliente.ventas.length > 0)
      .map((cliente) => {
        const cuotasPendientes = cliente.ventas.flatMap((venta) =>
          venta.cuotas.filter((cuota) => cuota.estado !== EstadoCuota.PAGADA),
        );

        let saldoVencido = new Prisma.Decimal(0);
        let interesMora = new Prisma.Decimal(0);

        for (const cuota of cuotasPendientes) {
          const vencida = evaluarCuotaVencida(cuota, cuota.abonos, hoy, TASA_MORA_MENSUAL);
          if (vencida) {
            saldoVencido = saldoVencido.plus(vencida.saldoVencido);
            interesMora = interesMora.plus(vencida.interesMora);
          }
        }

        const semaforo: Semaforo = calcularSemaforo(
          cuotasPendientes.map((cuota) => ({
            fechaVencimiento: cuota.fechaVencimiento,
            diasHastaVencer: calcularDiasHastaVencer(cuota.fechaVencimiento, hoy),
          })),
          DIAS_ALERTA_AMARILLA,
        );

        const proximaCuota =
          cuotasPendientes
            .slice()
            .sort((a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime())[0] ?? null;

        return {
          cliente: { id: cliente.id, nombre: cliente.nombre, documento: cliente.documento },
          semaforo,
          saldoVencido,
          interesMora,
          proximaCuota,
        };
      });
  }

  async reportePorProyecto() {
    const proyectos = await this.prisma.proyecto.findMany({
      include: {
        lotes: {
          include: {
            ventas: {
              where: { estado: EstadoVenta.ACTIVA },
              include: { cuotas: { include: { abonos: true } } },
            },
          },
        },
      },
      orderBy: { nombre: 'asc' },
    });

    const hoy = new Date();
    let saldoVencidoConsolidado = new Prisma.Decimal(0);
    let interesMoraConsolidado = new Prisma.Decimal(0);

    const porProyecto = proyectos.map((proyecto) => {
      let saldoVencido = new Prisma.Decimal(0);
      let interesMora = new Prisma.Decimal(0);

      for (const lote of proyecto.lotes) {
        for (const venta of lote.ventas) {
          for (const cuota of venta.cuotas) {
            const vencida = evaluarCuotaVencida(cuota, cuota.abonos, hoy, TASA_MORA_MENSUAL);
            if (vencida) {
              saldoVencido = saldoVencido.plus(vencida.saldoVencido);
              interesMora = interesMora.plus(vencida.interesMora);
            }
          }
        }
      }

      saldoVencidoConsolidado = saldoVencidoConsolidado.plus(saldoVencido);
      interesMoraConsolidado = interesMoraConsolidado.plus(interesMora);

      return { proyectoId: proyecto.id, nombre: proyecto.nombre, saldoVencido, interesMora };
    });

    return {
      porProyecto,
      consolidado: { saldoVencido: saldoVencidoConsolidado, interesMora: interesMoraConsolidado },
    };
  }
}
