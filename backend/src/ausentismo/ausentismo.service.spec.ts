import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLAVE_CONTRATISTA_SST, CLAVE_GERENTE, ROLES_SISTEMA } from '../auth/permisos.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { SeguridadSocialService } from '../seguridad-social/seguridad-social.service.js';
import type { DocumentosSstService } from '../sst/documentos-sst.service.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';
import { AusentismoService } from './ausentismo.service.js';

const dia = (mes: number, diaDelMes: number, anio = 2026) => new Date(anio, mes - 1, diaDelMes);

function usuarioCon(clave: string): UsuarioAutenticado {
  const rol = ROLES_SISTEMA.find((r) => r.clave === clave);
  return { id: `u-${clave}`, email: `${clave.toLowerCase()}@ejemplo.test`, nombre: `Usuario ${clave}`, rol: { id: 'r', clave, nombre: clave }, permisos: [...(rol?.permisos ?? [])], proyectoIds: null };
}
const GERENTE = usuarioCon(CLAVE_GERENTE);
const ADMINISTRADOR = usuarioCon('ADMINISTRADOR');
const CONTRATISTA = usuarioCon(CLAVE_CONTRATISTA_SST);

const TRABAJADOR = { id: 't-1', nombre: 'Persona Inventada', documento: '000111', cargo: 'Oficial', salarioBase: new Prisma.Decimal(3_000_000), fechaIngreso: dia(1, 1), estado: 'ACTIVO', fechaRetiro: null };
const TIPO_GENERAL = { id: 'tipo-eg', codigo: 'ENFERMEDAD_GENERAL', nombre: 'Enfermedad general', regla: 'INCAPACIDAD_GENERAL', porcentaje: null, requiereDiagnostico: true, diaEventoComoLaborado: false, activo: true };
const TIPO_ACCIDENTE = { id: 'tipo-at', codigo: 'ACCIDENTE_TRABAJO', nombre: 'Accidente de trabajo', regla: 'ORIGEN_LABORAL', porcentaje: null, requiereDiagnostico: true, diaEventoComoLaborado: true, activo: true };
const TIPO_LUTO = { id: 'tipo-luto', codigo: 'LUTO', nombre: 'Licencia por luto', regla: 'PAGA_EMPLEADOR', porcentaje: new Prisma.Decimal(100), requiereDiagnostico: false, diaEventoComoLaborado: false, activo: true };
const TIPO_MATERNIDAD = { id: 'tipo-mat', codigo: 'LICENCIA_MATERNIDAD_PATERNIDAD', nombre: 'Licencia de maternidad o paternidad', regla: 'PAGA_EPS', porcentaje: new Prisma.Decimal(100), requiereDiagnostico: false, diaEventoComoLaborado: false, activo: true };
const DIAGNOSTICO = { id: 'cie-1', codigo: 'M54.5', descripcion: 'Lumbago no especificado', activo: true };

const PARAMETRO = {
  anio: 2026,
  smmlv: new Prisma.Decimal(1_750_905),
  auxilioTransporte: new Prisma.Decimal(249_095),
  porcentajeIncapacidadTramo1: new Prisma.Decimal('66.67'),
  porcentajeIncapacidadTramo2: new Prisma.Decimal(50),
  porcentajeIncapacidadLaboral: new Prisma.Decimal(100),
  diasEmpleador: 2,
  diasTramo1Hasta: 90,
  diasTramo2Hasta: 180,
  diasBaseMes: 30,
  validadoEn: null,
};

