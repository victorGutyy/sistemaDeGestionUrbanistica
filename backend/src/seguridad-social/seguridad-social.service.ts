import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { registrarAuditoria, soloCampos } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { Prisma } from '../generated/prisma/client.js';
import { TipoEntidadSS } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { errorEnTramos } from './calculos.js';
import {
  ActualizarClaseRiesgoArlDto,
  ActualizarEntidadSSDto,
  ActualizarParametroLegalDto,
  CrearEntidadSSDto,
  CrearParametroLegalDto,
} from './dto/seguridad-social.dto.js';

// Valores legales que, si cambian, hacen perder la validación del asesor laboral (las notas no).
const CAMPOS_LEGALES = [
  'smmlv',
  'auxilioTransporte',
  'topeAuxilioSmmlv',
  'porcentajeIncapacidadTramo1',
  'porcentajeIncapacidadTramo2',
  'porcentajeIncapacidadLaboral',
  'diasEmpleador',
  'diasTramo1Hasta',
  'diasTramo2Hasta',
  'diasBaseMes',
] as const;
const CAMPOS_PARAMETRO = ['anio', ...CAMPOS_LEGALES, 'notas', 'validadoEn', 'validadoPorId'] as const;

const ETIQUETA_TIPO: Record<TipoEntidadSS, string> = {
  EPS: 'EPS',
  AFP: 'fondo de pensión',
  CESANTIAS: 'fondo de cesantías',
  ARL: 'ARL',
  CAJA: 'caja de compensación',
};

// Administra los valores legales por año y los catálogos de seguridad social (RF-CFG-13 y RF-CFG-14). Nada se borra:
// los parámetros se corrigen y las entidades se desactivan (la base de datos lo impide).
@Injectable()
export class SeguridadSocialService {
  constructor(private readonly prisma: PrismaService) {}

