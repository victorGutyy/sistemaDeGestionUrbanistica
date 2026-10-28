import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { basename } from 'node:path';
import { registrarAuditoria } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { CONTENT_TYPE_DOCUMENTO, detectarTipoDocumento } from '../common/tipo-archivo.js';
import { TipoDocumentoTrabajador } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { puedeSubirTipoDocumento, tiposDocumentoVisibles } from './documentos-visibles.js';

const ETIQUETA_TIPO: Record<TipoDocumentoTrabajador, string> = {
  CERTIFICADO_AFILIACION: 'certificado de afiliación',
  AUTORIZACION_DATOS: 'autorización de datos',
  CONTRATO: 'contrato',
  OTRO: 'documento',
};

// Documentos adjuntos del trabajador (RF-PER-06): certificados de afiliación, autorización de datos, contrato. Se
// conservan siempre (la base de datos impide borrarlos) y solo se descargan con sesión y permiso (RNF-SEG-05).
@Injectable()
export class DocumentosTrabajadorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async listar(trabajadorId: string, usuario: UsuarioAutenticado) {
    await this.exigirTrabajador(trabajadorId);
    return this.prisma.documentoTrabajador.findMany({
      where: { trabajadorId, tipo: { in: [...tiposDocumentoVisibles(usuario.permisos)] } },
      orderBy: { createdAt: 'desc' },
      include: { subidoPor: { select: { nombre: true } } },
    });
  }

  async subir(trabajadorId: string, archivo: Express.Multer.File | undefined, tipo: TipoDocumentoTrabajador, descripcion: string | undefined, usuario: UsuarioAutenticado) {
    const trabajador = await this.exigirTrabajador(trabajadorId);
    if (!puedeSubirTipoDocumento(tipo, usuario.permisos)) {
      throw new ForbiddenException(`Tu rol no puede adjuntar un ${ETIQUETA_TIPO[tipo]}`);
    }
    if (!archivo) {
      throw new BadRequestException('Adjunta un archivo');
    }
    if (descripcion && descripcion.length > 300) {
      throw new BadRequestException('La descripción es demasiado larga (máximo 300 caracteres)');
    }
    const tipoArchivo = detectarTipoDocumento(archivo.buffer);
    if (!tipoArchivo) {
      throw new BadRequestException(`El archivo "${archivo.originalname}" no es un PDF ni una imagen PNG o JPG`);
    }

    // Primero se guarda el archivo; el registro y su auditoría se crean juntos (todo o nada). El nombre en disco lo
    // fija el servidor según el tipo real; el original solo se muestra.
    const { rutaRelativa } = await this.storage.guardar(`trabajadores/${trabajadorId}`, `documento.${tipoArchivo}`, archivo.buffer);
    return this.prisma.$transaction(async (tx) => {
      const documento = await tx.documentoTrabajador.create({
        data: {
          trabajadorId,
          tipo,
          nombreOriginal: basename(archivo.originalname).slice(0, 200),
          ruta: rutaRelativa,
          tipoMime: CONTENT_TYPE_DOCUMENTO[tipoArchivo],
          tamano: archivo.buffer.length,
          descripcion: descripcion?.trim() || null,
          subidoPorId: usuario.id,
        },
        include: { subidoPor: { select: { nombre: true } } },
      });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'TRABAJADOR_DOCUMENTO_SUBIR',
        entidad: 'TRABAJADOR',
        entidadId: trabajadorId,
        resumen: `Adjuntó un ${ETIQUETA_TIPO[tipo]} a ${trabajador.nombre}`,
        despues: { documentoId: documento.id, tipo, nombre: documento.nombreOriginal, tipoMime: documento.tipoMime, tamano: documento.tamano, descripcion: documento.descripcion },
      });
      return documento;
    });
  }

  // Un documento que el usuario no puede ver se responde igual que uno que no existe.
  async leer(trabajadorId: string, documentoId: string, usuario: UsuarioAutenticado) {
    const documento = await this.prisma.documentoTrabajador.findFirst({
      where: { id: documentoId, trabajadorId, tipo: { in: [...tiposDocumentoVisibles(usuario.permisos)] } },
    });
    if (!documento) {
      throw new NotFoundException(`No existe el documento ${documentoId}`);
    }
    const buffer = await this.storage.leer(documento.ruta);
    return { buffer, contentType: documento.tipoMime, nombre: documento.nombreOriginal };
  }

  private async exigirTrabajador(id: string) {
    const trabajador = await this.prisma.trabajador.findUnique({ where: { id }, select: { id: true, nombre: true } });
    if (!trabajador) {
      throw new NotFoundException(`No existe el trabajador ${id}`);
    }
    return trabajador;
  }
}
