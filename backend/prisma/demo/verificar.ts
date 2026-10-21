import type { Contexto } from './contexto.js';
import { actorDe } from './contexto.js';

// Revisiones de coherencia sobre una base ya cargada (demostración o volumen). Devuelve cuántas fallaron.
export async function verificar(ctx: Contexto, emailGerente: string, esperados: { semaforos: boolean }): Promise<number> {
  const { prisma } = ctx;
  let fallas = 0;
  const revisar = (ok: boolean, texto: string, detalle?: unknown) => {
    console.log(`  ${ok ? '✔' : '✘'} ${texto}${ok || detalle === undefined ? '' : ` → ${JSON.stringify(detalle)}`}`);
    if (!ok) fallas += 1;
  };
  const contar = async (consulta: Promise<{ n: bigint }[]>) => Number((await consulta)[0].n);

  // 1. Cada abono activo quedó repartido completo entre cuotas.
  const abonosDescuadrados = await contar(prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM (
      SELECT a.id FROM "Abono" a LEFT JOIN "AplicacionAbono" ap ON ap."abonoId" = a.id
      WHERE a.estado = 'ACTIVO' GROUP BY a.id, a.valor HAVING a.valor <> COALESCE(SUM(ap.valor), 0)
    ) x`);
  revisar(abonosDescuadrados === 0, 'Todo abono activo está aplicado por completo a cuotas', abonosDescuadrados);

  // 2. Ninguna cuota recibió más de lo que vale.
  const cuotasPasadas = await contar(prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM (
      SELECT c.id FROM "Cuota" c JOIN "AplicacionAbono" ap ON ap."cuotaId" = c.id JOIN "Abono" a ON a.id = ap."abonoId"
      WHERE a.estado = 'ACTIVO' GROUP BY c.id, c.valor HAVING SUM(ap.valor) > c.valor
    ) x`);
  revisar(cuotasPasadas === 0, 'Ninguna cuota recibió más que su valor', cuotasPasadas);

  // 3. Todo abono tiene su recibo y los consecutivos van sin saltos ni repetidos.
  const sinRecibo = await contar(prisma.$queryRaw`SELECT COUNT(*) AS n FROM "Abono" a LEFT JOIN "Recibo" r ON r."abonoId" = a.id WHERE r.id IS NULL`);
  revisar(sinRecibo === 0, 'Todo abono tiene su recibo', sinRecibo);
  const series = await prisma.$queryRaw<{ serie: string; total: bigint; maximo: number; minimo: number }[]>`
    SELECT serie, COUNT(*) AS total, MAX(numero) AS maximo, MIN(numero) AS minimo FROM "Recibo" GROUP BY serie`;
  for (const s of series) {
    revisar(Number(s.total) === s.maximo && s.minimo === 1, `Serie ${s.serie}: ${s.total} recibos, del 1 al ${s.maximo}, sin saltos`);
  }
  const consecutivos = await prisma.consecutivo.findMany();
  for (const c of consecutivos) {
    const serie = series.find((s) => s.serie === c.serie);
    if (serie) revisar(c.ultimo === serie.maximo, `Contador ${c.serie} (${c.ultimo}) coincide con el último recibo emitido`);
  }

  // 4. Dinero siempre en pesos enteros.
  const conCentavos = await contar(prisma.$queryRaw`
    SELECT (SELECT COUNT(*) FROM "Abono" WHERE valor <> TRUNC(valor)) + (SELECT COUNT(*) FROM "Cuota" WHERE valor <> TRUNC(valor))
         + (SELECT COUNT(*) FROM "MovimientoFinanciero" WHERE valor <> TRUNC(valor)) AS n`);
  revisar(conCentavos === 0, 'Abonos, cuotas y movimientos en pesos enteros', conCentavos);

  // 5. Comisiones: toda venta activa o desistida con vendedor (y valor configurado) tiene la suya, y cada pagada tiene su egreso vigente.
  const sinComision = await contar(prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM "Venta" v JOIN "Vendedor" d ON d.id = v."vendedorId"
    JOIN "ComisionTipoVendedor" t ON t.tipo = d.tipo AND t.valor >= 0.5
    WHERE v.estado IN ('ACTIVA', 'DESISTIDA') AND NOT EXISTS (SELECT 1 FROM "Comision" c WHERE c."ventaId" = v.id)`);
  revisar(sinComision === 0, 'Toda venta con vendedor tiene su comisión', sinComision);
  const pagadasSinEgreso = await contar(prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM "Comision" c LEFT JOIN "MovimientoFinanciero" m ON m.id = c."movimientoId"
    WHERE c.estado = 'PAGADA' AND (m.id IS NULL OR m.estado <> 'ACTIVO' OR m.valor <> c.valor)`);
  revisar(pagadasSinEgreso === 0, 'Toda comisión pagada tiene su egreso vigente por el mismo valor', pagadasSinEgreso);

  // 5b. Verificación de abonos (RF-REC-10).
  const efectivoPorVerificar = await contar(prisma.$queryRaw`SELECT COUNT(*) AS n FROM "Abono" WHERE "medioPago" = 'EFECTIVO' AND "verificacion" <> 'NO_REQUIERE'`);
  revisar(efectivoPorVerificar === 0, 'El efectivo no pide verificación', efectivoPorVerificar);
  const sinVerificarElBanco = await contar(prisma.$queryRaw`SELECT COUNT(*) AS n FROM "Abono" WHERE "medioPago" <> 'EFECTIVO' AND "verificacion" = 'NO_REQUIERE' AND "estado" = 'ACTIVO' AND NOT EXISTS (SELECT 1 FROM "Recibo" r WHERE r."abonoId" = "Abono"."id" AND r."esHistorico")`);
  revisar(sinVerificarElBanco === 0, 'Todo pago no efectivo (no histórico) pasa por la verificación', sinVerificarElBanco);
  const pendientesDemo = await prisma.abono.count({ where: { verificacion: 'POR_VERIFICAR', estado: 'ACTIVO' } });
  const verificadosDemo = await prisma.abono.count({ where: { verificacion: 'VERIFICADO', verificadoPorId: { not: null } } });
  if (esperados.semaforos) {
    // Solo la demostración promete 6 pendientes (y los demás ya verificados por un usuario); el volumen los deja todos pendientes.
    revisar(pendientesDemo === 6 && verificadosDemo > 0, `Hay ${pendientesDemo} abonos por verificar y ${verificadosDemo} verificados por un usuario`);
  } else {
    console.log(`  · Verificación: ${pendientesDemo} abonos por verificar (todos los pagos no efectivo)`);
  }

  // 6. La auditoría cubre las acciones sobre dinero.
  const auditoria = await prisma.registroAuditoria.count();
  revisar(auditoria > 0, `Auditoría con ${auditoria} registros`);

  // 7. Semáforo de cartera (solo la demostración promete los tres colores).
  const gerente = await actorDe(prisma, emailGerente);
  const cartera = await ctx.cartera.listarPorCliente(gerente);
  const cuenta = (color: string) => cartera.filter((c) => c.semaforo === color).length;
  console.log(`  · Cartera: ${cartera.length} clientes con saldo (verde ${cuenta('VERDE')}, amarillo ${cuenta('AMARILLO')}, rojo ${cuenta('ROJO')})`);
  if (esperados.semaforos) {
    revisar(cuenta('VERDE') > 0 && cuenta('AMARILLO') > 0 && cuenta('ROJO') > 0, 'Hay clientes en verde, amarillo y rojo');
  }

  return fallas;
}
