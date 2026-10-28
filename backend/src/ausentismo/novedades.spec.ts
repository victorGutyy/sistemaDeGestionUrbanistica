import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { filasDeNovedades, reporteDeNovedades, totalesDeNovedades, type PeriodoParaNovedades } from './novedades.js';

const dia = (mes: number, diaDelMes: number) => new Date(2026, mes - 1, diaDelMes);
const d = (valor: number) => new Prisma.Decimal(valor);

function periodo(nombre: string, inicio: Date, extra: Partial<PeriodoParaNovedades> = {}, ausentismo: Partial<PeriodoParaNovedades['ausentismo']> = {}): PeriodoParaNovedades {
  return {
    anio: 2026,
    mes: 3,
    dias: 5,
    diasEmpleador: 2,
    diasEps: 3,
    diasArl: 0,
    diasAfp: 0,
    diasLaborados: 0,
    diasDescuento: 0,
    valorEmpleador: d(133_340),
    valorEps: d(200_010),
    valorArl: d(0),
    valorAfp: d(0),
    valorDescuento: d(0),
    ausentismo: {
      id: `a-${nombre}`,
      numeroDocumento: 'INC-1',
      fechaInicio: inicio,
      fechaFin: new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 4),
      esProrroga: false,
      corregida: false,
      trabajador: { nombre, documento: `doc-${nombre}`, cargo: 'Oficial' },
      tipo: { nombre: 'Enfermedad general' },
      ...ausentismo,
    },
    ...extra,
  };
}

describe('filasDeNovedades (RF-SST-11)', () => {
  const periodos = [
    periodo('Zulema Inventada', dia(3, 20)),
    periodo('Ana Inventada', dia(3, 12), {}, { numeroDocumento: null, esProrroga: true, corregida: true }),
    periodo('Ana Inventada', dia(3, 2), { dias: 3, diasEmpleador: 3, diasEps: 0, valorEmpleador: d(300_000), valorEps: d(0) }, { tipo: { nombre: 'Licencia por luto' } }),
  ];
  const filas = filasDeNovedades(periodos);

  it('ordena por trabajador y por fecha de inicio', () => {
    expect(filas.map((f) => [f.trabajador, f.desde])).toEqual([
      ['Ana Inventada', '2026-03-02'],
      ['Ana Inventada', '2026-03-12'],
      ['Zulema Inventada', '2026-03-20'],
    ]);
  });

  it('trae el documento, el tipo, los días y los valores de cada pagador', () => {
    expect(filas[0]).toMatchObject({
      documentoTrabajador: 'doc-Ana Inventada',
      numeroDocumento: 'INC-1',
      tipo: 'Licencia por luto',
      desde: '2026-03-02',
      hasta: '2026-03-06',
      dias: 3,
      diasEmpleador: 3,
      valorEmpleador: '300000',
      valorEps: '0',
    });
  });

  it('anota si es prórroga o si la liquidación se corrigió a mano', () => {
    expect(filas[0].observacion).toBeNull();
    expect(filas[1].observacion).toBe('Prórroga. Liquidación corregida a mano');
    expect(filas[1].numeroDocumento).toBeNull();
  });

  it('nunca lleva diagnóstico, observaciones del registro ni el salario', () => {
    const texto = JSON.stringify(filas);
    expect(texto).not.toMatch(/diagnostico|observaciones|salario|cie/i);
  });

  it('suma los días y los valores en la fila de totales', () => {
    expect(totalesDeNovedades(filas)).toMatchObject({ trabajador: 'Total', dias: 13, diasEmpleador: 7, diasEps: 6, valorEmpleador: '566680', valorEps: '400020', valorDescuento: '0' });
  });
});

describe('reporteDeNovedades', () => {
  it('arma el reporte con el título del mes, los filtros y la hoja de novedades', () => {
    const reporte = reporteDeNovedades(2026, 3, [periodo('Ana Inventada', dia(3, 12))], new Date('2026-04-02T15:00:00.000Z'));
    expect(reporte.clave).toBe('ausentismo-novedades');
    expect(reporte.titulo).toBe('Novedades de ausentismo para la nómina · marzo de 2026');
    expect(reporte.filtros).toEqual([
      { etiqueta: 'Mes', valor: 'marzo de 2026' },
      { etiqueta: 'Estado', valor: 'Ausentismos vigentes (sin anulados)' },
    ]);
    expect(reporte.secciones).toHaveLength(1);
    expect(reporte.secciones[0].filas).toHaveLength(1);
    expect(reporte.secciones[0].totales).toBeDefined();
    expect(reporte.secciones[0].columnas.map((c) => c.clave)).toContain('valorEps');
  });

  it('un mes sin ausentismos da una hoja vacía, sin totales', () => {
    const reporte = reporteDeNovedades(2026, 7, [], new Date());
    expect(reporte.secciones[0].filas).toEqual([]);
    expect(reporte.secciones[0].totales).toBeUndefined();
  });
});
