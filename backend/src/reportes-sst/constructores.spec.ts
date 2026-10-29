import { describe, expect, it } from 'vitest';
import type { TotalesLiquidacion } from '../ausentismo/liquidacion.js';
import { calcularResumenMensual } from '../ausentismo/resumen.js';
import { Prisma } from '../generated/prisma/client.js';
import { resumenDelPlan } from '../sst/plan.js';
import {
  nombreDelMes,
  seccionesDetalleAusentismo,
  seccionesCapacitaciones,
  seccionesEpp,
  seccionesPlan,
  seccionesResumenAusentismo,
  textoPorcentaje,
  type ActividadParaReporte,
  type AusentismoParaDetalle,
  type CapacitacionParaReporte,
} from './constructores.js';

const d = (valor: number) => new Prisma.Decimal(valor);
const dia = (mes: number, diaDelMes: number) => new Date(2026, mes - 1, diaDelMes);

const clavesDe = (columnas: { clave: string }[]) => columnas.map((c) => c.clave);
const CLAVES_DE_VALORES = ['valorEmpleador', 'valorEps', 'valorArl', 'valorAfp', 'valorDescuento'];

describe('textoPorcentaje', () => {
  it('escribe la coma decimal y el signo, y deja vacío lo que no hay', () => {
    expect(textoPorcentaje(66.7)).toBe('66,7 %');
    expect(textoPorcentaje('16.13')).toBe('16,13 %');
    expect(textoPorcentaje(0)).toBe('0 %');
    expect(textoPorcentaje(null)).toBeNull();
    expect(textoPorcentaje(undefined)).toBeNull();
  });
});

describe('seccionesResumenAusentismo (RF-SST-22)', () => {
  const resumen = calcularResumenMensual({
    anio: 2026,
    periodos: [
      {
        ausentismoId: 'a-1',
        tipoId: 'tipo-eg',
        tipoNombre: 'Enfermedad general',
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
      },
    ],
    trabajadores: [{ fechaIngreso: dia(1, 1), fechaRetiro: null }],
  });

  it('con valores: los días en una tabla, los pesos en otra y los días por tipo', () => {
    const [mensual, valores, porTipo] = seccionesResumenAusentismo(resumen, true);
    expect(mensual.filas).toHaveLength(12);
    expect(mensual.filas[2]).toMatchObject({ mes: 'Marzo', registros: 1, dias: 5, diasEmpleador: 2, diasEps: 3, trabajadoresActivos: 1, porcentaje: '16,13 %' });
    expect(mensual.totales).toMatchObject({ mes: 'Total del año', registros: 1, dias: 5 });
    expect(clavesDe(mensual.columnas).filter((c) => CLAVES_DE_VALORES.includes(c))).toEqual([]);

    expect(valores.titulo).toBe('Valores por mes');
    expect(clavesDe(valores.columnas)).toEqual(['mes', ...CLAVES_DE_VALORES]);
    expect(valores.filas[2]).toMatchObject({ mes: 'Marzo', valorEmpleador: '133340', valorEps: '200010' });
    expect(valores.totales).toMatchObject({ mes: 'Total del año', valorEps: '200010' });
    expect(porTipo.filas).toEqual([{ tipo: 'Enfermedad general', registros: 1, dias: 5 }]);
  });

  it('sin permiso de valores: ni la tabla de valores ni los números existen en el reporte', () => {
    const secciones = seccionesResumenAusentismo(resumen, false);
    expect(secciones.map((s) => s.titulo)).toEqual(['Resumen mensual 2026', 'Por tipo de ausentismo']);
    for (const seccion of secciones) {
      expect(clavesDe(seccion.columnas).filter((c) => CLAVES_DE_VALORES.includes(c))).toEqual([]);
    }
    expect(JSON.stringify(secciones)).not.toMatch(/133340|200010|valor|liquidaci[oó]n de apoyo/i);
    // Los días sí salen: no son valores.
    expect(secciones[0].filas[2]).toMatchObject({ dias: 5, diasEps: 3 });
  });

  it('un año sin ausentismo igual da los doce meses en cero', () => {
    const vacio = calcularResumenMensual({ anio: 2026, periodos: [], trabajadores: [{ fechaIngreso: dia(1, 1), fechaRetiro: null }] });
    const [mensual, valores, porTipo] = seccionesResumenAusentismo(vacio, true);
    expect(mensual.filas).toHaveLength(12);
    expect(mensual.totales).toMatchObject({ registros: 0, dias: 0 });
    expect(valores.totales).toMatchObject({ valorEps: '0' });
    expect(porTipo.filas).toEqual([]);
    expect(porTipo.totales).toBeUndefined();
  });
});

