import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoProyecto, EstadoTrabajador, MedioPago, TipoNovedad } from '../generated/prisma/enums.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import type { LiquidarQuincenaDto } from './dto/liquidar-quincena.dto.js';
import { CLAVE_BLOQUEO_NOMINA, liquidarQuincenaEnTx, prepararLiquidacion } from './liquidar-quincena.js';

const D = (valor: string) => new Prisma.Decimal(valor);
const USUARIO = usuarioDePrueba();

function dto(cambios: Partial<LiquidarQuincenaDto> = {}): LiquidarQuincenaDto {
  return {
    proyectoId: 'obra-1',
    periodoInicio: '2026-10-01',
    periodoFin: '2026-10-15',
    fechaPago: '2026-10-15',
    medioPago: MedioPago.EFECTIVO,
    pagos: [{ trabajadorId: 'trab-1', dias: '10' }],
    ...cambios,
  };
}

describe('prepararLiquidacion (forma de la liquidación)', () => {
  it('cuenta los días del período con el primero y el último (quincena del 1 al 15 y del 16 al 31)', () => {
    expect(prepararLiquidacion(dto(), null).diasPeriodo).toBe(15);
    expect(prepararLiquidacion(dto({ periodoInicio: '2026-10-16', periodoFin: '2026-10-31', fechaPago: '2026-10-31' }), null).diasPeriodo).toBe(16);
  });

  it('convierte días, valor día, horas extra y novedades a decimales y limpia los textos', () => {
    const liquidacion = prepararLiquidacion(
      dto({
        pagos: [
          {
            trabajadorId: 'trab-1',
            dias: '7.5',
            valorDia: '65000',
            horasExtra: '3.5',
            valorHoraExtra: '9000',
            observaciones: '  Anticipo de la semana  ',
            novedades: [{ tipo: TipoNovedad.ANTICIPO, valor: '100000', descripcion: '  adelanto  ' }],
          },
        ],
      }),
      null,
    );
    const pago = liquidacion.pagos[0];
    expect(pago.dias.toString()).toBe('7.5');
    expect(pago.valorDia?.toString()).toBe('65000');
    expect(pago.horasExtra?.toString()).toBe('3.5');
    expect(pago.observaciones).toBe('Anticipo de la semana');
    expect(pago.novedades[0]).toMatchObject({ tipo: TipoNovedad.ANTICIPO, descripcion: 'adelanto' });
  });

  it('rechaza una fecha que no existe en el calendario', () => {
    expect(() => prepararLiquidacion(dto({ periodoFin: '2026-02-30' }), null)).toThrow(/no es una fecha real/);
    expect(() => prepararLiquidacion(dto({ fechaPago: '2026-13-01' }), null)).toThrow(/no es una fecha real/);
  });

  it('rechaza un fin anterior al inicio, un período de más de 31 días y un pago anterior al inicio', () => {
    expect(() => prepararLiquidacion(dto({ periodoInicio: '2026-10-15', periodoFin: '2026-10-01' }), null)).toThrow(/anterior a su inicio/);
    expect(() => prepararLiquidacion(dto({ periodoInicio: '2026-10-01', periodoFin: '2026-11-05' }), null)).toThrow(/no puede pasar de 31/);
    expect(() => prepararLiquidacion(dto({ fechaPago: '2026-09-30' }), null)).toThrow(/anterior al inicio del período/);
  });

  it('un período de exactamente 31 días se permite', () => {
    expect(prepararLiquidacion(dto({ periodoInicio: '2026-10-01', periodoFin: '2026-10-31', fechaPago: '2026-10-31' }), null).diasPeriodo).toBe(31);
  });

  it('rechaza el mismo trabajador dos veces en la misma liquidación', () => {
    const pagos = [{ trabajadorId: 'trab-1', dias: '5' }, { trabajadorId: 'trab-1', dias: '3' }];
    expect(() => prepararLiquidacion(dto({ pagos }), null)).toThrow(/repetido/);
  });

  it('las horas extra no se aceptan como novedad (van en horas y valor de la hora)', () => {
    const pagos = [{ trabajadorId: 'trab-1', dias: '5', novedades: [{ tipo: TipoNovedad.HORAS_EXTRA, valor: '30000' }] }];
    expect(() => prepararLiquidacion(dto({ pagos }), null)).toThrow(/horas y valor de la hora/);
  });

  it.each(['0', '-5000', '1500.50'])('rechaza una novedad con valor %s: debe ser pesos enteros mayores a cero', (valor) => {
    const pagos = [{ trabajadorId: 'trab-1', dias: '5', novedades: [{ tipo: TipoNovedad.DESCUENTO, valor }] }];
    expect(() => prepararLiquidacion(dto({ pagos }), null)).toThrow(BadRequestException);
  });
});

