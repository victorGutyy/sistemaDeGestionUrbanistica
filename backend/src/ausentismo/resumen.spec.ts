import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { calcularResumenMensual, diasDelMes, trabajadoresActivosEn, type PeriodoParaResumen, type TrabajadorParaResumen } from './resumen.js';

const dia = (anio: number, mes: number, diaDelMes: number) => new Date(anio, mes - 1, diaDelMes);
const d = (valor: number) => new Prisma.Decimal(valor);

function periodo(extra: Partial<PeriodoParaResumen> & Pick<PeriodoParaResumen, 'ausentismoId' | 'mes' | 'dias'>): PeriodoParaResumen {
  return {
    tipoId: 'tipo-eg',
    tipoNombre: 'Enfermedad general',
    anio: 2026,
    diasEmpleador: 0,
    diasEps: 0,
    diasArl: 0,
    diasAfp: 0,
    diasLaborados: 0,
    diasDescuento: 0,
    valorEmpleador: d(0),
    valorEps: d(0),
    valorArl: d(0),
    valorAfp: d(0),
    valorDescuento: d(0),
    ...extra,
  };
}

// A y B trabajan todo el año (B ingresa el 15 de marzo); C se retira el 10 de febrero.
const TRABAJADORES: TrabajadorParaResumen[] = [
  { fechaIngreso: dia(2025, 1, 1), fechaRetiro: null },
  { fechaIngreso: dia(2026, 3, 15), fechaRetiro: null },
  { fechaIngreso: dia(2025, 6, 1), fechaRetiro: dia(2026, 2, 10) },
];

const PERIODOS: PeriodoParaResumen[] = [
  periodo({ ausentismoId: 'a1', mes: 3, dias: 5, diasEmpleador: 2, diasEps: 3, valorEmpleador: d(133_340), valorEps: d(200_010) }),
  periodo({ ausentismoId: 'a2', mes: 3, dias: 3, tipoId: 'tipo-luto', tipoNombre: 'Licencia por luto', diasEmpleador: 3, valorEmpleador: d(300_000) }),
  periodo({ ausentismoId: 'a3', mes: 3, dias: 6, diasEps: 6, valorEps: d(350_181) }),
  // a4 cruza de marzo a abril.
  periodo({ ausentismoId: 'a4', mes: 3, dias: 2, diasEmpleador: 2, valorEmpleador: d(133_340) }),
  periodo({ ausentismoId: 'a4', mes: 4, dias: 2, diasEps: 2, valorEps: d(133_340) }),
  // De otro año: no cuenta.
  periodo({ ausentismoId: 'a0', anio: 2025, mes: 3, dias: 9, diasEps: 9, valorEps: d(1_000_000) }),
];

describe('trabajadoresActivosEn', () => {
  it('cuenta a quien ya ingresó a fin de mes y no se había retirado antes de que empezara', () => {
    expect(trabajadoresActivosEn(TRABAJADORES, 2026, 1)).toBe(2); // A y C
    expect(trabajadoresActivosEn(TRABAJADORES, 2026, 2)).toBe(2); // A y C (se retira el 10 de febrero: cuenta ese mes)
    expect(trabajadoresActivosEn(TRABAJADORES, 2026, 3)).toBe(2); // A y B (C ya no)
    expect(trabajadoresActivosEn(TRABAJADORES, 2026, 12)).toBe(2);
  });

  it('los límites del mes cuentan: ingresar el último día y retirarse el primero', () => {
    expect(trabajadoresActivosEn([{ fechaIngreso: dia(2026, 3, 31), fechaRetiro: null }], 2026, 3)).toBe(1);
    expect(trabajadoresActivosEn([{ fechaIngreso: dia(2026, 4, 1), fechaRetiro: null }], 2026, 3)).toBe(0);
    expect(trabajadoresActivosEn([{ fechaIngreso: dia(2025, 1, 1), fechaRetiro: dia(2026, 3, 1) }], 2026, 3)).toBe(1);
    expect(trabajadoresActivosEn([{ fechaIngreso: dia(2025, 1, 1), fechaRetiro: dia(2026, 2, 28) }], 2026, 3)).toBe(0);
  });
});

