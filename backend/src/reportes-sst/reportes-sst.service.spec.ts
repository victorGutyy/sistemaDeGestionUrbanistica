import ExcelJS from 'exceljs';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InformesAusentismoService } from '../ausentismo/informes-ausentismo.service.js';
import { calcularResumenMensual } from '../ausentismo/resumen.js';
import { presentarResumen, vistaDe } from '../ausentismo/visibilidad.js';
import { CLAVE_CONTRATISTA_SST, CLAVE_GERENTE, ROLES_SISTEMA } from '../auth/permisos.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { resumenDelPlan } from '../sst/plan.js';
import type { CapacitacionesService } from '../sst/capacitaciones.service.js';
import type { EppService } from '../sst/epp.service.js';
import type { PlanTrabajoService } from '../sst/plan-trabajo.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { auditoriaDe } from '../test-utils/auditoria.js';
import { CATALOGO_REPORTES_SST } from './catalogo.js';
import { ReportesSstService } from './reportes-sst.service.js';

function usuarioCon(clave: string): UsuarioAutenticado {
  const rol = ROLES_SISTEMA.find((r) => r.clave === clave);
  return { id: `u-${clave}`, email: `${clave.toLowerCase()}@ejemplo.test`, nombre: `Usuario ${clave}`, rol: { id: 'r', clave, nombre: clave }, permisos: [...(rol?.permisos ?? [])], proyectoIds: null };
}
const GERENTE = usuarioCon(CLAVE_GERENTE);
const ADMINISTRADOR = usuarioCon('ADMINISTRADOR');
const CONTRATISTA = usuarioCon(CLAVE_CONTRATISTA_SST);

const d = (valor: number) => new Prisma.Decimal(valor);
const dia = (mes: number, diaDelMes: number) => new Date(2026, mes - 1, diaDelMes);
const HOY = new Date(2026, 5, 10);

const AUSENTISMO = {
  id: 'a-1',
  numeroDocumento: 'INC-1',
  fechaInicio: dia(3, 30),
  fechaFin: dia(4, 3),
  esProrroga: false,
  corregida: false,
  anulada: false,
  trabajador: { nombre: 'Persona Inventada', documento: '000111' },
  tipo: { nombre: 'Enfermedad general' },
  // Datos de salud que la base de datos no debería entregar a este reporte; si llegaran, el reporte no puede pasarlos.
  diagnostico: { codigo: 'M54.5', nombre: 'Lumbago inventado' },
  observaciones: 'Cirugía de columna inventada',
};
const periodo = (mes: number, dias: number, diasEmpleador: number, diasEps: number, valorEmpleador: number, valorEps: number) => ({
  anio: 2026,
  mes,
  dias,
  diasEmpleador,
  diasEps,
  diasArl: 0,
  diasAfp: 0,
  diasLaborados: 0,
  diasDescuento: 0,
  valorEmpleador: d(valorEmpleador),
  valorEps: d(valorEps),
  valorArl: d(0),
  valorAfp: d(0),
  valorDescuento: d(0),
  ausentismo: AUSENTISMO,
});