function crearTxFalso() {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    cierreCaja: { findFirst: vi.fn().mockResolvedValue(null) },
    proyecto: { findUnique: vi.fn() },
    trabajador: { findMany: vi.fn() },
    pagoNomina: { findMany: vi.fn(), create: vi.fn() },
    registroAuditoria: { create: vi.fn() },
  };
  return tx;
}

const OBRA = { id: 'obra-1', nombre: 'Obra de prueba', estado: EstadoProyecto.ACTIVO };
const trabajador = (id: string, nombre: string, valorDia: string | null = '60000', estado: EstadoTrabajador = EstadoTrabajador.ACTIVO) => ({
  id,
  nombre,
  documento: `DOC-${id}`,
  valorDia: valorDia ? D(valorDia) : null,
  estado,
});

describe('liquidarQuincenaEnTx (un pago por trabajador y obra)', () => {
  let tx: ReturnType<typeof crearTxFalso>;
  const ejecutar = (cambios: Partial<LiquidarQuincenaDto> = {}, cuentaId: string | null = null) =>
    liquidarQuincenaEnTx(tx as never, prepararLiquidacion(dto(cambios), cuentaId), USUARIO);

  // `repetidos` son los pagos que ya existen en esta obra y período; `otros`, los días del trabajador en otras obras.
  function datos(opciones: { repetidos?: { trabajadorId: string }[]; otros?: { trabajadorId: string; dias: Prisma.Decimal }[] } = {}) {
    tx.pagoNomina.findMany.mockImplementation(async ({ where }: { where: { proyectoId?: string } }) => (where.proyectoId ? (opciones.repetidos ?? []) : (opciones.otros ?? [])));
  }

  beforeEach(() => {
    tx = crearTxFalso();
    tx.proyecto.findUnique.mockResolvedValue(OBRA);
    tx.trabajador.findMany.mockResolvedValue([trabajador('trab-1', 'Ana Prueba'), trabajador('trab-2', 'Beto Prueba', '80000')]);
    let n = 0;
    tx.pagoNomina.create.mockImplementation(async () => ({ id: `pago-${++n}` }));
    datos();
  });

  it('crea un pago por trabajador con la obra, los días, el valor día de su ficha y los totales calculados', async () => {
    const resultado = await ejecutar({ pagos: [{ trabajadorId: 'trab-1', dias: '10' }, { trabajadorId: 'trab-2', dias: '7.5', horasExtra: '4', valorHoraExtra: '10000' }] });

    expect(tx.pagoNomina.create).toHaveBeenCalledTimes(2);
    const primero = tx.pagoNomina.create.mock.calls[0][0].data;
    expect(primero).toMatchObject({ trabajadorId: 'trab-1', proyectoId: 'obra-1', medioPago: MedioPago.EFECTIVO, cuentaId: null });
    expect(primero.salarioBase.toString()).toBe('600000');
    expect(primero.valorDia.toString()).toBe('60000');
    expect(primero.valorDevengado.toString()).toBe('600000');
    expect(primero.valorPagado.toString()).toBe('600000');
    const segundo = tx.pagoNomina.create.mock.calls[1][0].data;
    expect(segundo.salarioBase.toString()).toBe('600000'); // 7,5 x 80.000
    expect(segundo.valorHorasExtra.toString()).toBe('40000');
    expect(segundo.valorDevengado.toString()).toBe('640000');

    expect(resultado.totales.trabajadores).toBe(2);
    expect(resultado.totales.devengado.toString()).toBe('1240000');
    expect(resultado.totales.pagado.toString()).toBe('1240000');
    expect(resultado.avisos).toEqual([]);
  });

  it('el anticipo resta de lo pagado pero no del costo de la obra', async () => {
    const resultado = await ejecutar({ pagos: [{ trabajadorId: 'trab-1', dias: '10', novedades: [{ tipo: TipoNovedad.ANTICIPO, valor: '150000' }] }] });
    const data = tx.pagoNomina.create.mock.calls[0][0].data;
    expect(data.valorDevengado.toString()).toBe('600000');
    expect(data.valorPagado.toString()).toBe('450000');
    expect(data.novedades.create).toEqual([expect.objectContaining({ tipo: TipoNovedad.ANTICIPO })]);
    expect(resultado.totales.pagado.toString()).toBe('450000');
  });

  it('toma el bloqueo de nómina antes de revisar y crear, y exige que el día no esté en un cierre de caja', async () => {
    await ejecutar();
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(String(tx.$executeRaw.mock.calls[0][1])).toBe(String(CLAVE_BLOQUEO_NOMINA));
    expect(tx.cierreCaja.findFirst).toHaveBeenCalled();
  });

  it('no guarda nada si la fecha pertenece a un cierre de caja cerrado', async () => {
    tx.cierreCaja.findFirst.mockResolvedValue({ numeroTexto: 'CC-000009', desde: new Date('2026-10-01T00:00:00Z'), hasta: new Date('2026-10-31T00:00:00Z') });
    await expect(ejecutar()).rejects.toThrow(/CC-000009/);
    expect(tx.pagoNomina.create).not.toHaveBeenCalled();
  });

  it('rechaza un proyecto que no existe o que está finalizado', async () => {
    tx.proyecto.findUnique.mockResolvedValue(null);
    await expect(ejecutar()).rejects.toBeInstanceOf(NotFoundException);
    tx.proyecto.findUnique.mockResolvedValue({ ...OBRA, estado: EstadoProyecto.FINALIZADO });
    await expect(ejecutar()).rejects.toThrow(/finalizado/);
    expect(tx.pagoNomina.create).not.toHaveBeenCalled();
  });

  it('rechaza un trabajador que no existe o que ya fue retirado', async () => {
    tx.trabajador.findMany.mockResolvedValue([]);
    await expect(ejecutar()).rejects.toBeInstanceOf(NotFoundException);
    tx.trabajador.findMany.mockResolvedValue([trabajador('trab-1', 'Ana Prueba', '60000', EstadoTrabajador.INACTIVO)]);
    await expect(ejecutar()).rejects.toThrow(/retirados: Ana Prueba/);
    expect(tx.pagoNomina.create).not.toHaveBeenCalled();
  });

  it('RF-PER-23: no permite un segundo pago del mismo trabajador en la misma obra y período', async () => {
    datos({ repetidos: [{ trabajadorId: 'trab-1' }] });
    const error = await ejecutar().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ codigo: 'PAGO_NOMINA_REPETIDO' });
    expect((error as ConflictException).message).toMatch(/Ana Prueba/);
    expect(tx.pagoNomina.create).not.toHaveBeenCalled();
  });

  it('RF-PER-23: la misma persona en otra obra del mismo período sí se paga, y avisa si la suma de días pasa del período', async () => {
    // Ya tiene 9 días en otra obra; 8 más en esta suman 17 en un período de 15 días.
    datos({ otros: [{ trabajadorId: 'trab-1', dias: D('9') }] });
    const resultado = await ejecutar({ pagos: [{ trabajadorId: 'trab-1', dias: '8' }] });
    expect(tx.pagoNomina.create).toHaveBeenCalledTimes(1);
    expect(resultado.avisos).toHaveLength(1);
    expect(resultado.avisos[0].mensaje).toMatch(/suma 17 días en ese período, que tiene 15/);
  });

  it('no avisa cuando la suma de días entre obras cabe en el período', async () => {
    datos({ otros: [{ trabajadorId: 'trab-1', dias: D('5') }] });
    const resultado = await ejecutar({ pagos: [{ trabajadorId: 'trab-1', dias: '10' }] });
    expect(resultado.avisos).toEqual([]);
  });

  it('sin valor día en el pago ni en la ficha, no guarda nada y dice quién', async () => {
    tx.trabajador.findMany.mockResolvedValue([trabajador('trab-1', 'Ana Prueba', null)]);
    await expect(ejecutar()).rejects.toThrow(/Ana Prueba no tiene valor día/);
    expect(tx.pagoNomina.create).not.toHaveBeenCalled();
  });

  it('un valor día distinto al de la ficha se respeta, queda como foto del pago y se avisa', async () => {
    const resultado = await ejecutar({ pagos: [{ trabajadorId: 'trab-1', dias: '10', valorDia: '70000' }] });
    expect(tx.pagoNomina.create.mock.calls[0][0].data.valorDia.toString()).toBe('70000');
    expect(resultado.avisos[0].mensaje).toMatch(/actualízalo en la ficha/);
  });

  it('un error de cálculo dice de qué trabajador es (días con un cuarto de día)', async () => {
    await expect(ejecutar({ pagos: [{ trabajadorId: 'trab-1', dias: '7.25' }] })).rejects.toThrow(/Ana Prueba: Los días se escriben enteros/);
  });

  it('deja una auditoría por cada pago, con quién, qué y los valores', async () => {
    await ejecutar({ pagos: [{ trabajadorId: 'trab-1', dias: '10' }, { trabajadorId: 'trab-2', dias: '5' }] });
    expect(tx.registroAuditoria.create).toHaveBeenCalledTimes(2);
    const primera = tx.registroAuditoria.create.mock.calls[0][0].data;
    expect(primera).toMatchObject({ accion: 'NOMINA_REGISTRAR_PAGO', entidad: 'NOMINA', entidadId: 'pago-1', usuarioId: USUARIO.id });
    expect(primera.resumen).toMatch(/Ana Prueba/);
    expect(primera.despues).toMatchObject({ proyectoId: 'obra-1', dias: '10', valorDevengado: '600000' });
  });
});
