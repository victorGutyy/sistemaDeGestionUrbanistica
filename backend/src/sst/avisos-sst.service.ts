import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ZONA_HORARIA } from '../common/zona-horaria.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { EmailService } from '../email/email.service.js';
import { EstadoActividadSst, EstadoNotificacion, EstadoTrabajador, TipoAvisoSst } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { DatosEmpresaCorreo } from '../recordatorios/plantilla-correo.js';
import { estadosDeReposicion } from './epp.js';
import { inicioDelDia } from './fechas.js';
import { alertaDeFechaLimite, type EstadoAlerta } from './plan.js';
import {
  asuntoAvisoActividad,
  asuntoAvisoCapacitacion,
  asuntoResumenEpp,
  generarHtmlAvisoActividad,
  generarHtmlAvisoCapacitacion,
  generarHtmlResumenEpp,
  type MomentoAviso,
} from './plantillas-sst.js';

export interface ConteoAvisosSst {
  enviados: number;
  fallidos: number;
  omitidos: number;
}

export interface ResultadoAvisosSst {
  actividades: ConteoAvisosSst;
  capacitaciones: ConteoAvisosSst;
  epp: ConteoAvisosSst;
}

const CERO: ConteoAvisosSst = { enviados: 0, fallidos: 0, omitidos: 0 };
const MAX_DETALLE = 500;
const MOTIVO_SIN_CORREO = 'El correo de la empresa no está configurado';

type ColumnaAviso = 'avisoProximaEn' | 'avisoVencidaEn';

interface ItemConFechaLimite {
  id: string;
  alerta: EstadoAlerta;
  diasRestantes: number | null;
  avisoProximaEn: Date | null;
  avisoVencidaEn: Date | null;
}

interface OpcionesFechaLimite<T extends ItemConFechaLimite> {
  tipo: TipoAvisoSst;
  destinatario: (item: T) => string;
  // Asunto y cuerpo del correo para ese momento.
  construir: (item: T, momento: MomentoAviso) => { asunto: string; html: string };
  // "Reclamar" marca el aviso como enviado ANTES de enviar y dice si lo logró (así dos procesos no mandan el mismo correo).
  reclamar: (id: string, columna: ColumnaAviso) => Promise<boolean>;
  liberar: (id: string, columna: ColumnaAviso) => Promise<void>;
  referencia: (id: string) => { actividadPlanId?: string; capacitacionId?: string };
}

