import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import { costoDelPago } from '../../nomina/calculo-pago.js';
import { generarExcelReporte } from '../generar-excel.js';
import { generarPdfReporte } from '../generar-pdf.js';
import type { ReporteGenerado } from '../modelo.js';
import { NOMBRE_SIN_PROYECTO } from './egresos.js';
import { construirManoDeObra, type PagoManoDeObra } from './mano-de-obra.js';

const D = (valor: string | number) => new Prisma.Decimal(valor);

// Todos los datos son inventados.
const pago = (cambios: Partial<PagoManoDeObra>): PagoManoDeObra => ({
  proyecto: 'Obra Uno',
  periodoInicio: '2026-10-01',
  periodoFin: '2026-10-15',
  trabajadorId: 't-1',
  trabajador: 'Ana Inventada',
  cargo: 'Auxiliar',
  dias: D(10),
  valorDia: D(60000),
  valorHorasExtra: D(0),
  devengado: D(600000),
  pagado: D(600000),
  ...cambios,
});

const PAGOS: PagoManoDeObra[] = [
  pago({}),
  pago({ trabajadorId: 't-2', trabajador: 'Beto Inventado', cargo: 'Oficial', dias: D('7.5'), valorDia: D(90000), valorHorasExtra: D(36000), devengado: D(711000), pagado: D(611000) }),
  pago({ periodoInicio: '2026-10-16', periodoFin: '2026-10-31', dias: D(12), devengado: D(720000), pagado: D(720000) }),
  pago({ proyecto: 'Obra Dos', trabajadorId: 't-1', dias: D(5), devengado: D(300000), pagado: D(300000) }),
  // Pago anterior a CC-05: sin obra ni días; cuesta lo que se pagó.
  pago({ proyecto: null, trabajadorId: 't-3', trabajador: 'Carla Inventada', dias: null, valorDia: null, valorHorasExtra: null, devengado: D(250000), pagado: D(250000) }),
];

describe('construirManoDeObra (RF-PER-10)', () => {
  const [porObra, porQuincena, porTrabajador] = construirManoDeObra(PAGOS);

  it('arma tres secciones: por obra, por obra y quincena, y el detalle por trabajador', () => {
    expect(construirManoDeObra(PAGOS).map((s) => s.titulo)).toEqual(['Costo de la mano de obra por obra', 'Costo por obra y quincena', 'Detalle por trabajador']);
  });

  it('por obra: trabajadores distintos, pagos, días, costo, descontado y pagado, con la obra general al final', () => {
    expect(porObra.filas.map((f) => f.proyecto)).toEqual(['Obra Dos', 'Obra Uno', NOMBRE_SIN_PROYECTO]);
    expect(porObra.filas.find((f) => f.proyecto === 'Obra Uno')).toMatchObject({
      trabajadores: 2,
      pagos: 3,
      dias: '29,5',
      devengado: '2031000',
      descontado: '100000',
      pagado: '1931000',
    });
    expect(porObra.filas.find((f) => f.proyecto === NOMBRE_SIN_PROYECTO)).toMatchObject({ pagos: 1, dias: '0', devengado: '250000', descontado: '0' });
  });

  it('el total es la suma de todas las obras y no cuenta dos veces a quien trabajó en dos', () => {
    expect(porObra.totales).toMatchObject({ proyecto: 'Total', trabajadores: 3, pagos: 5, dias: '34,5', devengado: '2581000', descontado: '100000', pagado: '2481000' });
  });

  it('por quincena: una fila por obra y período, la más reciente primero', () => {
    expect(porQuincena.filas.map((f) => `${f.proyecto} · ${f.periodo}`)).toEqual([
      'Obra Dos · 01/10/2026 al 15/10/2026',
      'Obra Uno · 16/10/2026 al 31/10/2026',
      'Obra Uno · 01/10/2026 al 15/10/2026',
      `${NOMBRE_SIN_PROYECTO} · 01/10/2026 al 15/10/2026`,
    ]);
    expect(porQuincena.filas[2]).toMatchObject({ trabajadores: 2, dias: '17,5', devengado: '1311000', pagado: '1211000' });
  });

  it('el detalle lleva a cada trabajador; un pago anterior a CC-05 no inventa días ni valor día', () => {
    expect(porTrabajador.filas).toHaveLength(5);
    const beto = porTrabajador.filas.find((f) => f.trabajador === 'Beto Inventado');
    expect(beto).toMatchObject({ dias: '7,5', valorDia: '90000', horasExtra: '36000', devengado: '711000', descontado: '100000', pagado: '611000' });
    const carla = porTrabajador.filas.find((f) => f.trabajador === 'Carla Inventada');
    expect(carla).toMatchObject({ proyecto: NOMBRE_SIN_PROYECTO, dias: '—', valorDia: null, horasExtra: null, devengado: '250000' });
  });

  it('lo descontado nunca es negativo (un pago puede salir por encima del devengado en datos antiguos)', () => {
    const [seccion] = construirManoDeObra([pago({ devengado: D(500000), pagado: D(520000) })]);
    expect(seccion.filas[0]).toMatchObject({ descontado: '0' });
  });

  it('sin pagos las tres secciones salen vacías y con totales en cero', () => {
    const secciones = construirManoDeObra([]);
    expect(secciones.map((s) => s.filas.length)).toEqual([0, 0, 0]);
    expect(secciones[0].totales).toMatchObject({ trabajadores: 0, pagos: 0, devengado: '0', pagado: '0' });
  });

  it('el detalle se recorta si es muy largo y lo dice', () => {
    const muchos = Array.from({ length: 5001 }, (_, i) => pago({ trabajadorId: `t-${i}` }));
    const detalle = construirManoDeObra(muchos)[2];
    expect(detalle.filas).toHaveLength(5000);
    expect(detalle.filasTotales).toBe(5001);
  });
});

