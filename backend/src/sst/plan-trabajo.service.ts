import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { registrarAuditoria, soloCampos } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoActividadSst } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActualizarActividadPlanDto, CopiarPlanDto, CrearActividadPlanDto, ListarPlanQueryDto } from './dto/plan.dto.js';
import { inicioDelDia } from './fechas.js';
import { actividadesParaCopiar, alertaDeFechaLimite, cronogramaMensual, resumenDelPlan } from './plan.js';

const CAMPOS_AUDITADOS = ['ciclo', 'estandar', 'actividad', 'meta', 'responsable', 'correoResponsable', 'fechaInicio', 'fechaFin', 'recursos', 'presupuesto', 'estado', 'porcentajeAvance'] as const;

const ETIQUETA_CAMPO: Record<(typeof CAMPOS_AUDITADOS)[number], string> = {
  ciclo: 'ciclo PHVA',
  estandar: 'estándar',
  actividad: 'actividad',
  meta: 'meta',
  responsable: 'responsable',
  correoResponsable: 'correo del responsable',
  fechaInicio: 'fecha de inicio',
  fechaFin: 'fecha de fin',
  recursos: 'recursos',
  presupuesto: 'presupuesto',
  estado: 'estado',
  porcentajeAvance: 'avance',
};

const claveFecha = (fecha: Date) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
const textoOpcional = (valor: string | undefined) => (valor === undefined ? undefined : valor.trim() === '' ? null : valor.trim());