describe('seccionesDetalleAusentismo (RF-SST-22, RNF-SEG-08)', () => {
  const totales = (extra: Partial<TotalesLiquidacion> = {}): TotalesLiquidacion => ({
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
    ...extra,
  });
  const ausentismo = (extra: Partial<AusentismoParaDetalle> = {}): AusentismoParaDetalle => ({
    id: 'a-1',
    numeroDocumento: 'INC-1',
    esProrroga: false,
    corregida: false,
    anulada: false,
    fechaInicio: dia(3, 10),
    fechaFin: dia(3, 14),
    trabajador: { nombre: 'Persona Inventada', documento: '000111' },
    tipoNombre: 'Enfermedad general',
    totales: totales(),
    ...extra,
  });

  it('una fila por ausentismo, con sus días y su observación; los pesos van en la segunda tabla', () => {
    const [dias, valores] = seccionesDetalleAusentismo([ausentismo({ esProrroga: true, corregida: true })], true);
    expect(dias.filas).toEqual([
      expect.objectContaining({
        documentoTrabajador: '000111',
        trabajador: 'Persona Inventada',
        numeroDocumento: 'INC-1',
        tipo: 'Enfermedad general',
        desde: '2026-03-10',
        hasta: '2026-03-14',
        estado: 'Vigente',
        dias: 5,
        diasEmpleador: 2,
        diasEps: 3,
        observacion: 'Prórroga. Liquidación corregida a mano',
      }),
    ]);
    expect(clavesDe(dias.columnas).filter((c) => CLAVES_DE_VALORES.includes(c))).toEqual([]);
    expect(valores.titulo).toBe('Valores liquidados por registro');
    expect(valores.filas).toEqual([expect.objectContaining({ trabajador: 'Persona Inventada', numeroDocumento: 'INC-1', desde: '2026-03-10', valorEmpleador: '133340', valorEps: '200010', valorArl: '0' })]);
  });

  it('ordena por trabajador y fecha de inicio, y las dos tablas llevan las mismas filas en el mismo orden', () => {
    const [dias, valores] = seccionesDetalleAusentismo(
      [
        ausentismo({ id: 'z', trabajador: { nombre: 'Zoraida Ejemplo', documento: '2' } }),
        ausentismo({ id: 'a2', fechaInicio: dia(5, 1), fechaFin: dia(5, 2) }),
        ausentismo({ id: 'a1', fechaInicio: dia(3, 1), fechaFin: dia(3, 2) }),
      ],
      true,
    );
    expect(dias.filas.map((f) => `${f.trabajador}|${f.desde}`)).toEqual(['Persona Inventada|2026-03-01', 'Persona Inventada|2026-05-01', 'Zoraida Ejemplo|2026-03-10']);
    expect(valores.filas.map((f) => `${f.trabajador}|${f.desde}`)).toEqual(dias.filas.map((f) => `${f.trabajador}|${f.desde}`));
  });

  it('los anulados se listan pero no suman en los totales', () => {
    const [dias, valores] = seccionesDetalleAusentismo([ausentismo(), ausentismo({ id: 'a-2', anulada: true })], true);
    expect(dias.filas.map((f) => f.estado)).toEqual(['Vigente', 'Anulado']);
    expect(dias.totales).toMatchObject({ dias: 5, diasEps: 3 });
    expect(valores.totales).toMatchObject({ valorEps: '200010' });
  });

  it('sin permiso de valores hay una sola tabla, sin columnas ni números de pesos', () => {
    const secciones = seccionesDetalleAusentismo([ausentismo()], false);
    expect(secciones).toHaveLength(1);
    expect(clavesDe(secciones[0].columnas).filter((c) => CLAVES_DE_VALORES.includes(c))).toEqual([]);
    expect(JSON.stringify(secciones)).not.toMatch(/133340|200010|valor|liquidaci[oó]n de apoyo/i);
    expect(secciones[0].totales).toMatchObject({ dias: 5 });
  });

  it('nunca tiene una columna de diagnóstico ni de observaciones del trabajador', () => {
    for (const verValores of [true, false]) {
      for (const seccion of seccionesDetalleAusentismo([ausentismo()], verValores)) {
        expect(JSON.stringify(seccion.columnas)).not.toMatch(/diagn|cie/i);
        expect(clavesDe(seccion.columnas)).not.toContain('observaciones');
      }
    }
  });

  it('sin filas no hay fila de totales', () => {
    for (const seccion of seccionesDetalleAusentismo([], true)) expect(seccion.totales).toBeUndefined();
  });
});