// Avisos automáticos por correo de la gestión SST (RF-SST-14, 16 y 20): a cada responsable cuando su actividad o capacitación
// queda próxima y cuando se vence, y un resumen de los EPP por reponer al correo de avisos SST. Cada aviso sale UNA vez por
// estado (no se repite cada día) y cada intento queda en un historial que no se puede editar. Sin correo configurado no se
// envía nada: queda una anotación de "omitido" por día y los avisos salen cuando el correo exista.
@Injectable()
export class AvisosSstService {
  private readonly logger = new Logger(AvisosSstService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  // Hora de Bogotá (no la del servidor), a una hora distinta de los avisos a clientes (8:00 y 8:05) para que un fallo en uno
  // no arrastre al otro.
  @Cron('0 10 8 * * *', { timeZone: ZONA_HORARIA })
  async ejecutarProgramado() {
    try {
      const r = await this.enviarPendientes();
      this.logger.log(
        `Avisos SST: actividades ${r.actividades.enviados} enviados, ${r.actividades.fallidos} fallidos, ${r.actividades.omitidos} omitidos; ` +
          `capacitaciones ${r.capacitaciones.enviados}/${r.capacitaciones.fallidos}/${r.capacitaciones.omitidos}; EPP ${r.epp.enviados}/${r.epp.fallidos}/${r.epp.omitidos}`,
      );
    } catch (error) {
      this.logger.error(`No se pudieron enviar los avisos SST: ${String(error)}`);
    }
  }

  // Cada parte va aparte: si una falla, las demás se hacen igual.
  async enviarPendientes(hoy = new Date()): Promise<ResultadoAvisosSst> {
    const empresa = await this.configuracion.obtenerEmpresa();
    const dia = inicioDelDia(hoy);
    const datosEmpresa: DatosEmpresaCorreo = { nombreComercial: empresa.nombreComercial, colorPrimario: empresa.colorPrimario, telefonos: empresa.telefonos, correo: empresa.correo };

    const intentar = async (nombre: string, tarea: () => Promise<ConteoAvisosSst>) => {
      try {
        return await tarea();
      } catch (error) {
        this.logger.error(`Falló el aviso de ${nombre}: ${String(error)}`);
        return { ...CERO };
      }
    };

    return {
      actividades: await intentar('actividades del plan', () => this.avisarActividades(dia, empresa.diasAlertaSst, datosEmpresa)),
      capacitaciones: await intentar('capacitaciones', () => this.avisarCapacitaciones(dia, empresa.diasAlertaSst, datosEmpresa)),
      epp: await intentar('EPP', () => this.avisarEpp(dia, empresa.diasAlertaSst, empresa.correoAvisosSst, datosEmpresa)),
    };
  }

  // ---------- Actividades del plan ----------

  private async avisarActividades(dia: Date, diasAlerta: number, empresa: DatosEmpresaCorreo): Promise<ConteoAvisosSst> {
    const candidatas = await this.prisma.actividadPlan.findMany({
      where: { estado: { notIn: [EstadoActividadSst.EJECUTADA, EstadoActividadSst.CANCELADA] }, OR: [{ avisoProximaEn: null }, { avisoVencidaEn: null }] },
      orderBy: { fechaFin: 'asc' },
    });
    const items = candidatas.map((a) => ({ ...a, ...alertaDeFechaLimite(a.fechaFin, a.estado, dia, diasAlerta) }));

    return this.enviarPorEstado(items, {
      tipo: TipoAvisoSst.ACTIVIDAD_PLAN,
      destinatario: (a) => a.correoResponsable,
      construir: (a, momento) => ({
        asunto: asuntoAvisoActividad(momento, a.actividad),
        html: generarHtmlAvisoActividad({ momento, responsable: a.responsable, actividad: a.actividad, meta: a.meta, anio: a.anio, fechaFin: a.fechaFin, diasRestantes: a.diasRestantes ?? 0, empresa }),
      }),
      reclamar: async (id, columna) => (await this.prisma.actividadPlan.updateMany({ where: { id, [columna]: null }, data: { [columna]: new Date() } })).count === 1,
      liberar: async (id, columna) => {
        await this.prisma.actividadPlan.updateMany({ where: { id }, data: { [columna]: null } });
      },
      referencia: (id) => ({ actividadPlanId: id }),
    });
  }

  // ---------- Capacitaciones ----------

  private async avisarCapacitaciones(dia: Date, diasAlerta: number, empresa: DatosEmpresaCorreo): Promise<ConteoAvisosSst> {
    const candidatas = await this.prisma.capacitacion.findMany({
      where: { estado: { notIn: [EstadoActividadSst.EJECUTADA, EstadoActividadSst.CANCELADA] }, OR: [{ avisoProximaEn: null }, { avisoVencidaEn: null }] },
      orderBy: { fechaProgramada: 'asc' },
    });
    const items = candidatas.map((c) => ({ ...c, ...alertaDeFechaLimite(c.fechaProgramada, c.estado, dia, diasAlerta) }));

    return this.enviarPorEstado(items, {
      tipo: TipoAvisoSst.CAPACITACION,
      destinatario: (c) => c.correoResponsable,
      construir: (c, momento) => ({
        asunto: asuntoAvisoCapacitacion(momento, c.tema),
        html: generarHtmlAvisoCapacitacion({ momento, responsable: c.responsable, tema: c.tema, fechaProgramada: c.fechaProgramada, diasRestantes: c.diasRestantes ?? 0, dirigidoA: c.dirigidoA, empresa }),
      }),
      reclamar: async (id, columna) => (await this.prisma.capacitacion.updateMany({ where: { id, [columna]: null }, data: { [columna]: new Date() } })).count === 1,
      liberar: async (id, columna) => {
        await this.prisma.capacitacion.updateMany({ where: { id }, data: { [columna]: null } });
      },
      referencia: (id) => ({ capacitacionId: id }),
    });
  }

  // Lo común a las dos: avisar una vez cuando queda próxima y una vez cuando se vence.
  private async enviarPorEstado<T extends ItemConFechaLimite>(items: readonly T[], opciones: OpcionesFechaLimite<T>): Promise<ConteoAvisosSst> {
    const pendientes: { item: T; momento: MomentoAviso; columna: ColumnaAviso }[] = [];
    for (const item of items) {
      if (item.alerta === 'PROXIMA' && !item.avisoProximaEn) pendientes.push({ item, momento: 'PROXIMA', columna: 'avisoProximaEn' });
      else if (item.alerta === 'VENCIDA' && !item.avisoVencidaEn) pendientes.push({ item, momento: 'VENCIDA', columna: 'avisoVencidaEn' });
    }
    const conteo = { ...CERO };
    if (pendientes.length === 0) return conteo;

    // Sin servidor de correo no se reclama nada: cuando exista, estos avisos saldrán.
    if (!this.email.estaConfigurado()) {
      await this.anotarOmisionDelDia(opciones.tipo, pendientes.length);
      return { ...conteo, omitidos: pendientes.length };
    }

    for (const { item, momento, columna } of pendientes) {
      if (!(await opciones.reclamar(item.id, columna))) continue;
      const { asunto, html } = opciones.construir(item, momento);
      const destinatario = opciones.destinatario(item);
      const estado = await this.enviarYAnotar({ tipo: opciones.tipo, destinatario, asunto, html, ...opciones.referencia(item.id) });
      if (estado === EstadoNotificacion.ENVIADA) {
        conteo.enviados += 1;
      } else {
        // Falló: se libera para reintentar al día siguiente (un fallo de red no debe perder el aviso).
        await opciones.liberar(item.id, columna);
        conteo.fallidos += 1;
      }
    }
    return conteo;
  }

  // ---------- EPP por reponer ----------

  // Un solo correo con lo que entró en "por reponer" o "vencido" desde el último aviso. Va al "correo de avisos SST" de la
  // configuración; si está vacío, las alertas de EPP solo se ven en el panel.
  private async avisarEpp(dia: Date, diasAlerta: number, correoAvisos: string | null, empresa: DatosEmpresaCorreo): Promise<ConteoAvisosSst> {
    const conteo = { ...CERO };
    if (!correoAvisos?.trim()) return conteo;

    const entregas = await this.prisma.entregaEpp.findMany({
      where: { anulada: false, trabajador: { estado: EstadoTrabajador.ACTIVO }, elemento: { activo: true } },
      include: { trabajador: { select: { nombre: true, documento: true } }, elemento: { select: { nombre: true } } },
    });
    const estados = estadosDeReposicion(entregas, dia, diasAlerta);
    const vencidas = estados.filter((e) => e.estado === 'VENCIDO' && !e.avisoVencidaEn);
    const porReponer = estados.filter((e) => e.estado === 'POR_REPONER' && !e.avisoPorReponerEn);
    const cantidad = vencidas.length + porReponer.length;
    if (cantidad === 0) return conteo;

    if (!this.email.estaConfigurado()) {
      await this.anotarOmisionDelDia(TipoAvisoSst.EPP, cantidad);
      return { ...conteo, omitidos: cantidad };
    }

    // Se reclaman antes de enviar; si el correo falla, se liberan para reintentar mañana.
    const ahora = new Date();
    const idsVencidas = vencidas.map((e) => e.id);
    const idsPorReponer = porReponer.map((e) => e.id);
    if (idsVencidas.length > 0) await this.prisma.entregaEpp.updateMany({ where: { id: { in: idsVencidas }, avisoVencidaEn: null }, data: { avisoVencidaEn: ahora } });
    if (idsPorReponer.length > 0) await this.prisma.entregaEpp.updateMany({ where: { id: { in: idsPorReponer }, avisoPorReponerEn: null }, data: { avisoPorReponerEn: ahora } });

    const fila = (e: (typeof estados)[number]) => ({ trabajador: e.trabajador.nombre, documento: e.trabajador.documento, elemento: e.elemento.nombre, proximaReposicion: e.proximaReposicion, diasRestantes: e.diasRestantes });
    const estado = await this.enviarYAnotar({
      tipo: TipoAvisoSst.EPP,
      destinatario: correoAvisos.trim(),
      asunto: asuntoResumenEpp(vencidas.length, porReponer.length),
      html: generarHtmlResumenEpp({ vencidos: vencidas.map(fila), porReponer: porReponer.map(fila), empresa }),
      cantidad,
    });

    if (estado === EstadoNotificacion.ENVIADA) {
      return { ...conteo, enviados: 1 };
    }
    if (idsVencidas.length > 0) await this.prisma.entregaEpp.updateMany({ where: { id: { in: idsVencidas } }, data: { avisoVencidaEn: null } });
    if (idsPorReponer.length > 0) await this.prisma.entregaEpp.updateMany({ where: { id: { in: idsPorReponer } }, data: { avisoPorReponerEn: null } });
    return { ...conteo, fallidos: 1 };
  }

  // ---------- Historial ----------

  private async enviarYAnotar(datos: { tipo: TipoAvisoSst; destinatario: string; asunto: string; html: string; actividadPlanId?: string; capacitacionId?: string; cantidad?: number }): Promise<EstadoNotificacion> {
    let estado: EstadoNotificacion = EstadoNotificacion.ENVIADA;
    let detalle: string | null = null;
    try {
      await this.email.enviar({ to: datos.destinatario, subject: datos.asunto, html: datos.html });
    } catch (error) {
      detalle = (error instanceof Error ? error.message : String(error)).slice(0, MAX_DETALLE);
      this.logger.warn(`No se pudo enviar el aviso SST a ${datos.destinatario}: ${detalle}`);
      estado = EstadoNotificacion.FALLIDA;
    }

    // El correo ya salió (o falló): si anotarlo falla no se debe deshacer ni repetir nada, solo avisar en el log.
    try {
      await this.prisma.avisoSst.create({
        data: { tipo: datos.tipo, estado, destinatario: datos.destinatario, asunto: datos.asunto, detalle, actividadPlanId: datos.actividadPlanId, capacitacionId: datos.capacitacionId, cantidad: datos.cantidad },
      });
    } catch (error) {
      this.logger.error(`No se pudo anotar el aviso SST (${estado}) a ${datos.destinatario}: ${String(error)}`);
    }
    return estado;
  }

  // Sin correo configurado, una sola anotación por día y tipo (no una por cada actividad ni por cada día de espera).
  private async anotarOmisionDelDia(tipo: TipoAvisoSst, cantidad: number) {
    const desde = inicioDelDia(new Date());
    const yaAnotada = await this.prisma.avisoSst.findFirst({ where: { tipo, estado: EstadoNotificacion.OMITIDA, detalle: MOTIVO_SIN_CORREO, createdAt: { gte: desde } }, select: { id: true } });
    if (yaAnotada) return;
    await this.prisma.avisoSst.create({ data: { tipo, estado: EstadoNotificacion.OMITIDA, detalle: MOTIVO_SIN_CORREO, cantidad } });
  }

  // El historial de avisos (más recientes primero).
  listarAvisos(filtro: { tipo?: TipoAvisoSst; estado?: EstadoNotificacion } = {}, limite = 200) {
    return this.prisma.avisoSst.findMany({
      where: { tipo: filtro.tipo, estado: filtro.estado },
      orderBy: { createdAt: 'desc' },
      take: limite,
      include: { actividadPlan: { select: { id: true, actividad: true } }, capacitacion: { select: { id: true, tema: true } } },
    });
  }
}
