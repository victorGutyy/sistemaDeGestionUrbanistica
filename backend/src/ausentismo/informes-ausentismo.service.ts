import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { registrarAuditoria } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generarExcelReporte } from '../reportes/generar-excel.js';
import { propuestaDeNovedades } from './novedad-nomina.js';
import { reporteDeNovedades, type PeriodoParaNovedades } from './novedades.js';
import { calcularResumenMensual } from './resumen.js';
import { presentarResumen, vistaDe } from './visibilidad.js';

// Un pago de nómina cubre una semana, una quincena o un mes; más de esto es un error de digitación.
const MAXIMO_DIAS_DEL_PERIODO = 62;

function fechaDelPeriodo(valor: string, campo: string): Date {
  const fecha = parsearFechaLocal(valor);
  const [anio, mes, dia] = valor.split('-').map(Number);
  if (Number.isNaN(fecha.getTime()) || fecha.getFullYear() !== anio || fecha.getMonth() + 1 !== mes || fecha.getDate() !== dia) {
    throw new BadRequestException(`${campo} no es una fecha válida`);
  }
  return fecha;
}

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Lo que sale del ausentismo hacia afuera de las pantallas de registro: el resumen mensual del año (RF-SST-10) y las
// novedades para la nómina (RF-SST-11). Ninguno lleva diagnósticos ni observaciones (RNF-SEG-08); los valores solo salen para
// quien puede verlos. Solo cuentan los ausentismos vigentes: los anulados no aparecen.
@Injectable()
export class InformesAusentismoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  async resumenMensual(anio: number | undefined, usuario: UsuarioAutenticado, hoy = new Date()) {
    const anioDelResumen = anio ?? hoy.getFullYear();
    const [periodos, trabajadores] = await Promise.all([
      this.prisma.ausentismoPeriodo.findMany({
        where: { anio: anioDelResumen, ausentismo: { anulada: false } },
        include: { ausentismo: { select: { id: true, tipo: { select: { id: true, nombre: true } } } } },
      }),
      this.prisma.trabajador.findMany({ select: { fechaIngreso: true, fechaRetiro: true } }),
    ]);
    const resumen = calcularResumenMensual({
      anio: anioDelResumen,
      periodos: periodos.map(({ ausentismo, ...p }) => ({ ...p, ausentismoId: ausentismo.id, tipoId: ausentismo.tipo.id, tipoNombre: ausentismo.tipo.nombre })),
      trabajadores,
    });
    return presentarResumen(resumen, vistaDe(usuario));
  }

  // Las novedades del mes como reporte (la pantalla las dibuja desde esta estructura y el Excel desde la misma).
  async novedades(anio: number, mes: number, hoy = new Date()) {
    const periodos = await this.prisma.ausentismoPeriodo.findMany({
      where: { anio, mes, ausentismo: { anulada: false } },
      include: {
        ausentismo: {
          select: {
            id: true,
            numeroDocumento: true,
            fechaInicio: true,
            fechaFin: true,
            esProrroga: true,
            corregida: true,
            trabajador: { select: { nombre: true, documento: true, cargo: true } },
            tipo: { select: { nombre: true } },
          },
        },
      },
    });
    return reporteDeNovedades(anio, mes, periodos as PeriodoParaNovedades[], hoy);
  }

  // Las novedades que se proponen al registrar el pago de nómina de un trabajador por un período (RF-SST-11): lo que el
  // ausentismo vigente tiene entre `desde` y `hasta`, repartido por pagador. Es una sugerencia; el usuario la confirma.
  async novedadesDelPeriodo(trabajadorId: string, desde: string, hasta: string) {
    const primero = fechaDelPeriodo(desde, 'desde');
    const ultimo = fechaDelPeriodo(hasta, 'hasta');
    if (ultimo < primero) {
      throw new BadRequestException('La fecha final no puede ser anterior a la inicial');
    }
    if ((ultimo.getTime() - primero.getTime()) / 86_400_000 > MAXIMO_DIAS_DEL_PERIODO) {
      throw new BadRequestException(`El período no puede pasar de ${MAXIMO_DIAS_DEL_PERIODO} días`);
    }
    const trabajador = await this.prisma.trabajador.findUnique({ where: { id: trabajadorId }, select: { id: true } });
    if (!trabajador) {
      throw new NotFoundException(`No existe el trabajador ${trabajadorId}`);
    }
    const ausentismos = await this.prisma.ausentismo.findMany({
      where: { trabajadorId, anulada: false, fechaInicio: { lte: ultimo }, fechaFin: { gte: primero } },
      select: {
        id: true,
        numeroDocumento: true,
        esProrroga: true,
        corregida: true,
        fechaInicio: true,
        fechaFin: true,
        salarioFoto: true,
        parametrosLiquidacion: true,
        tipo: { select: { nombre: true } },
      },
    });
    return propuestaDeNovedades(
      ausentismos.map(({ tipo, ...a }) => ({ ...a, tipoNombre: tipo.nombre })),
      primero,
      ultimo,
    );
  }

  async novedadesExcel(anio: number, mes: number, usuario: UsuarioAutenticado) {
    const [reporte, empresa] = await Promise.all([this.novedades(anio, mes), this.configuracion.obtenerEmpresa()]);
    const buffer = await generarExcelReporte(reporte, empresa);
    await registrarAuditoria(this.prisma, {
      usuario,
      accion: 'AUSENTISMO_NOVEDADES_EXPORTAR',
      entidad: 'AUSENTISMO',
      resumen: `Descargó las novedades de ausentismo de ${String(mes).padStart(2, '0')}/${anio} (${reporte.secciones[0].filas.length} filas)`,
    });
    return { buffer, contentType: TIPO_XLSX, nombreArchivo: `novedades-ausentismo-${anio}-${String(mes).padStart(2, '0')}.xlsx` };
  }
}
