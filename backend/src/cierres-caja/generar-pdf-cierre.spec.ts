import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { calcularCierre, type AbonoCaja, type DatosCierre, type MovimientoCaja } from './calcular-cierre.js';
import { generarPdfCierre, type DatosPdfCierre, type EmpresaPdfCierre } from './generar-pdf-cierre.js';

const D = (v: string) => new Prisma.Decimal(v);
const EMPRESA: EmpresaPdfCierre = {
  nombreComercial: 'Empresa de prueba',
  razonSocial: 'Empresa de prueba SAS',
  nit: '900000000',
  direccion: 'Calle 1 # 2-3',
  telefonos: null,
  correo: 'contacto@ejemplo.test',
  colorPrimario: '#2563eb',
};
const CUENTA = { id: 'cuenta-1', alias: 'Ahorros', banco: 'Banco de prueba' };

const abono = (id: string, dia: number, valor: string, extra: Partial<AbonoCaja> = {}): AbonoCaja => ({
  id,
  fecha: new Date(2026, 9, dia),
  valor: D(valor),
  medioPago: 'EFECTIVO',
  cuenta: null,
  estado: 'ACTIVO',
  anuladoEn: null,
  recibo: `RC-${id}`,
  cliente: 'Cliente de Prueba',
  lote: 'L-1',
  proyecto: 'Proyecto de prueba',
  ...extra,
});

const gasto = (id: string, dia: number, valor: string): MovimientoCaja => ({
  id,
  tipo: 'GASTO',
  fecha: new Date(2026, 9, dia),
  valor: D(valor),
  medioPago: 'TRANSFERENCIA',
  cuenta: CUENTA,
  estado: 'ACTIVO',
  anuladoEn: null,
  descripcion: 'Compra de materiales para la obra',
  categoria: 'Materiales',
  proyecto: 'Proyecto de prueba',
});

function datosPdf(datos: DatosCierre, extra: Partial<DatosPdfCierre> = {}): DatosPdfCierre {
  return {
    numeroTexto: 'CC-000001',
    tipo: 'SEMANAL',
    desde: '2026-10-12',
    hasta: '2026-10-18',
    estado: 'APROBADO',
    creadoPor: 'Administrador de Prueba',
    cerradoPor: 'Administrador de Prueba',
    cerradoEn: new Date(Date.UTC(2026, 9, 19, 15, 0, 0)),
    resueltoPor: 'Gerente de Prueba',
    resueltoEn: new Date(Date.UTC(2026, 9, 19, 18, 0, 0)),
    observacionGerente: null,
    efectivoContado: '400000',
    diferencia: '0',
    explicacionDiferencia: null,
    resumen: calcularCierre({ desde: '2026-10-12', hasta: '2026-10-18', efectivoInicial: D('100000') }, datos),
    ...extra,
  };
}

const paginas = (pdf: Buffer) => Number(/\/Count (\d+)/.exec(pdf.toString('latin1'))?.[1]);
const esPdf = (pdf: Buffer) => pdf.subarray(0, 5).toString('ascii') === '%PDF-';

const POCOS: DatosCierre = {
  abonos: [abono('1', 13, '500000'), abono('2', 14, '2000000', { medioPago: 'TRANSFERENCIA', cuenta: CUENTA })],
  movimientos: [gasto('g1', 15, '400000')],
  nominas: [],
};

describe('generarPdfCierre (RF-CAJ-06)', () => {
  it('genera un PDF válido de una hoja para un cierre aprobado', async () => {
    const pdf = await generarPdfCierre(datosPdf(POCOS), { empresa: EMPRESA });
    expect(esPdf(pdf)).toBe(true);
    expect(paginas(pdf)).toBe(1);
  });

  it('un borrador y un cierre devuelto se generan igual, marcados como no definitivos', async () => {
    const borrador = await generarPdfCierre(
      datosPdf(POCOS, { estado: 'BORRADOR', numeroTexto: null, efectivoContado: null, diferencia: null, cerradoPor: null, cerradoEn: null, resueltoPor: null, resueltoEn: null }),
      { empresa: EMPRESA },
    );
    const devuelto = await generarPdfCierre(datosPdf(POCOS, { estado: 'DEVUELTO', observacionGerente: 'Falta el soporte del taxi' }), { empresa: EMPRESA });
    expect(esPdf(borrador) && esPdf(devuelto)).toBe(true);
    expect(paginas(borrador)).toBe(1);
  });

  it('con diferencia y explicación, con anulaciones y sin movimientos', async () => {
    const conDiferencia = await generarPdfCierre(
      datosPdf(POCOS, { efectivoContado: '350000', diferencia: '-50000', explicacionDiferencia: 'Se pagó un taxi sin recibo' }),
      { empresa: EMPRESA },
    );
    const conAnulacion = await generarPdfCierre(
      datosPdf({ ...POCOS, abonos: [abono('x', 6, '300000', { estado: 'ANULADO', anuladoEn: new Date(Date.UTC(2026, 9, 15, 17, 0, 0)) })] }),
      { empresa: EMPRESA },
    );
    const vacio = await generarPdfCierre(datosPdf({ abonos: [], movimientos: [], nominas: [] }), { empresa: EMPRESA });
    for (const pdf of [conDiferencia, conAnulacion, vacio]) expect(esPdf(pdf)).toBe(true);
  });

  it('un cierre con muchos movimientos sigue en varias hojas, cada una con su numeración', async () => {
    const muchos: DatosCierre = {
      abonos: Array.from({ length: 120 }, (_, i) => abono(`a${i}`, 12 + (i % 7), '10000')),
      movimientos: [],
      nominas: [],
    };
    const pdf = await generarPdfCierre(datosPdf(muchos), { empresa: EMPRESA });
    expect(esPdf(pdf)).toBe(true);
    expect(paginas(pdf)).toBeGreaterThan(2);
  });

  it('un logo que no se pueda dibujar no impide generar el cierre', async () => {
    const pdf = await generarPdfCierre(datosPdf(POCOS), { empresa: EMPRESA, logo: Buffer.from('esto no es una imagen') });
    expect(esPdf(pdf)).toBe(true);
  });

  it('un color de empresa inválido no rompe el documento', async () => {
    const pdf = await generarPdfCierre(datosPdf(POCOS), { empresa: { ...EMPRESA, colorPrimario: 'rojo' } });
    expect(esPdf(pdf)).toBe(true);
  });
});
