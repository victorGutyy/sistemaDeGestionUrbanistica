import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { registrarAuditoria, soloCampos } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoActividadSst, EstadoTrabajador } from '../generated/prisma/enums.js';
import type { ClienteDb } from '../prisma/cliente-db.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ActualizarAsistenciaDto,
  ActualizarCapacitacionDto,
  AnularAsistenciaDto,
  CrearCapacitacionDto,
  ListarCapacitacionesQueryDto,
  RegistrarAsistentesDto,
} from './dto/capacitaciones.dto.js';
import { inicioDelDia } from './fechas.js';
import { alertaDeFechaLimite, coberturaDeCapacitacion } from './plan.js';

const CAMPOS_AUDITADOS = [
  'tema',
  'objetivo',
  'dirigidoA',
  'modalidad',
  'horas',
  'fechaProgramada',
  'fechaEjecucion',
  'responsable',
  'correoResponsable',
  'ejecutor',
  'asistentesProgramados',
  'estado',
  'evaluacionEficacia',
] as const;

const ETIQUETA_CAMPO: Record<(typeof CAMPOS_AUDITADOS)[number], string> = {
  tema: 'tema',
  objetivo: 'objetivo',
  dirigidoA: 'dirigido a',
  modalidad: 'modalidad',
  horas: 'horas',
  fechaProgramada: 'fecha programada',
  fechaEjecucion: 'fecha de ejecución',
  responsable: 'facilitador',
  correoResponsable: 'correo del facilitador',
  ejecutor: 'ejecutor',
  asistentesProgramados: 'asistentes programados',
  estado: 'estado',
  evaluacionEficacia: 'evaluación de eficacia',
};

const claveFecha = (fecha: Date) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
const esViolacionDeUnico = (error: unknown) => typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';

