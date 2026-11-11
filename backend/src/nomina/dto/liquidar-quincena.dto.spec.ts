import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { LiquidarQuincenaDto, MAXIMO_PAGOS_POR_LIQUIDACION } from './liquidar-quincena.dto.js';

const UUID = '3f2b1c2e-5a1d-4a52-9b7e-0c8a4d2f6e11';
const base = () => ({
  proyectoId: UUID,
  periodoInicio: '2026-10-01',
  periodoFin: '2026-10-15',
  fechaPago: '2026-10-15',
  medioPago: 'EFECTIVO',
  pagos: [{ trabajadorId: UUID, dias: '7.5' }],
});

// Devuelve los textos de los errores (de la liquidación y de lo anidado) para comprobar que se rechazó por la razón correcta.
async function errores(datos: unknown): Promise<string[]> {
  const instancia = plainToInstance(LiquidarQuincenaDto, datos);
  const lista = await validate(instancia, { whitelist: true, forbidNonWhitelisted: true });
  const recoger = (e: (typeof lista)[number]): string[] => [...Object.values(e.constraints ?? {}), ...(e.children ?? []).flatMap(recoger)];
  return lista.flatMap(recoger);
}

describe('LiquidarQuincenaDto (la forma que llega por la API)', () => {
  it('acepta una liquidación completa', async () => {
    const datos = base();
    datos.pagos = [
      { trabajadorId: UUID, dias: '7.5', valorDia: '65000', horasExtra: '3.5', valorHoraExtra: '9000', observaciones: 'ok', novedades: [{ tipo: 'ANTICIPO', valor: '100000' }] } as never,
      { trabajadorId: UUID, dias: '15' },
    ];
    expect(await errores({ ...datos, cuentaId: UUID })).toEqual([]);
  });

  it.each([
    ['días con dos decimales', { dias: '7.25' }],
    ['días que no son un número', { dias: 'siete' }],
    ['días como número en vez de texto', { dias: 7.5 }],
    ['valor día con centavos', { dias: '5', valorDia: '60000.5' }],
    ['valor día negativo', { dias: '5', valorDia: '-60000' }],
    ['horas extra con dos decimales', { dias: '5', horasExtra: '2.25' }],
    ['valor de la hora con centavos', { dias: '5', valorHoraExtra: '9000.75' }],
    ['observaciones demasiado largas', { dias: '5', observaciones: 'x'.repeat(301) }],
    ['una novedad con un tipo inexistente', { dias: '5', novedades: [{ tipo: 'REGALO', valor: '1000' }] }],
  ])('rechaza %s', async (_nombre, pago) => {
    const datos = { ...base(), pagos: [{ trabajadorId: UUID, ...pago }] };
    expect((await errores(datos)).length).toBeGreaterThan(0);
  });

  it('rechaza una lista vacía de trabajadores y una con demasiados', async () => {
    expect((await errores({ ...base(), pagos: [] })).join(' ')).toMatch(/al menos un trabajador/);
    const demasiados = Array.from({ length: MAXIMO_PAGOS_POR_LIQUIDACION + 1 }, () => ({ trabajadorId: UUID, dias: '1' }));
    expect((await errores({ ...base(), pagos: demasiados })).length).toBeGreaterThan(0);
  });

  it('rechaza fechas con otro formato, un proyecto que no es un identificador y un medio de pago inexistente', async () => {
    expect((await errores({ ...base(), periodoInicio: '01/10/2026' })).join(' ')).toMatch(/periodoInicio/);
    expect((await errores({ ...base(), fechaPago: '2026-10-1' })).join(' ')).toMatch(/fechaPago/);
    expect((await errores({ ...base(), proyectoId: 'obra-1' })).length).toBeGreaterThan(0);
    expect((await errores({ ...base(), medioPago: 'TRUEQUE' })).length).toBeGreaterThan(0);
  });

  it('rechaza campos que no existen (no se cuelan datos extra)', async () => {
    expect((await errores({ ...base(), valorPagado: '999999999' })).length).toBeGreaterThan(0);
  });
});