function montar() {
  const tablas = {
    trabajador: {
      findMany: vi.fn().mockResolvedValue([{ id: 't-1', nombre: 'Persona Inventada', documento: '000111' }]),
      findUnique: vi.fn().mockResolvedValue({ nombre: 'Persona Inventada' }),
    },
    tipoAusentismo: {
      findMany: vi.fn().mockResolvedValue([{ id: 'tipo-eg', nombre: 'Enfermedad general' }]),
      findUnique: vi.fn().mockResolvedValue({ nombre: 'Enfermedad general' }),
    },
    // Un ausentismo que cruza de marzo a abril: un período por mes.
    ausentismoPeriodo: { findMany: vi.fn().mockResolvedValue([periodo(3, 2, 2, 0, 133_340, 0), periodo(4, 3, 0, 3, 0, 200_010)]) },
    entregaEpp: {
      findMany: vi.fn().mockResolvedValue([
        { fecha: dia(3, 5), cantidad: 2, tallaReferencia: 'M', motivo: 'DOTACION_INICIAL', firmoRecibido: true, proximaReposicion: dia(9, 5), trabajador: { nombre: 'Persona Inventada', documento: '000111' }, elemento: { nombre: 'Casco' } },
      ]),
    },
    registroAuditoria: { create: vi.fn() },
  };
  const configuracion = { obtenerEmpresa: vi.fn().mockResolvedValue({ nombreComercial: 'Empresa de Prueba', razonSocial: 'Empresa de Prueba SAS', nit: '900000001', logoRuta: null }) };
  const storage = { leer: vi.fn() };

  const resumenCompleto = calcularResumenMensual({
    anio: 2026,
    periodos: [
      {
        ausentismoId: 'a-1',
        tipoId: 'tipo-eg',
        tipoNombre: 'Enfermedad general',
        anio: 2026,
        mes: 4,
        dias: 3,
        diasEmpleador: 0,
        diasEps: 3,
        diasArl: 0,
        diasAfp: 0,
        diasLaborados: 0,
        diasDescuento: 0,
        valorEmpleador: d(0),
        valorEps: d(200_010),
        valorArl: d(0),
        valorAfp: d(0),
        valorDescuento: d(0),
      },
    ],
    trabajadores: [{ fechaIngreso: dia(1, 1), fechaRetiro: null }],
  });
  // El servicio de informes ya entrega el resumen filtrado por rol: aquí se imita lo mismo.
  const informes = { resumenMensual: vi.fn(async (_anio: number, usuario: UsuarioAutenticado) => presentarResumen(resumenCompleto, vistaDe(usuario))) };

  const epp = {
    reposiciones: vi.fn().mockResolvedValue({
      diasAlerta: 15,
      resumen: { vencidos: 1, porReponer: 0, vigentes: 2 },
      reposiciones: [{ trabajador: { id: 't-1', nombre: 'Persona Inventada', documento: '000111' }, elemento: { id: 'e-1', nombre: 'Casco' }, ultimaEntrega: dia(3, 5), proximaReposicion: dia(5, 5), diasRestantes: -36, estado: 'VENCIDO' }],
    }),
  };

  const actividades = [
    { ciclo: 'PLANEAR', estandar: '1.1.1', actividad: 'Definir responsable', meta: '100 %', responsable: 'Responsable Inventado', fechaInicio: dia(2, 1), fechaFin: dia(2, 28), presupuesto: d(500_000), estado: 'EJECUTADA', porcentajeAvance: 100, alerta: 'SIN_ALERTA', diasRestantes: null },
  ];
  const plan = { listar: vi.fn().mockResolvedValue({ anio: 2026, diasAlerta: 15, resumen: resumenDelPlan(actividades as never), actividades }) };

  const capacitaciones = {
    listar: vi.fn().mockResolvedValue({
      anio: 2026,
      diasAlerta: 15,
      resumen: { total: 1, ejecutadas: 1, coberturaEjecutadas: 80 },
      capacitaciones: [
        { tema: 'Alturas', modalidad: 'PRESENCIAL', horas: d(2), fechaProgramada: dia(4, 10), fechaEjecucion: dia(4, 10), responsable: 'Facilitador Inventado', ejecutor: 'ARL', estado: 'EJECUTADA', asistentesProgramados: 10, asistentesReales: 8, cobertura: 80, evaluacionEficacia: null, alerta: 'SIN_ALERTA' },
      ],
    }),
  };

  const servicio = new ReportesSstService(
    tablas as unknown as PrismaService,
    configuracion as unknown as ConfiguracionService,
    storage as unknown as StorageService,
    informes as unknown as InformesAusentismoService,
    epp as unknown as EppService,
    plan as unknown as PlanTrabajoService,
    capacitaciones as unknown as CapacitacionesService,
  );
  return { tablas, informes, epp, plan, capacitaciones, servicio };
}

const clavesDe = (columnas: { clave: string }[]) => columnas.map((c) => c.clave);
// ¿Alguna tabla del reporte tiene columnas de pesos?
const TIENE_VALORES = (secciones: { columnas: { clave: string }[] }[]) => secciones.some((seccion) => clavesDe(seccion.columnas).some((c) => c.startsWith('valor')));

