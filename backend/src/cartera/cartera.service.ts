import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoCuota, EstadoVenta } from '../generated/prisma/enums.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  calcularDiasHastaVencer,
  calcularSemaforo,
  evaluarCuotaPendiente,
  type ParametrosMora,
  type Semaforo,
} from './mora.js';

@Injectable()
export class CarteraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  // La tasa de mora, los días de gracia y los días del semáforo los define el
  // gerente en Configuración: se leen en cada cálculo, no al arrancar.
  private async leerParametros() {
    const empresa = await this.configuracion.obtenerEmpresa();
    const mora: ParametrosMora = {
      tasaMoraMensual: empresa.tasaMoraMensual,
      diasGracia: empresa.diasGraciaMora,
    };
    return { mora, diasAlertaAmarilla: empresa.diasSemaforoAmarillo };
  }

  async listarPorCliente() {
    const { mora, diasAlertaAmarilla } = await this.leerParametros();
    const clientes = await this.prisma.cliente.findMany({
      include: {
        ventas: {
          where: { estado: EstadoVenta.ACTIVA },
          include: { cuotas: { include: { abonos: true } }, lote: { include: { proyecto: true } } },
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
          const evaluacion = evaluarCuotaPendiente(cuota, cuota.abonos, hoy, mora);
          if (evaluacion?.vencida) {
            saldoVencido = saldoVencido.plus(evaluacion.saldo);
            interesMora = interesMora.plus(evaluacion.interesMora);
          }
        }

        const semaforo: Semaforo = calcularSemaforo(
          cuotasPendientes.map((cuota) => ({
            fechaVencimiento: cuota.fechaVencimiento,
            diasHastaVencer: calcularDiasHastaVencer(cuota.fechaVencimiento, hoy),
          })),
          diasAlertaAmarilla,
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
          // Para poder ir directo al seguimiento de cuotas/abonos de cada
          // venta (VentaDetallePage), sin tener que buscarla aparte.
          ventas: cliente.ventas.map((venta) => ({
            id: venta.id,
            numeroLote: venta.lote.numero,
            nombreProyecto: venta.lote.proyecto.nombre,
          })),
        };
      });
  }

  async reportePorProyecto() {
    const { mora } = await this.leerParametros();
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
    let saldoPorVencerConsolidado = new Prisma.Decimal(0);

    const porProyecto = proyectos.map((proyecto) => {
      let saldoVencido = new Prisma.Decimal(0);
      let interesMora = new Prisma.Decimal(0);
      let saldoPorVencer = new Prisma.Decimal(0);

      for (const lote of proyecto.lotes) {
        for (const venta of lote.ventas) {
          for (const cuota of venta.cuotas) {
            const evaluacion = evaluarCuotaPendiente(cuota, cuota.abonos, hoy, mora);
            if (!evaluacion) continue;

            if (evaluacion.vencida) {
              saldoVencido = saldoVencido.plus(evaluacion.saldo);
              interesMora = interesMora.plus(evaluacion.interesMora);
            } else {
              saldoPorVencer = saldoPorVencer.plus(evaluacion.saldo);
            }
          }
        }
      }

      saldoVencidoConsolidado = saldoVencidoConsolidado.plus(saldoVencido);
      interesMoraConsolidado = interesMoraConsolidado.plus(interesMora);
      saldoPorVencerConsolidado = saldoPorVencerConsolidado.plus(saldoPorVencer);

      return { proyectoId: proyecto.id, nombre: proyecto.nombre, saldoVencido, interesMora, saldoPorVencer };
    });

    return {
      // false = el gerente todavía no define la tasa de mora: el interés
      // mostrado es $0 por falta de dato, no porque nadie deba nada.
      moraConfigurada: mora.tasaMoraMensual !== null,
      porProyecto,
      consolidado: {
        saldoVencido: saldoVencidoConsolidado,
        interesMora: interesMoraConsolidado,
        saldoPorVencer: saldoPorVencerConsolidado,
      },
    };
  }
}
