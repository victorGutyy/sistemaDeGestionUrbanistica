import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';
import { MedioPago, TipoMovimiento } from '../generated/prisma/enums.js';
import { categoriaDevolucionDesistimientoEnTx, crearMovimientoEnTx, type DatosMovimiento } from './crear-movimiento-tx.js';

const D = (v: string) => new Prisma.Decimal(v);

function crearTxFalso() {
  return {
    $executeRaw: vi.fn().mockResolvedValue(0),
    registroAuditoria: { create: vi.fn() },
    cierreCaja: { findFirst: vi.fn().mockResolvedValue(null) },
    categoriaGasto: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    categoriaIngreso: { findUnique: vi.fn() },
    movimientoFinanciero: { create: vi.fn().mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'm-1', ...data })) },
  };
}

const EGRESO: DatosMovimiento = {
  tipo: TipoMovimiento.GASTO,
  fecha: new Date(2026, 9, 1),
  valor: D('250000'),
  descripcion: '  Cemento para la obra  ',
  proyectoId: 'p-1',
  categoriaId: 'cat-gasto',
  medioPago: MedioPago.EFECTIVO,
  motivoSinSoporte: 'El proveedor no entregó factura',
  usuario: { id: 'u-1', nombre: 'Usuario de Prueba', email: 'usuario@ejemplo.test' },
};

