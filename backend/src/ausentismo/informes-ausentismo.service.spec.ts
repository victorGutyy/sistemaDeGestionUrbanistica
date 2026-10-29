import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLAVE_CONTRATISTA_SST, CLAVE_GERENTE, ROLES_SISTEMA } from '../auth/permisos.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { auditoriaDe } from '../test-utils/auditoria.js';
import { InformesAusentismoService } from './informes-ausentismo.service.js';

function usuarioCon(clave: string): UsuarioAutenticado {
  const rol = ROLES_SISTEMA.find((r) => r.clave === clave);
  return { id: `u-${clave}`, email: `${clave.toLowerCase()}@ejemplo.test`, nombre: `Usuario ${clave}`, rol: { id: 'r', clave, nombre: clave }, permisos: [...(rol?.permisos ?? [])], proyectoIds: null };
}
const GERENTE = usuarioCon(CLAVE_GERENTE);
const ADMINISTRADOR = usuarioCon('ADMINISTRADOR');
const CONTRATISTA = usuarioCon(CLAVE_CONTRATISTA_SST);

const d = (valor: number) => new Prisma.Decimal(valor);
const dia = (mes: number, diaDelMes: number) => new Date(2026, mes - 1, diaDelMes);

const PERIODO = {
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
    id: 'a-1',
    numeroDocumento: 'INC-1',
    fechaInicio: dia(3, 10),
    fechaFin: dia(3, 14),
    esProrroga: false,
    corregida: false,
    trabajador: { nombre: 'Persona Inventada', documento: '000111', cargo: 'Oficial' },
    tipo: { id: 'tipo-eg', nombre: 'Enfermedad general' },
  },
};

function montar() {
  const tablas = {
    ausentismoPeriodo: { findMany: vi.fn().mockResolvedValue([PERIODO]) },
    trabajador: { findMany: vi.fn().mockResolvedValue([{ fechaIngreso: dia(1, 1), fechaRetiro: null }]) },
    registroAuditoria: { create: vi.fn() },
  };
  const configuracion = { obtenerEmpresa: vi.fn().mockResolvedValue({ nombreComercial: 'Empresa de Prueba', razonSocial: 'Empresa de Prueba SAS', nit: '900000001' }) };
  return { tablas, servicio: new InformesAusentismoService(tablas as unknown as PrismaService, configuracion as unknown as ConfiguracionService) };
}

describe('InformesAusentismoService.resumenMensual (RF-SST-10)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('solo cuenta ausentismos vigentes del año pedido, o del año en curso si no se pide', async () => {
    await m.servicio.resumenMensual(2025, GERENTE);
    expect(m.tablas.ausentismoPeriodo.findMany.mock.calls[0][0].where).toEqual({ anio: 2025, ausentismo: { anulada: false } });
    await m.servicio.resumenMensual(undefined, GERENTE, dia(6, 1));
    expect(m.tablas.ausentismoPeriodo.findMany.mock.calls[1][0].where).toEqual({ anio: 2026, ausentismo: { anulada: false } });
  });

  it('arma los doce meses con los días, los tipos y el porcentaje', async () => {
    const resumen = await m.servicio.resumenMensual(2026, GERENTE);
    expect(resumen.meses).toHaveLength(12);
    expect(resumen.meses[2]).toMatchObject({ mes: 3, registros: 1, dias: 5, trabajadoresActivos: 1, porcentajeAusentismo: '16.13' }); // 5 / 31
    expect(resumen.meses[2].porTipo).toEqual([{ tipoId: 'tipo-eg', nombre: 'Enfermedad general', registros: 1, dias: 5 }]);
    expect(resumen.meses[2].valores).toMatchObject({ empleador: '133340', eps: '200010' });
  });

  it('el contratista ve los días y los porcentajes pero ningún valor', async () => {
    const resumen = await m.servicio.resumenMensual(2026, CONTRATISTA);
    expect(JSON.stringify(resumen)).not.toMatch(/valores|133340|200010/);
    expect(resumen.meses[2]).toMatchObject({ dias: 5, diasPorPagador: { empleador: 2, eps: 3 } });
    expect(resumen.total).toMatchObject({ registros: 1, dias: 5 });
  });

  it('nunca lleva diagnósticos ni observaciones, para ningún rol', async () => {
    for (const usuario of [GERENTE, ADMINISTRADOR, CONTRATISTA]) {
      const texto = JSON.stringify(await m.servicio.resumenMensual(2026, usuario));
      expect(texto).not.toMatch(/diagnostico|observaciones|cie/i);
    }
  });
});

