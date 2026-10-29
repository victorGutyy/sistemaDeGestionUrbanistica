import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { totalesDe } from '../ausentismo/liquidacion.js';
import { InformesAusentismoService } from '../ausentismo/informes-ausentismo.service.js';
import { vistaDe } from '../ausentismo/visibilidad.js';
import { registrarAuditoria } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { formatearDiaDDMMAAAA, hoyISO } from '../cierres-caja/periodo.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { EstadoActividadSst } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generarExcelReporte } from '../reportes/generar-excel.js';
import { generarPdfReporte } from '../reportes/generar-pdf.js';
import { leerLogoParaPdf } from '../reportes/logo-pdf.js';
import type { ReporteGenerado, SeccionReporte } from '../reportes/modelo.js';
import { CapacitacionesService } from '../sst/capacitaciones.service.js';
import { EppService } from '../sst/epp.service.js';
import { PlanTrabajoService } from '../sst/plan-trabajo.service.js';
import { StorageService } from '../storage/storage.service.js';
import {
  CATALOGO_REPORTES_SST,
  definicionSstDe,
  ESTADOS_DE_REGISTRO,
  OPCIONES_ESTADO_ACTIVIDAD,
  OPCIONES_ESTADO_REGISTRO,
  type DefinicionReporteSst,
  type EstadoDeRegistro,
} from './catalogo.js';
import {
  nombreDelMes,
  seccionesDetalleAusentismo,
  seccionesCapacitaciones,
  seccionesEpp,
  seccionesPlan,
  seccionesResumenAusentismo,
  type AusentismoParaDetalle,
} from './constructores.js';
import type { ConsultaReporteSstDto, ExportarReporteSstDto } from './dto/consulta-reporte-sst.dto.js';

