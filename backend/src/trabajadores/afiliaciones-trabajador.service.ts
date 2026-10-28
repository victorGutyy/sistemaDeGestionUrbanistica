import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { registrarAuditoria } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { TipoEntidadSS } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolverCambioDeAfiliacion } from './afiliaciones.js';
import { CerrarAfiliacionDto, RegistrarAfiliacionDto } from './dto/afiliacion.dto.js';
import { INCLUIR_AFILIACION } from './trabajadores.service.js';

const ETIQUETA_TIPO: Record<TipoEntidadSS, string> = {
  EPS: 'EPS',
  AFP: 'fondo de pensión',
  CESANTIAS: 'fondo de cesantías',
  ARL: 'ARL',
  CAJA: 'caja de compensación',
};

const esViolacionDeUnico = (error: unknown) => typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';

// Afiliaciones del trabajador a la seguridad social, con historial (RF-PER-04). Nunca se borran: cambiar de entidad
// cierra la vigente y abre la nueva; dejar de estar afiliado se registra con una fecha de fin.
@Injectable()
export class AfiliacionesTrabajadorService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(trabajadorId: string) {
    await this.exigirTrabajador(trabajadorId);
    return this.prisma.afiliacionTrabajador.findMany({
      where: { trabajadorId },
      include: INCLUIR_AFILIACION,
      orderBy: [{ tipo: 'asc' }, { fechaInicio: 'desc' }],
    });
  }

  async registrar(trabajadorId: string, dto: RegistrarAfiliacionDto, usuario: UsuarioAutenticado) {
    const trabajador = await this.exigirTrabajador(trabajadorId);
    const fechaInicio = parsearFechaLocal(dto.fechaInicio);
    if (Number.isNaN(fechaInicio.getTime())) {
      throw new BadRequestException('La fecha de inicio no es válida');
    }
    if (fechaInicio.getTime() < trabajador.fechaIngreso.getTime()) {
      throw new BadRequestException('La afiliación no puede empezar antes de la fecha de ingreso del trabajador');
    }

    const entidad = await this.prisma.entidadSS.findUnique({ where: { id: dto.entidadId } });
    if (!entidad) {
      throw new NotFoundException(`No existe la entidad ${dto.entidadId}`);
    }
    if (entidad.tipo !== dto.tipo) {
      throw new BadRequestException(`"${entidad.nombre}" no es ${ETIQUETA_TIPO[dto.tipo]}`);
    }
    if (!entidad.activa) {
      throw new BadRequestException(`"${entidad.nombre}" está desactivada: elige otra entidad`);
    }

    // La clase de riesgo (y su tasa) solo existe en la ARL, y allí es obligatoria.
    let claseRiesgoId: string | null = null;
    let claseNumero: number | null = null;
    if (dto.tipo === TipoEntidadSS.ARL) {
      if (!dto.claseRiesgoId) {
        throw new BadRequestException('Elige la clase de riesgo de la ARL');
      }
      const clase = await this.prisma.claseRiesgoArl.findUnique({ where: { id: dto.claseRiesgoId } });
      if (!clase) {
        throw new NotFoundException(`No existe la clase de riesgo ${dto.claseRiesgoId}`);
      }
      if (!clase.activa) {
        throw new BadRequestException(`La clase de riesgo ${clase.clase} está desactivada`);
      }
      claseRiesgoId = clase.id;
      claseNumero = clase.clase;
    } else if (dto.claseRiesgoId) {
      throw new BadRequestException('La clase de riesgo solo aplica a la ARL');
    }

    const vigente = await this.prisma.afiliacionTrabajador.findFirst({ where: { trabajadorId, tipo: dto.tipo, fechaFin: null } });
    const plan = resolverCambioDeAfiliacion(vigente, { entidadId: entidad.id, claseRiesgoId, fechaInicio });
    if (!plan.ok) {
      throw new ConflictException(plan.error);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (plan.cerrar) {
          await tx.afiliacionTrabajador.update({ where: { id: plan.cerrar.id }, data: { fechaFin: plan.cerrar.fechaFin } });
        }
        const creada = await tx.afiliacionTrabajador.create({
          data: { trabajadorId, tipo: dto.tipo, entidadId: entidad.id, claseRiesgoId, fechaInicio, registradaPorId: usuario.id },
          include: INCLUIR_AFILIACION,
        });
        await registrarAuditoria(tx, {
          usuario,
          accion: 'TRABAJADOR_AFILIACION_REGISTRAR',
          entidad: 'TRABAJADOR',
          entidadId: trabajadorId,
          resumen: `Afilió a ${trabajador.nombre} a ${ETIQUETA_TIPO[dto.tipo]} ${entidad.nombre}${claseNumero ? ` (clase de riesgo ${claseNumero})` : ''}${plan.cerrar ? ' y cerró la afiliación anterior' : ''}`,
          antes: vigente ? { afiliacionAnteriorId: vigente.id, entidadId: vigente.entidadId, claseRiesgoId: vigente.claseRiesgoId, fechaFin: null } : undefined,
          despues: { afiliacionId: creada.id, tipo: dto.tipo, entidadId: entidad.id, entidad: entidad.nombre, claseRiesgoId, fechaInicio, anteriorCerradaEl: plan.cerrar?.fechaFin },
        });
        return creada;
      });
    } catch (error) {
      // Dos personas registrando a la vez: el índice parcial de la base deja pasar solo una.
      if (esViolacionDeUnico(error)) {
        throw new ConflictException('El trabajador ya tiene una afiliación vigente de ese tipo: vuelve a cargar la ficha');
      }
      throw error;
    }
  }

  // Termina una afiliación sin reemplazarla (p. ej. el trabajador se retira).
  async cerrar(trabajadorId: string, afiliacionId: string, dto: CerrarAfiliacionDto, usuario: UsuarioAutenticado) {
    const trabajador = await this.exigirTrabajador(trabajadorId);
    const afiliacion = await this.prisma.afiliacionTrabajador.findFirst({ where: { id: afiliacionId, trabajadorId }, include: INCLUIR_AFILIACION });
    if (!afiliacion) {
      throw new NotFoundException(`No existe la afiliación ${afiliacionId} de este trabajador`);
    }
    if (afiliacion.fechaFin) {
      throw new ConflictException('Esa afiliación ya está cerrada');
    }
    const fechaFin = parsearFechaLocal(dto.fechaFin);
    if (Number.isNaN(fechaFin.getTime()) || fechaFin.getTime() < afiliacion.fechaInicio.getTime()) {
      throw new BadRequestException('La fecha de fin no puede ser anterior al inicio de la afiliación');
    }
    return this.prisma.$transaction(async (tx) => {
      const cerrada = await tx.afiliacionTrabajador.update({ where: { id: afiliacionId }, data: { fechaFin }, include: INCLUIR_AFILIACION });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'TRABAJADOR_AFILIACION_CERRAR',
        entidad: 'TRABAJADOR',
        entidadId: trabajadorId,
        resumen: `Cerró la afiliación de ${trabajador.nombre} a ${ETIQUETA_TIPO[afiliacion.tipo]} ${afiliacion.entidad.nombre}`,
        antes: { afiliacionId, fechaFin: null },
        despues: { afiliacionId, fechaFin },
      });
      return cerrada;
    });
  }

  private async exigirTrabajador(id: string) {
    const trabajador = await this.prisma.trabajador.findUnique({ where: { id } });
    if (!trabajador) {
      throw new NotFoundException(`No existe el trabajador ${id}`);
    }
    return trabajador;
  }
}