// Lo que devuelve la base al leer un ausentismo con todas sus relaciones.
function detalle(extra: Record<string, unknown> = {}) {
  return {
    id: 'a-1',
    trabajadorId: 't-1',
    trabajador: { id: 't-1', nombre: TRABAJADOR.nombre, documento: '000111', cargo: 'Oficial', estado: 'ACTIVO' },
    tipoId: TIPO_GENERAL.id,
    tipo: TIPO_GENERAL,
    fechaInicio: dia(3, 10),
    fechaFin: dia(3, 14),
    dias: 5,
    anio: 2026,
    mes: 3,
    numeroDocumento: null,
    esProrroga: false,
    prorrogaDeId: null,
    diasPrevios: 0,
    diagnosticoId: 'cie-1',
    diagnostico: DIAGNOSTICO,
    observaciones: 'Reposo en casa',
    salarioFoto: new Prisma.Decimal(3_000_000),
    baseDiaria: new Prisma.Decimal(100_000),
    anulada: false,
    corregida: false,
    periodos: [
      {
        id: 'p-1',
        ausentismoId: 'a-1',
        anio: 2026,
        mes: 3,
        dias: 5,
        diasEmpleador: 2,
        diasEps: 3,
        diasArl: 0,
        diasAfp: 0,
        diasLaborados: 0,
        diasDescuento: 0,
        valorEmpleador: new Prisma.Decimal(133_340),
        valorEps: new Prisma.Decimal(200_010),
        valorArl: new Prisma.Decimal(0),
        valorAfp: new Prisma.Decimal(0),
        valorDescuento: new Prisma.Decimal(0),
      },
    ],
    recobros: [],
    _count: { documentos: 1 },
    ...extra,
  };
}

function montar() {
  const tablas = {
    trabajador: { findUnique: vi.fn().mockResolvedValue(TRABAJADOR) },
    tipoAusentismo: { findUnique: vi.fn().mockResolvedValue(TIPO_GENERAL) },
    diagnosticoCie10: { findUnique: vi.fn().mockResolvedValue(DIAGNOSTICO) },
    afiliacionTrabajador: {
      findMany: vi.fn().mockResolvedValue([
        { tipo: 'EPS', entidad: { nombre: 'Sura' } },
        { tipo: 'ARL', entidad: { nombre: 'Colmena' } },
        { tipo: 'AFP', entidad: { nombre: 'Colpensiones' } },
      ]),
    },
    ausentismo: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(where.id === 'a-nuevo' ? detalle({ id: 'a-nuevo' }) : detalle({ id: where.id }))),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: 'a-nuevo' }),
      update: vi.fn().mockResolvedValue({}),
    },
    ausentismoPeriodo: { update: vi.fn() },
    registroAuditoria: { create: vi.fn() },
  };
  tablas.ausentismo.create.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'a-nuevo', ...data }));
  const prisma = { ...tablas, $transaction: vi.fn((accion: (tx: typeof tablas) => unknown) => accion(tablas)) };
  const seguridadSocial = { parametroDelAnio: vi.fn().mockResolvedValue(PARAMETRO) };
  const documentos = { listar: vi.fn().mockResolvedValue([{ id: 'doc-1' }]), subir: vi.fn().mockResolvedValue({ id: 'doc-nuevo' }), leer: vi.fn().mockResolvedValue({ buffer: Buffer.from('x'), contentType: 'application/pdf', nombre: 'certificado.pdf' }) };
  return {
    tablas,
    seguridadSocial,
    documentos,
    servicio: new AusentismoService(prisma as unknown as PrismaService, seguridadSocial as unknown as SeguridadSocialService, documentos as unknown as DocumentosSstService),
  };
}

const DATOS = { trabajadorId: 't-1', tipoId: 'tipo-eg', fechaInicio: '2026-03-10', fechaFin: '2026-03-14', diagnosticoId: 'cie-1' };

