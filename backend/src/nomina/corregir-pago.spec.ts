import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoCierre, EstadoProyecto, MedioPago, TipoNovedad } from '../generated/prisma/enums.js';
import { auditoriaDe } from '../test-utils/auditoria.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { corregirPagoEnTx } from './corregir-pago.js';
import type { CorregirPagoNominaDto } from './dto/corregir-pago-nomina.dto.js';

const D = (valor: string) => new Prisma.Decimal(valor);
const USUARIO = usuarioDePrueba();
const MOTIVO = 'Se digitaron mal los días de la quincena';

// Un pago de la obra 1 del 1 al 15 de octubre de 2026: 10 días a $60.000, con un anticipo de $100.000.
function pagoBase(cambios: Record<string, unknown> = {}) {
  return {
    id: 'pago-1',
    trabajadorId: 'trab-1',
    proyectoId: 'obra-1',
    periodoInicio: new Date(2026, 9, 1),
    periodoFin: new Date(2026, 9, 15),
    salarioBase: D('600000'),
    dias: D('10'),
    valorDia: D('60000'),
    horasExtra: D('0'),
    valorHoraExtra: D('0'),
    valorHorasExtra: D('0'),
    valorDevengado: D('600000'),
    observaciones: null,
    valorPagado: D('500000'),
    fechaPago: new Date(2026, 9, 15),
    medioPago: MedioPago.EFECTIVO,
    cuentaId: null,
    novedades: [{ id: 'n-1', pagoId: 'pago-1', tipo: TipoNovedad.ANTICIPO, valor: D('100000'), descripcion: null }],
    trabajador: { id: 'trab-1', nombre: 'Ana Prueba', documento: 'DOC-1' },
    proyecto: { id: 'obra-1', nombre: 'Obra de prueba', estado: EstadoProyecto.ACTIVO },
    ...cambios,
  };
}

function crearTxFalso() {
  return {
    $executeRaw: vi.fn().mockResolvedValue(0),
    cierreCaja: { findFirst: vi.fn().mockResolvedValue(null) },
    cuentaBancaria: { findUnique: vi.fn() },
    pagoNomina: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), update: vi.fn().mockResolvedValue({}) },
    registroAuditoria: { create: vi.fn() },
  };
}

