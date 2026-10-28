import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { registrarAuditoria, soloCampos } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { Prisma } from '../generated/prisma/client.js';
import { ReglaAusentismo } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ActualizarDiagnosticoCie10Dto,
  ActualizarTipoAusentismoDto,
  CrearDiagnosticoCie10Dto,
  CrearTipoAusentismoDto,
  type ListarDiagnosticosCie10QueryDto,
} from './dto/catalogos.dto.js';

const CAMPOS_TIPO = ['codigo', 'nombre', 'regla', 'porcentaje', 'requiereDiagnostico', 'diaEventoComoLaborado', 'activo', 'orden'] as const;
const CAMPOS_DIAGNOSTICO = ['codigo', 'descripcion', 'activo'] as const;

// Las reglas que llevan porcentaje propio del tipo. Las demás usan los porcentajes del parámetro legal del año.
export const REGLAS_CON_PORCENTAJE: readonly ReglaAusentismo[] = [ReglaAusentismo.PAGA_EPS, ReglaAusentismo.PAGA_EMPLEADOR, ReglaAusentismo.DESCUENTO];
const REGLAS_LABORALES: readonly ReglaAusentismo[] = [ReglaAusentismo.ORIGEN_LABORAL];

const LIMITE_POR_DEFECTO = 50;

