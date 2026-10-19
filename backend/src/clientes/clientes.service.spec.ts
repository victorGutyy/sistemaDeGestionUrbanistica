import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { ClientesService } from './clientes.service.js';

function crearPrismaFalso() {
  const tablas = {
    cliente: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    registroAuditoria: { create: vi.fn() },
  };
  // El cliente se crea y se edita en una transacción junto con su registro de auditoría.
  return { ...tablas, $transaction: vi.fn((accion: (tx: typeof tablas) => unknown) => accion(tablas)) };
}

const CONFIGURACION = {
  obtenerEmpresa: vi.fn().mockResolvedValue({ tasaMoraMensual: null, diasGraciaMora: 0, diasSemaforoAmarillo: 5, logoRuta: null }),
} as unknown as ConfiguracionService;
const ALMACENAMIENTO = { leer: vi.fn() } as unknown as StorageService;

const servicio = (prisma: ReturnType<typeof crearPrismaFalso>) => new ClientesService(prisma as unknown as PrismaService, CONFIGURACION, ALMACENAMIENTO);

const DTO = { nombre: 'Ana Pérez', documento: '1000000001', telefono: '3000000000' };
const CLIENTE = {
  id: 'c-1',
  nombre: 'Ana Pérez',
  documento: '1000000001',
  tipoDocumento: 'CC',
  telefono: '3000000000',
  email: null,
  direccion: null,
  autorizaDatos: false,
  fechaAutorizacion: null,
  autorizacionRegistradaPorId: null,
};