// El PDF reparte el ancho de la hoja según el peso de cada columna y recorta lo que no cabe. Un valor en pesos recortado en un
// reporte de dinero no es aceptable: cada columna de pesos debe ser de las más anchas de su tabla y la tabla no puede pasar de
// cierto número de columnas (la hoja horizontal A4 tiene 770 puntos útiles y un valor como $12.345.678 necesita unos 50).
describe('anchos de las columnas de pesos en el PDF', () => {
  const PUNTOS_UTILES = 770;
  const PUNTOS_DE_UN_VALOR_EN_PESOS = 50;

  it('toda columna de pesos de los reportes de ausentismo y de plan cabe completa', () => {
    const resumen = calcularResumenMensual({ anio: 2026, periodos: [], trabajadores: [{ fechaIngreso: dia(1, 1), fechaRetiro: null }] });
    const secciones = [
      ...seccionesResumenAusentismo(resumen, true),
      ...seccionesDetalleAusentismo([], true),
      ...seccionesPlan(2026, resumenDelPlan([]), []),
    ];
    for (const seccion of secciones) {
      const suma = seccion.columnas.reduce((total, c) => total + (c.peso ?? 1), 0);
      for (const columna of seccion.columnas.filter((c) => c.tipo === 'pesos')) {
        const puntos = (PUNTOS_UTILES * (columna.peso ?? 1)) / suma - 6;
        expect(puntos, `${seccion.titulo} · ${columna.encabezado}`).toBeGreaterThanOrEqual(PUNTOS_DE_UN_VALOR_EN_PESOS);
      }
    }
  });
});

describe('seccionesEpp (RF-SST-22)', () => {
  const entrega = {
    fecha: dia(3, 5),
    cantidad: 2,
    tallaReferencia: 'M',
    motivo: 'REPOSICION_DANO',
    firmoRecibido: true,
    proximaReposicion: dia(9, 5),
    trabajador: { nombre: 'Persona Inventada', documento: '000111' },
    elemento: { nombre: 'Casco' },
  };

  it('arma las entregas y las que están por reponer o vencidas', () => {
    const [entregas, reposicion] = seccionesEpp(
      [entrega],
      [
        { trabajador: { nombre: 'Persona Inventada', documento: '000111' }, elemento: { nombre: 'Casco' }, ultimaEntrega: dia(3, 5), proximaReposicion: dia(9, 5), diasRestantes: -3, estado: 'VENCIDO' },
        { trabajador: { nombre: 'Ana Ejemplo', documento: '000222' }, elemento: { nombre: 'Guantes' }, ultimaEntrega: dia(4, 5), proximaReposicion: dia(8, 1), diasRestantes: 10, estado: 'POR_REPONER' },
      ],
      { vencidos: 1, porReponer: 1, vigentes: 4 },
      15,
    );
    expect(entregas.filas[0]).toMatchObject({ fecha: '2026-03-05', trabajador: 'Persona Inventada', elemento: 'Casco', cantidad: 2, talla: 'M', motivo: 'Reposición por daño o deterioro', firmo: 'Sí', proximaReposicion: '2026-09-05' });
    expect(entregas.totales).toMatchObject({ cantidad: 2 });
    // Ordenadas por la próxima reposición: lo más urgente primero.
    expect(reposicion.filas.map((f) => f.estado)).toEqual(['Por reponer', 'Vencido']);
    expect(reposicion.nota).toMatch(/1 vencidos, 1 por reponer \(faltan 15 días o menos\) y 4 vigentes/);
  });

  it('sin entregas no hay fila de totales', () => {
    expect(seccionesEpp([], [], { vencidos: 0, porReponer: 0, vigentes: 0 }, 15)[0].totales).toBeUndefined();
  });
});

describe('seccionesPlan (RF-SST-22)', () => {
  const actividad = (extra: Partial<ActividadParaReporte> = {}): ActividadParaReporte => ({
    ciclo: 'PLANEAR',
    estandar: '1.1.1',
    actividad: 'Definir el responsable del SG-SST',
    meta: '100 % cumplido',
    responsable: 'Responsable Inventado',
    fechaInicio: dia(2, 1),
    fechaFin: dia(2, 28),
    presupuesto: d(500_000),
    estado: 'EJECUTADA',
    porcentajeAvance: 100,
    alerta: 'SIN_ALERTA',
    ...extra,
  });

  it('el cumplimiento del plan y cada actividad con su avance', () => {
    const actividades = [actividad(), actividad({ estado: 'EN_EJECUCION', porcentajeAvance: 50, alerta: 'VENCIDA', presupuesto: d(250_000) }), actividad({ estado: 'CANCELADA', porcentajeAvance: 0, presupuesto: d(1_000_000) })];
    const [cumplimiento, lista] = seccionesPlan(2026, resumenDelPlan(actividades), actividades);
    expect(cumplimiento.titulo).toBe('Cumplimiento del plan 2026');
    expect(cumplimiento.filas[0]).toMatchObject({ total: 3, ejecutadas: 1, enEjecucion: 1, canceladas: 1, avancePromedio: '75 %', cumplimiento: '50 %' });
    expect(lista.filas[0]).toMatchObject({ ciclo: 'Planear', estado: 'Ejecutada', avance: '100 %', presupuesto: '500000', alerta: null });
    expect(lista.filas[1]).toMatchObject({ estado: 'En ejecución', avance: '50 %', alerta: 'Vencida' });
    // El presupuesto total no cuenta la cancelada.
    expect(lista.totales).toMatchObject({ presupuesto: '750000' });
  });

  it('un plan sin actividades da el resumen en cero y ninguna fila', () => {
    const [cumplimiento, lista] = seccionesPlan(2027, resumenDelPlan([]), []);
    expect(cumplimiento.filas[0]).toMatchObject({ total: 0, avancePromedio: '0 %', cumplimiento: '0 %' });
    expect(lista.filas).toEqual([]);
    expect(lista.totales).toBeUndefined();
  });
});

