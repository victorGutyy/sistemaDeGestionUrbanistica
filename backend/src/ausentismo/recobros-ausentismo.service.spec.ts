import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLAVE_CONTRATISTA_SST, CLAVE_GERENTE, ROLES_SISTEMA } from '../auth/permisos.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { auditoriaDe } from '../test-utils/auditoria.js';
import { RecobrosAusentismoService } from './recobros-ausentismo.service.js';

function usuarioCon(clave: string): UsuarioAutenticado {
  const rol = ROLES_SISTEMA.find((r) => r.clave === clave);
  return { id: `u-${clave}`, email: `${clave.toLowerCase()}@ejemplo.test`, nombre: `Usuario ${clave}`, rol: { id: 'r', clave, nombre: clave }, permisos: [...(rol?.permisos ?? [])], proyectoIds: null };
}
const GERENTE = usuarioCon(CLAVE_GERENTE);
const ADMINISTRADOR = usuarioCon('ADMINISTRADOR');
const CONTRATISTA = usuarioCon(CLAVE_CONTRATISTA_SST);

const d = (valor: number) => new Prisma.Decimal(valor);
const PERIODOS = [{ valorEps: d(200_010), valorArl: d(0), valorAfp: d(0), diasEps: 3, diasArl: 0, diasAfp: 0 }];
const RECOBRO = { id: 'r-1', ausentismoId: 'a-1', entidad: 'EPS', estado: 'PENDIENTE', valorReconocido: null, fechaRadicacion: null, fechaPago: null, observaciones: null };
const AUSENTISMO = { id: 'a-1', anulada: false, trabajador: { nombre: 'Persona Inventada' }, periodos: PERIODOS, recobros: [RECOBRO] };

function montar() {
  const tablas = {
    ausentismo: { findUnique: vi.fn().mockResolvedValue(AUSENTISMO) },
    recobroAusentismo: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...RECOBRO, ...data })),
      create: vi.fn().mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'r-nuevo', ...data })),
    },
    registroAuditoria: { create: vi.fn() },
  };
  const prisma = { ...tablas, $transaction: vi.fn((accion: (tx: typeof tablas) => unknown) => accion(tablas)) };
  return { tablas, servicio: new RecobrosAusentismoService(prisma as unknown as PrismaService) };
}

describe('RecobrosAusentismoService.listar (RF-SST-09)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
    m.tablas.recobroAusentismo.findMany.mockResolvedValue([
      {
        ...RECOBRO,
        valorReconocido: d(210_000),
        observaciones: 'Pagó 210.000',
        ausentismo: { id: 'a-1', fechaInicio: new Date(2026, 2, 10), fechaFin: new Date(2026, 2, 14), dias: 5, numeroDocumento: 'INC-1', trabajador: { id: 't-1', nombre: 'Persona Inventada', documento: '000111' }, tipo: { id: 'tipo-eg', nombre: 'Enfermedad general' }, periodos: PERIODOS },
      },
    ]);
  });

  it('solo trae los de ausentismos vigentes y filtra por estado, entidad y año', async () => {
    await m.servicio.listar({}, GERENTE);
    expect(m.tablas.recobroAusentismo.findMany.mock.calls[0][0].where).toEqual({ ausentismo: { anulada: false } });
    await m.servicio.listar({ estado: 'PENDIENTE', entidad: 'ARL', anio: 2026 }, GERENTE);
    expect(m.tablas.recobroAusentismo.findMany.mock.calls[1][0].where).toEqual({ estado: 'PENDIENTE', entidad: 'ARL', ausentismo: { anulada: false, anio: 2026 } });
  });

  it('con valores trae lo esperado y lo reconocido', async () => {
    const [fila] = await m.servicio.listar({}, ADMINISTRADOR);
    expect(fila).toMatchObject({ entidad: 'EPS', valorEsperado: '200010', valorReconocido: expect.anything(), observaciones: 'Pagó 210.000' });
    expect(fila.ausentismo).toMatchObject({ numeroDocumento: 'INC-1', trabajador: { nombre: 'Persona Inventada' } });
    expect(fila.ausentismo).not.toHaveProperty('periodos');
  });

  it('el contratista ve el estado pero ningún valor ni las observaciones del recobro', async () => {
    const [fila] = await m.servicio.listar({}, CONTRATISTA);
    const texto = JSON.stringify(fila);
    for (const valor of ['200010', '210000', '210.000']) {
      expect(texto, valor).not.toContain(valor);
    }
    expect(fila).toMatchObject({ entidad: 'EPS', estado: 'PENDIENTE' });
  });
});