// Catálogos del ausentismo (RF-CFG-14): los tipos con su regla de liquidación y los diagnósticos CIE-10. Nada se borra
// (la base de datos lo impide): los tipos y los diagnósticos se desactivan.
@Injectable()
export class CatalogosAusentismoService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Tipos de ausentismo ----------

  listarTipos(incluirInactivos = false) {
    return this.prisma.tipoAusentismo.findMany({
      where: incluirInactivos ? {} : { activo: true },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
  }

  async crearTipo(dto: CrearTipoAusentismoDto, usuario: UsuarioAutenticado) {
    const nombre = dto.nombre.trim();
    this.exigirPorcentajeSegunRegla(dto.regla, dto.porcentaje);
    this.exigirDiaEventoSoloLaboral(dto.regla, dto.diaEventoComoLaborado);
    await this.exigirTipoLibre(dto.codigo, nombre);

    const ultimo = await this.prisma.tipoAusentismo.findMany({ orderBy: { orden: 'desc' }, take: 1, select: { orden: true } });
    return this.prisma.$transaction(async (tx) => {
      const tipo = await tx.tipoAusentismo.create({
        data: {
          codigo: dto.codigo,
          nombre,
          regla: dto.regla,
          porcentaje: dto.porcentaje === undefined ? null : new Prisma.Decimal(dto.porcentaje),
          requiereDiagnostico: dto.requiereDiagnostico ?? false,
          diaEventoComoLaborado: dto.diaEventoComoLaborado ?? false,
          orden: (ultimo[0]?.orden ?? 0) + 1,
        },
      });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'TIPO_AUSENTISMO_CREAR',
        entidad: 'TIPO_AUSENTISMO',
        entidadId: tipo.id,
        resumen: `Creó el tipo de ausentismo "${tipo.nombre}" (${tipo.codigo})`,
        despues: soloCampos(tipo, CAMPOS_TIPO),
      });
      return tipo;
    });
  }

  // La clave y la regla no se cambian (la base de datos lo impide): se desactiva el tipo y se crea otro.
  async actualizarTipo(id: string, dto: ActualizarTipoAusentismoDto, usuario: UsuarioAutenticado) {
    const actual = await this.prisma.tipoAusentismo.findUnique({ where: { id } });
    if (!actual) {
      throw new NotFoundException(`No existe el tipo de ausentismo ${id}`);
    }
    const nombre = dto.nombre?.trim();
    if (dto.porcentaje !== undefined && !REGLAS_CON_PORCENTAJE.includes(actual.regla)) {
      throw new BadRequestException('Este tipo se liquida con los porcentajes de los parámetros legales del año: su porcentaje se cambia allí');
    }
    if (dto.diaEventoComoLaborado === true) {
      this.exigirDiaEventoSoloLaboral(actual.regla, true);
    }
    if (nombre !== undefined && nombre.toLowerCase() !== actual.nombre.toLowerCase()) {
      await this.exigirTipoLibre(undefined, nombre, id);
    }

    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.tipoAusentismo.update({
        where: { id },
        data: {
          nombre,
          porcentaje: dto.porcentaje === undefined ? undefined : new Prisma.Decimal(dto.porcentaje),
          requiereDiagnostico: dto.requiereDiagnostico,
          diaEventoComoLaborado: dto.diaEventoComoLaborado,
          activo: dto.activo,
          orden: dto.orden,
        },
      });
      const cambios = [
        nombre !== undefined && nombre !== actual.nombre ? `nombre a "${actualizado.nombre}"` : null,
        dto.porcentaje !== undefined && !new Prisma.Decimal(dto.porcentaje).equals(actual.porcentaje ?? -1)
          ? `porcentaje de ${actual.porcentaje?.toString() ?? '—'} a ${actualizado.porcentaje?.toString()} %`
          : null,
        dto.requiereDiagnostico !== undefined && dto.requiereDiagnostico !== actual.requiereDiagnostico
          ? actualizado.requiereDiagnostico
            ? 'ahora exige diagnóstico'
            : 'ya no exige diagnóstico'
          : null,
        dto.diaEventoComoLaborado !== undefined && dto.diaEventoComoLaborado !== actual.diaEventoComoLaborado
          ? actualizado.diaEventoComoLaborado
            ? 'el día del evento se paga como laborado'
            : 'el día del evento ya no se paga como laborado'
          : null,
        dto.activo !== undefined && dto.activo !== actual.activo ? (actualizado.activo ? 'lo activó' : 'lo desactivó') : null,
        dto.orden !== undefined && dto.orden !== actual.orden ? `orden a ${actualizado.orden}` : null,
      ].filter(Boolean);
      await registrarAuditoria(tx, {
        usuario,
        accion: 'TIPO_AUSENTISMO_EDITAR',
        entidad: 'TIPO_AUSENTISMO',
        entidadId: id,
        resumen: `Cambió el tipo de ausentismo "${actual.nombre}"${cambios.length > 0 ? `: ${cambios.join(', ')}` : ''}`,
        antes: soloCampos(actual, CAMPOS_TIPO),
        despues: soloCampos(actualizado, CAMPOS_TIPO),
      });
      return actualizado;
    });
  }

  private exigirPorcentajeSegunRegla(regla: ReglaAusentismo, porcentaje: number | undefined) {
    if (REGLAS_CON_PORCENTAJE.includes(regla) && porcentaje === undefined) {
      throw new BadRequestException('Este tipo de regla exige el porcentaje que se paga o se descuenta');
    }
    if (!REGLAS_CON_PORCENTAJE.includes(regla) && porcentaje !== undefined) {
      throw new BadRequestException('Las incapacidades se liquidan con los porcentajes de los parámetros legales del año: no lleva porcentaje propio');
    }
  }

  private exigirDiaEventoSoloLaboral(regla: ReglaAusentismo, diaEventoComoLaborado: boolean | undefined) {
    if (diaEventoComoLaborado && !REGLAS_LABORALES.includes(regla)) {
      throw new BadRequestException('Pagar el día del evento como laborado solo aplica a los ausentismos de origen laboral');
    }
  }

  private async exigirTipoLibre(codigo: string | undefined, nombre: string, ignorarId?: string) {
    const existente = await this.prisma.tipoAusentismo.findFirst({
      where: { OR: [{ nombre: { equals: nombre, mode: 'insensitive' } }, ...(codigo ? [{ codigo }] : [])] },
    });
    if (existente && existente.id !== ignorarId) {
      throw new ConflictException(`Ya existe el tipo de ausentismo "${existente.nombre}" (${existente.codigo})`);
    }
  }

  // ---------- Diagnósticos CIE-10 ----------

  listarDiagnosticos(filtro: ListarDiagnosticosCie10QueryDto = {}) {
    const texto = filtro.q?.trim();
    return this.prisma.diagnosticoCie10.findMany({
      where: {
        ...(filtro.incluirInactivos === 'true' ? {} : { activo: true }),
        ...(texto
          ? { OR: [{ codigo: { contains: texto, mode: 'insensitive' as const } }, { descripcion: { contains: texto, mode: 'insensitive' as const } }] }
          : {}),
      },
      orderBy: { codigo: 'asc' },
      take: filtro.limite ?? LIMITE_POR_DEFECTO,
    });
  }

  async crearDiagnostico(dto: CrearDiagnosticoCie10Dto, usuario: UsuarioAutenticado) {
    const existente = await this.prisma.diagnosticoCie10.findUnique({ where: { codigo: dto.codigo } });
    if (existente) {
      throw new ConflictException(`El código ${dto.codigo} ya existe (${existente.descripcion})`);
    }
    return this.prisma.$transaction(async (tx) => {
      const diagnostico = await tx.diagnosticoCie10.create({ data: { codigo: dto.codigo, descripcion: dto.descripcion.trim() } });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'DIAGNOSTICO_CIE10_CREAR',
        entidad: 'DIAGNOSTICO_CIE10',
        entidadId: diagnostico.id,
        resumen: `Agregó el diagnóstico CIE-10 ${diagnostico.codigo}`,
        despues: soloCampos(diagnostico, CAMPOS_DIAGNOSTICO),
      });
      return diagnostico;
    });
  }

  // El código no se cambia (la base de datos lo impide): los ausentismos ya registrados lo referencian.
  async actualizarDiagnostico(id: string, dto: ActualizarDiagnosticoCie10Dto, usuario: UsuarioAutenticado) {
    const actual = await this.prisma.diagnosticoCie10.findUnique({ where: { id } });
    if (!actual) {
      throw new NotFoundException(`No existe el diagnóstico ${id}`);
    }
    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.diagnosticoCie10.update({ where: { id }, data: { descripcion: dto.descripcion?.trim(), activo: dto.activo } });
      const cambios = [
        dto.descripcion !== undefined && dto.descripcion.trim() !== actual.descripcion ? 'cambió la descripción' : null,
        dto.activo !== undefined && dto.activo !== actual.activo ? (actualizado.activo ? 'lo activó' : 'lo desactivó') : null,
      ].filter(Boolean);
      await registrarAuditoria(tx, {
        usuario,
        accion: 'DIAGNOSTICO_CIE10_EDITAR',
        entidad: 'DIAGNOSTICO_CIE10',
        entidadId: id,
        resumen: `Cambió el diagnóstico CIE-10 ${actual.codigo}${cambios.length > 0 ? `: ${cambios.join(', ')}` : ''}`,
        antes: soloCampos(actual, CAMPOS_DIAGNOSTICO),
        despues: soloCampos(actualizado, CAMPOS_DIAGNOSTICO),
      });
      return actualizado;
    });
  }
}
