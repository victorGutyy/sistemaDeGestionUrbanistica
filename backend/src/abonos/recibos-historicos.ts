import { EstadoAbono } from '../generated/prisma/enums.js';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { emitirReciboEnTx } from './crear-abono-tx.js';
import { empresaParaRecibo } from './recibo-contenido.js';

// Emite el recibo histórico (serie H-) de cada abono que todavía no tiene recibo: los abonos que existían antes
// de que el sistema numerara los recibos, y más adelante los importados desde Excel (RF-REC-10, paso 2.9).
// Es seguro correrlo varias veces: solo toca los abonos sin recibo.
//
// El saldo anterior de cada recibo se calcula en orden cronológico dentro de cada venta, contando solo abonos
// ACTIVOS; los anulados reciben su recibo igual (queda marcado como anulado en el PDF), pero no mueven el saldo.
export async function emitirRecibosHistoricosFaltantes(prisma: PrismaClient): Promise<number> {
  const sinRecibo = await prisma.abono.findMany({
    where: { recibo: null },
    select: { ventaId: true },
    distinct: ['ventaId'],
  });
  if (sinRecibo.length === 0) return 0;

  const empresa = await prisma.configuracionEmpresa.findUniqueOrThrow({ where: { id: 1 } });
  let emitidos = 0;

  for (const { ventaId } of sinRecibo) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Venta" WHERE "id" = ${ventaId} FOR UPDATE`;
      const venta = await tx.venta.findUniqueOrThrow({
        where: { id: ventaId },
        include: {
          cliente: true,
          lote: { include: { proyecto: true, manzana: true } },
          abonos: {
            orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }],
            include: {
              recibo: { select: { id: true } },
              cuentaDestino: true,
              registradoPor: { select: { nombre: true } },
              aplicaciones: { include: { cuota: { select: { numero: true, valor: true } } } },
            },
          },
        },
      });

      let pagado = new Prisma.Decimal(0);
      for (const abono of venta.abonos) {
        const saldoAnterior = venta.valorTotal.minus(pagado);
        if (abono.estado === EstadoAbono.ACTIVO) pagado = pagado.plus(abono.valor);
        if (abono.recibo) continue;

        await emitirReciboEnTx(tx, {
          abonoId: abono.id,
          esHistorico: true,
          prefijoRecibo: empresa.prefijoRecibo,
          fechaEmision: abono.createdAt,
          contenido: {
            empresa: empresaParaRecibo(empresa),
            cliente: { nombre: venta.cliente.nombre, documento: venta.cliente.documento },
            proyecto: venta.lote.proyecto.nombre,
            manzana: venta.lote.manzana?.nombre ?? null,
            lote: venta.lote.numero,
            fechaAbono: abono.fecha,
            valor: abono.valor,
            medioPago: abono.medioPago,
            cuenta: abono.cuentaDestino
              ? { banco: abono.cuentaDestino.banco, alias: abono.cuentaDestino.alias, numero: abono.cuentaDestino.numero }
              : null,
            referencia: abono.referencia,
            conSoporte: Boolean(abono.comprobanteUrl),
            cuotasCubiertas: abono.aplicaciones
              .slice()
              .sort((a, b) => a.cuota.numero - b.cuota.numero)
              .map((aplicacion) => ({
                numero: aplicacion.cuota.numero,
                valor: aplicacion.valor,
                completa: aplicacion.valor.greaterThanOrEqualTo(aplicacion.cuota.valor),
              })),
            saldoAnterior,
            saldoNuevo: saldoAnterior.minus(abono.estado === EstadoAbono.ACTIVO ? abono.valor : 0),
            recibidoPor: abono.registradoPor?.nombre ?? 'Registro histórico',
          },
        });
        emitidos += 1;
      }
    });
  }
  return emitidos;
}