  async listarCatalogos() {
    const [parametrosLegales, entidades, clasesRiesgo] = await Promise.all([
      this.prisma.parametroLegal.findMany({ orderBy: { anio: 'desc' }, include: { validadoPor: { select: { nombre: true } } } }),
      this.prisma.entidadSS.findMany({ orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }] }),
      this.prisma.claseRiesgoArl.findMany({ orderBy: { clase: 'asc' } }),
    ]);
    return { parametrosLegales, entidades, clasesRiesgo };
  }

  // El parámetro del año de una fecha. Si no existe NO se usa el de otro año: una liquidación con valores de otro año
  // sería un error silencioso.
  async parametroDelAnio(anio: number) {
    const parametro = await this.prisma.parametroLegal.findUnique({ where: { anio } });
    if (!parametro) {
      throw new NotFoundException(`No hay parámetros legales del año ${anio}: créalos en Configuración → Seguridad social`);
    }
    return parametro;
  }

  // ---------- Parámetros legales por año ----------

  async crearParametro(dto: CrearParametroLegalDto, usuario: UsuarioAutenticado) {
    const existente = await this.prisma.parametroLegal.findUnique({ where: { anio: dto.anio } });
    if (existente) {
      throw new ConflictException(`Ya existen los parámetros legales del año ${dto.anio}: edítalos en vez de crearlos de nuevo`);
    }
    const datos = {
      anio: dto.anio,
      smmlv: new Prisma.Decimal(dto.smmlv),
      auxilioTransporte: new Prisma.Decimal(dto.auxilioTransporte),
      topeAuxilioSmmlv: new Prisma.Decimal(dto.topeAuxilioSmmlv ?? 2),
      porcentajeIncapacidadTramo1: new Prisma.Decimal(dto.porcentajeIncapacidadTramo1),
      porcentajeIncapacidadTramo2: new Prisma.Decimal(dto.porcentajeIncapacidadTramo2),
      porcentajeIncapacidadLaboral: new Prisma.Decimal(dto.porcentajeIncapacidadLaboral),
      diasEmpleador: dto.diasEmpleador,
      diasTramo1Hasta: dto.diasTramo1Hasta,
      diasTramo2Hasta: dto.diasTramo2Hasta,
      diasBaseMes: dto.diasBaseMes ?? 30,
      notas: dto.notas?.trim() || null,
    };
    this.exigirTramosEnOrden(datos);
    if (datos.smmlv.lessThanOrEqualTo(0)) {
      throw new BadRequestException('El salario mínimo debe ser mayor que cero');
    }

    return this.prisma.$transaction(async (tx) => {
      const creado = await tx.parametroLegal.create({ data: datos });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'PARAMETRO_LEGAL_CREAR',
        entidad: 'PARAMETRO_LEGAL',
        entidadId: creado.id,
        resumen: `Creó los parámetros legales de ${creado.anio} (pendientes de validar)`,
        despues: soloCampos(creado, CAMPOS_PARAMETRO),
      });
      return creado;
    });
  }

  async actualizarParametro(id: string, dto: ActualizarParametroLegalDto, usuario: UsuarioAutenticado) {
    const actual = await this.buscarParametro(id);
    const datos = {
      smmlv: dto.smmlv === undefined ? actual.smmlv : new Prisma.Decimal(dto.smmlv),
      auxilioTransporte: dto.auxilioTransporte === undefined ? actual.auxilioTransporte : new Prisma.Decimal(dto.auxilioTransporte),
      topeAuxilioSmmlv: dto.topeAuxilioSmmlv === undefined ? actual.topeAuxilioSmmlv : new Prisma.Decimal(dto.topeAuxilioSmmlv),
      porcentajeIncapacidadTramo1: dto.porcentajeIncapacidadTramo1 === undefined ? actual.porcentajeIncapacidadTramo1 : new Prisma.Decimal(dto.porcentajeIncapacidadTramo1),
      porcentajeIncapacidadTramo2: dto.porcentajeIncapacidadTramo2 === undefined ? actual.porcentajeIncapacidadTramo2 : new Prisma.Decimal(dto.porcentajeIncapacidadTramo2),
      porcentajeIncapacidadLaboral: dto.porcentajeIncapacidadLaboral === undefined ? actual.porcentajeIncapacidadLaboral : new Prisma.Decimal(dto.porcentajeIncapacidadLaboral),
      diasEmpleador: dto.diasEmpleador ?? actual.diasEmpleador,
      diasTramo1Hasta: dto.diasTramo1Hasta ?? actual.diasTramo1Hasta,
      diasTramo2Hasta: dto.diasTramo2Hasta ?? actual.diasTramo2Hasta,
      diasBaseMes: dto.diasBaseMes ?? actual.diasBaseMes,
    };
    this.exigirTramosEnOrden(datos);
    if (datos.smmlv.lessThanOrEqualTo(0)) {
      throw new BadRequestException('El salario mínimo debe ser mayor que cero');
    }

    const cambioLegal = CAMPOS_LEGALES.some((campo) => !new Prisma.Decimal(datos[campo]).equals(actual[campo]));
    const notas = dto.notas === undefined ? actual.notas : dto.notas.trim() || null;
    // Cambiar un valor legal invalida lo que el asesor revisó: hay que validarlo de nuevo.
    const pierdeValidacion = cambioLegal && actual.validadoEn !== null;

    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.parametroLegal.update({
        where: { id },
        data: { ...datos, notas, ...(pierdeValidacion ? { validadoEn: null, validadoPorId: null } : {}) },
      });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'PARAMETRO_LEGAL_EDITAR',
        entidad: 'PARAMETRO_LEGAL',
        entidadId: id,
        resumen: `Cambió los parámetros legales de ${actual.anio}${pierdeValidacion ? ' (perdieron la validación)' : ''}`,
        antes: soloCampos(actual, CAMPOS_PARAMETRO),
        despues: soloCampos(actualizado, CAMPOS_PARAMETRO),
      });
      return actualizado;
    });
  }

  // Deja constancia de que el asesor laboral revisó los valores de ese año (RF-CFG-13). El sistema no certifica nada:
  // solo registra quién dijo que está validado, y cuándo.
  async validarParametro(id: string, usuario: UsuarioAutenticado) {
    const actual = await this.buscarParametro(id);
    if (actual.validadoEn) {
      throw new ConflictException(`Los parámetros de ${actual.anio} ya están validados`);
    }
    return this.prisma.$transaction(async (tx) => {
      const validado = await tx.parametroLegal.update({ where: { id }, data: { validadoEn: new Date(), validadoPorId: usuario.id } });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'PARAMETRO_LEGAL_VALIDAR',
        entidad: 'PARAMETRO_LEGAL',
        entidadId: id,
        resumen: `Marcó como validados los parámetros legales de ${actual.anio}`,
        antes: soloCampos(actual, ['validadoEn', 'validadoPorId']),
        despues: soloCampos(validado, ['validadoEn', 'validadoPorId']),
      });
      return validado;
    });
  }

  private async buscarParametro(id: string) {
    const parametro = await this.prisma.parametroLegal.findUnique({ where: { id } });
    if (!parametro) {
      throw new NotFoundException(`No existen los parámetros legales ${id}`);
    }
    return parametro;
  }

  private exigirTramosEnOrden(datos: { diasEmpleador: number; diasTramo1Hasta: number; diasTramo2Hasta: number }) {
    const error = errorEnTramos(datos);
    if (error) throw new BadRequestException(error);
  }

  // ---------- Entidades (EPS, AFP, cesantías, ARL, cajas) ----------

  async crearEntidad(dto: CrearEntidadSSDto, usuario: UsuarioAutenticado) {
    const nombre = dto.nombre.trim();
    await this.exigirNombreLibre(dto.tipo, nombre);
    return this.prisma.$transaction(async (tx) => {
      const entidad = await tx.entidadSS.create({ data: { tipo: dto.tipo, nombre } });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'ENTIDAD_SS_CREAR',
        entidad: 'ENTIDAD_SS',
        entidadId: entidad.id,
        resumen: `Creó ${ETIQUETA_TIPO[entidad.tipo]} "${entidad.nombre}"`,
        despues: soloCampos(entidad, ['tipo', 'nombre', 'activa']),
      });
      return entidad;
    });
  }

  async actualizarEntidad(id: string, dto: ActualizarEntidadSSDto, usuario: UsuarioAutenticado) {
    const entidad = await this.prisma.entidadSS.findUnique({ where: { id } });
    if (!entidad) {
      throw new NotFoundException(`No existe la entidad ${id}`);
    }
    const nombre = dto.nombre?.trim();
    if (nombre !== undefined && nombre !== entidad.nombre) {
      await this.exigirNombreLibre(entidad.tipo, nombre, id);
    }
    return this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.entidadSS.update({ where: { id }, data: { nombre, activa: dto.activa } });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'ENTIDAD_SS_EDITAR',
        entidad: 'ENTIDAD_SS',
        entidadId: id,
        resumen: `Cambió ${ETIQUETA_TIPO[entidad.tipo]} "${entidad.nombre}"${dto.activa === undefined || dto.activa === entidad.activa ? '' : actualizada.activa ? ': la activó' : ': la desactivó'}`,
        antes: soloCampos(entidad, ['tipo', 'nombre', 'activa']),
        despues: soloCampos(actualizada, ['tipo', 'nombre', 'activa']),
      });
      return actualizada;
    });
  }

  private async exigirNombreLibre(tipo: TipoEntidadSS, nombre: string, ignorarId?: string) {
    const existente = await this.prisma.entidadSS.findFirst({ where: { tipo, nombre: { equals: nombre, mode: 'insensitive' } } });
    if (existente && existente.id !== ignorarId) {
      throw new ConflictException(`Ya existe ${ETIQUETA_TIPO[tipo]} "${existente.nombre}"`);
    }
  }

  // ---------- Clases de riesgo de la ARL ----------

  async actualizarClaseRiesgo(id: string, dto: ActualizarClaseRiesgoArlDto, usuario: UsuarioAutenticado) {
    if (dto.tasa === undefined && dto.activa === undefined) {
      throw new BadRequestException('Indica qué cambiar: la tasa o si la clase está activa');
    }
    const clase = await this.prisma.claseRiesgoArl.findUnique({ where: { id } });
    if (!clase) {
      throw new NotFoundException(`No existe la clase de riesgo ${id}`);
    }
    return this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.claseRiesgoArl.update({
        where: { id },
        data: { tasa: dto.tasa === undefined ? undefined : new Prisma.Decimal(dto.tasa), activa: dto.activa },
      });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'CLASE_RIESGO_ARL_EDITAR',
        entidad: 'CLASE_RIESGO_ARL',
        entidadId: id,
        resumen: `Cambió la clase de riesgo ${clase.clase} de la ARL`,
        antes: soloCampos(clase, ['clase', 'tasa', 'activa']),
        despues: soloCampos(actualizada, ['clase', 'tasa', 'activa']),
      });
      return actualizada;
    });
  }
}