describe('AusentismoService.registrar (RF-SST-01 a 03)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('registra una incapacidad: días, mes, año, foto del trabajador, liquidación y recobro de la EPS', async () => {
    await m.servicio.registrar({ ...DATOS, numeroDocumento: ' INC-0042 ', observaciones: ' Reposo ' }, GERENTE);
    const data = m.tablas.ausentismo.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      trabajadorId: 't-1',
      tipoId: 'tipo-eg',
      dias: 5,
      anio: 2026,
      mes: 3,
      numeroDocumento: 'INC-0042',
      observaciones: 'Reposo',
      esProrroga: false,
      diasPrevios: 0,
      cargoFoto: 'Oficial',
      epsFoto: 'Sura',
      arlFoto: 'Colmena',
      afpFoto: 'Colpensiones',
      registradaPorId: GERENTE.id,
    });
    expect(data.salarioFoto.toString()).toBe('3000000');
    expect(data.baseDiaria.toString()).toBe('100000');
    expect(data.pisoDiario.toString()).toBe('58363.5');
    // Un período con 2 días del empleador y 3 de la EPS.
    expect(data.periodos.create).toHaveLength(1);
    expect(data.periodos.create[0]).toMatchObject({ anio: 2026, mes: 3, dias: 5, diasEmpleador: 2, diasEps: 3 });
    expect(data.periodos.create[0].valorEps.toString()).toBe('200010');
    expect(data.recobros.create).toEqual([{ entidad: 'EPS' }]);
  });

  it('guarda como foto los parámetros usados y el cálculo original, y si estaban validados', async () => {
    await m.servicio.registrar(DATOS, GERENTE);
    const data = m.tablas.ausentismo.create.mock.calls[0][0].data;
    expect(data.parametrosLiquidacion).toMatchObject({ anio: 2026, parametrosValidados: false, regla: 'INCAPACIDAD_GENERAL', porcentajeTramo1: '66.67', diasBaseMes: 30 });
    expect(data.liquidacionCalculada.totales).toMatchObject({ dias: 5, valorEmpleador: '133340', valorEps: '200010' });
    expect(data.liquidacionCalculada.periodos).toHaveLength(1);
    m.seguridadSocial.parametroDelAnio.mockResolvedValue({ ...PARAMETRO, validadoEn: new Date() });
    await m.servicio.registrar({ ...DATOS, fechaInicio: '2026-04-10', fechaFin: '2026-04-11' }, GERENTE);
    expect(m.tablas.ausentismo.create.mock.calls[1][0].data.parametrosLiquidacion.parametrosValidados).toBe(true);
  });

  it('usa los parámetros del año en que empieza el ausentismo', async () => {
    await m.servicio.registrar({ ...DATOS, fechaInicio: '2026-12-30', fechaFin: '2027-01-02' }, GERENTE);
    expect(m.seguridadSocial.parametroDelAnio).toHaveBeenCalledWith(2026);
    const data = m.tablas.ausentismo.create.mock.calls[0][0].data;
    expect(data.periodos.create.map((p: { anio: number; mes: number }) => `${p.anio}-${p.mes}`)).toEqual(['2026-12', '2027-1']);
  });

  it('si no hay parámetros legales del año, no registra', async () => {
    m.seguridadSocial.parametroDelAnio.mockRejectedValue(new NotFoundException('No hay parámetros legales del año 2026'));
    await expect(m.servicio.registrar(DATOS, GERENTE)).rejects.toThrow(NotFoundException);
    expect(m.tablas.ausentismo.create).not.toHaveBeenCalled();
  });

  it('crea el recobro según quién paga: la ARL en un accidente, la EPS en maternidad y ninguno en un luto', async () => {
    m.tablas.tipoAusentismo.findUnique.mockResolvedValue(TIPO_ACCIDENTE);
    await m.servicio.registrar({ ...DATOS, tipoId: 'tipo-at' }, GERENTE);
    expect(m.tablas.ausentismo.create.mock.calls[0][0].data.recobros.create).toEqual([{ entidad: 'ARL' }]);
    m.tablas.tipoAusentismo.findUnique.mockResolvedValue(TIPO_MATERNIDAD);
    await m.servicio.registrar({ trabajadorId: 't-1', tipoId: 'tipo-mat', fechaInicio: '2026-05-01', fechaFin: '2026-05-10' }, GERENTE);
    expect(m.tablas.ausentismo.create.mock.calls[1][0].data.recobros.create).toEqual([{ entidad: 'EPS' }]);
    m.tablas.tipoAusentismo.findUnique.mockResolvedValue(TIPO_LUTO);
    await m.servicio.registrar({ trabajadorId: 't-1', tipoId: 'tipo-luto', fechaInicio: '2026-06-01', fechaFin: '2026-06-03' }, GERENTE);
    expect(m.tablas.ausentismo.create.mock.calls[2][0].data.recobros.create).toEqual([]);
  });

  it('una licencia no exige diagnóstico, y una incapacidad sí', async () => {
    m.tablas.tipoAusentismo.findUnique.mockResolvedValue(TIPO_LUTO);
    await m.servicio.registrar({ trabajadorId: 't-1', tipoId: 'tipo-luto', fechaInicio: '2026-06-01', fechaFin: '2026-06-03' }, GERENTE);
    m.tablas.tipoAusentismo.findUnique.mockResolvedValue(TIPO_GENERAL);
    await expect(m.servicio.registrar({ ...DATOS, diagnosticoId: undefined }, GERENTE)).rejects.toThrow(/exige el diagnóstico/);
  });

  it('el diagnóstico debe existir y estar activo', async () => {
    m.tablas.diagnosticoCie10.findUnique.mockResolvedValue(null);
    await expect(m.servicio.registrar(DATOS, GERENTE)).rejects.toThrow(NotFoundException);
    m.tablas.diagnosticoCie10.findUnique.mockResolvedValue({ ...DIAGNOSTICO, activo: false });
    await expect(m.servicio.registrar(DATOS, GERENTE)).rejects.toThrow(/desactivado/);
    expect(m.tablas.ausentismo.create).not.toHaveBeenCalled();
  });

  it('valida el trabajador, el tipo y las fechas', async () => {
    m.tablas.trabajador.findUnique.mockResolvedValueOnce(null);
    await expect(m.servicio.registrar(DATOS, GERENTE)).rejects.toThrow(NotFoundException);
    m.tablas.tipoAusentismo.findUnique.mockResolvedValueOnce(null);
    await expect(m.servicio.registrar(DATOS, GERENTE)).rejects.toThrow(NotFoundException);
    m.tablas.tipoAusentismo.findUnique.mockResolvedValueOnce({ ...TIPO_GENERAL, activo: false });
    await expect(m.servicio.registrar(DATOS, GERENTE)).rejects.toThrow(/desactivado/);
    await expect(m.servicio.registrar({ ...DATOS, fechaFin: '2026-03-09' }, GERENTE)).rejects.toThrow(/anterior a la de inicio/);
    await expect(m.servicio.registrar({ ...DATOS, fechaInicio: '2026-02-30' }, GERENTE)).rejects.toThrow(/no es una fecha válida/);
    await expect(m.servicio.registrar({ ...DATOS, fechaFin: '2029-12-31' }, GERENTE)).rejects.toThrow(/no puede pasar de/);
    await expect(m.servicio.registrar({ ...DATOS, fechaInicio: '2025-12-31', fechaFin: '2026-01-02' }, GERENTE)).rejects.toThrow(/antes de la fecha de ingreso/);
    m.tablas.trabajador.findUnique.mockResolvedValue({ ...TRABAJADOR, estado: 'INACTIVO', fechaRetiro: dia(3, 1) });
    await expect(m.servicio.registrar(DATOS, GERENTE)).rejects.toThrow(/después del retiro/);
    expect(m.tablas.ausentismo.create).not.toHaveBeenCalled();
  });

  it('no admite un traslape con otro ausentismo vigente y dice entre qué fechas', async () => {
    m.tablas.ausentismo.findFirst.mockResolvedValue({ fechaInicio: dia(3, 12), fechaFin: dia(3, 20) });
    const promesa = m.servicio.registrar(DATOS, GERENTE);
    await expect(promesa).rejects.toThrow(ConflictException);
    await expect(promesa).rejects.toThrow(/del 2026-03-12 al 2026-03-20/);
    expect(m.tablas.ausentismo.create).not.toHaveBeenCalled();
  });

  it('si la base de datos detecta el traslape (dos registros a la vez), también responde 409', async () => {
    m.tablas.ausentismo.create.mockRejectedValue(new Error('Invalid prisma.ausentismo.create(): El trabajador ya tiene un ausentismo en esas fechas'));
    await expect(m.servicio.registrar(DATOS, GERENTE)).rejects.toThrow(ConflictException);
  });

  it('registra la acción en la auditoría sin el diagnóstico, las observaciones ni los valores', async () => {
    await m.servicio.registrar({ ...DATOS, observaciones: 'Cirugía de columna' }, GERENTE);
    const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'AUSENTISMO_REGISTRAR');
    expect(registro.resumen).toContain('Persona Inventada');
    expect(registro.resumen).toContain('(5 días)');
    expect(JSON.stringify(registro)).not.toContain('Cirugía');
    expect(JSON.stringify(registro)).not.toContain('M54.5');
    expect(JSON.stringify(registro)).not.toContain('3000000');
  });

  describe('prórrogas (RF-SST-04)', () => {
    const PRORROGA = { ...DATOS, fechaInicio: '2026-03-15', fechaFin: '2026-03-20', esProrroga: true };
    const ANTERIOR = { id: 'a-ant', trabajadorId: 't-1', tipoId: 'tipo-eg', anulada: false, fechaInicio: dia(3, 10), fechaFin: dia(3, 14), dias: 5, diasPrevios: 0 };

    it('continúa una incapacidad del sistema: toma como días previos los de la anterior más los que ella traía', async () => {
      m.tablas.ausentismo.findUnique.mockResolvedValueOnce({ ...ANTERIOR, diasPrevios: 85 });
      await m.servicio.registrar({ ...PRORROGA, prorrogaDeId: 'a-ant' }, GERENTE);
      const data = m.tablas.ausentismo.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ esProrroga: true, prorrogaDeId: 'a-ant', diasPrevios: 90 });
      // Con 90 días previos, los 6 días de la prórroga ya son del segundo tramo (EPS al 50 %): 6 x 58.363,5.
      expect(data.periodos.create[0].valorEps.toString()).toBe('350181');
      expect(data.periodos.create[0].diasEmpleador).toBe(0);
    });

    it('si la anterior venía de fuera, se digitan los días que llevaba', async () => {
      await m.servicio.registrar({ ...PRORROGA, diasPrevios: 40 }, GERENTE);
      expect(m.tablas.ausentismo.create.mock.calls[0][0].data).toMatchObject({ esProrroga: true, prorrogaDeId: null, diasPrevios: 40 });
    });

    it.each([
      ['sin indicar la anterior ni los días previos', {}, /cuántos días llevaba/],
      ['con la anterior y los días previos a la vez', { prorrogaDeId: 'a-ant', diasPrevios: 3 }, /no se digitan los días previos/],
    ])('rechaza una prórroga %s', async (_caso, extra, mensaje) => {
      await expect(m.servicio.registrar({ ...PRORROGA, ...extra }, GERENTE)).rejects.toThrow(mensaje);
    });

    it('rechaza indicar la anterior sin marcar la prórroga', async () => {
      await expect(m.servicio.registrar({ ...DATOS, prorrogaDeId: 'a-ant' }, GERENTE)).rejects.toThrow(/marca el ausentismo como prórroga/);
      await expect(m.servicio.registrar({ ...DATOS, diasPrevios: 4 }, GERENTE)).rejects.toThrow(/marca el ausentismo como prórroga/);
    });

    it.each([
      ['de otro trabajador', { trabajadorId: 't-2' }, /mismo trabajador/],
      ['anulada', { anulada: true }, /anulada/],
      ['de otro tipo', { tipoId: 'otro' }, /mismo tipo/],
      ['que termina después de que empieza la prórroga', { fechaFin: dia(3, 15) }, /después de que termina/],
    ])('la anterior no puede ser %s', async (_caso, cambio, mensaje) => {
      m.tablas.ausentismo.findUnique.mockResolvedValueOnce({ ...ANTERIOR, ...cambio });
      await expect(m.servicio.registrar({ ...PRORROGA, prorrogaDeId: 'a-ant' }, GERENTE)).rejects.toThrow(mensaje);
    });

    it('una incapacidad solo tiene una prórroga vigente: se continúa la última', async () => {
      m.tablas.ausentismo.findUnique.mockResolvedValueOnce(ANTERIOR);
      m.tablas.ausentismo.count.mockResolvedValue(1);
      await expect(m.servicio.registrar({ ...PRORROGA, prorrogaDeId: 'a-ant' }, GERENTE)).rejects.toThrow(ConflictException);
    });

    it('las licencias no tienen prórroga', async () => {
      m.tablas.tipoAusentismo.findUnique.mockResolvedValue(TIPO_LUTO);
      await expect(m.servicio.registrar({ trabajadorId: 't-1', tipoId: 'tipo-luto', fechaInicio: '2026-06-01', fechaFin: '2026-06-03', esProrroga: true, diasPrevios: 2 }, GERENTE)).rejects.toThrow(/no tiene prórrogas/);
    });
  });

  describe('lo que recibe quien registra (RNF-SEG-08)', () => {
    it('un administrador registra con el diagnóstico pero la respuesta no lo trae, ni las observaciones ni el certificado', async () => {
      const respuesta = await m.servicio.registrar(DATOS, ADMINISTRADOR);
      expect(m.tablas.ausentismo.create.mock.calls[0][0].data.diagnosticoId).toBe('cie-1');
      const texto = JSON.stringify(respuesta);
      expect(texto).not.toContain('M54.5');
      expect(texto).not.toContain('Reposo en casa');
      expect(respuesta).not.toHaveProperty('diagnostico');
      expect(respuesta).toMatchObject({ salarioFoto: expect.anything() });
    });

    it('un contratista recibe el diagnóstico pero ningún valor', async () => {
      const respuesta = await m.servicio.registrar(DATOS, CONTRATISTA);
      expect(respuesta).toMatchObject({ diagnostico: { codigo: 'M54.5' } });
      const texto = JSON.stringify(respuesta);
      for (const valor of ['3000000', '100000', '200010', '133340']) {
        expect(texto, valor).not.toContain(valor);
      }
      expect((respuesta.periodos as { diasEps: number }[])[0].diasEps).toBe(3);
    });
  });
});