// Plan de capacitación del SG-SST (RF-SST-18, 19 y 20): cada capacitación con su asistencia, los asistentes reales y el
// porcentaje de cobertura frente a los programados. Una capacitación se edita (con auditoría) y no se borra: si ya no va, se
// cancela. Una asistencia registrada por error se anula con motivo.
@Injectable()
export class CapacitacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  // Las capacitaciones programadas en un año, con asistentes reales, cobertura y alerta (próxima o vencida).
  async listar(filtro: ListarCapacitacionesQueryDto = {}, hoy = new Date()) {
    const anio = filtro.anio ? Number(filtro.anio) : hoy.getFullYear();
    const [empresa, filas] = await Promise.all([
      this.configuracion.obtenerEmpresa(),
      this.prisma.capacitacion.findMany({
        where: { fechaProgramada: { gte: new Date(anio, 0, 1), lte: new Date(anio, 11, 31) }, ...(filtro.estado ? { estado: filtro.estado } : {}) },
        orderBy: [{ fechaProgramada: 'asc' }, { createdAt: 'asc' }],
        include: { _count: { select: { documentos: true, asistencias: { where: { anulada: false } } } } },
      }),
    ]);

    const capacitaciones = filas.map(({ _count, ...fila }) => ({
      ...fila,
      documentos: _count.documentos,
      ...coberturaDeCapacitacion(fila.asistentesProgramados, _count.asistencias),
      ...alertaDeFechaLimite(fila.fechaProgramada, fila.estado, inicioDelDia(hoy), empresa.diasAlertaSst),
    }));

    const ejecutadas = capacitaciones.filter((c) => c.estado === EstadoActividadSst.EJECUTADA);
    const programadosEjecutadas = ejecutadas.reduce((suma, c) => suma + c.asistentesProgramados, 0);
    const realesEjecutadas = ejecutadas.reduce((suma, c) => suma + c.asistentesReales, 0);
    return {
      anio,
      diasAlerta: empresa.diasAlertaSst,
      resumen: {
        total: capacitaciones.length,
        ejecutadas: ejecutadas.length,
        // Cobertura de las ya ejecutadas: asistentes reales sobre programados (null si no hay programados).
        coberturaEjecutadas: coberturaDeCapacitacion(programadosEjecutadas, realesEjecutadas).cobertura,
      },
      capacitaciones,
    };
  }

  async buscar(id: string, hoy = new Date()) {
    const [empresa, capacitacion] = await Promise.all([
      this.configuracion.obtenerEmpresa(),
      this.prisma.capacitacion.findUnique({
        where: { id },
        include: {
          creadaPor: { select: { nombre: true } },
          asistencias: {
            where: { anulada: false },
            orderBy: { trabajador: { nombre: 'asc' } },
            include: { trabajador: { select: { id: true, nombre: true, documento: true, cargo: true } } },
          },
          documentos: { orderBy: { createdAt: 'desc' }, include: { subidoPor: { select: { nombre: true } } } },
        },
      }),
    ]);
    if (!capacitacion) {
      throw new NotFoundException(`No existe la capacitación ${id}`);
    }
    const anuladas = await this.prisma.asistenciaCapacitacion.count({ where: { capacitacionId: id, anulada: true } });
    return {
      ...capacitacion,
      asistenciasAnuladas: anuladas,
      ...coberturaDeCapacitacion(capacitacion.asistentesProgramados, capacitacion.asistencias.length),
      ...alertaDeFechaLimite(capacitacion.fechaProgramada, capacitacion.estado, inicioDelDia(hoy), empresa.diasAlertaSst),
    };
  }

  async crear(dto: CrearCapacitacionDto, usuario: UsuarioAutenticado) {
    const fechaProgramada = this.parsearFecha(dto.fechaProgramada, 'programada');
    const fechaEjecucion = dto.fechaEjecucion ? this.parsearFecha(dto.fechaEjecucion, 'ejecución') : null;
    const estado = dto.estado ?? EstadoActividadSst.PROGRAMADA;
    this.exigirEjecucionConFecha(estado, fechaEjecucion);

    return this.prisma.$transaction(async (tx) => {
      const capacitacion = await tx.capacitacion.create({
        data: {
          tema: dto.tema.trim(),
          objetivo: dto.objetivo.trim(),
          dirigidoA: dto.dirigidoA.trim(),
          modalidad: dto.modalidad,
          horas: new Prisma.Decimal(dto.horas),
          fechaProgramada,
          fechaEjecucion,
          responsable: dto.responsable.trim(),
          correoResponsable: dto.correoResponsable.trim(),
          ejecutor: dto.ejecutor,
          asistentesProgramados: dto.asistentesProgramados,
          estado,
          evaluacionEficacia: dto.evaluacionEficacia === undefined ? null : new Prisma.Decimal(dto.evaluacionEficacia),
          creadaPorId: usuario.id,
        },
      });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'CAPACITACION_CREAR',
        entidad: 'CAPACITACION',
        entidadId: capacitacion.id,
        resumen: `Creó la capacitación "${capacitacion.tema}" programada para el ${claveFecha(capacitacion.fechaProgramada)}`,
        despues: soloCampos(capacitacion, CAMPOS_AUDITADOS),
      });
      return capacitacion;
    });
  }

  // Solo lo que cambia queda en la auditoría, con su valor anterior. Si cambia la fecha programada, o la capacitación se
  // reabre después de ejecutada o cancelada, vuelven a habilitarse los avisos por correo.
  async actualizar(id: string, dto: ActualizarCapacitacionDto, usuario: UsuarioAutenticado) {
    const actual = await this.prisma.capacitacion.findUnique({ where: { id } });
    if (!actual) {
      throw new NotFoundException(`No existe la capacitación ${id}`);
    }

    const fechaProgramada = dto.fechaProgramada ? this.parsearFecha(dto.fechaProgramada, 'programada') : actual.fechaProgramada;
    const fechaEjecucion = dto.fechaEjecucion ? this.parsearFecha(dto.fechaEjecucion, 'ejecución') : actual.fechaEjecucion;
    const estado = dto.estado ?? actual.estado;
    this.exigirEjecucionConFecha(estado, fechaEjecucion);

    const cambios: Prisma.CapacitacionUncheckedUpdateInput = {};
    for (const campo of ['tema', 'objetivo', 'dirigidoA', 'responsable', 'correoResponsable'] as const) {
      const nuevo = dto[campo]?.trim();
      if (nuevo !== undefined && nuevo !== actual[campo]) cambios[campo] = nuevo;
    }
    if (dto.modalidad !== undefined && dto.modalidad !== actual.modalidad) cambios.modalidad = dto.modalidad;
    if (dto.ejecutor !== undefined && dto.ejecutor !== actual.ejecutor) cambios.ejecutor = dto.ejecutor;
    if (dto.horas !== undefined && !new Prisma.Decimal(dto.horas).equals(actual.horas)) cambios.horas = new Prisma.Decimal(dto.horas);
    if (dto.asistentesProgramados !== undefined && dto.asistentesProgramados !== actual.asistentesProgramados) cambios.asistentesProgramados = dto.asistentesProgramados;
    if (claveFecha(fechaProgramada) !== claveFecha(actual.fechaProgramada)) cambios.fechaProgramada = fechaProgramada;
    if (fechaEjecucion && (!actual.fechaEjecucion || claveFecha(fechaEjecucion) !== claveFecha(actual.fechaEjecucion))) cambios.fechaEjecucion = fechaEjecucion;
    if (estado !== actual.estado) cambios.estado = estado;
    if (dto.evaluacionEficacia !== undefined && (actual.evaluacionEficacia === null || !new Prisma.Decimal(dto.evaluacionEficacia).equals(actual.evaluacionEficacia))) {
      cambios.evaluacionEficacia = new Prisma.Decimal(dto.evaluacionEficacia);
    }

    if (Object.keys(cambios).length === 0) {
      return actual;
    }

    const estabaCerrada = actual.estado === EstadoActividadSst.EJECUTADA || actual.estado === EstadoActividadSst.CANCELADA;
    const seReabre = estabaCerrada && estado !== EstadoActividadSst.EJECUTADA && estado !== EstadoActividadSst.CANCELADA;
    if ('fechaProgramada' in cambios || seReabre) {
      cambios.avisoProximaEn = null;
      cambios.avisoVencidaEn = null;
    }

    return this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.capacitacion.update({ where: { id }, data: cambios });
      const cambiados = CAMPOS_AUDITADOS.filter((campo) => campo in cambios);
      await registrarAuditoria(tx, {
        usuario,
        accion: 'CAPACITACION_EDITAR',
        entidad: 'CAPACITACION',
        entidadId: id,
        resumen: `Editó la capacitación "${actual.tema}": ${cambiados.map((campo) => ETIQUETA_CAMPO[campo]).join(', ')}`,
        antes: soloCampos(actual, cambiados),
        despues: soloCampos(actualizada, cambiados),
      });
      return actualizada;
    });
  }

  // ---------- Asistencia (RF-SST-19) ----------

  // Registra varios asistentes de una vez. Solo trabajadores activos; los que ya estaban registrados se omiten.
  async registrarAsistentes(capacitacionId: string, dto: RegistrarAsistentesDto, usuario: UsuarioAutenticado) {
    try {
      return await this.prisma.$transaction((tx) => this.registrarAsistentesEnTx(tx, capacitacionId, dto, usuario));
    } catch (error) {
      // Dos personas registrando al mismo trabajador a la vez: el índice parcial de la base deja pasar solo una.
      if (esViolacionDeUnico(error)) {
        throw new ConflictException('Alguno de los asistentes ya fue registrado: vuelve a cargar la capacitación');
      }
      throw error;
    }
  }

  // El registro completo (validaciones y asistencias) dentro de una transacción ya abierta: sirve al formulario y a la carga desde
  // Excel, que corre muchos registros en una sola transacción.
  async registrarAsistentesEnTx(db: Prisma.TransactionClient, capacitacionId: string, dto: RegistrarAsistentesDto, usuario: UsuarioAutenticado) {
    const capacitacion = await this.buscarSimple(capacitacionId, db);
    if (capacitacion.estado === EstadoActividadSst.CANCELADA) {
      throw new BadRequestException('La capacitación está cancelada: no admite asistentes');
    }

    const ids = dto.asistentes.map((a) => a.trabajadorId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Hay un trabajador repetido en la lista');
    }
    const trabajadores = await db.trabajador.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true, estado: true } });
    if (trabajadores.length !== ids.length) {
      throw new NotFoundException('Alguno de los trabajadores no existe');
    }
    const retirados = trabajadores.filter((t) => t.estado === EstadoTrabajador.INACTIVO);
    if (retirados.length > 0) {
      throw new BadRequestException(`Estos trabajadores están retirados: ${retirados.map((t) => t.nombre).join(', ')}`);
    }

    const yaRegistrados = new Set((await db.asistenciaCapacitacion.findMany({ where: { capacitacionId, anulada: false, trabajadorId: { in: ids } }, select: { trabajadorId: true } })).map((a) => a.trabajadorId));
    const nuevos = dto.asistentes.filter((a) => !yaRegistrados.has(a.trabajadorId));
    const nombres = new Map(trabajadores.map((t) => [t.id, t.nombre]));

    if (nuevos.length === 0) {
      return { registrados: 0, omitidos: yaRegistrados.size };
    }

    await db.asistenciaCapacitacion.createMany({
      data: nuevos.map((a) => ({
        capacitacionId,
        trabajadorId: a.trabajadorId,
        firmo: a.firmo ?? false,
        calificacion: a.calificacion === undefined ? null : new Prisma.Decimal(a.calificacion),
        registradaPorId: usuario.id,
      })),
    });
    await registrarAuditoria(db, {
      usuario,
      accion: 'CAPACITACION_ASISTENCIA_REGISTRAR',
      entidad: 'CAPACITACION',
      entidadId: capacitacionId,
      resumen: `Registró ${nuevos.length} asistente${nuevos.length === 1 ? '' : 's'} a la capacitación "${capacitacion.tema}"${yaRegistrados.size > 0 ? ` (${yaRegistrados.size} ya estaban registrados)` : ''}`,
      despues: { registrados: nuevos.length, omitidos: yaRegistrados.size, trabajadores: nuevos.map((a) => nombres.get(a.trabajadorId)) },
    });
    return { registrados: nuevos.length, omitidos: yaRegistrados.size };
  }

  async actualizarAsistencia(capacitacionId: string, asistenciaId: string, dto: ActualizarAsistenciaDto, usuario: UsuarioAutenticado) {
    const asistencia = await this.buscarAsistencia(capacitacionId, asistenciaId);
    if (asistencia.anulada) {
      throw new BadRequestException('La asistencia está anulada: no se puede editar');
    }

    const cambios: Prisma.AsistenciaCapacitacionUncheckedUpdateInput = {};
    if (dto.firmo !== undefined && dto.firmo !== asistencia.firmo) cambios.firmo = dto.firmo;
    if (dto.calificacion !== undefined) {
      const nueva = dto.calificacion === null ? null : new Prisma.Decimal(dto.calificacion);
      const igual = nueva === null ? asistencia.calificacion === null : asistencia.calificacion !== null && nueva.equals(asistencia.calificacion);
      if (!igual) cambios.calificacion = nueva;
    }
    if (Object.keys(cambios).length === 0) {
      return asistencia;
    }

    return this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.asistenciaCapacitacion.update({ where: { id: asistenciaId }, data: cambios, include: { trabajador: { select: { id: true, nombre: true, documento: true, cargo: true } } } });
      const campos = (['firmo', 'calificacion'] as const).filter((campo) => campo in cambios);
      await registrarAuditoria(tx, {
        usuario,
        accion: 'CAPACITACION_ASISTENCIA_EDITAR',
        entidad: 'CAPACITACION',
        entidadId: capacitacionId,
        resumen: `Editó la asistencia de ${actualizada.trabajador.nombre} (${campos.map((c) => (c === 'firmo' ? 'firma' : 'calificación')).join(', ')})`,
        antes: soloCampos(asistencia, campos),
        despues: soloCampos(actualizada, campos),
      });
      return actualizada;
    });
  }

  // Una asistencia registrada por error no se borra: se anula con motivo y deja de contar. Si el trabajador sí asistió, se
  // registra de nuevo.
  async anularAsistencia(capacitacionId: string, asistenciaId: string, dto: AnularAsistenciaDto, usuario: UsuarioAutenticado) {
    const asistencia = await this.buscarAsistencia(capacitacionId, asistenciaId);
    if (asistencia.anulada) {
      throw new ConflictException('La asistencia ya está anulada');
    }
    return this.prisma.$transaction(async (tx) => {
      const anulada = await tx.asistenciaCapacitacion.update({
        where: { id: asistenciaId },
        data: { anulada: true, anuladaEn: new Date(), anuladaPorId: usuario.id, motivoAnulacion: dto.motivo.trim() },
        include: { trabajador: { select: { id: true, nombre: true, documento: true, cargo: true } } },
      });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'CAPACITACION_ASISTENCIA_ANULAR',
        entidad: 'CAPACITACION',
        entidadId: capacitacionId,
        resumen: `Anuló la asistencia de ${anulada.trabajador.nombre}: ${anulada.motivoAnulacion}`,
        antes: { anulada: false },
        despues: { anulada: true, motivoAnulacion: anulada.motivoAnulacion },
      });
      return anulada;
    });
  }

  private async buscarSimple(id: string, db: ClienteDb = this.prisma) {
    const capacitacion = await db.capacitacion.findUnique({ where: { id } });
    if (!capacitacion) {
      throw new NotFoundException(`No existe la capacitación ${id}`);
    }
    return capacitacion;
  }

  // La asistencia debe ser de la capacitación de la ruta: un identificador de otra no sirve.
  private async buscarAsistencia(capacitacionId: string, asistenciaId: string) {
    const asistencia = await this.prisma.asistenciaCapacitacion.findFirst({
      where: { id: asistenciaId, capacitacionId },
      include: { trabajador: { select: { id: true, nombre: true, documento: true, cargo: true } } },
    });
    if (!asistencia) {
      throw new NotFoundException(`No existe la asistencia ${asistenciaId} en esta capacitación`);
    }
    return asistencia;
  }

  private parsearFecha(texto: string, cual: string): Date {
    const fecha = parsearFechaLocal(texto);
    if (Number.isNaN(fecha.getTime())) {
      throw new BadRequestException(`La fecha ${cual} no es válida`);
    }
    return fecha;
  }

  // Una capacitación ejecutada necesita la fecha en que se ejecutó (también lo exige la base de datos).
  private exigirEjecucionConFecha(estado: EstadoActividadSst, fechaEjecucion: Date | null) {
    if (estado === EstadoActividadSst.EJECUTADA && !fechaEjecucion) {
      throw new BadRequestException('Indica la fecha de ejecución: la capacitación está ejecutada');
    }
  }
}