// Plan de trabajo anual del SG-SST (RF-SST-15, 16 y 17): actividades con su ciclo PHVA, responsable, fechas, presupuesto,
// estado y avance, y el cronograma mensual calculado con las fechas. Es planeación: se edita (con auditoría) y no se borra;
// una actividad que ya no va se cancela.
@Injectable()
export class PlanTrabajoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  // Las actividades de un año con su cronograma y su alerta (próxima o vencida), y el resumen de cumplimiento del plan.
  async listar(filtro: ListarPlanQueryDto = {}, hoy = new Date()) {
    const anio = filtro.anio ? Number(filtro.anio) : hoy.getFullYear();
    const [empresa, filas] = await Promise.all([
      this.configuracion.obtenerEmpresa(),
      this.prisma.actividadPlan.findMany({
        where: { anio },
        orderBy: [{ fechaInicio: 'asc' }, { createdAt: 'asc' }],
        include: { _count: { select: { documentos: true } } },
      }),
    ]);

    const conCalculos = filas.map((fila) => ({
      ...fila,
      meses: cronogramaMensual(fila.fechaInicio, fila.fechaFin, anio),
      ...alertaDeFechaLimite(fila.fechaFin, fila.estado, inicioDelDia(hoy), empresa.diasAlertaSst),
    }));

    return {
      anio,
      diasAlerta: empresa.diasAlertaSst,
      resumen: resumenDelPlan(filas),
      actividades: filtro.estado ? conCalculos.filter((a) => a.estado === filtro.estado) : conCalculos,
    };
  }

  async buscar(id: string, hoy = new Date()) {
    const [empresa, actividad] = await Promise.all([
      this.configuracion.obtenerEmpresa(),
      this.prisma.actividadPlan.findUnique({
        where: { id },
        include: { creadaPor: { select: { nombre: true } }, documentos: { orderBy: { createdAt: 'desc' }, include: { subidoPor: { select: { nombre: true } } } } },
      }),
    ]);
    if (!actividad) {
      throw new NotFoundException(`No existe la actividad ${id}`);
    }
    return {
      ...actividad,
      meses: cronogramaMensual(actividad.fechaInicio, actividad.fechaFin, actividad.anio),
      ...alertaDeFechaLimite(actividad.fechaFin, actividad.estado, inicioDelDia(hoy), empresa.diasAlertaSst),
    };
  }

  async crear(dto: CrearActividadPlanDto, usuario: UsuarioAutenticado) {
    const fechaInicio = this.parsearFecha(dto.fechaInicio, 'inicio');
    const fechaFin = this.parsearFecha(dto.fechaFin, 'fin');
    this.exigirFechasDelPlan(fechaInicio, fechaFin, dto.anio);
    const estado = dto.estado ?? EstadoActividadSst.PROGRAMADA;

    return this.prisma.$transaction(async (tx) => {
      const actividad = await tx.actividadPlan.create({
        data: {
          anio: dto.anio,
          ciclo: dto.ciclo,
          estandar: dto.estandar.trim(),
          actividad: dto.actividad.trim(),
          meta: dto.meta.trim(),
          responsable: dto.responsable.trim(),
          correoResponsable: dto.correoResponsable.trim(),
          fechaInicio,
          fechaFin,
          recursos: textoOpcional(dto.recursos) ?? null,
          presupuesto: dto.presupuesto ? new Prisma.Decimal(dto.presupuesto) : null,
          estado,
          // Una actividad ejecutada queda siempre en 100 %.
          porcentajeAvance: estado === EstadoActividadSst.EJECUTADA ? 100 : (dto.porcentajeAvance ?? 0),
          creadaPorId: usuario.id,
        },
      });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'ACTIVIDAD_SST_CREAR',
        entidad: 'ACTIVIDAD_SST',
        entidadId: actividad.id,
        resumen: `Creó la actividad "${actividad.actividad}" del plan de trabajo ${actividad.anio}`,
        despues: soloCampos(actividad, CAMPOS_AUDITADOS),
      });
      return actividad;
    });
  }

  // Solo lo que cambia queda en la auditoría, con su valor anterior. Si cambia la fecha de fin, o la actividad se reabre
  // después de ejecutada o cancelada, vuelven a habilitarse los avisos por correo.
  async actualizar(id: string, dto: ActualizarActividadPlanDto, usuario: UsuarioAutenticado) {
    const actual = await this.prisma.actividadPlan.findUnique({ where: { id } });
    if (!actual) {
      throw new NotFoundException(`No existe la actividad ${id}`);
    }

    const fechaInicio = dto.fechaInicio ? this.parsearFecha(dto.fechaInicio, 'inicio') : actual.fechaInicio;
    const fechaFin = dto.fechaFin ? this.parsearFecha(dto.fechaFin, 'fin') : actual.fechaFin;
    this.exigirFechasDelPlan(fechaInicio, fechaFin, actual.anio);

    const cambios: Prisma.ActividadPlanUncheckedUpdateInput = {};
    if (dto.ciclo !== undefined && dto.ciclo !== actual.ciclo) cambios.ciclo = dto.ciclo;
    for (const campo of ['estandar', 'actividad', 'meta', 'responsable', 'correoResponsable'] as const) {
      const nuevo = dto[campo]?.trim();
      if (nuevo !== undefined && nuevo !== actual[campo]) cambios[campo] = nuevo;
    }
    if (claveFecha(fechaInicio) !== claveFecha(actual.fechaInicio)) cambios.fechaInicio = fechaInicio;
    if (claveFecha(fechaFin) !== claveFecha(actual.fechaFin)) cambios.fechaFin = fechaFin;
    const recursos = textoOpcional(dto.recursos);
    if (recursos !== undefined && recursos !== actual.recursos) cambios.recursos = recursos;
    if (dto.presupuesto !== undefined) {
      const presupuesto = dto.presupuesto === '' ? null : new Prisma.Decimal(dto.presupuesto);
      const igual = presupuesto === null ? actual.presupuesto === null : actual.presupuesto !== null && presupuesto.equals(actual.presupuesto);
      if (!igual) cambios.presupuesto = presupuesto;
    }

    const estado = dto.estado ?? actual.estado;
    if (estado !== actual.estado) cambios.estado = estado;
    // Ejecutada = 100 %, siempre.
    const avance = estado === EstadoActividadSst.EJECUTADA ? 100 : (dto.porcentajeAvance ?? actual.porcentajeAvance);
    if (avance !== actual.porcentajeAvance) cambios.porcentajeAvance = avance;

    if (Object.keys(cambios).length === 0) {
      return actual;
    }

    const estabaCerrada = actual.estado === EstadoActividadSst.EJECUTADA || actual.estado === EstadoActividadSst.CANCELADA;
    const seReabre = estabaCerrada && estado !== EstadoActividadSst.EJECUTADA && estado !== EstadoActividadSst.CANCELADA;
    if ('fechaFin' in cambios || seReabre) {
      cambios.avisoProximaEn = null;
      cambios.avisoVencidaEn = null;
    }

    return this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.actividadPlan.update({ where: { id }, data: cambios });
      const cambiados = CAMPOS_AUDITADOS.filter((campo) => campo in cambios);
      await registrarAuditoria(tx, {
        usuario,
        accion: 'ACTIVIDAD_SST_EDITAR',
        entidad: 'ACTIVIDAD_SST',
        entidadId: id,
        resumen: `Editó la actividad "${actual.actividad}" del plan ${actual.anio}: ${cambiados.map((campo) => ETIQUETA_CAMPO[campo]).join(', ')}`,
        antes: soloCampos(actual, cambiados),
        despues: soloCampos(actualizada, cambiados),
      });
      return actualizada;
    });
  }

  // Copia el plan de un año como borrador del siguiente (RF-SST-17). El año de destino debe estar vacío, para no duplicar.
  async copiarAnio(dto: CopiarPlanDto, usuario: UsuarioAutenticado) {
    if (dto.anioOrigen === dto.anioDestino) {
      throw new BadRequestException('El año de origen y el de destino deben ser distintos');
    }
    const origen = await this.prisma.actividadPlan.findMany({ where: { anio: dto.anioOrigen }, orderBy: [{ fechaInicio: 'asc' }, { createdAt: 'asc' }] });
    const aCopiar = actividadesParaCopiar(origen, dto.anioOrigen, dto.anioDestino);
    if (aCopiar.length === 0) {
      throw new BadRequestException(`El plan de ${dto.anioOrigen} no tiene actividades para copiar`);
    }
    const yaHay = await this.prisma.actividadPlan.count({ where: { anio: dto.anioDestino } });
    if (yaHay > 0) {
      throw new ConflictException(`El plan de ${dto.anioDestino} ya tiene ${yaHay} actividad${yaHay === 1 ? '' : 'es'}: no se copia encima`);
    }

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.actividadPlan.createMany({
        data: aCopiar.map((a) => ({
          anio: dto.anioDestino,
          ciclo: a.ciclo,
          estandar: a.estandar,
          actividad: a.actividad,
          meta: a.meta,
          responsable: a.responsable,
          correoResponsable: a.correoResponsable,
          fechaInicio: a.fechaInicio,
          fechaFin: a.fechaFin,
          recursos: a.recursos,
          presupuesto: a.presupuesto,
          estado: a.estado,
          porcentajeAvance: a.porcentajeAvance,
          creadaPorId: usuario.id,
        })),
      });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'ACTIVIDAD_SST_COPIAR_PLAN',
        entidad: 'ACTIVIDAD_SST',
        entidadId: String(dto.anioDestino),
        resumen: `Copió ${count} actividad${count === 1 ? '' : 'es'} del plan de trabajo ${dto.anioOrigen} al ${dto.anioDestino} como borrador`,
        despues: { anioOrigen: dto.anioOrigen, anioDestino: dto.anioDestino, copiadas: count, canceladasOmitidas: origen.length - aCopiar.length },
      });
      return { anioOrigen: dto.anioOrigen, anioDestino: dto.anioDestino, copiadas: count, canceladasOmitidas: origen.length - aCopiar.length };
    });
  }

  private parsearFecha(texto: string, cual: string): Date {
    const fecha = parsearFechaLocal(texto);
    if (Number.isNaN(fecha.getTime())) {
      throw new BadRequestException(`La fecha de ${cual} no es válida`);
    }
    return fecha;
  }

  // Las dos fechas van en orden y dentro del año del plan (el cronograma mensual es de ese año).
  private exigirFechasDelPlan(fechaInicio: Date, fechaFin: Date, anio: number) {
    if (fechaFin.getTime() < fechaInicio.getTime()) {
      throw new BadRequestException('La fecha de fin no puede ser anterior a la de inicio');
    }
    if (fechaInicio.getFullYear() !== anio || fechaFin.getFullYear() !== anio) {
      throw new BadRequestException(`Las fechas deben estar dentro de ${anio}, el año del plan`);
    }
  }
}