describe('AusentismoService.buscar y listar', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('consultar un diagnóstico queda en la auditoría (RNF-LEG-03)', async () => {
    await m.servicio.buscar('a-1', CONTRATISTA);
    const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'AUSENTISMO_DIAGNOSTICO_CONSULTAR');
    expect(registro).toMatchObject({ entidad: 'AUSENTISMO', entidadId: 'a-1', usuarioId: CONTRATISTA.id });
    expect(registro.resumen).toContain('Persona Inventada');
    expect(JSON.stringify(registro)).not.toContain('M54.5');
  });

  it('quien no puede ver diagnósticos no genera esa consulta en la auditoría, y no recibe el diagnóstico', async () => {
    const respuesta = await m.servicio.buscar('a-1', ADMINISTRADOR);
    expect(auditoriasDe(m.tablas.registroAuditoria.create)).toHaveLength(0);
    expect(respuesta).not.toHaveProperty('diagnostico');
    expect(respuesta).not.toHaveProperty('observaciones');
  });

  it('un ausentismo sin diagnóstico no genera consulta', async () => {
    m.tablas.ausentismo.findUnique.mockResolvedValue(detalle({ diagnosticoId: null, diagnostico: null }));
    await m.servicio.buscar('a-1', GERENTE);
    expect(auditoriasDe(m.tablas.registroAuditoria.create)).toHaveLength(0);
  });

  it('incluye los totales por pagador', async () => {
    const respuesta = await m.servicio.buscar('a-1', GERENTE);
    expect(respuesta.totales).toMatchObject({ dias: 5, diasEmpleador: 2, diasEps: 3, valorEmpleador: '133340', valorEps: '200010' });
  });

  it('uno que no existe da 404', async () => {
    m.tablas.ausentismo.findUnique.mockResolvedValue(null);
    await expect(m.servicio.buscar('nada', GERENTE)).rejects.toThrow(NotFoundException);
  });

  it('la lista nunca trae diagnósticos ni observaciones, ni siquiera para quien puede verlos', async () => {
    m.tablas.ausentismo.findMany.mockResolvedValue([{ ...detalle(), tipo: TIPO_GENERAL }]);
    const filas = await m.servicio.listar({}, GERENTE);
    const argumento = m.tablas.ausentismo.findMany.mock.calls[0][0];
    expect(argumento.include).toBeUndefined();
    for (const campo of ['diagnosticoId', 'diagnostico', 'observaciones', 'liquidacionCalculada', 'parametrosLiquidacion', 'salarioFoto']) {
      expect(argumento.select, campo).not.toHaveProperty(campo);
    }
    expect(filas).toHaveLength(1);
    expect(filas[0].totales).toMatchObject({ diasEps: 3, valorEps: '200010' });
  });

  it('la lista oculta los valores a quien no puede verlos', async () => {
    m.tablas.ausentismo.findMany.mockResolvedValue([detalle()]);
    const [fila] = await m.servicio.listar({}, CONTRATISTA);
    const texto = JSON.stringify(fila);
    for (const valor of ['3000000', '100000', '200010', '133340']) {
      expect(texto, valor).not.toContain(valor);
    }
    expect(fila.totales).toMatchObject({ dias: 5, diasEps: 3 });
  });

  it('filtra por estado (vigentes por defecto), trabajador, tipo y mes', async () => {
    await m.servicio.listar({}, GERENTE);
    expect(m.tablas.ausentismo.findMany.mock.calls[0][0].where).toEqual({ anulada: false });
    await m.servicio.listar({ estado: 'TODOS', trabajadorId: 't-1', tipoId: 'tipo-eg', mes: 3 }, GERENTE, dia(6, 10));
    expect(m.tablas.ausentismo.findMany.mock.calls[1][0].where).toEqual({ trabajadorId: 't-1', tipoId: 'tipo-eg', periodos: { some: { anio: 2026, mes: 3 } } });
    await m.servicio.listar({ estado: 'ANULADOS', anio: 2025 }, GERENTE);
    expect(m.tablas.ausentismo.findMany.mock.calls[2][0].where).toEqual({ anulada: true, periodos: { some: { anio: 2025 } } });
  });
});

