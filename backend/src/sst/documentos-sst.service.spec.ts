import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { DocumentosSstService } from './documentos-sst.service.js';

const PDF = Buffer.from('%PDF-1.4\ncontenido de prueba');
const archivo = (buffer: Buffer, nombre = 'acta.pdf') => ({ buffer, originalname: nombre }) as Express.Multer.File;

function montar() {
  const tablas = {
    entregaEpp: { findUnique: vi.fn().mockResolvedValue({ id: 'en-1', anulada: false }) },
    actividadPlan: { findUnique: vi.fn().mockResolvedValue({ id: 'ac-1' }) },
    capacitacion: { findUnique: vi.fn().mockResolvedValue({ id: 'ca-1' }) },
    documentoSst: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), create: vi.fn() },
    registroAuditoria: { create: vi.fn() },
  };
  tablas.documentoSst.create.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'd-1', ...data }));
  const prisma = { ...tablas, $transaction: vi.fn((accion: (tx: typeof tablas) => unknown) => accion(tablas)) };
  const storage = { guardar: vi.fn().mockResolvedValue({ rutaRelativa: 'sst/entregaEpp/en-1/documento.pdf' }), leer: vi.fn().mockResolvedValue(PDF) };
  return { tablas, storage, servicio: new DocumentosSstService(prisma as unknown as PrismaService, storage as unknown as StorageService) };
}

describe('DocumentosSstService (RF-SST-21, RNF-SEG-05)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('adjunta el acta de una entrega: nombre del servidor, tipo real y auditoría con la entidad de la entrega', async () => {
    await m.servicio.subir({ tipo: 'entregaEpp', id: 'en-1' }, archivo(PDF, '../../acta firmada.pdf'), ' Firmada por el trabajador ', usuarioDePrueba());

    expect(m.storage.guardar).toHaveBeenCalledWith('sst/entregaEpp/en-1', 'documento.pdf', PDF);
    expect(m.tablas.documentoSst.create.mock.calls[0][0].data).toMatchObject({
      entregaEppId: 'en-1',
      nombreOriginal: 'acta firmada.pdf',
      tipoMime: 'application/pdf',
      descripcion: 'Firmada por el trabajador',
      subidoPorId: 'usuario-prueba',
    });
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'SST_DOCUMENTO_SUBIR')).toMatchObject({ entidad: 'ENTREGA_EPP', entidadId: 'en-1' });
  });

  it('el mismo mecanismo sirve para una actividad del plan y para una capacitación, cada una con su columna y su entidad', async () => {
    await m.servicio.subir({ tipo: 'actividadPlan', id: 'ac-1' }, archivo(PDF), undefined, usuarioDePrueba());
    expect(m.tablas.documentoSst.create.mock.calls[0][0].data).toMatchObject({ actividadPlanId: 'ac-1' });
    await m.servicio.subir({ tipo: 'capacitacion', id: 'ca-1' }, archivo(PDF), undefined, usuarioDePrueba());
    expect(m.tablas.documentoSst.create.mock.calls[1][0].data).toMatchObject({ capacitacionId: 'ca-1' });
    expect(auditoriasDe(m.tablas.registroAuditoria.create).map((r) => r.entidad)).toEqual(['ACTIVIDAD_SST', 'CAPACITACION']);
  });

  it('una entrega anulada ya no admite documentos nuevos', async () => {
    m.tablas.entregaEpp.findUnique.mockResolvedValue({ id: 'en-1', anulada: true });
    await expect(m.servicio.subir({ tipo: 'entregaEpp', id: 'en-1' }, archivo(PDF), undefined, usuarioDePrueba())).rejects.toThrow(/anulada/);
    expect(m.storage.guardar).not.toHaveBeenCalled();
  });

  it('pero sí se pueden listar los de una entrega anulada', async () => {
    m.tablas.entregaEpp.findUnique.mockResolvedValue({ id: 'en-1', anulada: true });
    await expect(m.servicio.listar({ tipo: 'entregaEpp', id: 'en-1' })).resolves.toEqual([]);
  });

  it('un registro que no existe da 404 al listar y al adjuntar', async () => {
    m.tablas.actividadPlan.findUnique.mockResolvedValue(null);
    await expect(m.servicio.listar({ tipo: 'actividadPlan', id: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    m.tablas.capacitacion.findUnique.mockResolvedValue(null);
    await expect(m.servicio.subir({ tipo: 'capacitacion', id: 'x' }, archivo(PDF), undefined, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('solo acepta PDF, PNG y JPG según los primeros bytes, y pide el archivo', async () => {
    await expect(m.servicio.subir({ tipo: 'entregaEpp', id: 'en-1' }, archivo(Buffer.from('<script>alert(1)</script>'), 'acta.pdf'), undefined, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
    await expect(m.servicio.subir({ tipo: 'entregaEpp', id: 'en-1' }, undefined, undefined, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
    expect(m.storage.guardar).not.toHaveBeenCalled();
  });

  it('rechaza un archivo de más de 10 MB y una descripción demasiado larga', async () => {
    const grande = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);
    await expect(m.servicio.subir({ tipo: 'entregaEpp', id: 'en-1' }, archivo(grande), undefined, usuarioDePrueba())).rejects.toThrow(/10 MB/);
    await expect(m.servicio.subir({ tipo: 'entregaEpp', id: 'en-1' }, archivo(PDF), 'x'.repeat(301), usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('al descargar, el adjunto debe ser del registro de la ruta: un identificador ajeno no sirve', async () => {
    m.tablas.documentoSst.findFirst.mockResolvedValue(null);
    await expect(m.servicio.leer({ tipo: 'entregaEpp', id: 'en-1' }, 'd-de-otra-entrega')).rejects.toBeInstanceOf(NotFoundException);
    expect(m.tablas.documentoSst.findFirst.mock.calls[0][0].where).toEqual({ id: 'd-de-otra-entrega', entregaEppId: 'en-1' });
    expect(m.storage.leer).not.toHaveBeenCalled();
  });

  it('descargar entrega el archivo con su tipo y su nombre original', async () => {
    m.tablas.documentoSst.findFirst.mockResolvedValue({ ruta: 'sst/entregaEpp/en-1/documento.pdf', tipoMime: 'application/pdf', nombreOriginal: 'acta.pdf' });
    expect(await m.servicio.leer({ tipo: 'entregaEpp', id: 'en-1' }, 'd-1')).toEqual({ buffer: PDF, contentType: 'application/pdf', nombre: 'acta.pdf' });
  });
});