describe('RecobrosAusentismoService.actualizar (RF-SST-09)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('radica el cobro y lo deja en la auditoría con el antes y el después', async () => {
    const respuesta = await m.servicio.actualizar('a-1', 'EPS', { estado: 'RADICADA', fechaRadicacion: '2026-04-01', observaciones: ' Radicado en la oficina ' }, ADMINISTRADOR);
    const data = m.tablas.recobroAusentismo.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ estado: 'RADICADA', actualizadoPorId: ADMINISTRADOR.id, observaciones: 'Radicado en la oficina', fechaPago: null, valorReconocido: null });
    expect(data.fechaRadicacion).toEqual(new Date(2026, 3, 1));
    expect(respuesta).toMatchObject({ estado: 'RADICADA', valorEsperado: '200010' });
    const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'AUSENTISMO_RECOBRO_ACTUALIZAR');
    expect(registro.resumen).toContain('recobro a la EPS');
    expect(registro.resumen).toContain('radicada');
    expect((registro.antes as { estado: string }).estado).toBe('PENDIENTE');
    expect((registro.despues as { estado: string }).estado).toBe('RADICADA');
  });

  it('registra el pago con el valor que reconoció la entidad', async () => {
    await m.servicio.actualizar('a-1', 'EPS', { estado: 'PAGADA', fechaRadicacion: '2026-04-01', fechaPago: '2026-04-20', valorReconocido: '210000' }, GERENTE);
    const data = m.tablas.recobroAusentismo.update.mock.calls[0][0].data;
    expect(data.valorReconocido.toString()).toBe('210000');
    expect(data.fechaPago).toEqual(new Date(2026, 3, 20));
  });

  it('un rechazo exige el motivo; un pendiente no conserva fechas ni valor', async () => {
    await expect(m.servicio.actualizar('a-1', 'EPS', { estado: 'RECHAZADA', fechaRadicacion: '2026-04-01' }, GERENTE)).rejects.toThrow(/motivo del rechazo/);
    await m.servicio.actualizar('a-1', 'EPS', { estado: 'PENDIENTE', valorReconocido: '5000' }, GERENTE);
    expect(m.tablas.recobroAusentismo.update.mock.calls[0][0].data).toMatchObject({ estado: 'PENDIENTE', valorReconocido: null, fechaRadicacion: null, fechaPago: null });
  });

  it('rechaza lo que el estado no admite y las fechas que no existen', async () => {
    await expect(m.servicio.actualizar('a-1', 'EPS', { estado: 'RADICADA' }, GERENTE)).rejects.toThrow(/se radicó/);
    await expect(m.servicio.actualizar('a-1', 'EPS', { estado: 'PAGADA', fechaRadicacion: '2026-04-10', fechaPago: '2026-04-01', valorReconocido: '1' }, GERENTE)).rejects.toThrow(/anterior a la de radicación/);
    await expect(m.servicio.actualizar('a-1', 'EPS', { estado: 'RADICADA', fechaRadicacion: '2026-02-30' }, GERENTE)).rejects.toThrow(/no es una fecha válida/);
    expect(m.tablas.recobroAusentismo.update).not.toHaveBeenCalled();
  });

  it('crea el seguimiento si la liquidación le asigna días a la entidad y todavía no lo tenía', async () => {
    m.tablas.ausentismo.findUnique.mockResolvedValue({ ...AUSENTISMO, recobros: [], periodos: [{ ...PERIODOS[0], diasArl: 2, valorArl: d(116_727) }] });
    const respuesta = await m.servicio.actualizar('a-1', 'ARL', { estado: 'RADICADA', fechaRadicacion: '2026-04-01' }, GERENTE);
    expect(m.tablas.recobroAusentismo.create).toHaveBeenCalledOnce();
    expect(m.tablas.recobroAusentismo.create.mock.calls[0][0].data).toMatchObject({ ausentismoId: 'a-1', entidad: 'ARL', estado: 'RADICADA' });
    expect(respuesta).toMatchObject({ valorEsperado: '116727' });
  });

  it('no hay nada que cobrarle a una entidad que no paga ningún día', async () => {
    m.tablas.ausentismo.findUnique.mockResolvedValue({ ...AUSENTISMO, recobros: [] });
    await expect(m.servicio.actualizar('a-1', 'AFP', { estado: 'RADICADA', fechaRadicacion: '2026-04-01' }, GERENTE)).rejects.toThrow(/no tiene días a cargo del fondo de pensiones/);
    expect(m.tablas.recobroAusentismo.create).not.toHaveBeenCalled();
  });

  it('un ausentismo anulado o que no existe no tiene recobro', async () => {
    m.tablas.ausentismo.findUnique.mockResolvedValue({ ...AUSENTISMO, anulada: true });
    await expect(m.servicio.actualizar('a-1', 'EPS', { estado: 'RADICADA', fechaRadicacion: '2026-04-01' }, GERENTE)).rejects.toThrow(BadRequestException);
    m.tablas.ausentismo.findUnique.mockResolvedValue(null);
    await expect(m.servicio.actualizar('nada', 'EPS', { estado: 'RADICADA', fechaRadicacion: '2026-04-01' }, GERENTE)).rejects.toThrow(NotFoundException);
  });
});