describe('calcularResumenMensual (RF-SST-10)', () => {
  const resumen = calcularResumenMensual({ anio: 2026, periodos: PERIODOS, trabajadores: TRABAJADORES });
  const marzo = resumen.meses[2];
  const abril = resumen.meses[3];

  it('trae los doce meses del año, aunque no tengan ausentismos', () => {
    expect(resumen.anio).toBe(2026);
    expect(resumen.meses.map((m) => m.mes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(resumen.meses[0]).toMatchObject({ registros: 0, dias: 0, porTipo: [], porcentajeAusentismo: '0', trabajadoresActivos: 2 });
  });

  it('cuenta los registros y los días del mes, sin los de otro año', () => {
    expect(marzo).toMatchObject({ registros: 4, dias: 16 });
    expect(abril).toMatchObject({ registros: 1, dias: 2 });
  });

  it('un ausentismo que cruza de mes cuenta en cada mes con los días de ese mes', () => {
    expect(marzo.porTipo[0]).toMatchObject({ tipoId: 'tipo-eg', registros: 3, dias: 13 }); // a1 (5) + a3 (6) + a4 (2)
    expect(abril.porTipo).toEqual([{ tipoId: 'tipo-eg', nombre: 'Enfermedad general', registros: 1, dias: 2 }]);
  });

  it('separa los días por tipo, de más a menos', () => {
    expect(marzo.porTipo.map((t) => [t.nombre, t.registros, t.dias])).toEqual([
      ['Enfermedad general', 3, 13],
      ['Licencia por luto', 1, 3],
    ]);
  });

  it('suma los días y los valores de cada pagador', () => {
    expect(marzo.diasPorPagador).toEqual({ empleador: 7, eps: 9, arl: 0, afp: 0, laborados: 0, descuento: 0 });
    expect(marzo.valores).toEqual({ empleador: '566680', eps: '550191', arl: '0', afp: '0', descuento: '0' });
    expect(abril.valores.eps).toBe('133340');
  });

  it('el porcentaje de ausentismo es días ÷ (trabajadores activos x días del mes), con dos decimales', () => {
    expect(marzo.trabajadoresActivos).toBe(2);
    expect(marzo.porcentajeAusentismo).toBe('25.81'); // 16 / 62
    expect(abril.porcentajeAusentismo).toBe('3.33'); // 2 / 60
  });

  it('el total del año suma los meses; los activos son el promedio y el porcentaje usa los días de cada mes', () => {
    expect(resumen.total).toMatchObject({ registros: 4, dias: 18, trabajadoresActivos: 2 });
    expect(resumen.total.valores).toEqual({ empleador: '566680', eps: '683531', arl: '0', afp: '0', descuento: '0' });
    expect(resumen.total.porcentajeAusentismo).toBe('2.47'); // 18 / 730
    expect(resumen.total.diasPorPagador).toMatchObject({ empleador: 7, eps: 11 });
  });

  it('sin trabajadores activos el porcentaje es cero, no una división por cero', () => {
    const vacio = calcularResumenMensual({ anio: 2026, periodos: PERIODOS, trabajadores: [] });
    expect(vacio.meses[2].porcentajeAusentismo).toBe('0');
    expect(vacio.total.porcentajeAusentismo).toBe('0');
    expect(vacio.meses[2].dias).toBe(16);
  });

  it('febrero de un año bisiesto tiene 29 días', () => {
    expect(diasDelMes(2028, 2)).toBe(29);
    expect(diasDelMes(2026, 2)).toBe(28);
    const bisiesto = calcularResumenMensual({ anio: 2028, periodos: [periodo({ ausentismoId: 'x', anio: 2028, mes: 2, dias: 29, diasEps: 29 })], trabajadores: [{ fechaIngreso: dia(2020, 1, 1), fechaRetiro: null }] });
    expect(bisiesto.meses[1].porcentajeAusentismo).toBe('100');
  });
});