const CONTENT_TYPE = {
  pdf: 'application/pdf',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

type Filtros = ConsultaReporteSstDto;

const ESTADOS_DE_ACTIVIDAD: readonly string[] = Object.values(EstadoActividadSst);

// Reportes de seguridad y salud en el trabajo en pantalla, PDF y Excel (RF-SST-22). Reutilizan los mismos cálculos de cada
// pantalla (resumen mensual, reposición de EPP, plan y capacitaciones), así lo que dice el papel coincide con lo que se ve.
// Ningún reporte lleva diagnósticos ni observaciones, y los valores del ausentismo solo salen para quien puede verlos
// (RNF-SEG-08). Bajarlos queda en la auditoría.
@Injectable()
export class ReportesSstService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
    private readonly storage: StorageService,
    private readonly informes: InformesAusentismoService,
    private readonly epp: EppService,
    private readonly plan: PlanTrabajoService,
    private readonly capacitaciones: CapacitacionesService,
  ) {}

  // Qué reportes hay y las opciones para los filtros que se eligen de una lista.
  async catalogo() {
    const [trabajadores, tiposAusentismo] = await Promise.all([
      this.prisma.trabajador.findMany({ select: { id: true, nombre: true, documento: true }, orderBy: { nombre: 'asc' } }),
      this.prisma.tipoAusentismo.findMany({ select: { id: true, nombre: true }, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] }),
    ]);
    return {
      reportes: CATALOGO_REPORTES_SST,
      opciones: { trabajadores, tiposAusentismo, estadosRegistro: OPCIONES_ESTADO_REGISTRO, estadosActividad: OPCIONES_ESTADO_ACTIVIDAD },
    };
  }

  async generar(clave: string, filtros: Filtros, usuario: UsuarioAutenticado, hoy = new Date()): Promise<ReporteGenerado> {
    const definicion = definicionSstDe(clave);
    if (!definicion) {
      throw new NotFoundException(`No existe el reporte "${clave}"`);
    }
    if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
      throw new BadRequestException('La fecha inicial no puede ser posterior a la final');
    }

    return {
      clave: definicion.clave,
      titulo: definicion.titulo,
      descripcion: definicion.descripcion,
      filtros: await this.describirFiltros(definicion, filtros, hoy),
      generadoEn: hoy.toISOString(),
      secciones: await this.construir(definicion.clave, filtros, usuario, hoy),
    };
  }

  async exportar(clave: string, filtros: ExportarReporteSstDto, usuario: UsuarioAutenticado) {
    const reporte = await this.generar(clave, filtros, usuario);
    const empresa = await this.configuracion.obtenerEmpresa();

    let buffer: Buffer;
    if (filtros.formato === 'excel') {
      buffer = await generarExcelReporte(reporte, empresa);
    } else {
      buffer = await generarPdfReporte(reporte, { empresa, logo: await leerLogoParaPdf(this.storage, empresa.logoRuta) });
    }

    // Un reporte de ausentismo trae datos de trabajadores relacionados con su salud: bajarlo deja rastro.
    await registrarAuditoria(this.prisma, {
      usuario,
      accion: 'SST_REPORTE_EXPORTAR',
      entidad: 'EXPORTACION',
      resumen: `Descargó el reporte "${reporte.titulo}" en ${filtros.formato === 'excel' ? 'Excel' : 'PDF'}`,
    });

    const extension = filtros.formato === 'excel' ? 'xlsx' : 'pdf';
    return { buffer, contentType: CONTENT_TYPE[filtros.formato], nombreArchivo: `${nombreBase(reporte.clave, filtros)}.${extension}` };
  }

  // ---------- Consultas de cada reporte ----------

  private construir(clave: DefinicionReporteSst['clave'], filtros: Filtros, usuario: UsuarioAutenticado, hoy: Date): Promise<SeccionReporte[]> {
    switch (clave) {
      case 'sst-ausentismo-resumen':
        return this.ausentismoResumen(filtros, usuario, hoy);
      case 'sst-ausentismo-detalle':
        return this.ausentismoDetalle(filtros, usuario, hoy);
      case 'sst-epp':
        return this.eppReporte(filtros, hoy);
      case 'sst-plan':
        return this.planReporte(filtros, hoy);
      case 'sst-capacitaciones':
        return this.capacitacionesReporte(filtros, hoy);
    }
  }

  private async ausentismoResumen(filtros: Filtros, usuario: UsuarioAutenticado, hoy: Date): Promise<SeccionReporte[]> {
    const resumen = await this.informes.resumenMensual(filtros.anio ?? hoy.getFullYear(), usuario, hoy);
    return seccionesResumenAusentismo(resumen, vistaDe(usuario).verValores);
  }

  private async ausentismoDetalle(filtros: Filtros, usuario: UsuarioAutenticado, hoy: Date): Promise<SeccionReporte[]> {
    const estado = this.estadoDeRegistro(filtros.estado);
    const periodos = await this.prisma.ausentismoPeriodo.findMany({
      where: {
        anio: filtros.anio ?? hoy.getFullYear(),
        ...(filtros.mes ? { mes: filtros.mes } : {}),
        ausentismo: {
          ...(estado === 'TODOS' ? {} : { anulada: estado === 'ANULADOS' }),
          ...(filtros.trabajadorId ? { trabajadorId: filtros.trabajadorId } : {}),
          ...(filtros.tipoId ? { tipoId: filtros.tipoId } : {}),
        },
      },
      // Campos explícitos: ni el diagnóstico ni las observaciones salen de la base de datos hacia este reporte.
      include: {
        ausentismo: {
          select: {
            id: true,
            numeroDocumento: true,
            fechaInicio: true,
            fechaFin: true,
            esProrroga: true,
            corregida: true,
            anulada: true,
            trabajador: { select: { nombre: true, documento: true } },
            tipo: { select: { nombre: true } },
          },
        },
      },
    });

    // Un ausentismo que cruza de mes tiene un período por mes: se junta en una sola fila con lo liquidado en los meses pedidos.
    const porAusentismo = new Map<string, { ausentismo: (typeof periodos)[number]['ausentismo']; periodos: typeof periodos }>();
    for (const periodo of periodos) {
      const actual = porAusentismo.get(periodo.ausentismo.id);
      if (actual) actual.periodos.push(periodo);
      else porAusentismo.set(periodo.ausentismo.id, { ausentismo: periodo.ausentismo, periodos: [periodo] });
    }
    const filas: AusentismoParaDetalle[] = [...porAusentismo.values()].map(({ ausentismo, periodos: suyos }) => ({
      id: ausentismo.id,
      numeroDocumento: ausentismo.numeroDocumento,
      esProrroga: ausentismo.esProrroga,
      corregida: ausentismo.corregida,
      anulada: ausentismo.anulada,
      fechaInicio: ausentismo.fechaInicio,
      fechaFin: ausentismo.fechaFin,
      trabajador: ausentismo.trabajador,
      tipoNombre: ausentismo.tipo.nombre,
      totales: totalesDe(suyos),
    }));
    return seccionesDetalleAusentismo(filas, vistaDe(usuario).verValores);
  }

  private async eppReporte(filtros: Filtros, hoy: Date): Promise<SeccionReporte[]> {
    const fecha: Prisma.DateTimeFilter = {};
    if (filtros.desde) fecha.gte = parsearFechaLocal(filtros.desde);
    if (filtros.hasta) fecha.lte = parsearFechaLocal(filtros.hasta);
    const [entregas, reposiciones] = await Promise.all([
      this.prisma.entregaEpp.findMany({
        where: { anulada: false, ...(filtros.trabajadorId ? { trabajadorId: filtros.trabajadorId } : {}), ...(Object.keys(fecha).length > 0 ? { fecha } : {}) },
        orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
        include: { trabajador: { select: { nombre: true, documento: true } }, elemento: { select: { nombre: true } } },
      }),
      this.epp.reposiciones({ trabajadorId: filtros.trabajadorId }, hoy),
    ]);
    return seccionesEpp(entregas, reposiciones.reposiciones, reposiciones.resumen, reposiciones.diasAlerta);
  }

  private async planReporte(filtros: Filtros, hoy: Date): Promise<SeccionReporte[]> {
    const estado = this.estadoDeActividad(filtros.estado);
    const plan = await this.plan.listar({ anio: String(filtros.anio ?? hoy.getFullYear()), estado }, hoy);
    return seccionesPlan(plan.anio, plan.resumen, plan.actividades);
  }

  private async capacitacionesReporte(filtros: Filtros, hoy: Date): Promise<SeccionReporte[]> {
    const estado = this.estadoDeActividad(filtros.estado);
    const listado = await this.capacitaciones.listar({ anio: String(filtros.anio ?? hoy.getFullYear()), estado }, hoy);
    return seccionesCapacitaciones(listado.anio, listado.resumen, listado.capacitaciones);
  }

  // ---------- Filtros ----------

  private estadoDeRegistro(estado: string | undefined): EstadoDeRegistro {
    if (estado === undefined) return 'VIGENTES';
    if (!(ESTADOS_DE_REGISTRO as readonly string[]).includes(estado)) {
      throw new BadRequestException('El estado debe ser VIGENTES, ANULADOS o TODOS');
    }
    return estado as EstadoDeRegistro;
  }

  private estadoDeActividad(estado: string | undefined): EstadoActividadSst | undefined {
    if (estado === undefined) return undefined;
    if (!ESTADOS_DE_ACTIVIDAD.includes(estado)) {
      throw new BadRequestException('El estado debe ser uno de una actividad: PROGRAMADA, EN_EJECUCION, EJECUTADA, REPROGRAMADA o CANCELADA');
    }
    return estado as EstadoActividadSst;
  }

  // Lo que se pidió, en palabras, para que el papel diga de qué es.
  private async describirFiltros(definicion: DefinicionReporteSst, filtros: Filtros, hoy: Date): Promise<{ etiqueta: string; valor: string }[]> {
    const lista: { etiqueta: string; valor: string }[] = [];
    const usa = (clave: string) => definicion.filtros.some((filtro) => filtro.clave === clave);

    if (usa('anio')) lista.push({ etiqueta: 'Año', valor: String(filtros.anio ?? hoy.getFullYear()) });
    if (usa('mes') && filtros.mes) lista.push({ etiqueta: 'Mes', valor: nombreDelMes(filtros.mes) });
    if ((usa('desde') || usa('hasta')) && (filtros.desde || filtros.hasta)) {
      lista.push({ etiqueta: 'Período', valor: `${filtros.desde ? formatearDiaDDMMAAAA(filtros.desde) : 'desde el inicio'} a ${filtros.hasta ? formatearDiaDDMMAAAA(filtros.hasta) : formatearDiaDDMMAAAA(hoyISO())}` });
    }
    if (usa('trabajadorId') && filtros.trabajadorId) {
      const trabajador = await this.prisma.trabajador.findUnique({ where: { id: filtros.trabajadorId }, select: { nombre: true } });
      lista.push({ etiqueta: 'Trabajador', valor: trabajador?.nombre ?? '—' });
    }
    if (usa('tipoId') && filtros.tipoId) {
      const tipo = await this.prisma.tipoAusentismo.findUnique({ where: { id: filtros.tipoId }, select: { nombre: true } });
      lista.push({ etiqueta: 'Tipo de ausentismo', valor: tipo?.nombre ?? '—' });
    }
    if (usa('estado') && filtros.estado) {
      const opcion = [...OPCIONES_ESTADO_REGISTRO, ...OPCIONES_ESTADO_ACTIVIDAD].find((o) => o.valor === filtros.estado);
      lista.push({ etiqueta: 'Estado', valor: opcion?.etiqueta ?? filtros.estado });
    }
    return lista;
  }
}

// El nombre del archivo: la clave del reporte y lo que lo acota ("sst-plan-2026.pdf").
function nombreBase(clave: string, filtros: Filtros): string {
  const partes: (string | number)[] = [clave];
  if (filtros.anio) partes.push(filtros.anio);
  if (filtros.mes) partes.push(String(filtros.mes).padStart(2, '0'));
  if (filtros.desde || filtros.hasta) partes.push(`${filtros.desde ?? 'inicio'}-a-${filtros.hasta ?? 'hoy'}`);
  return partes.join('-');
}