// El PDF recorta lo que no cabe: un valor en pesos cortado en un reporte de dinero no es aceptable. La hoja horizontal A4 tiene 770
// puntos útiles y un valor como $12.345.678 necesita unos 50 (misma regla de los reportes de seguridad y salud).
describe('anchos de las columnas de pesos en el PDF', () => {
  it('toda columna de pesos del reporte de mano de obra cabe completa', () => {
    for (const seccion of construirManoDeObra(PAGOS)) {
      const suma = seccion.columnas.reduce((total, c) => total + (c.peso ?? 1), 0);
      for (const columna of seccion.columnas.filter((c) => c.tipo === 'pesos')) {
        const puntos = (770 * (columna.peso ?? 1)) / suma - 6;
        expect(puntos, `${seccion.titulo} · ${columna.encabezado}`).toBeGreaterThanOrEqual(50);
      }
    }
  });
});

describe('el reporte de mano de obra se puede descargar en PDF y en Excel', () => {
  const reporte: ReporteGenerado = {
    clave: 'mano-de-obra',
    titulo: 'Costo de mano de obra por obra y quincena',
    descripcion: 'Prueba',
    filtros: [{ etiqueta: 'Proyecto', valor: 'Obra Uno' }],
    generadoEn: '2026-11-11T15:00:00.000Z',
    secciones: construirManoDeObra(PAGOS),
  };
  const empresa = { nombreComercial: 'Empresa de Prueba', razonSocial: 'Empresa de Prueba SAS', nit: '900000000' };

  it('el PDF sale en hoja horizontal (tablas anchas) y es un PDF válido', async () => {
    const pdf = await generarPdfReporte(reporte, { empresa });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const caja = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf.toString('latin1'))!;
    expect(Number(caja[1])).toBeGreaterThan(Number(caja[2]));
  });

  it('el Excel trae una hoja por sección con los valores en pesos como números', async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load((await generarExcelReporte(reporte, empresa)) as unknown as ExcelJS.Buffer);
    expect(libro.worksheets).toHaveLength(4); // portada + 3 secciones
  });
});

describe('costoDelPago (lo que un pago cuesta a su obra)', () => {
  it('es lo devengado cuando el pago se liquidó por días (el anticipo no baja el costo)', () => {
    expect(costoDelPago({ valorDevengado: D(600000), valorPagado: D(480000) }).toString()).toBe('600000');
  });

  it('es lo pagado cuando el pago es anterior a CC-05 y no tiene devengado', () => {
    expect(costoDelPago({ valorDevengado: null, valorPagado: D(750000) }).toString()).toBe('750000');
  });

  it('un devengado en cero se respeta (no se confunde con "sin dato")', () => {
    expect(costoDelPago({ valorDevengado: D(0), valorPagado: D(0) }).toString()).toBe('0');
  });
});