describe('crearMovimientoEnTx', () => {
  let tx: ReturnType<typeof crearTxFalso>;
  const ejecutar = (datos: DatosMovimiento) => crearMovimientoEnTx(tx as never, datos);

  beforeEach(() => {
    tx = crearTxFalso();
    tx.categoriaGasto.findUnique.mockResolvedValue({ id: 'cat-gasto', nombre: 'Materiales', activa: true });
    tx.categoriaIngreso.findUnique.mockResolvedValue({ id: 'cat-ingreso', nombre: 'Otros servicios', activa: true });
  });

  it('un egreso se guarda con su categoría de gasto, sin categoría de ingreso', async () => {
    await ejecutar(EGRESO);
    expect(tx.categoriaGasto.findUnique).toHaveBeenCalledWith({ where: { id: 'cat-gasto' } });
    expect(tx.movimientoFinanciero.create.mock.calls[0][0].data).toMatchObject({
      tipo: 'GASTO',
      categoriaGastoId: 'cat-gasto',
      categoriaIngresoId: null,
      descripcion: 'Cemento para la obra',
      origen: 'MANUAL',
      registradoPorId: 'u-1',
    });
  });

  it('registrar un egreso deja en la auditoría quién, cuánto, en qué categoría y con qué soporte (RF-AUD-01)', async () => {
    await ejecutar({ ...EGRESO, terceroNombre: 'Ferretería de Prueba' });

    const registro = auditoriaDe(tx.registroAuditoria.create, 'MOVIMIENTO_REGISTRAR');
    expect(registro).toMatchObject({ entidad: 'MOVIMIENTO', entidadId: 'm-1', usuarioId: 'u-1', usuarioNombre: 'Usuario de Prueba' });
    expect(registro.resumen).toContain('egreso');
    expect(registro.despues).toMatchObject({ tipo: 'GASTO', valor: '250000', categoria: 'Materiales', medioPago: 'EFECTIVO', conSoporte: false, motivoSinSoporte: 'El proveedor no entregó factura' });
  });

  it('un movimiento rechazado (sin soporte, categoría inválida, fecha cerrada) no deja nada en la auditoría', async () => {
    await expect(ejecutar({ ...EGRESO, motivoSinSoporte: '   ' })).rejects.toThrow();
    tx.categoriaGasto.findUnique.mockResolvedValue(null);
    await expect(ejecutar(EGRESO)).rejects.toThrow();
    expect(auditoriasDe(tx.registroAuditoria.create)).toEqual([]);
  });

  it('un ingreso busca su categoría entre las de ingreso y no exige soporte (RF-EGR-03)', async () => {
    await ejecutar({ ...EGRESO, tipo: TipoMovimiento.INGRESO, categoriaId: 'cat-ingreso', motivoSinSoporte: undefined });
    expect(tx.categoriaIngreso.findUnique).toHaveBeenCalled();
    expect(tx.movimientoFinanciero.create.mock.calls[0][0].data).toMatchObject({ categoriaIngresoId: 'cat-ingreso', categoriaGastoId: null });
  });

  it('un movimiento con fecha dentro de un cierre de caja cerrado o aprobado se rechaza (RF-CAJ-05)', async () => {
    tx.cierreCaja.findFirst.mockResolvedValue({ numeroTexto: 'CC-000002', desde: new Date('2026-10-01T00:00:00Z'), hasta: new Date('2026-10-07T00:00:00Z') });
    await expect(ejecutar(EGRESO)).rejects.toThrow(/cierre de caja CC-000002/);
    expect(tx.movimientoFinanciero.create).not.toHaveBeenCalled();
  });

  it('un egreso sin soporte exige el motivo (RF-EGR-02)', async () => {
    await expect(ejecutar({ ...EGRESO, motivoSinSoporte: '   ' })).rejects.toThrow(/soporte/);
    expect(tx.movimientoFinanciero.create).not.toHaveBeenCalled();
  });

  it('con soporte adjunto no guarda el motivo', async () => {
    await ejecutar({ ...EGRESO, soporteRuta: 'finanzas/soporte.pdf' });
    expect(tx.movimientoFinanciero.create.mock.calls[0][0].data).toMatchObject({ soporteRuta: 'finanzas/soporte.pdf', motivoSinSoporte: null });
  });

  it.each(['0', '-5', '100.5'])('rechaza el valor %s: solo pesos enteros mayores a cero', async (valor) => {
    await expect(ejecutar({ ...EGRESO, valor: D(valor) })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.movimientoFinanciero.create).not.toHaveBeenCalled();
  });

  it('rechaza una categoría que no existe o que está desactivada', async () => {
    tx.categoriaGasto.findUnique.mockResolvedValue(null);
    await expect(ejecutar(EGRESO)).rejects.toThrow(/no existe/);
    tx.categoriaGasto.findUnique.mockResolvedValue({ id: 'cat-gasto', nombre: 'Publicidad', activa: false });
    await expect(ejecutar(EGRESO)).rejects.toThrow(/desactivada/);
    expect(tx.movimientoFinanciero.create).not.toHaveBeenCalled();
  });

  it('guarda el tercero y el número de la factura (RF-EGR-09)', async () => {
    await ejecutar({ ...EGRESO, terceroNombre: 'Ferretería de Prueba', terceroDocumento: '900000001', numeroDocumento: 'FV-123', referencia: ' ' });
    expect(tx.movimientoFinanciero.create.mock.calls[0][0].data).toMatchObject({
      terceroNombre: 'Ferretería de Prueba',
      terceroDocumento: '900000001',
      numeroDocumento: 'FV-123',
      referencia: null,
    });
  });
});

describe('categoriaDevolucionDesistimientoEnTx', () => {
  it('usa la categoría del sistema si existe, la reactiva si estaba desactivada y la crea si falta', async () => {
    const tx = crearTxFalso();
    tx.categoriaGasto.findUnique.mockResolvedValueOnce({ id: 'c', activa: true });
    expect(await categoriaDevolucionDesistimientoEnTx(tx as never)).toMatchObject({ id: 'c' });

    tx.categoriaGasto.findUnique.mockResolvedValueOnce({ id: 'c', activa: false });
    tx.categoriaGasto.update.mockResolvedValue({ id: 'c', activa: true });
    await categoriaDevolucionDesistimientoEnTx(tx as never);
    expect(tx.categoriaGasto.update).toHaveBeenCalledWith({ where: { id: 'c' }, data: { activa: true } });

    tx.categoriaGasto.findUnique.mockResolvedValueOnce(null);
    tx.categoriaGasto.create.mockResolvedValue({ id: 'nueva' });
    await categoriaDevolucionDesistimientoEnTx(tx as never);
    expect(tx.categoriaGasto.create).toHaveBeenCalledWith({ data: { nombre: 'Devolución por desistimiento', esSistema: true } });
  });
});