describe('seccionesCapacitaciones (RF-SST-22)', () => {
  const capacitacion = (extra: Partial<CapacitacionParaReporte> = {}): CapacitacionParaReporte => ({
    tema: 'Trabajo seguro en alturas',
    modalidad: 'PRESENCIAL',
    horas: d(2.5),
    fechaProgramada: dia(4, 10),
    fechaEjecucion: dia(4, 11),
    responsable: 'Facilitador Inventado',
    ejecutor: 'ARL',
    estado: 'EJECUTADA',
    asistentesProgramados: 10,
    asistentesReales: 8,
    cobertura: 80,
    evaluacionEficacia: d(4.5),
    alerta: 'SIN_ALERTA',
    ...extra,
  });

  it('el resumen de cobertura y cada capacitación con sus asistentes', () => {
    const [resumen, lista] = seccionesCapacitaciones(2026, { total: 2, ejecutadas: 1, coberturaEjecutadas: 80 }, [capacitacion(), capacitacion({ tema: 'Primeros auxilios', estado: 'PROGRAMADA', fechaEjecucion: null, asistentesReales: 0, cobertura: 0, evaluacionEficacia: null, alerta: 'PROXIMA' })]);
    expect(resumen.filas[0]).toEqual({ total: 2, ejecutadas: 1, cobertura: '80 %' });
    expect(lista.filas[0]).toMatchObject({ tema: 'Trabajo seguro en alturas', modalidad: 'Presencial', horas: '2,5', fechaProgramada: '2026-04-10', fechaEjecucion: '2026-04-11', ejecutor: 'ARL', programados: 10, reales: 8, cobertura: '80 %', eficacia: '4,5' });
    expect(lista.filas[1]).toMatchObject({ estado: 'Programada', fechaEjecucion: null, eficacia: null, alerta: 'Próxima' });
  });

  it('sin asistentes programados la cobertura queda vacía, no en 0 %', () => {
    const [resumen, lista] = seccionesCapacitaciones(2026, { total: 1, ejecutadas: 0, coberturaEjecutadas: null }, [capacitacion({ asistentesProgramados: 0, cobertura: null })]);
    expect(resumen.filas[0].cobertura).toBeNull();
    expect(lista.filas[0].cobertura).toBeNull();
  });
});

// Una cifra escrita como texto ("66,7 %") va a la derecha como los números; si no, junto a la columna numérica de al lado se lee "6 6,7 %".
describe('columnas de porcentaje', () => {
  it('van alineadas a la derecha en todos los reportes', () => {
    const resumen = calcularResumenMensual({ anio: 2026, periodos: [], trabajadores: [{ fechaIngreso: dia(1, 1), fechaRetiro: null }] });
    const secciones = [
      ...seccionesResumenAusentismo(resumen, true),
      ...seccionesPlan(2026, resumenDelPlan([]), []),
      ...seccionesCapacitaciones(2026, { total: 0, ejecutadas: 0, coberturaEjecutadas: null }, []),
    ];
    const claves = ['porcentaje', 'avancePromedio', 'cumplimiento', 'avance', 'cobertura', 'eficacia', 'horas'];
    const columnas = secciones.flatMap((s) => s.columnas).filter((c) => claves.includes(c.clave));
    expect(columnas.length).toBeGreaterThanOrEqual(6);
    for (const columna of columnas) expect(columna.alineacion, columna.clave).toBe('derecha');
  });
});

describe('nombreDelMes', () => {
  it('da el nombre en español', () => {
    expect(nombreDelMes(1)).toBe('Enero');
    expect(nombreDelMes(12)).toBe('Diciembre');
  });
});
