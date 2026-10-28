import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { basename } from 'node:path';
import { registrarAuditoria, type EntidadAuditoria } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { CONTENT_TYPE_DOCUMENTO, detectarTipoDocumento } from '../common/tipo-archivo.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';

// Los cuatro registros que pueden llevar adjuntos (RF-SST-21).
export type TipoDuenoSst = 'entregaEpp' | 'actividadPlan' | 'capacitacion' | 'ausentismo';

export interface DuenoSst {
  tipo: TipoDuenoSst;
  id: string;
}

const CONFIGURACION: Record<TipoDuenoSst, { columna: 'entregaEppId' | 'actividadPlanId' | 'capacitacionId' | 'ausentismoId'; entidad: EntidadAuditoria; etiqueta: string }> = {
  entregaEpp: { columna: 'entregaEppId', entidad: 'ENTREGA_EPP', etiqueta: 'el acta de entrega de EPP' },
  actividadPlan: { columna: 'actividadPlanId', entidad: 'ACTIVIDAD_SST', etiqueta: 'la evidencia de una actividad del plan' },
  capacitacion: { columna: 'capacitacionId', entidad: 'CAPACITACION', etiqueta: 'el soporte de una capacitación' },
  ausentismo: { columna: 'ausentismoId', entidad: 'AUSENTISMO', etiqueta: 'el certificado de un ausentismo' },
};

const TAMANO_MAXIMO = 10 * 1024 * 1024;

// Adjuntos de la gestión SST: actas de entrega de EPP, evidencias de actividades y listados de asistencia de
// capacitaciones. Un solo mecanismo para los tres. Se conservan siempre (la base lo impide borrar) y solo se descargan con
// sesión y permiso (RNF-SEG-05): el endpoint que los sirve exige sst.ver y comprueba que el adjunto sea del registro.
@Injectable()
export class DocumentosSstService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async listar(dueno: DuenoSst) {
    await this.exigirDueno(dueno);
    return this.prisma.documentoSst.findMany({
      where: { [CONFIGURACION[dueno.tipo].columna]: dueno.id },
      orderBy: { createdAt: 'desc' },
      include: { subidoPor: { select: { nombre: true } } },
    });
  }

  async subir(dueno: DuenoSst, archivo: Express.Multer.File | undefined, descripcion: string | undefined, usuario: UsuarioAutenticado) {
    const { columna, entidad, etiqueta } = CONFIGURACION[dueno.tipo];
    await this.exigirDueno(dueno, true);
    if (!archivo) {
      throw new BadRequestException('Adjunta un archivo');
    }
    if (archivo.buffer.length > TAMANO_MAXIMO) {
      throw new BadRequestException('El archivo pesa más de 10 MB');
    }
    if (descripcion && descripcion.length > 300) {
      throw new BadRequestException('La descripción es demasiado larga (máximo 300 caracteres)');
    }
    const tipoArchivo = detectarTipoDocumento(archivo.buffer);
    if (!tipoArchivo) {
      throw new BadRequestException(`El archivo "${archivo.originalname}" no es un PDF ni una imagen PNG o JPG`);
    }

    // Primero se guarda el archivo; el registro y su auditoría se crean juntos (todo o nada). El nombre en disco lo fija el
    // servidor según el tipo real; el original solo se muestra.
    const { rutaRelativa } = await this.storage.guardar(`sst/${dueno.tipo}/${dueno.id}`, `documento.${tipoArchivo}`, archivo.buffer);
    return this.prisma.$transaction(async (tx) => {
      const documento = await tx.documentoSst.create({
        data: {
          [columna]: dueno.id,
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
        accion: 'SST_DOCUMENTO_SUBIR',
        entidad,
        entidadId: dueno.id,
        resumen: `Adjuntó ${etiqueta}`,
        despues: { documentoId: documento.id, nombre: documento.nombreOriginal, tipoMime: documento.tipoMime, tamano: documento.tamano, descripcion: documento.descripcion },
      });
      return documento;
    });
  }

  // El adjunto debe ser del registro de la ruta: así un identificador de otro registro no sirve para llegar a él.
  async leer(dueno: DuenoSst, documentoId: string) {
    const documento = await this.prisma.documentoSst.findFirst({ where: { id: documentoId, [CONFIGURACION[dueno.tipo].columna]: dueno.id } });
    if (!documento) {
      throw new NotFoundException(`No existe el documento ${documentoId}`);
    }
    const buffer = await this.storage.leer(documento.ruta);
    return { buffer, contentType: documento.tipoMime, nombre: documento.nombreOriginal };
  }

  // El registro debe existir; si se va a adjuntar algo, una entrega o un ausentismo anulado ya no admite documentos nuevos.
  private async exigirDueno(dueno: DuenoSst, paraEscribir = false) {
    if (dueno.tipo === 'entregaEpp') {
      const entrega = await this.prisma.entregaEpp.findUnique({ where: { id: dueno.id }, select: { id: true, anulada: true } });
      if (!entrega) throw new NotFoundException(`No existe la entrega ${dueno.id}`);
      if (paraEscribir && entrega.anulada) throw new BadRequestException('La entrega está anulada: ya no admite documentos nuevos');
      return;
    }
    if (dueno.tipo === 'ausentismo') {
      const ausentismo = await this.prisma.ausentismo.findUnique({ where: { id: dueno.id }, select: { id: true, anulada: true } });
      if (!ausentismo) throw new NotFoundException(`No existe el ausentismo ${dueno.id}`);
      if (paraEscribir && ausentismo.anulada) throw new BadRequestException('El ausentismo está anulado: ya no admite documentos nuevos');
      return;
    }
    const existe =
      dueno.tipo === 'actividadPlan'
        ? await this.prisma.actividadPlan.findUnique({ where: { id: dueno.id }, select: { id: true } })
        : await this.prisma.capacitacion.findUnique({ where: { id: dueno.id }, select: { id: true } });
    if (!existe) {
      throw new NotFoundException(dueno.tipo === 'actividadPlan' ? `No existe la actividad ${dueno.id}` : `No existe la capacitación ${dueno.id}`);
    }
  }
}