describe('ReportesSstService: catálogo y filtros (RF-SST-22)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('ofrece los cinco reportes y las opciones de sus filtros', async () => {
    const { reportes, opciones } = await m.servicio.catalogo();
    expect(reportes.map((r) => r.clave)).toEqual(CATALOGO_REPORTES_SST.map((r) => r.clave));
    expect(reportes).toHaveLength(5);
    expect(opciones.trabajadores).toEqual([{ id: 't-1', nombre: 'Persona Inventada', documento: '000111' }]);
    expect(opciones.tiposAusentismo).toEqual([{ id: 'tipo-eg', nombre: 'Enfermedad general' }]);
    expect(opciones.estadosRegistro.map((e) => e.valor)).toEqual(['VIGENTES', 'ANULADOS', 'TODOS']);
    expect(opciones.estadosActividad).toHaveLength(5);
  });

  it('un reporte que no existe da 404', async () => {
    await expect(m.servicio.generar('recaudo', {}, GERENTE)).rejects.toBeInstanceOf(NotFoundException);
    await expect(m.servicio.generar('sst-inventado', {}, GERENTE)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza un período con la fecha final antes de la inicial', async () => {
    await expect(m.servicio.generar('sst-epp', { desde: '2026-06-10', hasta: '2026-06-01' }, GERENTE)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza un estado que no corresponde al reporte', async () => {
    await expect(m.servicio.generar('sst-ausentismo-detalle', { estado: 'EJECUTADA' }, GERENTE)).rejects.toThrow(/VIGENTES, ANULADOS o TODOS/);
    await expect(m.servicio.generar('sst-plan', { estado: 'VIGENTES' }, GERENTE)).rejects.toThrow(/PROGRAMADA/);
    await expect(m.servicio.generar('sst-capacitaciones', { estado: 'ANULADOS' }, GERENTE)).rejects.toThrow(/PROGRAMADA/);
  });

  it('el reporte dice de qué es: año, mes, trabajador, tipo y estado en palabras', async () => {
    const reporte = await m.servicio.generar('sst-ausentismo-detalle', { anio: 2026, mes: 3, trabajadorId: 't-1', tipoId: 'tipo-eg', estado: 'TODOS' }, GERENTE, HOY);
    expect(reporte.filtros).toEqual([
      { etiqueta: 'Año', valor: '2026' },
      { etiqueta: 'Mes', valor: 'Marzo' },
      { etiqueta: 'Trabajador', valor: 'Persona Inventada' },
      { etiqueta: 'Tipo de ausentismo', valor: 'Enfermedad general' },
      { etiqueta: 'Estado', valor: 'Todos' },
    ]);
    expect(reporte).toMatchObject({ clave: 'sst-ausentismo-detalle', generadoEn: HOY.toISOString() });
  });
});

