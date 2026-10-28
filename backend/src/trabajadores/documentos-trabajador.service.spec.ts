import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { DocumentosTrabajadorService } from './documentos-trabajador.service.js';

const CONTRATISTA = { ...usuarioDePrueba(), permisos: ['sst.ver', 'sst.gestionar', 'sst.diagnosticos_ver'] };
const ADMINISTRADOR = { ...usuarioDePrueba(), permisos: ['nomina.ver', 'nomina.gestionar', 'sst.ver', 'sst.gestionar'] };

const PDF = Buffer.from('%PDF-1.4\ncontenido de prueba');
const archivo = (buffer: Buffer, nombre = 'certificado.pdf') => ({ buffer, originalname: nombre }) as Express.Multer.File;

function montar() {
  const tablas = {
    trabajador: { findUnique: vi.fn().mockResolvedValue({ id: 't-1', nombre: 'Persona Inventada' }) },
    documentoTrabajador: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), create: vi.fn() },
    registroAuditoria: { create: vi.fn() },
  };
  tablas.documentoTrabajador.create.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'd-1', ...data }));
  const prisma = { ...tablas, $transaction: vi.fn((accion: (tx: typeof tablas) => unknown) => accion(tablas)) };
  const storage = { guardar: vi.fn().mockResolvedValue({ rutaRelativa: 'trabajadores/t-1/documento.pdf' }), leer: vi.fn().mockResolvedValue(PDF) };
  return { tablas, storage, servicio: new DocumentosTrabajadorService(prisma as unknown as PrismaService, storage as unknown as StorageService) };
}

describe('DocumentosTrabajadorService (RF-PER-06, RNF-SEG-05)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('el contratista sube un certificado de afiliación: se guarda con nombre del servidor y queda auditado', async () => {
    await m.servicio.subir('t-1', archivo(PDF, '../../etc/certificado eps.pdf'), 'CERTIFICADO_AFILIACION', ' Vigente 2026 ', CONTRATISTA);

    expect(m.storage.guardar).toHaveBeenCalledWith('trabajadores/t-1', 'documento.pdf', PDF);
    const datos = m.tablas.documentoTrabajador.create.mock.calls[0][0].data;
    expect(datos).toMatchObject({ trabajadorId: 't-1', tipo: 'CERTIFICADO_AFILIACION', nombreOriginal: 'certificado eps.pdf', tipoMime: 'application/pdf', descripcion: 'Vigente 2026', subidoPorId: 'usuario-prueba' });
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'TRABAJADOR_DOCUMENTO_SUBIR')).toMatchObject({ entidad: 'TRABAJADOR', entidadId: 't-1' });
  });

  it('el contratista no puede adjuntar un contrato: nada se guarda ni se audita', async () => {
    await expect(m.servicio.subir('t-1', archivo(PDF), 'CONTRATO', undefined, CONTRATISTA)).rejects.toBeInstanceOf(ForbiddenException);
    expect(m.storage.guardar).not.toHaveBeenCalled();
    expect(auditoriasDe(m.tablas.registroAuditoria.create)).toHaveLength(0);
  });

  it('el administrador sí adjunta el contrato', async () => {
    await m.servicio.subir('t-1', archivo(PDF, 'contrato.pdf'), 'CONTRATO', undefined, ADMINISTRADOR);
    expect(m.tablas.documentoTrabajador.create).toHaveBeenCalledTimes(1);
  });

  it('solo se aceptan PDF, PNG y JPG según los primeros bytes, no según la extensión', async () => {
    await expect(m.servicio.subir('t-1', archivo(Buffer.from('<script>alert(1)</script>'), 'certificado.pdf'), 'CERTIFICADO_AFILIACION', undefined, CONTRATISTA)).rejects.toBeInstanceOf(BadRequestException);
    expect(m.storage.guardar).not.toHaveBeenCalled();
  });

  it('pide el archivo y limita la descripción', async () => {
    await expect(m.servicio.subir('t-1', undefined, 'CERTIFICADO_AFILIACION', undefined, CONTRATISTA)).rejects.toBeInstanceOf(BadRequestException);
    await expect(m.servicio.subir('t-1', archivo(PDF), 'CERTIFICADO_AFILIACION', 'x'.repeat(301), CONTRATISTA)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('un trabajador que no existe da 404', async () => {
    m.tablas.trabajador.findUnique.mockResolvedValue(null);
    await expect(m.servicio.subir('x', archivo(PDF), 'CERTIFICADO_AFILIACION', undefined, CONTRATISTA)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('el contratista solo lista los tipos de SST; quien ve la nómina, todos', async () => {
    await m.servicio.listar('t-1', CONTRATISTA);
    expect(m.tablas.documentoTrabajador.findMany.mock.calls[0][0].where.tipo.in.sort()).toEqual(['AUTORIZACION_DATOS', 'CERTIFICADO_AFILIACION']);
    await m.servicio.listar('t-1', ADMINISTRADOR);
    expect(m.tablas.documentoTrabajador.findMany.mock.calls[1][0].where.tipo.in).toHaveLength(4);
  });

  it('descargar un contrato siendo contratista se responde como "no existe"', async () => {
    m.tablas.documentoTrabajador.findFirst.mockResolvedValue(null);
    await expect(m.servicio.leer('t-1', 'd-contrato', CONTRATISTA)).rejects.toBeInstanceOf(NotFoundException);
    const filtro = m.tablas.documentoTrabajador.findFirst.mock.calls[0][0].where;
    expect(filtro).toMatchObject({ id: 'd-contrato', trabajadorId: 't-1' });
    expect(filtro.tipo.in).not.toContain('CONTRATO');
    expect(m.storage.leer).not.toHaveBeenCalled();
  });

  it('descargar entrega el archivo con su tipo y su nombre original', async () => {
    m.tablas.documentoTrabajador.findFirst.mockResolvedValue({ ruta: 'trabajadores/t-1/documento.pdf', tipoMime: 'application/pdf', nombreOriginal: 'certificado.pdf' });
    expect(await m.servicio.leer('t-1', 'd-1', CONTRATISTA)).toEqual({ buffer: PDF, contentType: 'application/pdf', nombre: 'certificado.pdf' });
  });
});