describe('AusentismoService.actualizar, anular y corregir', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('completa el número, el diagnóstico y las observaciones, y lo audita', async () => {
    await m.servicio.actualizar('a-1', { numeroDocumento: ' INC-7 ', observaciones: '', diagnosticoId: 'cie-1' }, GERENTE);
    expect(m.tablas.ausentismo.update.mock.calls[0][0].data).toEqual({ numeroDocumento: 'INC-7', diagnosticoId: 'cie-1', observaciones: null });
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'AUSENTISMO_EDITAR').resumen).toContain('el número del documento');
  });

  it('una incapacidad no puede quedarse sin diagnóstico', async () => {
    await expect(m.servicio.actualizar('a-1', { diagnosticoId: null }, GERENTE)).rejects.toThrow(/exige el diagnóstico/);
    expect(m.tablas.ausentismo.update).not.toHaveBeenCalled();
  });

  it('un ausentismo anulado no se modifica', async () => {
    m.tablas.ausentismo.findUnique.mockResolvedValue(detalle({ anulada: true }));
    await expect(m.servicio.actualizar('a-1', { observaciones: 'x' }, GERENTE)).rejects.toThrow(/anulado/);
    await expect(m.servicio.anular('a-1', { motivo: 'Registrado por error' }, GERENTE)).rejects.toThrow(/anulado/);
    await expect(m.servicio.corregirLiquidacion('a-1', { motivo: 'La EPS pagó distinto', periodos: [] }, GERENTE)).rejects.toThrow(/anulado/);
  });

  it('anula con motivo, a nombre de quien lo hace, y lo audita', async () => {
    await m.servicio.anular('a-1', { motivo: ' Registrado por error ' }, ADMINISTRADOR);
    expect(m.tablas.ausentismo.update.mock.calls[0][0].data).toMatchObject({ anulada: true, anuladaPorId: ADMINISTRADOR.id, motivoAnulacion: 'Registrado por error' });
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'AUSENTISMO_ANULAR').resumen).toContain('Registrado por error');
  });

  it('no anula una incapacidad que tiene prórrogas vigentes', async () => {
    m.tablas.ausentismo.count.mockResolvedValue(1);
    await expect(m.servicio.anular('a-1', { motivo: 'Registrado por error' }, GERENTE)).rejects.toThrow(/prórrogas vigentes/);
    expect(m.tablas.ausentismo.update).not.toHaveBeenCalled();
  });

  describe('corrección de la liquidación (RF-SST-08)', () => {
    const CORRECCION = {
      motivo: ' La EPS reconoció 210.000 ',
      periodos: [{ anio: 2026, mes: 3, diasEmpleador: 2, diasEps: 3, diasArl: 0, diasAfp: 0, diasLaborados: 0, diasDescuento: 0, valorEmpleador: '133340', valorEps: '210000', valorArl: '0', valorAfp: '0', valorDescuento: '0' }],
    };

    it('cambia los valores, marca la corrección y deja el antes y el después en la auditoría', async () => {
      await m.servicio.corregirLiquidacion('a-1', CORRECCION, GERENTE);
      expect(m.tablas.ausentismoPeriodo.update).toHaveBeenCalledOnce();
      expect(m.tablas.ausentismoPeriodo.update.mock.calls[0][0].where).toEqual({ id: 'p-1' });
      expect(m.tablas.ausentismoPeriodo.update.mock.calls[0][0].data.valorEps.toString()).toBe('210000');
      expect(m.tablas.ausentismo.update.mock.calls[0][0].data).toMatchObject({ corregida: true, corregidaPorId: GERENTE.id, motivoCorreccion: 'La EPS reconoció 210.000' });
      const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'AUSENTISMO_CORREGIR');
      expect((registro.antes as { periodos: { valorEps: string }[] }).periodos[0].valorEps).toBe('200010');
      expect((registro.despues as { periodos: { valorEps: string }[] }).periodos[0].valorEps).toBe('210000');
    });

    it('permite cambiar cómo se reparten los días entre los pagadores si siguen sumando el total del mes', async () => {
      await m.servicio.corregirLiquidacion('a-1', { ...CORRECCION, periodos: [{ ...CORRECCION.periodos[0], diasEmpleador: 1, diasEps: 4 }] }, GERENTE);
      expect(m.tablas.ausentismoPeriodo.update.mock.calls[0][0].data).toMatchObject({ diasEmpleador: 1, diasEps: 4 });
    });

    it('rechaza días que no suman, meses que no son los de la liquidación y meses que faltan', async () => {
      await expect(m.servicio.corregirLiquidacion('a-1', { ...CORRECCION, periodos: [{ ...CORRECCION.periodos[0], diasEps: 4 }] }, GERENTE)).rejects.toThrow(/deben sumar 5/);
      await expect(m.servicio.corregirLiquidacion('a-1', { ...CORRECCION, periodos: [{ ...CORRECCION.periodos[0], mes: 7 }] }, GERENTE)).rejects.toThrow(BadRequestException);
      await expect(m.servicio.corregirLiquidacion('a-1', { ...CORRECCION, periodos: [CORRECCION.periodos[0], { ...CORRECCION.periodos[0], mes: 4 }] }, GERENTE)).rejects.toThrow(/mismos meses/);
      expect(m.tablas.ausentismoPeriodo.update).not.toHaveBeenCalled();
      expect(m.tablas.ausentismo.update).not.toHaveBeenCalled();
    });
  });
});