describe('ReportesSstService: ausentismo (RF-SST-22, RNF-SEG-08)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('el resumen usa el año pedido, o el año en curso si no se pide', async () => {
    await m.servicio.generar('sst-ausentismo-resumen', { anio: 2025 }, GERENTE, HOY);
    expect(m.informes.resumenMensual.mock.calls[0][0]).toBe(2025);
    await m.servicio.generar('sst-ausentismo-resumen', {}, GERENTE, HOY);
    expect(m.informes.resumenMensual.mock.calls[1][0]).toBe(2026);
  });

  it('el resumen: gerente y administrador ven valores; el contratista, no', async () => {
    for (const [usuario, conValores] of [[GERENTE, true], [ADMINISTRADOR, true], [CONTRATISTA, false]] as const) {
      const reporte = await m.servicio.generar('sst-ausentismo-resumen', { anio: 2026 }, usuario, HOY);
      expect(TIENE_VALORES(reporte.secciones), usuario.rol.clave).toBe(conValores);
      expect(JSON.stringify(reporte).includes('200010'), usuario.rol.clave).toBe(conValores);
      expect(reporte.secciones[0].filas[3]).toMatchObject({ dias: 3, diasEps: 3 });
    }
  });

  it('el detalle junta los meses de un ausentismo en una sola fila', async () => {
    const reporte = await m.servicio.generar('sst-ausentismo-detalle', { anio: 2026 }, GERENTE, HOY);
    const [seccion, valores] = reporte.secciones;
    expect(seccion.filas).toHaveLength(1);
    expect(seccion.filas[0]).toMatchObject({ trabajador: 'Persona Inventada', numeroDocumento: 'INC-1', tipo: 'Enfermedad general', dias: 5, diasEmpleador: 2, diasEps: 3, estado: 'Vigente' });
    expect(seccion.totales).toMatchObject({ dias: 5 });
    expect(valores.filas[0]).toMatchObject({ trabajador: 'Persona Inventada', valorEmpleador: '133340', valorEps: '200010' });
    expect(valores.totales).toMatchObject({ valorEps: '200010' });
  });

  it('el detalle pide solo lo que filtra el reporte, y por defecto los vigentes', async () => {
    await m.servicio.generar('sst-ausentismo-detalle', { anio: 2026, mes: 4, trabajadorId: 't-1', tipoId: 'tipo-eg' }, GERENTE, HOY);
    expect(m.tablas.ausentismoPeriodo.findMany.mock.calls[0][0].where).toEqual({ anio: 2026, mes: 4, ausentismo: { anulada: false, trabajadorId: 't-1', tipoId: 'tipo-eg' } });
    await m.servicio.generar('sst-ausentismo-detalle', { estado: 'ANULADOS' }, GERENTE, HOY);
    expect(m.tablas.ausentismoPeriodo.findMany.mock.calls[1][0].where).toEqual({ anio: 2026, ausentismo: { anulada: true } });
    await m.servicio.generar('sst-ausentismo-detalle', { estado: 'TODOS' }, GERENTE, HOY);
    expect(m.tablas.ausentismoPeriodo.findMany.mock.calls[2][0].where).toEqual({ anio: 2026, ausentismo: {} });
  });

  it('ningún reporte de ausentismo pasa el diagnóstico ni las observaciones, ni siquiera al gerente', async () => {
    for (const clave of ['sst-ausentismo-resumen', 'sst-ausentismo-detalle'] as const) {
      for (const usuario of [GERENTE, ADMINISTRADOR, CONTRATISTA]) {
        const reporte = await m.servicio.generar(clave, { anio: 2026 }, usuario, HOY);
        expect(JSON.stringify(reporte), `${clave} ${usuario.rol.clave}`).not.toMatch(/M54|Lumbago|Cirug/i);
      }
    }
  });

  it('el detalle ni siquiera consulta el diagnóstico ni las observaciones', async () => {
    await m.servicio.generar('sst-ausentismo-detalle', {}, GERENTE, HOY);
    const { include } = m.tablas.ausentismoPeriodo.findMany.mock.calls[0][0];
    expect(Object.keys(include.ausentismo.select)).not.toEqual(expect.arrayContaining(['diagnosticoId', 'diagnostico', 'observaciones', 'documentos']));
    expect(JSON.stringify(include)).not.toMatch(/diagn|observaciones|documentos/i);
  });

  it('el detalle del contratista no trae ningún valor, ni salario, ni nada de salud', async () => {
    const reporte = await m.servicio.generar('sst-ausentismo-detalle', {}, CONTRATISTA, HOY);
    expect(TIENE_VALORES(reporte.secciones)).toBe(false);
    expect(JSON.stringify(reporte)).not.toMatch(/133340|200010|200\.010|salario|M54|Lumbago|Cirug/i);
    expect(reporte.secciones[0].filas[0]).toMatchObject({ dias: 5, diasEps: 3 });
  });
});

