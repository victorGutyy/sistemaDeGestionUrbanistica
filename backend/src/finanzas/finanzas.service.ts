import { Injectable } from '@nestjs/common';
import { exigirAlcanceTotal, exigirProyecto, filtroMovimiento, filtroProyecto, filtroVenta, tieneAlcanceTotal } from '../auth/alcance.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
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

  crear(dto: CrearMovimientoDto, usuario: UsuarioAutenticado) {
    // Un movimiento general (sin proyecto) no es de ningún proyecto: solo con alcance total.
    if (dto.proyectoId) {
      exigirProyecto(usuario, dto.proyectoId, `No existe el proyecto ${dto.proyectoId}`);
    } else {
      exigirAlcanceTotal(usuario);
    }

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

  listar(filtro: ListarMovimientosQueryDto, usuario: UsuarioAutenticado) {
    return this.prisma.movimientoFinanciero.findMany({
      where: {
        proyectoId: filtro.proyectoId,
        AND: [filtroMovimiento(usuario)],
        fecha: construirRangoFechas(filtro),
      },
      include: { proyecto: true },
      orderBy: { fecha: 'desc' },
    });
  }

  async consolidado(filtro: FiltroPeriodoDto, usuario: UsuarioAutenticado) {
    const [movimientosRegistrados, ventas, pagosNomina, proyectos] = await Promise.all([
      this.prisma.movimientoFinanciero.findMany({
        where: { fecha: construirRangoFechas(filtro), ...filtroMovimiento(usuario) },
      }),
      this.prisma.venta.findMany({
        // Una venta desistida conserva sus abonos: ese dinero se recibió y consta en la caja.
        where: { estado: { in: [EstadoVenta.ACTIVA, EstadoVenta.DESISTIDA] }, ...filtroVenta(usuario) },
        include: { lote: true, abonos: true },
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
}