describe('InformesAusentismoService.novedades y novedadesExcel (RF-SST-11)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('trae solo los períodos del mes de ausentismos vigentes, con los datos que necesita la nómina', async () => {
    const reporte = await m.servicio.novedades(2026, 3);
    expect(m.tablas.ausentismoPeriodo.findMany.mock.calls[0][0].where).toEqual({ anio: 2026, mes: 3, ausentismo: { anulada: false } });
    const select = JSON.stringify(m.tablas.ausentismoPeriodo.findMany.mock.calls[0][0].include);
    expect(select).not.toMatch(/diagnostico|observaciones|salarioFoto/);
    expect(reporte.secciones[0].filas).toHaveLength(1);
    expect(reporte.secciones[0].filas[0]).toMatchObject({ trabajador: 'Persona Inventada', numeroDocumento: 'INC-1', valorEps: '200010' });
  });

  it('el Excel trae los números como números, las fechas como fechas y los totales', async () => {
    const { buffer, contentType, nombreArchivo } = await m.servicio.novedadesExcel(2026, 3, ADMINISTRADOR);
    expect(contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(nombreArchivo).toBe('novedades-ausentismo-2026-03.xlsx');
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(libro.worksheets.map((h) => h.name)).toEqual(['Reporte', 'Novedades']);
    const hoja = libro.getWorksheet('Novedades')!;
    const encabezado = hoja.getRow(4).values as unknown[];
    expect(encabezado).toContain('A cargo de la EPS');
    const fila = hoja.getRow(5);
    expect(fila.getCell(2).value).toBe('Persona Inventada');
    expect(fila.getCell(5).value).toEqual(new Date('2026-03-10T00:00:00.000Z'));
    expect(fila.getCell(7).value).toBe(5);
    expect(fila.getCell(15).value).toBe(200010);
    const totales = hoja.getRow(6);
    expect(totales.getCell(2).value).toBe('Total');
    expect(totales.getCell(15).value).toBe(200010);
  });

  it('descargar las novedades queda en la auditoría', async () => {
    await m.servicio.novedadesExcel(2026, 3, ADMINISTRADOR);
    const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'AUSENTISMO_NOVEDADES_EXPORTAR');
    expect(registro).toMatchObject({ entidad: 'AUSENTISMO', usuarioId: ADMINISTRADOR.id });
    expect(registro.resumen).toContain('03/2026');
    expect(registro.resumen).toContain('1 filas');
  });

  it('el Excel no lleva diagnósticos ni observaciones del registro', async () => {
    const { buffer } = await m.servicio.novedadesExcel(2026, 3, ADMINISTRADOR);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
    const texto = JSON.stringify(libro.worksheets.map((h) => h.getSheetValues()));
    expect(texto).not.toMatch(/diagn[oó]stico|M54|cie-?10|salario/i);
  });
});

describe('InformesAusentismoService.novedadesDelPeriodo (RF-SST-11)', () => {
  const PARAMETROS_FOTO = {
    regla: 'INCAPACIDAD_GENERAL',
    porcentajeTipo: null,
    diaEventoComoLaborado: false,
    diasPrevios: 0,
    smmlv: 1_750_905,
    diasBaseMes: 30,
    porcentajeTramo1: 66.67,
    porcentajeTramo2: 50,
    porcentajeLaboral: 100,
    diasEmpleador: 2,
    diasTramo1Hasta: 90,
    diasTramo2Hasta: 180,
  };
  const AUSENTISMO = {
    id: 'a-1',
    numeroDocumento: 'INC-1',
    esProrroga: false,
    corregida: false,
    fechaInicio: dia(3, 10),
    fechaFin: dia(3, 14),
    salarioFoto: d(3_000_000),
    parametrosLiquidacion: PARAMETROS_FOTO,
    tipo: { nombre: 'Enfermedad general' },
  };

  function montarPeriodo(trabajadorExiste = true) {
    const tablas = {
      trabajador: { findUnique: vi.fn().mockResolvedValue(trabajadorExiste ? { id: 't-1' } : null) },
      ausentismo: { findMany: vi.fn().mockResolvedValue([AUSENTISMO]) },
    };
    return { tablas, servicio: new InformesAusentismoService(tablas as unknown as PrismaService, {} as unknown as ConfiguracionService) };
  }

  it('propone la incapacidad de los días de la EPS que caen en el período', async () => {
    const { servicio, tablas } = montarPeriodo();
    const propuestas = await servicio.novedadesDelPeriodo('t-1', '2026-03-01', '2026-03-15');
    expect(propuestas).toHaveLength(1);
    expect(propuestas[0].novedades).toEqual([{ tipo: 'INCAPACIDAD', valor: '300000', descripcion: 'Enfermedad general INC-1: 3 de la EPS (del 12/03 al 14/03)' }]);
    // Solo pide los ausentismos vigentes que se cruzan con el período.
    expect(tablas.ausentismo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { trabajadorId: 't-1', anulada: false, fechaInicio: { lte: dia(3, 15) }, fechaFin: { gte: dia(3, 1) } } }),
    );
  });

  it('rechaza un trabajador que no existe', async () => {
    const { servicio } = montarPeriodo(false);
    await expect(servicio.novedadesDelPeriodo('t-x', '2026-03-01', '2026-03-15')).rejects.toThrow(/No existe el trabajador/);
  });

  it.each([
    ['fecha inválida', '2026-02-30', '2026-03-15', /no es una fecha válida/],
    ['fin antes del inicio', '2026-03-15', '2026-03-01', /no puede ser anterior/],
    ['período demasiado largo', '2026-01-01', '2026-06-30', /no puede pasar de 62 días/],
  ])('rechaza %s', async (_caso, desde, hasta, mensaje) => {
    const { servicio } = montarPeriodo();
    await expect(servicio.novedadesDelPeriodo('t-1', desde, hasta)).rejects.toThrow(mensaje);
  });
});
