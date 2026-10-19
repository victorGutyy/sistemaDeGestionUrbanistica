import { crearAbonoEnTx, type ContextoRecibo } from '../abonos/crear-abono-tx.js';
import { registrarAuditoria, soloCampos, type ActorAuditoria } from '../auditoria/auditoria.js';
import { formatearCOP } from '../common/formato.util.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoVenta, TipoEventoLote } from '../generated/prisma/enums.js';
import { aplicarAccionLote } from '../lotes/aplicar-accion.js';
import { normalizarTexto } from './celdas.js';
import type { PlanImportacion } from './validar.js';

export const MOTIVO_IMPORTACION = 'Importación desde Excel';
export const RECIBIDO_POR_IMPORTACION = 'Registro histórico (importado desde Excel)';

export interface ResultadoEjecucion {
  proyectos: number;
  manzanas: number;
  lotes: number;
  clientes: number;
  vendedores: number;
  ventas: number;
  cuotas: number;
  abonos: number;
  // Rango de recibos históricos emitidos (serie H-).
  recibosHistoricos: { cantidad: number; primero: string | null; ultimo: string | null };
}

const claveManzana = (proyecto: string, manzana: string) => `${normalizarTexto(proyecto)}|${normalizarTexto(manzana)}`;

// Guarda el plan validado. Se llama DENTRO de la transacción de la carga: si cualquier paso falla, no queda nada
// guardado (ni proyectos, ni ventas, ni recibos) y los consecutivos de recibos no se consumen.
//
// Reutiliza los mismos mecanismos del uso diario: el estado del lote pasa por la máquina de estados (queda en el
// historial del lote) y cada abono se registra con `crearAbonoEnTx`, que lo reparte entre las cuotas, emite su recibo
// con consecutivo sin saltos (serie histórica H-) y lo deja en la auditoría.
export async function ejecutarPlanEnTx(
  tx: Prisma.TransactionClient,
  plan: PlanImportacion,
  usuario: ActorAuditoria,
  contextoRecibo: ContextoRecibo,
): Promise<ResultadoEjecucion> {
  const contexto: ContextoRecibo = { ...contextoRecibo, recibidoPor: RECIBIDO_POR_IMPORTACION };

  // ----- Proyectos y manzanas -------------------------------------------------------------
  const proyectoIds = new Map<string, string>();
  for (const proyecto of plan.proyectos) {
    const creado = await tx.proyecto.create({
      data: {
        nombre: proyecto.nombre,
        ubicacion: proyecto.ubicacion,
        municipio: proyecto.municipio,
        areaTotal: proyecto.areaTotal,
        valorCompra: proyecto.valorCompra,
        fechaCompra: proyecto.fechaCompra ? parsearFechaLocal(proyecto.fechaCompra) : null,
      },
    });
    proyectoIds.set(normalizarTexto(proyecto.nombre), creado.id);
    await registrarAuditoria(tx, {
      usuario,
      accion: 'PROYECTO_CREAR',
      entidad: 'PROYECTO',
      entidadId: creado.id,
      resumen: `Creó el proyecto ${creado.nombre} (${MOTIVO_IMPORTACION})`,
      despues: soloCampos(creado, ['nombre', 'tipo', 'ubicacion', 'municipio', 'areaTotal', 'valorCompra', 'fechaCompra', 'estado']),
    });
  }
  const idDelProyecto = (nombre: string, idExistente?: string) => idExistente ?? (proyectoIds.get(normalizarTexto(nombre)) as string);

  const manzanaIds = new Map<string, string>();
  for (const manzana of plan.manzanas) {
    const creada = await tx.manzana.create({ data: { proyectoId: idDelProyecto(manzana.proyecto, manzana.proyectoId), nombre: manzana.nombre } });
    manzanaIds.set(claveManzana(manzana.proyecto, manzana.nombre), creada.id);
  }

  // ----- Lotes ------------------------------------------------------------------------------
  const loteIds = new Map<string, string>();
  for (const lote of plan.lotes) {
    const creado = await tx.lote.create({
      data: {
        proyectoId: idDelProyecto(lote.proyecto, lote.proyectoId),
        manzanaId: lote.manzana ? (lote.manzanaId ?? manzanaIds.get(claveManzana(lote.proyecto, lote.manzana)) ?? null) : null,
        numero: lote.numero,
        area: lote.area,
        valorVenta: lote.valorVenta,
        valorPorM2: lote.valorPorM2,
        linderos: lote.linderos,
      },
    });
    loteIds.set(lote.clave, creado.id);
  }
  if (loteIds.size > 0) {
    const nuevos = await tx.lote.findMany({ where: { id: { in: [...loteIds.values()] } }, select: { id: true, estado: true, valorVenta: true } });
    await tx.loteHistorial.createMany({
      data: nuevos.map((lote) => ({
        loteId: lote.id,
        tipo: TipoEventoLote.CREACION,
        estadoNuevo: lote.estado,
        valorNuevo: lote.valorVenta,
        motivo: MOTIVO_IMPORTACION,
        usuarioId: usuario.id,
      })),
    });
  }

  // ----- Clientes y vendedores ----------------------------------------------------------------
  const clienteIds = new Map<string, string>();
  for (const cliente of plan.clientes) {
    const creado = await tx.cliente.create({
      data: { nombre: cliente.nombre, documento: cliente.documento, telefono: cliente.telefono, email: cliente.email, direccion: cliente.direccion },
    });
    clienteIds.set(cliente.documento, creado.id);
    await registrarAuditoria(tx, {
      usuario,
      accion: 'CLIENTE_CREAR',
      entidad: 'CLIENTE',
      entidadId: creado.id,
      resumen: `Creó el cliente ${creado.nombre} (documento ${creado.documento}) (${MOTIVO_IMPORTACION})`,
      despues: soloCampos(creado, ['nombre', 'documento', 'telefono', 'email', 'direccion']),
    });
  }
  const vendedorIds = new Map<string, string>();
  for (const vendedor of plan.vendedores) {
    const creado = await tx.vendedor.create({ data: { tipo: vendedor.tipo, nombre: vendedor.nombre, documento: vendedor.documento } });
    vendedorIds.set(vendedor.documento, creado.id);
  }

  const idDelCliente = async (documento: string) => {
    const conocido = clienteIds.get(documento);
    if (conocido) return conocido;
    const existente = await tx.cliente.findUniqueOrThrow({ where: { documento }, select: { id: true } });
    clienteIds.set(documento, existente.id);
    return existente.id;
  };
  const idDelVendedor = async (documento: string | null) => {
    if (!documento) return null;
    const conocido = vendedorIds.get(documento);
    if (conocido) return conocido;
    const existente = await tx.vendedor.findUniqueOrThrow({ where: { documento }, select: { id: true } });
    vendedorIds.set(documento, existente.id);
    return existente.id;
  };

  // ----- Ventas, cuotas, abonos y recibos históricos --------------------------------------------
  let cuotas = 0;
  let abonos = 0;
  const recibos: string[] = [];

  for (const venta of plan.ventas) {
    const loteId = venta.loteId ?? (loteIds.get(venta.claveLote) as string);
    const lote = await tx.lote.findUniqueOrThrow({ where: { id: loteId }, select: { id: true, numero: true, estado: true } });

    const creada = await tx.venta.create({
      data: {
        loteId,
        clienteId: await idDelCliente(venta.documentoCliente),
        vendedorId: await idDelVendedor(venta.vendedorDocumento),
        valorTotal: venta.valorTotal,
        cuotaInicial: venta.cuotaInicial,
        numeroCuotas: venta.numeroCuotas,
        tasaInteres: null,
        formaPago: venta.formaPago,
        fechaVenta: parsearFechaLocal(venta.fechaVenta),
        fechaCuotaInicial: parsearFechaLocal(venta.fechaCuotaInicial),
        estado: EstadoVenta.ACTIVA,
        registradaPorId: usuario.id,
      },
    });
    await tx.cuota.createMany({
      data: venta.cuotas.map((cuota) => ({
        ventaId: creada.id,
        numero: cuota.numero,
        fechaVencimiento: parsearFechaLocal(cuota.fechaVencimiento),
        valor: cuota.valor,
      })),
    });
    cuotas += venta.cuotas.length;

    await aplicarAccionLote(tx, lote, 'VENDER', usuario, { ventaId: creada.id, motivo: MOTIVO_IMPORTACION });
    await registrarAuditoria(tx, {
      usuario,
      accion: 'VENTA_CREAR',
      entidad: 'VENTA',
      entidadId: creada.id,
      resumen: `Registró la venta del lote ${lote.numero} por ${formatearCOP(venta.valorTotal)} (${MOTIVO_IMPORTACION})`,
      despues: {
        ...soloCampos(creada, ['estado', 'loteId', 'clienteId', 'vendedorId', 'formaPago', 'valorTotal', 'cuotaInicial', 'numeroCuotas', 'fechaVenta']),
        importada: true,
        abonosImportados: venta.abonos.length,
      },
    });

    // En orden de fecha: así el saldo anterior de cada recibo histórico sale en orden cronológico.
    for (const abono of venta.abonos) {
      const { recibo } = await crearAbonoEnTx(
        tx,
        {
          ventaId: creada.id,
          fecha: parsearFechaLocal(abono.fecha),
          valor: abono.valor,
          medioPago: abono.medioPago,
          cuentaDestinoId: abono.cuentaId,
          referencia: abono.referencia,
          registradoPorId: usuario.id,
          esHistorico: true,
        },
        contexto,
      );
      recibos.push(recibo.numeroTexto);
      abonos += 1;
    }
  }

  return {
    proyectos: plan.proyectos.length,
    manzanas: plan.manzanas.length,
    lotes: plan.lotes.length,
    clientes: plan.clientes.length,
    vendedores: plan.vendedores.length,
    ventas: plan.ventas.length,
    cuotas,
    abonos,
    recibosHistoricos: { cantidad: recibos.length, primero: recibos[0] ?? null, ultimo: recibos[recibos.length - 1] ?? null },
  };
}