describe('corregirPagoEnTx (CC-09, corregir un pago ya liquidado)', () => {
  let tx: ReturnType<typeof crearTxFalso>;
  const corregir = (cambios: Partial<CorregirPagoNominaDto> = {}) => corregirPagoEnTx(tx as never, 'pago-1', { motivo: MOTIVO, ...cambios }, USUARIO);

  beforeEach(() => {
    tx = crearTxFalso();
    tx.pagoNomina.findUnique.mockResolvedValue(pagoBase());
  });

  it('corrige los días y recalcula el devengado y lo pagado con la misma fórmula de la liquidación', async () => {
    const resultado = await corregir({ dias: '12' });
    const datos = tx.pagoNomina.update.mock.calls[0][0].data;
    expect(datos.dias.toString()).toBe('12');
    expect(datos.salarioBase.toString()).toBe('720000');
    expect(datos.valorDevengado.toString()).toBe('720000');
    // El anticipo del pago original se conserva: 720.000 - 100.000.
    expect(datos.valorPagado.toString()).toBe('620000');
    expect(datos.novedades).toBeUndefined();
    expect(resultado.pago).toMatchObject({ id: 'pago-1' });
    expect(resultado.pago.valorPagado.toString()).toBe('620000');
  });

  it('corrige el valor día y las horas extra (con su tarifa)', async () => {
    await corregir({ valorDia: '70000', horasExtra: '4', valorHoraExtra: '9000' });
    const datos = tx.pagoNomina.update.mock.calls[0][0].data;
    expect(datos.valorDia.toString()).toBe('70000');
    expect(datos.valorHorasExtra.toString()).toBe('36000');
    expect(datos.valorDevengado.toString()).toBe('736000');
    expect(datos.valorPagado.toString()).toBe('636000');
  });

  it('si se envían novedades REEMPLAZAN las anteriores; [] las quita todas', async () => {
    await corregir({ novedades: [{ tipo: TipoNovedad.DESCUENTO, valor: '20000', descripcion: ' préstamo ' }] });
    const datos = tx.pagoNomina.update.mock.calls[0][0].data;
    expect(datos.novedades.deleteMany).toEqual({});
    expect(datos.novedades.create).toEqual([{ tipo: TipoNovedad.DESCUENTO, valor: D('20000'), descripcion: 'préstamo' }]);
    expect(datos.valorPagado.toString()).toBe('580000');

    tx.pagoNomina.update.mockClear();
    await corregir({ novedades: [] });
    expect(tx.pagoNomina.update.mock.calls[0][0].data.valorPagado.toString()).toBe('600000');
  });

  it('las horas extra no se aceptan como novedad', async () => {
    await expect(corregir({ novedades: [{ tipo: TipoNovedad.HORAS_EXTRA, valor: '30000' }] })).rejects.toThrow(/horas y valor de la hora/);
    expect(tx.pagoNomina.update).not.toHaveBeenCalled();
  });

  it('un error de cálculo dice de qué trabajador es y no guarda nada', async () => {
    await expect(corregir({ dias: '7.25' })).rejects.toThrow(/Ana Prueba: Los días se escriben enteros/);
    await expect(corregir({ novedades: [{ tipo: TipoNovedad.ANTICIPO, valor: '900000' }] })).rejects.toThrow(/superan lo devengado/);
    expect(tx.pagoNomina.update).not.toHaveBeenCalled();
    expect(tx.registroAuditoria.create).not.toHaveBeenCalled();
  });

  it('rechaza una corrección que no cambia nada', async () => {
    await expect(corregir({ dias: '10', valorDia: '60000' })).rejects.toThrow(/nada que corregir/);
    expect(tx.pagoNomina.update).not.toHaveBeenCalled();
  });

  it('exige el motivo (mínimo 10 caracteres)', async () => {
    await expect(corregirPagoEnTx(tx as never, 'pago-1', { motivo: '  corto ', dias: '11' }, USUARIO)).rejects.toThrow(/al menos 10 caracteres/);
  });

  it('un pago que no existe da no encontrado', async () => {
    tx.pagoNomina.findUnique.mockResolvedValue(null);
    await expect(corregir({ dias: '11' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un pago anterior a la liquidación por obra (sin días ni obra) no se corrige aquí', async () => {
    tx.pagoNomina.findUnique.mockResolvedValue(pagoBase({ proyecto: null, proyectoId: null, dias: null, valorDia: null }));
    await expect(corregir({ valorDia: '70000' })).rejects.toThrow(/anterior a la liquidación por obra/);
  });

  it('una obra finalizada no admite cambios en su nómina', async () => {
    tx.pagoNomina.findUnique.mockResolvedValue(pagoBase({ proyecto: { id: 'obra-1', nombre: 'Obra de prueba', estado: EstadoProyecto.FINALIZADO } }));
    await expect(corregir({ dias: '11' })).rejects.toThrow(/está finalizado/);
    expect(tx.pagoNomina.update).not.toHaveBeenCalled();
  });

  it('toma el mismo bloqueo de las liquidaciones', async () => {
    await corregir({ dias: '11' });
    expect(tx.$executeRaw).toHaveBeenCalled();
  });

  describe('cierre de caja', () => {
    const CIERRE = { numeroTexto: 'CC-2026-010', desde: new Date('2026-10-12T00:00:00.000Z'), hasta: new Date('2026-10-18T00:00:00.000Z') };

    it('si el día del pago ya está en un cierre cerrado, no se corrige', async () => {
      tx.cierreCaja.findFirst.mockResolvedValue({ ...CIERRE, estado: EstadoCierre.CERRADO });
      await expect(corregir({ dias: '11' })).rejects.toBeInstanceOf(ConflictException);
      expect(tx.pagoNomina.update).not.toHaveBeenCalled();
    });

    it('si la fecha NUEVA cae en un cierre cerrado, tampoco', async () => {
      tx.cierreCaja.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(CIERRE);
      await expect(corregir({ fechaPago: '2026-10-16' })).rejects.toBeInstanceOf(ConflictException);
      expect(tx.pagoNomina.update).not.toHaveBeenCalled();
    });

    it('la fecha de pago no puede ser anterior al inicio del período ni una fecha que no existe', async () => {
      await expect(corregir({ fechaPago: '2026-09-30' })).rejects.toThrow(/anterior al inicio del período/);
      await expect(corregir({ fechaPago: '2026-02-30' })).rejects.toThrow(/no es una fecha real/);
    });

    it('cambiar la fecha de pago a un día abierto funciona', async () => {
      await corregir({ fechaPago: '2026-10-20' });
      expect(tx.pagoNomina.update.mock.calls[0][0].data.fechaPago).toEqual(new Date(2026, 9, 20));
    });
  });

  describe('medio y cuenta de pago', () => {
    it('pasar a transferencia exige la cuenta', async () => {
      await expect(corregir({ medioPago: MedioPago.TRANSFERENCIA })).rejects.toThrow(/Indica la cuenta/);
    });

    it('pasar a transferencia con una cuenta activa la guarda', async () => {
      tx.cuentaBancaria.findUnique.mockResolvedValue({ id: 'cuenta-1', alias: 'Bancolombia', activa: true });
      await corregir({ medioPago: MedioPago.TRANSFERENCIA, cuentaId: 'cuenta-1' });
      const datos = tx.pagoNomina.update.mock.calls[0][0].data;
      expect(datos.medioPago).toBe(MedioPago.TRANSFERENCIA);
      expect(datos.cuentaId).toBe('cuenta-1');
    });

    it('volver a efectivo quita la cuenta', async () => {
      tx.pagoNomina.findUnique.mockResolvedValue(pagoBase({ medioPago: MedioPago.TRANSFERENCIA, cuentaId: 'cuenta-1' }));
      await corregir({ medioPago: MedioPago.EFECTIVO });
      expect(tx.pagoNomina.update.mock.calls[0][0].data.cuentaId).toBeNull();
    });

    it('si el medio no cambia, la cuenta anterior se conserva', async () => {
      tx.pagoNomina.findUnique.mockResolvedValue(pagoBase({ medioPago: MedioPago.TRANSFERENCIA, cuentaId: 'cuenta-1' }));
      tx.cuentaBancaria.findUnique.mockResolvedValue({ id: 'cuenta-1', alias: 'Bancolombia', activa: true });
      await corregir({ medioPago: MedioPago.TRANSFERENCIA, dias: '11' });
      expect(tx.pagoNomina.update.mock.calls[0][0].data.cuentaId).toBe('cuenta-1');
    });
  });

  describe('aviso por días en varias obras', () => {
    it('avisa (sin impedir guardar) si la suma con las otras obras pasa de los días del período', async () => {
      tx.pagoNomina.findMany.mockResolvedValue([{ dias: D('8') }]);
      const resultado = await corregir({ dias: '10.5' });
      expect(resultado.avisos[0].mensaje).toMatch(/suma 18\.5 días en ese período, que tiene 15/);
      expect(tx.pagoNomina.update).toHaveBeenCalled();
    });

    it('no avisa si la suma cabe en el período', async () => {
      tx.pagoNomina.findMany.mockResolvedValue([{ dias: D('3') }]);
      expect((await corregir({ dias: '11' })).avisos).toEqual([]);
    });
  });

  it('deja la auditoría con lo anterior, lo nuevo y el motivo', async () => {
    await corregir({ dias: '12', observaciones: ' se corrigió ' });
    const registro = auditoriaDe(tx.registroAuditoria.create, 'NOMINA_CORREGIR_PAGO');
    expect(registro).toMatchObject({ entidad: 'NOMINA', entidadId: 'pago-1', usuarioId: USUARIO.id });
    expect(registro.resumen).toMatch(/Ana Prueba.*devengado de \$600\.000 a \$720\.000.*Se digitaron mal los días/);
    expect(registro.antes).toMatchObject({ dias: '10', valorDevengado: '600000', valorPagado: '500000', observaciones: '' });
    expect(registro.despues).toMatchObject({ dias: '12', valorDevengado: '720000', valorPagado: '620000', observaciones: 'se corrigió', motivo: MOTIVO });
  });
});