describe('ClientesService.crear', () => {
  it('crea el cliente y deja en la auditoría quién lo creó y con qué datos (RF-AUD-01)', async () => {
    const prisma = crearPrismaFalso();
    prisma.cliente.findUnique.mockResolvedValue(null);
    prisma.cliente.create.mockResolvedValue({ ...CLIENTE });
    const usuario = usuarioDePrueba();

    await servicio(prisma).crear(DTO, usuario);

    expect(auditoriaDe(prisma.registroAuditoria.create, 'CLIENTE_CREAR')).toMatchObject({
      entidad: 'CLIENTE',
      entidadId: 'c-1',
      usuarioId: usuario.id,
      despues: { nombre: 'Ana Pérez', documento: '1000000001', tipoDocumento: 'CC' },
    });
  });

  it('un documento repetido se rechaza sin dejar nada en la auditoría', async () => {
    const prisma = crearPrismaFalso();
    prisma.cliente.findUnique.mockResolvedValue({ id: 'existente' });

    await expect(servicio(prisma).crear(DTO, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
    expect(auditoriasDe(prisma.registroAuditoria.create)).toEqual([]);
  });

  it('con autorización de datos guarda la fecha y quién la registró (RF-CLI-04)', async () => {
    const prisma = crearPrismaFalso();
    prisma.cliente.findUnique.mockResolvedValue(null);
    prisma.cliente.create.mockResolvedValue({ ...CLIENTE, tipoDocumento: 'NIT', autorizaDatos: true });
    const usuario = usuarioDePrueba();

    await servicio(prisma).crear({ ...DTO, tipoDocumento: 'NIT', autorizaDatos: true }, usuario);

    const datos = prisma.cliente.create.mock.calls[0][0].data;
    expect(datos).toMatchObject({ tipoDocumento: 'NIT', autorizaDatos: true, autorizacionRegistradaPorId: usuario.id });
    expect(datos.fechaAutorizacion).toBeInstanceOf(Date);
  });
});

describe('ClientesService.listar', () => {
  it('busca por nombre, documento o teléfono sin importar mayúsculas, dentro del alcance', async () => {
    const prisma = crearPrismaFalso();
    prisma.cliente.findMany.mockResolvedValue([]);

    await servicio(prisma).listar(usuarioDePrueba(['p-1']), '  ana ');

    const { where } = prisma.cliente.findMany.mock.calls[0][0];
    expect(where.AND[0]).toEqual({ ventas: { some: { lote: { proyectoId: { in: ['p-1'] } } } } });
    expect(where.AND[1].OR).toEqual([
      { nombre: { contains: 'ana', mode: 'insensitive' } },
      { documento: { contains: 'ana', mode: 'insensitive' } },
      { telefono: { contains: 'ana', mode: 'insensitive' } },
    ]);
  });

  it('sin texto de búsqueda no filtra por texto', async () => {
    const prisma = crearPrismaFalso();
    prisma.cliente.findMany.mockResolvedValue([]);
    await servicio(prisma).listar(usuarioDePrueba(), undefined);
    expect(prisma.cliente.findMany.mock.calls[0][0].where.AND[1]).toEqual({});
  });
});

describe('ClientesService.actualizar', () => {
  it('cambia los datos y deja en la auditoría solo lo que cambió, con su valor anterior', async () => {
    const prisma = crearPrismaFalso();
    prisma.cliente.findFirst.mockResolvedValue({ ...CLIENTE });
    prisma.cliente.update.mockResolvedValue({ ...CLIENTE, tipoDocumento: 'NIT', telefono: '3111111111' });
    const usuario = usuarioDePrueba();

    await servicio(prisma).actualizar('c-1', { tipoDocumento: 'NIT', telefono: '3111111111', nombre: 'Ana Pérez' }, usuario);

    expect(prisma.cliente.update.mock.calls[0][0].data).toEqual({ tipoDocumento: 'NIT', telefono: '3111111111' });
    expect(auditoriaDe(prisma.registroAuditoria.create, 'CLIENTE_EDITAR')).toMatchObject({
      entidadId: 'c-1',
      usuarioId: usuario.id,
      antes: { tipoDocumento: 'CC', telefono: '3000000000' },
      despues: { tipoDocumento: 'NIT', telefono: '3111111111' },
    });
  });

  it('un texto vacío borra el teléfono, el correo o la dirección', async () => {
    const prisma = crearPrismaFalso();
    prisma.cliente.findFirst.mockResolvedValue({ ...CLIENTE, email: 'ana@ejemplo.test' });
    prisma.cliente.update.mockResolvedValue({ ...CLIENTE, telefono: null, email: null });

    await servicio(prisma).actualizar('c-1', { telefono: '', email: '' }, usuarioDePrueba());

    expect(prisma.cliente.update.mock.calls[0][0].data).toEqual({ telefono: null, email: null });
  });

  it('registrar la autorización guarda fecha y usuario; retirarla los borra, y ambos cambios se auditan', async () => {
    const usuario = usuarioDePrueba();

    const darla = crearPrismaFalso();
    darla.cliente.findFirst.mockResolvedValue({ ...CLIENTE });
    darla.cliente.update.mockResolvedValue({ ...CLIENTE, autorizaDatos: true, fechaAutorizacion: new Date() });
    await servicio(darla).actualizar('c-1', { autorizaDatos: true }, usuario);
    const dada = darla.cliente.update.mock.calls[0][0].data;
    expect(dada).toMatchObject({ autorizaDatos: true, autorizacionRegistradaPorId: usuario.id });
    expect(dada.fechaAutorizacion).toBeInstanceOf(Date);
    expect(auditoriaDe(darla.registroAuditoria.create, 'CLIENTE_EDITAR').resumen).toMatch(/autorización de datos/);

    const retirarla = crearPrismaFalso();
    retirarla.cliente.findFirst.mockResolvedValue({ ...CLIENTE, autorizaDatos: true, fechaAutorizacion: new Date(), autorizacionRegistradaPorId: 'otro' });
    retirarla.cliente.update.mockResolvedValue({ ...CLIENTE });
    await servicio(retirarla).actualizar('c-1', { autorizaDatos: false }, usuario);
    expect(retirarla.cliente.update.mock.calls[0][0].data).toEqual({ autorizaDatos: false, fechaAutorizacion: null, autorizacionRegistradaPorId: null });
    expect(auditoriaDe(retirarla.registroAuditoria.create, 'CLIENTE_EDITAR').antes).toMatchObject({ autorizaDatos: true });
  });

  it('si no cambia nada no escribe ni audita', async () => {
    const prisma = crearPrismaFalso();
    prisma.cliente.findFirst.mockResolvedValue({ ...CLIENTE });

    await servicio(prisma).actualizar('c-1', { nombre: 'Ana Pérez', telefono: '3000000000', autorizaDatos: false }, usuarioDePrueba());

    expect(prisma.cliente.update).not.toHaveBeenCalled();
    expect(auditoriasDe(prisma.registroAuditoria.create)).toEqual([]);
  });

  it('un cliente fuera del alcance responde 404 y no se edita', async () => {
    const prisma = crearPrismaFalso();
    prisma.cliente.findFirst.mockResolvedValue(null);

    await expect(servicio(prisma).actualizar('c-x', { nombre: 'Otro Nombre' }, usuarioDePrueba(['p-1']))).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.cliente.update).not.toHaveBeenCalled();
  });
});
