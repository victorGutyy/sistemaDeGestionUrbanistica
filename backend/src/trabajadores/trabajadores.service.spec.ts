import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { componerNombre, datosDeAutorizacionSalud, TrabajadoresService } from './trabajadores.service.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';

const D = (valor: string | number) => new Prisma.Decimal(valor);

function crearPrismaFalso() {
  return {
    trabajador: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  };
}

describe('TrabajadoresService', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let service: TrabajadoresService;

  beforeEach(() => {
    prisma = crearPrismaFalso();
    service = new TrabajadoresService(prisma as unknown as PrismaService);
  });

  it('rechaza crear un trabajador con un documento que ya existe', async () => {
    prisma.trabajador.findUnique.mockResolvedValue({ id: 'existente' });

    await expect(
      service.crear({
        nombre: 'Juan Pérez',
        documento: '123',
        cargo: 'Operario',
        salarioBase: '1500000',
        fechaIngreso: '2026-01-01',
      }, usuarioDePrueba()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza buscar un trabajador que no existe', async () => {
    prisma.trabajador.findUnique.mockResolvedValue(null);
    await expect(service.buscarPorId('x')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TrabajadoresService: auditoría (RF-AUD-01)', () => {
  it('crear un trabajador deja quién lo creó y con qué datos', async () => {
    const tablas = { trabajador: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 't-1', nombre: 'Juan Pérez', documento: '123', cargo: 'Operario', salarioBase: '1500000', fechaIngreso: new Date(2026, 0, 1), estado: 'ACTIVO' }) }, registroAuditoria: { create: vi.fn() } };
    const prisma = { ...tablas, $transaction: vi.fn((accion: (tx: typeof tablas) => unknown) => accion(tablas)) };
    const servicio = new TrabajadoresService(prisma as unknown as PrismaService);

    await servicio.crear({ nombre: 'Juan Pérez', documento: '123', cargo: 'Operario', salarioBase: '1500000', fechaIngreso: '2026-01-01' }, usuarioDePrueba());

    expect(auditoriaDe(tablas.registroAuditoria.create, 'TRABAJADOR_CREAR')).toMatchObject({ entidad: 'TRABAJADOR', entidadId: 't-1', despues: { nombre: 'Juan Pérez', cargo: 'Operario' } });
  });
});

describe('componerNombre', () => {
  it('une nombres y apellidos sin espacios sobrantes', () => {
    expect(componerNombre('  Ana María ', ' Pérez Gómez')).toBe('Ana María Pérez Gómez');
    expect(componerNombre('Ana', null)).toBe('Ana');
    expect(componerNombre(undefined, 'Pérez')).toBe('Pérez');
    expect(componerNombre('', '  ')).toBe('');
  });
});

describe('datosDeAutorizacionSalud (RNF-LEG-03)', () => {
  it('al autorizar guarda fecha y quién la registró; al retirarla borra ambas', () => {
    expect(datosDeAutorizacionSalud(true, { id: 'u-1' })).toMatchObject({ autorizaDatosSalud: true, autorizacionSaludRegistradaPorId: 'u-1', fechaAutorizacionSalud: expect.any(Date) });
    expect(datosDeAutorizacionSalud(false, { id: 'u-1' })).toEqual({ autorizaDatosSalud: false, fechaAutorizacionSalud: null, autorizacionSaludRegistradaPorId: null });
  });
});

describe('TrabajadoresService: ficha ampliada (RF-PER-17)', () => {
  const ACTUAL = {
    id: 't-1',
    nombre: 'Persona Inventada',
    nombres: null,
    apellidos: null,
    documento: '000111',
    tipoDocumento: 'CC',
    fechaNacimiento: null,
    sexo: null,
    area: null,
    cargo: 'Oficial',
    tipoContrato: 'OBRA_LABOR',
    salarioBase: D('1500000'),
    fechaIngreso: new Date(2026, 0, 1),
    fechaRetiro: null,
    motivoRetiro: null,
    telefono: null,
    celular: null,
    email: null,
    estado: 'ACTIVO',
    autorizaDatosSalud: false,
    fechaAutorizacionSalud: null,
    autorizacionSaludRegistradaPorId: null,
  };

  function montar(actual: object | null = ACTUAL) {
    const tablas = {
      trabajador: { findUnique: vi.fn().mockResolvedValue(actual), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn() },
      parametroLegal: { findUnique: vi.fn().mockResolvedValue(null) },
      registroAuditoria: { create: vi.fn() },
    };
    tablas.trabajador.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...ACTUAL, ...data }));
    const prisma = { ...tablas, $transaction: vi.fn((accion: (tx: typeof tablas) => unknown) => accion(tablas)) };
    return { tablas, servicio: new TrabajadoresService(prisma as unknown as PrismaService) };
  }

  it('crear sin nombre completo lo arma con nombres y apellidos', async () => {
    const m = montar(null);
    m.tablas.trabajador.create.mockResolvedValue({ ...ACTUAL });
    await m.servicio.crear({ nombres: 'Ana María', apellidos: 'Pérez Gómez', documento: '999', cargo: 'Oficial', salarioBase: '1500000', fechaIngreso: '2026-01-01' }, usuarioDePrueba());
    expect(m.tablas.trabajador.create.mock.calls[0][0].data).toMatchObject({ nombre: 'Ana María Pérez Gómez', nombres: 'Ana María', apellidos: 'Pérez Gómez' });
  });

  it('crear sin ningún nombre se rechaza', async () => {
    const m = montar(null);
    await expect(m.servicio.crear({ documento: '999', cargo: 'Oficial', salarioBase: '1', fechaIngreso: '2026-01-01' }, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('crear con una fecha de nacimiento futura se rechaza', async () => {
    const m = montar(null);
    await expect(
      m.servicio.crear({ nombre: 'Persona Inventada', documento: '999', cargo: 'Oficial', salarioBase: '1', fechaIngreso: '2026-01-01', fechaNacimiento: '2999-01-01' }, usuarioDePrueba()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('editar deja en la auditoría solo lo que cambió, con su valor anterior', async () => {
    const m = montar();
    await m.servicio.actualizar('t-1', { cargo: 'Maestro', area: 'Obra civil', salarioBase: '1800000' }, usuarioDePrueba());

    const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'TRABAJADOR_EDITAR');
    expect(registro.resumen).toMatch(/: área, cargo, salario base$/);
    expect(registro.antes).toEqual({ cargo: 'Oficial', area: null, salarioBase: '1500000' });
    expect(registro.despues).toEqual({ cargo: 'Maestro', area: 'Obra civil', salarioBase: '1800000' });
  });

  it('enviar los mismos valores no escribe ni audita (el salario se compara como número, no como texto)', async () => {
    const m = montar();
    const resultado = await m.servicio.actualizar('t-1', { cargo: 'Oficial', salarioBase: '1500000.00', fechaIngreso: '2026-01-01', tipoDocumento: 'CC' }, usuarioDePrueba());
    expect(resultado).toBe(ACTUAL);
    expect(m.tablas.trabajador.update).not.toHaveBeenCalled();
    expect(auditoriasDe(m.tablas.registroAuditoria.create)).toHaveLength(0);
  });

  it('un texto vacío borra el área, el celular o el correo', async () => {
    const conDatos = { ...ACTUAL, area: 'Obra civil', celular: '3000000000', email: 'a@ejemplo.test' };
    const m = montar(conDatos);
    await m.servicio.actualizar('t-1', { area: '', celular: '  ', email: '' }, usuarioDePrueba());
    expect(m.tablas.trabajador.update.mock.calls[0][0].data).toEqual({ area: null, celular: null, email: null });
  });

  it('cambiar solo nombres o apellidos vuelve a armar el nombre completo', async () => {
    const m = montar({ ...ACTUAL, nombres: 'Ana', apellidos: 'Pérez', nombre: 'Ana Pérez' });
    await m.servicio.actualizar('t-1', { apellidos: 'Gómez' }, usuarioDePrueba());
    expect(m.tablas.trabajador.update.mock.calls[0][0].data).toMatchObject({ apellidos: 'Gómez', nombre: 'Ana Gómez' });
  });

  it('una fecha de ingreso posterior al retiro se rechaza', async () => {
    const m = montar({ ...ACTUAL, estado: 'INACTIVO', fechaRetiro: new Date(2026, 5, 1), motivoRetiro: 'Fin de obra' });
    await expect(m.servicio.actualizar('t-1', { fechaIngreso: '2026-07-01' }, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retirar deja estado, fecha y motivo, y lo audita', async () => {
    const m = montar();
    await m.servicio.retirar('t-1', { fechaRetiro: '2026-06-30', motivo: 'Terminó la obra' }, usuarioDePrueba());
    expect(m.tablas.trabajador.update.mock.calls[0][0].data).toMatchObject({ estado: 'INACTIVO', motivoRetiro: 'Terminó la obra' });
    const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'TRABAJADOR_RETIRAR');
    expect(registro.antes).toMatchObject({ estado: 'ACTIVO', fechaRetiro: null });
    expect(registro.despues).toMatchObject({ estado: 'INACTIVO', motivoRetiro: 'Terminó la obra' });
  });

  it('no se retira dos veces ni antes de la fecha de ingreso', async () => {
    await expect(montar({ ...ACTUAL, estado: 'INACTIVO' }).servicio.retirar('t-1', { fechaRetiro: '2026-06-30', motivo: 'Terminó la obra' }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
    await expect(montar().servicio.retirar('t-1', { fechaRetiro: '2025-12-31', motivo: 'Terminó la obra' }, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reactivar limpia el retiro; un trabajador activo no se reactiva', async () => {
    const m = montar({ ...ACTUAL, estado: 'INACTIVO', fechaRetiro: new Date(2026, 5, 30), motivoRetiro: 'Terminó la obra' });
    await m.servicio.reactivar('t-1', usuarioDePrueba());
    expect(m.tablas.trabajador.update.mock.calls[0][0].data).toEqual({ estado: 'ACTIVO', fechaRetiro: null, motivoRetiro: null });
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'TRABAJADOR_REACTIVAR').antes).toMatchObject({ estado: 'INACTIVO' });
    await expect(montar().servicio.reactivar('t-1', usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
  });

  it('registrar la autorización de datos de salud guarda quién y cuándo; repetirla no hace nada', async () => {
    const m = montar();
    await m.servicio.registrarAutorizacionSalud('t-1', { autoriza: true }, usuarioDePrueba());
    expect(m.tablas.trabajador.update.mock.calls[0][0].data).toMatchObject({ autorizaDatosSalud: true, autorizacionSaludRegistradaPorId: 'usuario-prueba' });
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'TRABAJADOR_AUTORIZACION_SALUD').resumen).toMatch(/Registró la autorización/);

    const otro = montar();
    await otro.servicio.registrarAutorizacionSalud('t-1', { autoriza: false }, usuarioDePrueba());
    expect(otro.tablas.trabajador.update).not.toHaveBeenCalled();
  });

  it('la ficha del contratista SST no pide salario, pagos ni documentos de recursos humanos', async () => {
    const m = montar({ ...ACTUAL, afiliaciones: [], documentos: [] });
    await m.servicio.fichaSst('t-1', { ...usuarioDePrueba(), permisos: ['sst.ver', 'sst.gestionar'] });

    const consulta = m.tablas.trabajador.findUnique.mock.calls[0][0];
    expect(consulta.select).toBeDefined();
    expect(consulta.include).toBeUndefined();
    expect(consulta.select.salarioBase).toBeUndefined();
    expect(consulta.select.pagos).toBeUndefined();
    expect(consulta.select.documentos.where.tipo.in.sort()).toEqual(['AUTORIZACION_DATOS', 'CERTIFICADO_AFILIACION']);
  });

  it('la lista del módulo SST tampoco trae el salario', async () => {
    const m = montar();
    await m.servicio.listarSst();
    expect(m.tablas.trabajador.findMany.mock.calls[0][0].select.salarioBase).toBeUndefined();
  });

  it('el detalle calcula el auxilio de transporte y la tasa ARL con los parámetros del año en curso', async () => {
    const m = montar({ ...ACTUAL, pagos: [], documentos: [], afiliaciones: [{ tipo: 'ARL', fechaFin: null, claseRiesgo: { clase: 3, tasa: D('2.436') } }] });
    m.tablas.parametroLegal.findUnique.mockResolvedValue({ smmlv: D('1000000'), auxilioTransporte: D('150000'), topeAuxilioSmmlv: D('2'), validadoEn: new Date() });

    const detalle = await m.servicio.buscarPorId('t-1');

    expect(m.tablas.parametroLegal.findUnique.mock.calls[0][0].where.anio).toBe(new Date().getFullYear());
    expect(detalle.legales).toMatchObject({ hayParametros: true, parametrosValidados: true, tasaArl: { clase: 3 } });
    expect(detalle.legales.auxilioTransporte?.aplica).toBe(true);
    expect(detalle.legales.auxilioTransporte?.valor.toString()).toBe('150000');
  });

  it('un salario sobre el tope no recibe auxilio; sin parámetros del año no se inventa nada', async () => {
    const m = montar({ ...ACTUAL, salarioBase: D('2500000'), pagos: [], documentos: [], afiliaciones: [] });
    m.tablas.parametroLegal.findUnique.mockResolvedValue({ smmlv: D('1000000'), auxilioTransporte: D('150000'), topeAuxilioSmmlv: D('2'), validadoEn: null });
    const conParametros = await m.servicio.buscarPorId('t-1');
    expect(conParametros.legales.auxilioTransporte?.aplica).toBe(false);
    expect(conParametros.legales.auxilioTransporte?.valor.toString()).toBe('0');
    expect(conParametros.legales.parametrosValidados).toBe(false);

    m.tablas.parametroLegal.findUnique.mockResolvedValue(null);
    const sinParametros = await m.servicio.buscarPorId('t-1');
    expect(sinParametros.legales).toMatchObject({ hayParametros: false, auxilioTransporte: null, tasaArl: null });
  });
});
