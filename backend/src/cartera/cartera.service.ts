import { Injectable } from '@nestjs/common';
import { filtroCliente, filtroProyecto, filtroVenta } from '../auth/alcance.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoAbono, EstadoVenta } from '../generated/prisma/enums.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { resumirCartera } from './cartera-venta.js';
import { calcularDiasHastaVencer, evaluarCuotaPendiente, type ParametrosMora } from './mora.js';

// Solo cuenta lo aplicado por abonos ACTIVOS: un abono anulado ya no reduce lo que se debe.
const APLICACIONES_ACTIVAS = { where: { abono: { estado: EstadoAbono.ACTIVO } }, select: { valor: true } } as const;

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

  async listarPorCliente(usuario: UsuarioAutenticado) {
    const { mora, diasAlertaAmarilla } = await this.leerParametros();
    const clientes = await this.prisma.cliente.findMany({
      where: filtroCliente(usuario),
      include: {
        ventas: {
          // Un cliente con ventas en varios proyectos solo muestra las del alcance del usuario.
          where: { estado: EstadoVenta.ACTIVA, ...filtroVenta(usuario) },
          include: { cuotas: { include: { aplicaciones: APLICACIONES_ACTIVAS } }, lote: { include: { proyecto: true } } },
        },
      },
      orderBy: { nombre: 'asc' },
    });

    const hoy = new Date();

    return clientes
      .filter((cliente) => cliente.ventas.length > 0)
      .map((cliente) => {
        const resumen = resumirCartera(
          cliente.ventas.flatMap((venta) => venta.cuotas),
          hoy,
          mora,
          diasAlertaAmarilla,
        );

        return {
          cliente: { id: cliente.id, nombre: cliente.nombre, documento: cliente.documento },
          semaforo: resumen.semaforo,
          saldoVencido: resumen.saldoVencido,
          interesMora: resumen.interesMora,
          proximaCuota: resumen.proximaCuota,
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

  async reportePorProyecto(usuario: UsuarioAutenticado) {
    const { mora, diasAlertaAmarilla } = await this.leerParametros();
    const proyectos = await this.prisma.proyecto.findMany({
      where: filtroProyecto(usuario),
      include: {
        lotes: {
          include: {
            ventas: {
              where: { estado: EstadoVenta.ACTIVA },
              include: { cuotas: { include: { aplicaciones: APLICACIONES_ACTIVAS } } },
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
    let saldoProximoConsolidado = new Prisma.Decimal(0);

    const porProyecto = proyectos.map((proyecto) => {
      let saldoVencido = new Prisma.Decimal(0);
      let interesMora = new Prisma.Decimal(0);
      let saldoPorVencer = new Prisma.Decimal(0);
      // Lo que vence dentro de la ventana del semáforo amarillo (es una parte de lo "por vencer").
      let saldoProximoAVencer = new Prisma.Decimal(0);

      for (const lote of proyecto.lotes) {
        for (const venta of lote.ventas) {
          for (const cuota of venta.cuotas) {
            const evaluacion = evaluarCuotaPendiente(cuota, cuota.aplicaciones, hoy, mora);
            if (!evaluacion) continue;

            if (evaluacion.vencida) {
              saldoVencido = saldoVencido.plus(evaluacion.saldo);
              interesMora = interesMora.plus(evaluacion.interesMora);
            } else {
              saldoPorVencer = saldoPorVencer.plus(evaluacion.saldo);
              if (calcularDiasHastaVencer(cuota.fechaVencimiento, hoy) <= diasAlertaAmarilla) {
                saldoProximoAVencer = saldoProximoAVencer.plus(evaluacion.saldo);
              }
            }
          }
        }
      }

      saldoVencidoConsolidado = saldoVencidoConsolidado.plus(saldoVencido);
      interesMoraConsolidado = interesMoraConsolidado.plus(interesMora);
      saldoPorVencerConsolidado = saldoPorVencerConsolidado.plus(saldoPorVencer);
      saldoProximoConsolidado = saldoProximoConsolidado.plus(saldoProximoAVencer);

      return { proyectoId: proyecto.id, nombre: proyecto.nombre, saldoVencido, interesMora, saldoPorVencer, saldoProximoAVencer };
    });

    return {
      // false = el gerente todavía no define la tasa de mora: el interés
      // mostrado es $0 por falta de dato, no porque nadie deba nada.
      moraConfigurada: mora.tasaMoraMensual !== null,
      diasAlerta: diasAlertaAmarilla,
      porProyecto,
      consolidado: {
        saldoVencido: saldoVencidoConsolidado,
        interesMora: interesMoraConsolidado,
        saldoPorVencer: saldoPorVencerConsolidado,
        saldoProximoAVencer: saldoProximoConsolidado,
      },
    };
  }
}