describe('AusentismoService: certificados adjuntos (RF-SST-21)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('listar y descargar un certificado es consultar un dato de salud: queda en la auditoría', async () => {
    m.tablas.ausentismo.findUnique.mockResolvedValue({ id: 'a-1' });
    await m.servicio.listarDocumentos('a-1', CONTRATISTA);
    await m.servicio.leerDocumento('a-1', 'doc-1', CONTRATISTA);
    const registros = auditoriasDe(m.tablas.registroAuditoria.create);
    expect(registros.map((r) => r.accion)).toEqual(['AUSENTISMO_DIAGNOSTICO_CONSULTAR', 'AUSENTISMO_DIAGNOSTICO_CONSULTAR']);
    expect(registros[1].resumen).toContain('certificado.pdf');
    expect(m.documentos.listar).toHaveBeenCalledWith({ tipo: 'ausentismo', id: 'a-1' });
    expect(m.documentos.leer).toHaveBeenCalledWith({ tipo: 'ausentismo', id: 'a-1' }, 'doc-1');
  });

  it('un ausentismo que no existe da 404 antes de tocar los adjuntos', async () => {
    m.tablas.ausentismo.findUnique.mockResolvedValue(null);
    await expect(m.servicio.listarDocumentos('nada', CONTRATISTA)).rejects.toThrow(NotFoundException);
    await expect(m.servicio.leerDocumento('nada', 'doc-1', CONTRATISTA)).rejects.toThrow(NotFoundException);
    expect(m.documentos.listar).not.toHaveBeenCalled();
    expect(m.documentos.leer).not.toHaveBeenCalled();
  });

  it('adjuntar usa el servicio de adjuntos con el ausentismo como dueño', async () => {
    const archivo = { buffer: Buffer.from('x'), originalname: 'certificado.pdf' } as Express.Multer.File;
    await m.servicio.subirDocumento('a-1', archivo, 'Certificado de la EPS', ADMINISTRADOR);
    expect(m.documentos.subir).toHaveBeenCalledWith({ tipo: 'ausentismo', id: 'a-1' }, archivo, 'Certificado de la EPS', ADMINISTRADOR);
  });
});
