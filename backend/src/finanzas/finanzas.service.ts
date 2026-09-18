import { Injectable } from '@nestjs/common';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoVenta, TipoMovimiento } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { calcularConsolidado, fechaEnRango } from './consolidado.js';
import { CrearMovimientoDto } from './dto/crear-movimiento.dto.js';
import { FiltroPeriodoDto } from './dto/filtro-periodo.dto.js';
import { ListarMovimientosQueryDto } from './dto/listar-movimientos-query.dto.js';

function construirRangoFechas(filtro: FiltroPeriodoDto): Prisma.DateTimeFilter | undefined {
  if (!filtro.desde && !filtro.hasta) {
    return undefined;
  }
  return {
    gte: filtro.desde ? parsearFechaLocal(filtro.desde) : undefined,
    lte: filtro.hasta ? parsearFechaLocal(filtro.hasta) : undefined,
  };
}

@Injectable()
export class FinanzasService {
  constructor(private readonly prisma: PrismaService) {}

  crear(dto: CrearMovimientoDto) {
    return this.prisma.movimientoFinanciero.create({
      data: {
        tipo: dto.tipo,
        fecha: parsearFechaLocal(dto.fecha),
        valor: new Prisma.Decimal(dto.valor),
        concepto: dto.concepto,
        proyectoId: dto.proyectoId,
      },
    });
  }

  listar(filtro: ListarMovimientosQueryDto) {
    return this.prisma.movimientoFinanciero.findMany({
      where: {
        proyectoId: filtro.proyectoId,
        fecha: construirRangoFechas(filtro),
      },
      include: { proyecto: true },
      orderBy: { fecha: 'desc' },
    });
  }

  async consolidado(filtro: FiltroPeriodoDto) {
    const [movimientosRegistrados, ventas, pagosNomina, proyectos] = await Promise.all([
      this.prisma.movimientoFinanciero.findMany({ where: { fecha: construirRangoFechas(filtro) } }),
      this.prisma.venta.findMany({
        where: { estado: EstadoVenta.ACTIVA },
        include: { lote: true, abonos: true },
      }),
      this.prisma.pagoNomina.findMany(),
      this.prisma.proyecto.findMany({ select: { id: true, nombre: true } }),
    ]);

    // La cuota inicial se paga en el momento de la venta y no queda como
    // un Abono aparte (igual que en el estado de cuenta de Ventas), así que
    // hay que sumarla aquí también, fechada el día de la venta.
    const abonos: { valor: Prisma.Decimal; proyectoId: string }[] = [];
    for (const venta of ventas) {
      if (fechaEnRango(venta.fechaVenta, filtro)) {
        abonos.push({ valor: venta.cuotaInicial, proyectoId: venta.lote.proyectoId });
      }
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
}