describe('ReportesSstService: EPP, plan y capacitaciones (RF-SST-22)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('EPP: entregas vigentes del período y lo que está por reponer del trabajador pedido', async () => {
    const reporte = await m.servicio.generar('sst-epp', { desde: '2026-03-01', hasta: '2026-03-31', trabajadorId: 't-1' }, CONTRATISTA, HOY);
    expect(m.tablas.entregaEpp.findMany.mock.calls[0][0].where).toEqual({ anulada: false, trabajadorId: 't-1', fecha: { gte: dia(3, 1), lte: dia(3, 31) } });
    expect(m.epp.reposiciones).toHaveBeenCalledWith({ trabajadorId: 't-1' }, HOY);
    expect(reporte.secciones[0].filas[0]).toMatchObject({ elemento: 'Casco', cantidad: 2, motivo: 'Dotación inicial' });
    expect(reporte.secciones[1].filas[0]).toMatchObject({ elemento: 'Casco', estado: 'Vencido', diasRestantes: -36 });
    expect(reporte.filtros.map((f) => f.etiqueta)).toEqual(['Período', 'Trabajador']);
  });

  it('EPP sin fechas trae todas las entregas vigentes', async () => {
    await m.servicio.generar('sst-epp', {}, GERENTE, HOY);
    expect(m.tablas.entregaEpp.findMany.mock.calls[0][0].where).toEqual({ anulada: false });
  });

  it('plan: pide el año y el estado, y el contratista lo ve igual (el presupuesto no es un valor de ausentismo)', async () => {
    const reporte = await m.servicio.generar('sst-plan', { anio: 2026, estado: 'EJECUTADA' }, CONTRATISTA, HOY);
    expect(m.plan.listar).toHaveBeenCalledWith({ anio: '2026', estado: 'EJECUTADA' }, HOY);
    expect(reporte.secciones[0].filas[0]).toMatchObject({ total: 1, ejecutadas: 1, cumplimiento: '100 %' });
    expect(reporte.secciones[1].filas[0]).toMatchObject({ actividad: 'Definir responsable', estado: 'Ejecutada', avance: '100 %', presupuesto: '500000' });
  });

  it('plan y capacitaciones sin año usan el año en curso', async () => {
    await m.servicio.generar('sst-plan', {}, GERENTE, HOY);
    expect(m.plan.listar).toHaveBeenCalledWith({ anio: '2026', estado: undefined }, HOY);
    await m.servicio.generar('sst-capacitaciones', {}, GERENTE, HOY);
    expect(m.capacitaciones.listar).toHaveBeenCalledWith({ anio: '2026', estado: undefined }, HOY);
  });

  it('capacitaciones: la cobertura de las ejecutadas y cada capacitación', async () => {
    const reporte = await m.servicio.generar('sst-capacitaciones', { anio: 2026 }, GERENTE, HOY);
    expect(reporte.secciones[0].filas[0]).toEqual({ total: 1, ejecutadas: 1, cobertura: '80 %' });
    expect(reporte.secciones[1].filas[0]).toMatchObject({ tema: 'Alturas', programados: 10, reales: 8, cobertura: '80 %' });
  });
});

describe('ReportesSstService.exportar (RF-SST-22)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('el Excel es un libro real con el reporte, y queda en la auditoría', async () => {
    const { buffer, contentType, nombreArchivo } = await m.servicio.exportar('sst-plan', { anio: 2026, formato: 'excel' }, GERENTE);
    expect(contentType).toContain('spreadsheetml.sheet');
    expect(nombreArchivo).toBe('sst-plan-2026.xlsx');
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(libro.worksheets.length).toBeGreaterThan(0);
    expect(JSON.stringify(libro.worksheets.map((h) => h.getSheetValues()))).toMatch(/Definir responsable/);

    const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'SST_REPORTE_EXPORTAR');
    expect(registro.usuarioId).toBe(GERENTE.id);
    expect(registro.resumen).toMatch(/Plan de trabajo anual.*Excel/);
  });

  it('el PDF sale como PDF y también queda en la auditoría', async () => {
    const { buffer, contentType, nombreArchivo } = await m.servicio.exportar('sst-ausentismo-detalle', { anio: 2026, mes: 3, formato: 'pdf' }, ADMINISTRADOR);
    expect(contentType).toBe('application/pdf');
    expect(nombreArchivo).toBe('sst-ausentismo-detalle-2026-03.pdf');
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'SST_REPORTE_EXPORTAR').resumen).toMatch(/PDF/);
  });

  it('el nombre del archivo del EPP lleva el período', async () => {
    const { nombreArchivo } = await m.servicio.exportar('sst-epp', { desde: '2026-03-01', hasta: '2026-03-31', formato: 'excel' }, GERENTE);
    expect(nombreArchivo).toBe('sst-epp-2026-03-01-a-2026-03-31.xlsx');
  });

  it('el Excel del contratista no lleva valores ni datos de salud', async () => {
    const { buffer } = await m.servicio.exportar('sst-ausentismo-detalle', { anio: 2026, formato: 'excel' }, CONTRATISTA);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
    const texto = JSON.stringify(libro.worksheets.map((h) => h.getSheetValues()));
    expect(texto).not.toMatch(/133340|200010|Valores liquidados|A descontar/);
    expect(texto).not.toMatch(/M54|Lumbago|Cirug/i);
    expect(texto).toMatch(/Persona Inventada/);
  });

  it('si el reporte falla no deja rastro de descarga', async () => {
    await expect(m.servicio.exportar('sst-plan', { estado: 'VIGENTES', formato: 'pdf' }, GERENTE)).rejects.toBeInstanceOf(BadRequestException);
    expect(m.tablas.registroAuditoria.create).not.toHaveBeenCalled();
  });
});
