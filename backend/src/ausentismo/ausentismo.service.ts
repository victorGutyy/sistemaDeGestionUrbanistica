import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { registrarAuditoria, soloCampos } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { EntidadRecobro, EstadoTrabajador, ReglaAusentismo, TipoEntidadSS } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SeguridadSocialService } from '../seguridad-social/seguridad-social.service.js';
import { DocumentosSstService } from '../sst/documentos-sst.service.js';
import { diasEntre, inicioDelDia } from '../sst/fechas.js';
import type { ActualizarAusentismoDto, AnularAusentismoDto, CorregirLiquidacionDto, ListarAusentismosQueryDto, RegistrarAusentismoDto } from './dto/ausentismo.dto.js';
import { errorEnCorreccion, liquidarAusentismo, totalesDe, type PeriodoLiquidado, type TotalesLiquidacion } from './liquidacion.js';
import { presentarAusentismo, vistaDe } from './visibilidad.js';

// Tope de días de un solo registro: evita que un año mal escrito (2062 en vez de 2026) arme una liquidación de miles de días.
// No es una regla legal: es una protección contra errores de digitación.
const MAXIMO_DIAS_POR_REGISTRO = 1100;
const LIMITE_LISTA = 500;

const REGLAS_CON_TRAMOS: readonly ReglaAusentismo[] = [ReglaAusentismo.INCAPACIDAD_GENERAL, ReglaAusentismo.ORIGEN_LABORAL];

const CAMPOS_AUDITADOS = ['trabajadorId', 'tipoId', 'fechaInicio', 'fechaFin', 'dias', 'numeroDocumento', 'esProrroga', 'prorrogaDeId', 'diasPrevios', 'diagnosticoId'] as const;

const MENSAJE_TRASLAPE = 'El trabajador ya tiene un ausentismo en esas fechas';

const INCLUIR_DETALLE = {
  trabajador: { select: { id: true, nombre: true, documento: true, cargo: true, estado: true } },
  tipo: true,
  diagnostico: true,
  periodos: { orderBy: [{ anio: 'asc' as const }, { mes: 'asc' as const }] },
  recobros: { orderBy: { entidad: 'asc' as const } },
  prorrogaDe: { select: { id: true, fechaInicio: true, fechaFin: true, dias: true } },
  registradaPor: { select: { nombre: true } },
  anuladaPor: { select: { nombre: true } },
  corregidaPor: { select: { nombre: true } },
  _count: { select: { documentos: true } },
} satisfies Prisma.AusentismoInclude;

type AusentismoDetalle = Prisma.AusentismoGetPayload<{ include: typeof INCLUIR_DETALLE }>;

const textoDecimal = (valor: Prisma.Decimal) => valor.toString();

function fechaDelRegistro(valor: string, campo: string): Date {
  const fecha = parsearFechaLocal(valor);
  const [anio, mes, dia] = valor.split('-').map(Number);
  if (Number.isNaN(fecha.getTime()) || fecha.getFullYear() !== anio || fecha.getMonth() + 1 !== mes || fecha.getDate() !== dia) {
    throw new BadRequestException(`${campo} no es una fecha válida`);
  }
  return fecha;
}

const aISO = (fecha: Date) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;

// Un período de la liquidación como texto, para guardarlo como foto en el JSON del ausentismo.
const periodoComoTexto = (p: PeriodoLiquidado) => ({
  anio: p.anio,
  mes: p.mes,
  dias: p.dias,
  diasEmpleador: p.diasEmpleador,
  diasEps: p.diasEps,
  diasArl: p.diasArl,
  diasAfp: p.diasAfp,
  diasLaborados: p.diasLaborados,
  diasDescuento: p.diasDescuento,
  valorEmpleador: textoDecimal(p.valorEmpleador),
  valorEps: textoDecimal(p.valorEps),
  valorArl: textoDecimal(p.valorArl),
  valorAfp: textoDecimal(p.valorAfp),
  valorDescuento: textoDecimal(p.valorDescuento),
});

// Ausentismo (CC-03, fase C): incapacidades y licencias de los trabajadores, con la liquidación de apoyo de quién paga cada
// día y cuánto (RF-SST-01 a 08). Un ausentismo no se edita ni se borra: se anula con motivo y se registra de nuevo. El
// diagnóstico y los valores solo salen para los roles con permiso (RNF-SEG-08): todo lo que sale pasa por presentarAusentismo.
@Injectable()
export class AusentismoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seguridadSocial: SeguridadSocialService,
    private readonly documentos: DocumentosSstService,
  ) {}

  // ---------- Consulta ----------

  async listar(filtro: ListarAusentismosQueryDto, usuario: UsuarioAutenticado, hoy = new Date()) {
    const estado = filtro.estado ?? 'VIGENTES';
    const anio = filtro.anio ?? (filtro.mes === undefined ? undefined : hoy.getFullYear());
    const filas = await this.prisma.ausentismo.findMany({
      where: {
        ...(estado === 'TODOS' ? {} : { anulada: estado === 'ANULADOS' }),
        ...(filtro.trabajadorId ? { trabajadorId: filtro.trabajadorId } : {}),
        ...(filtro.tipoId ? { tipoId: filtro.tipoId } : {}),
        ...(anio !== undefined || filtro.mes !== undefined
          ? { periodos: { some: { ...(anio === undefined ? {} : { anio }), ...(filtro.mes === undefined ? {} : { mes: filtro.mes }) } } }
          : {}),
      },
      orderBy: [{ fechaInicio: 'desc' }, { createdAt: 'desc' }],
      take: LIMITE_LISTA,
      // Campos explícitos: la lista nunca lleva el diagnóstico, las observaciones ni el cálculo guardado, aunque el rol pueda verlos.
      select: {
        id: true,
        trabajadorId: true,
        tipoId: true,
        fechaInicio: true,
        fechaFin: true,
        dias: true,
        anio: true,
        mes: true,
        numeroDocumento: true,
        esProrroga: true,
        prorrogaDeId: true,
        diasPrevios: true,
        cargoFoto: true,
        corregida: true,
        anulada: true,
        anuladaEn: true,
        createdAt: true,
        trabajador: { select: { id: true, nombre: true, documento: true, cargo: true } },
        tipo: { select: { id: true, codigo: true, nombre: true, regla: true } },
        periodos: true,
        recobros: { select: { id: true, entidad: true, estado: true, valorReconocido: true } },
      },
    });
    const vista = vistaDe(usuario);
    // La lista nunca lleva el diagnóstico ni las observaciones: solo el detalle, que además queda en la auditoría.
    return filas.map((fila) => {
      const { periodos, ...resto } = fila;
      const totales = totalesDe(periodos);
      return presentarAusentismo({ ...resto, totales: totalesComoTexto(totales) }, vista);
    });
  }

  async buscar(id: string, usuario: UsuarioAutenticado) {
    const ausentismo = await this.buscarCompleto(id);
    const vista = vistaDe(usuario);
    // Mostrar un diagnóstico es consultar un dato de salud (RNF-LEG-03): queda en la auditoría.
    if (vista.verDiagnosticos && ausentismo.diagnosticoId) {
      await registrarAuditoria(this.prisma, {
        usuario,
        accion: 'AUSENTISMO_DIAGNOSTICO_CONSULTAR',
        entidad: 'AUSENTISMO',
        entidadId: id,
        resumen: `Consultó el diagnóstico de un ausentismo de ${ausentismo.trabajador.nombre}`,
      });
    }
    return this.presentar(ausentismo, usuario);
  }

  // ---------- Registro (RF-SST-01 a 03) ----------

  async registrar(dto: RegistrarAusentismoDto, usuario: UsuarioAutenticado) {
    const trabajador = await this.prisma.trabajador.findUnique({ where: { id: dto.trabajadorId } });
    if (!trabajador) {
      throw new NotFoundException(`No existe el trabajador ${dto.trabajadorId}`);
    }
    const tipo = await this.prisma.tipoAusentismo.findUnique({ where: { id: dto.tipoId } });
    if (!tipo) {
      throw new NotFoundException(`No existe el tipo de ausentismo ${dto.tipoId}`);
    }
    if (!tipo.activo) {
      throw new BadRequestException(`El tipo "${tipo.nombre}" está desactivado`);
    }

    const fechaInicio = fechaDelRegistro(dto.fechaInicio, 'fechaInicio');
    const fechaFin = fechaDelRegistro(dto.fechaFin, 'fechaFin');
    if (fechaFin < fechaInicio) {
      throw new BadRequestException('La fecha de fin no puede ser anterior a la de inicio');
    }
    const dias = diasEntre(fechaInicio, fechaFin) + 1;
    if (dias > MAXIMO_DIAS_POR_REGISTRO) {
      throw new BadRequestException(`Un ausentismo no puede pasar de ${MAXIMO_DIAS_POR_REGISTRO} días: revisa las fechas`);
    }
    if (fechaInicio < inicioDelDia(trabajador.fechaIngreso)) {
      throw new BadRequestException('El ausentismo no puede empezar antes de la fecha de ingreso del trabajador');
    }
    if (trabajador.estado === EstadoTrabajador.INACTIVO && trabajador.fechaRetiro && fechaInicio > inicioDelDia(trabajador.fechaRetiro)) {
      throw new BadRequestException('El ausentismo no puede empezar después del retiro del trabajador');
    }

    await this.validarDiagnostico(tipo.requiereDiagnostico, dto.diagnosticoId);
    const { esProrroga, prorrogaDeId, diasPrevios } = await this.resolverProrroga(dto, tipo, trabajador.id, fechaInicio);
    await this.exigirSinTraslape(trabajador.id, fechaInicio, fechaFin);

    const parametro = await this.seguridadSocial.parametroDelAnio(fechaInicio.getFullYear());
    let liquidacion;
    try {
      liquidacion = liquidarAusentismo({
        tipo: { regla: tipo.regla, porcentaje: tipo.porcentaje, diaEventoComoLaborado: tipo.diaEventoComoLaborado },
        fechaInicio,
        fechaFin,
        salario: trabajador.salarioBase,
        diasPrevios,
        parametros: {
          smmlv: parametro.smmlv,
          diasBaseMes: parametro.diasBaseMes,
          porcentajeTramo1: parametro.porcentajeIncapacidadTramo1,
          porcentajeTramo2: parametro.porcentajeIncapacidadTramo2,
          porcentajeLaboral: parametro.porcentajeIncapacidadLaboral,
          diasEmpleador: parametro.diasEmpleador,
          diasTramo1Hasta: parametro.diasTramo1Hasta,
          diasTramo2Hasta: parametro.diasTramo2Hasta,
        },
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'No se pudo liquidar el ausentismo');
    }

    const foto = await this.fotoDeEntidades(trabajador.id, fechaInicio);
    const parametrosLiquidacion = { ...liquidacion.parametrosUsados, anio: parametro.anio, parametrosValidados: parametro.validadoEn !== null };
    const liquidacionCalculada = { periodos: liquidacion.periodos.map(periodoComoTexto), totales: totalesComoTexto(liquidacion.totales) };
    const recobros = entidadesConValor(liquidacion.totales);

    let creado: { id: string };
    try {
      creado = await this.prisma.$transaction(async (tx) => {
        const ausentismo = await tx.ausentismo.create({
          data: {
            trabajadorId: trabajador.id,
            tipoId: tipo.id,
            fechaInicio,
            fechaFin,
            dias,
            anio: fechaInicio.getFullYear(),
            mes: fechaInicio.getMonth() + 1,
            numeroDocumento: dto.numeroDocumento?.trim() || null,
            esProrroga,
            prorrogaDeId,
            diasPrevios,
            diagnosticoId: dto.diagnosticoId ?? null,
            observaciones: dto.observaciones?.trim() || null,
            cargoFoto: trabajador.cargo,
            salarioFoto: trabajador.salarioBase,
            epsFoto: foto.EPS,
            arlFoto: foto.ARL,
            afpFoto: foto.AFP,
            baseDiaria: liquidacion.baseDiaria,
            pisoDiario: liquidacion.pisoDiario,
            parametrosLiquidacion,
            liquidacionCalculada,
            registradaPorId: usuario.id,
            periodos: { create: liquidacion.periodos.map(({ anio, mes, ...resto }) => ({ anio, mes, ...resto })) },
            recobros: { create: recobros.map((entidad) => ({ entidad })) },
          },
        });
        // Sin diagnóstico, sin observaciones y sin valores: el resumen lo ve quien consulta la auditoría (el gerente).
        await registrarAuditoria(tx, {
          usuario,
          accion: 'AUSENTISMO_REGISTRAR',
          entidad: 'AUSENTISMO',
          entidadId: ausentismo.id,
          resumen: `Registró ${tipo.nombre.toLowerCase()} de ${trabajador.nombre} del ${aISO(fechaInicio)} al ${aISO(fechaFin)} (${dias} ${dias === 1 ? 'día' : 'días'})${esProrroga ? ', prórroga' : ''}`,
          despues: soloCampos(ausentismo, CAMPOS_AUDITADOS),
        });
        return ausentismo;
      });
    } catch (error) {
      // La base de datos también impide el traslape (dos registros simultáneos): se traduce al mismo mensaje.
      if (error instanceof Error && error.message.includes(MENSAJE_TRASLAPE)) {
        throw new ConflictException(MENSAJE_TRASLAPE);
      }
      throw error;
    }
    return this.presentar(await this.buscarCompleto(creado.id), usuario);
  }

  // ---------- Cambios ----------

  // Solo se completa el número del documento, el diagnóstico y las observaciones. Lo demás se corrige anulando y registrando
  // de nuevo (la base de datos lo impide).
  async actualizar(id: string, dto: ActualizarAusentismoDto, usuario: UsuarioAutenticado) {
    const actual = await this.buscarCompleto(id);
    this.exigirVigente(actual);
    if (dto.diagnosticoId !== undefined) {
      await this.validarDiagnostico(actual.tipo.requiereDiagnostico, dto.diagnosticoId ?? undefined);
    }
    const numeroDocumento = dto.numeroDocumento === undefined ? undefined : dto.numeroDocumento.trim() || null;
    const observaciones = dto.observaciones === undefined ? undefined : dto.observaciones.trim() || null;

    await this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.ausentismo.update({
        where: { id },
        data: { numeroDocumento, diagnosticoId: dto.diagnosticoId, observaciones },
      });
      const cambios = [
        numeroDocumento !== undefined && numeroDocumento !== actual.numeroDocumento ? 'el número del documento' : null,
        dto.diagnosticoId !== undefined && dto.diagnosticoId !== actual.diagnosticoId ? 'el diagnóstico' : null,
        observaciones !== undefined && observaciones !== actual.observaciones ? 'las observaciones' : null,
      ].filter(Boolean);
      await registrarAuditoria(tx, {
        usuario,
        accion: 'AUSENTISMO_EDITAR',
        entidad: 'AUSENTISMO',
        entidadId: id,
        resumen: `Cambió ${cambios.length > 0 ? cambios.join(', ') : 'un ausentismo'} de un ausentismo de ${actual.trabajador.nombre}`,
        antes: soloCampos(actual, ['numeroDocumento', 'diagnosticoId']),
        despues: soloCampos(actualizado, ['numeroDocumento', 'diagnosticoId']),
      });
    });
    return this.presentar(await this.buscarCompleto(id), usuario);
  }

  async anular(id: string, dto: AnularAusentismoDto, usuario: UsuarioAutenticado) {
    const actual = await this.buscarCompleto(id);
    this.exigirVigente(actual);
    const prorrogas = await this.prisma.ausentismo.count({ where: { prorrogaDeId: id, anulada: false } });
    if (prorrogas > 0) {
      throw new ConflictException('Este ausentismo tiene prórrogas vigentes: anúlalas primero');
    }
    const motivo = dto.motivo.trim();
    await this.prisma.$transaction(async (tx) => {
      await tx.ausentismo.update({ where: { id }, data: { anulada: true, anuladaEn: new Date(), anuladaPorId: usuario.id, motivoAnulacion: motivo } });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'AUSENTISMO_ANULAR',
        entidad: 'AUSENTISMO',
        entidadId: id,
        resumen: `Anuló un ausentismo de ${actual.trabajador.nombre} del ${aISO(actual.fechaInicio)} al ${aISO(actual.fechaFin)}: ${motivo}`,
        antes: soloCampos(actual, CAMPOS_AUDITADOS),
      });
    });
    return this.presentar(await this.buscarCompleto(id), usuario);
  }

  // Corrección manual de la liquidación (RF-SST-08), por ejemplo cuando la entidad reconoce otro valor. Con motivo
  // obligatorio. El cálculo original queda guardado en el ausentismo y la auditoría conserva los valores de antes y de después.
  async corregirLiquidacion(id: string, dto: CorregirLiquidacionDto, usuario: UsuarioAutenticado) {
    const actual = await this.buscarCompleto(id);
    this.exigirVigente(actual);
    const originales = actual.periodos.map(comoPeriodoLiquidado);
    const corregidos: PeriodoLiquidado[] = dto.periodos.map((p) => ({
      anio: p.anio,
      mes: p.mes,
      dias: originales.find((o) => o.anio === p.anio && o.mes === p.mes)?.dias ?? 0,
      diasEmpleador: p.diasEmpleador,
      diasEps: p.diasEps,
      diasArl: p.diasArl,
      diasAfp: p.diasAfp,
      diasLaborados: p.diasLaborados,
      diasDescuento: p.diasDescuento,
      valorEmpleador: new Prisma.Decimal(p.valorEmpleador),
      valorEps: new Prisma.Decimal(p.valorEps),
      valorArl: new Prisma.Decimal(p.valorArl),
      valorAfp: new Prisma.Decimal(p.valorAfp),
      valorDescuento: new Prisma.Decimal(p.valorDescuento),
    }));
    const error = errorEnCorreccion(originales, corregidos);
    if (error) {
      throw new BadRequestException(error);
    }
    const motivo = dto.motivo.trim();

    await this.prisma.$transaction(async (tx) => {
      for (const corregido of corregidos) {
        const periodo = actual.periodos.find((p) => p.anio === corregido.anio && p.mes === corregido.mes);
        if (!periodo) continue;
        await tx.ausentismoPeriodo.update({
          where: { id: periodo.id },
          data: {
            diasEmpleador: corregido.diasEmpleador,
            diasEps: corregido.diasEps,
            diasArl: corregido.diasArl,
            diasAfp: corregido.diasAfp,
            diasLaborados: corregido.diasLaborados,
            diasDescuento: corregido.diasDescuento,
            valorEmpleador: corregido.valorEmpleador,
            valorEps: corregido.valorEps,
            valorArl: corregido.valorArl,
            valorAfp: corregido.valorAfp,
            valorDescuento: corregido.valorDescuento,
          },
        });
      }
      await tx.ausentismo.update({ where: { id }, data: { corregida: true, corregidaEn: new Date(), corregidaPorId: usuario.id, motivoCorreccion: motivo } });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'AUSENTISMO_CORREGIR',
        entidad: 'AUSENTISMO',
        entidadId: id,
        resumen: `Corrigió la liquidación de un ausentismo de ${actual.trabajador.nombre}: ${motivo}`,
        antes: { periodos: originales.map(periodoComoTexto) },
        despues: { periodos: corregidos.map(periodoComoTexto) },
      });
    });
    return this.presentar(await this.buscarCompleto(id), usuario);
  }

  // ---------- Certificados adjuntos (RF-SST-21) ----------

  // El certificado de una incapacidad trae el diagnóstico escrito: lo ve solo quien puede ver diagnósticos. Quien gestiona sí
  // puede adjuntarlo (el permiso de la ruta lo decide el controlador) sin poder leerlo después.
  async listarDocumentos(id: string, usuario: UsuarioAutenticado) {
    await this.buscarSimple(id);
    const lista = await this.documentos.listar({ tipo: 'ausentismo', id });
    await this.auditarConsultaDeCertificado(id, usuario, 'Consultó los certificados adjuntos');
    return lista;
  }

  async subirDocumento(id: string, archivo: Express.Multer.File | undefined, descripcion: string | undefined, usuario: UsuarioAutenticado) {
    const documento = await this.documentos.subir({ tipo: 'ausentismo', id }, archivo, descripcion, usuario);
    return documento;
  }

  async leerDocumento(id: string, documentoId: string, usuario: UsuarioAutenticado) {
    await this.buscarSimple(id);
    const lectura = await this.documentos.leer({ tipo: 'ausentismo', id }, documentoId);
    await this.auditarConsultaDeCertificado(id, usuario, `Descargó el certificado ${lectura.nombre}`);
    return lectura;
  }

  private async auditarConsultaDeCertificado(id: string, usuario: UsuarioAutenticado, resumen: string) {
    await registrarAuditoria(this.prisma, { usuario, accion: 'AUSENTISMO_DIAGNOSTICO_CONSULTAR', entidad: 'AUSENTISMO', entidadId: id, resumen });
  }

  // ---------- Apoyos ----------

  private presentar(ausentismo: AusentismoDetalle, usuario: UsuarioAutenticado) {
    const { periodos, ...resto } = ausentismo;
    return presentarAusentismo({ ...resto, periodos, totales: totalesComoTexto(totalesDe(periodos)) }, vistaDe(usuario));
  }

  private async buscarCompleto(id: string): Promise<AusentismoDetalle> {
    const ausentismo = await this.prisma.ausentismo.findUnique({ where: { id }, include: INCLUIR_DETALLE });
    if (!ausentismo) {
      throw new NotFoundException(`No existe el ausentismo ${id}`);
    }
    return ausentismo;
  }

  private async buscarSimple(id: string) {
    const ausentismo = await this.prisma.ausentismo.findUnique({ where: { id }, select: { id: true } });
    if (!ausentismo) {
      throw new NotFoundException(`No existe el ausentismo ${id}`);
    }
    return ausentismo;
  }

  private exigirVigente(ausentismo: { anulada: boolean }) {
    if (ausentismo.anulada) {
      throw new BadRequestException('El ausentismo está anulado: ya no se puede modificar');
    }
  }

  // El diagnóstico debe existir y estar activo; en las incapacidades es obligatorio (RF-SST-02).
  private async validarDiagnostico(obligatorio: boolean, diagnosticoId: string | undefined) {
    if (diagnosticoId === undefined) {
      if (obligatorio) {
        throw new BadRequestException('Este tipo de ausentismo exige el diagnóstico CIE-10');
      }
      return;
    }
    const diagnostico = await this.prisma.diagnosticoCie10.findUnique({ where: { id: diagnosticoId } });
    if (!diagnostico) {
      throw new NotFoundException(`No existe el diagnóstico ${diagnosticoId}`);
    }
    if (!diagnostico.activo) {
      throw new BadRequestException(`El diagnóstico ${diagnostico.codigo} está desactivado`);
    }
  }

  // Una prórroga continúa una incapacidad: los días de la anterior cuentan para los tramos (RF-SST-04). La anterior puede
  // estar en el sistema (se encadena) o venir de fuera (se digitan los días que llevaba).
  private async resolverProrroga(dto: RegistrarAusentismoDto, tipo: { regla: ReglaAusentismo; id: string; nombre: string }, trabajadorId: string, fechaInicio: Date) {
    if (!dto.esProrroga) {
      if (dto.prorrogaDeId || dto.diasPrevios !== undefined) {
        throw new BadRequestException('Para indicar la incapacidad anterior marca el ausentismo como prórroga');
      }
      return { esProrroga: false, prorrogaDeId: null as string | null, diasPrevios: 0 };
    }
    if (!REGLAS_CON_TRAMOS.includes(tipo.regla)) {
      throw new BadRequestException(`"${tipo.nombre}" no tiene prórrogas: solo las incapacidades las tienen`);
    }
    if (dto.prorrogaDeId) {
      if (dto.diasPrevios !== undefined) {
        throw new BadRequestException('Con la incapacidad anterior en el sistema no se digitan los días previos: se toman de ella');
      }
      const anterior = await this.prisma.ausentismo.findUnique({ where: { id: dto.prorrogaDeId } });
      if (!anterior || anterior.trabajadorId !== trabajadorId) {
        throw new BadRequestException('La prórroga debe continuar un ausentismo del mismo trabajador');
      }
      if (anterior.anulada) {
        throw new BadRequestException('La incapacidad anterior está anulada');
      }
      if (anterior.tipoId !== tipo.id) {
        throw new BadRequestException('La prórroga debe ser del mismo tipo que la incapacidad anterior');
      }
      if (inicioDelDia(anterior.fechaFin) >= fechaInicio) {
        throw new BadRequestException('La prórroga debe empezar después de que termina la incapacidad anterior');
      }
      const yaProrrogada = await this.prisma.ausentismo.count({ where: { prorrogaDeId: anterior.id, anulada: false } });
      if (yaProrrogada > 0) {
        throw new ConflictException('La incapacidad anterior ya tiene una prórroga: continúa la última');
      }
      return { esProrroga: true, prorrogaDeId: anterior.id as string | null, diasPrevios: anterior.diasPrevios + anterior.dias };
    }
    if (dto.diasPrevios === undefined) {
      throw new BadRequestException('Indica la incapacidad anterior o cuántos días llevaba acumulados');
    }
    return { esProrroga: true, prorrogaDeId: null as string | null, diasPrevios: dto.diasPrevios };
  }

  private async exigirSinTraslape(trabajadorId: string, fechaInicio: Date, fechaFin: Date) {
    const traslape = await this.prisma.ausentismo.findFirst({
      where: { trabajadorId, anulada: false, fechaInicio: { lte: fechaFin }, fechaFin: { gte: fechaInicio } },
      select: { fechaInicio: true, fechaFin: true },
    });
    if (traslape) {
      throw new ConflictException(`${MENSAJE_TRASLAPE}: del ${aISO(traslape.fechaInicio)} al ${aISO(traslape.fechaFin)}`);
    }
  }

  // El nombre de la EPS, la ARL y el fondo de pensiones del trabajador el día en que empieza el ausentismo (RF-SST-03).
  private async fotoDeEntidades(trabajadorId: string, fechaInicio: Date): Promise<Record<'EPS' | 'ARL' | 'AFP', string | null>> {
    const afiliaciones = await this.prisma.afiliacionTrabajador.findMany({
      where: {
        trabajadorId,
        tipo: { in: [TipoEntidadSS.EPS, TipoEntidadSS.ARL, TipoEntidadSS.AFP] },
        fechaInicio: { lte: fechaInicio },
        OR: [{ fechaFin: null }, { fechaFin: { gte: fechaInicio } }],
      },
      orderBy: { fechaInicio: 'desc' },
      include: { entidad: { select: { nombre: true } } },
    });
    const nombre = (tipo: TipoEntidadSS) => afiliaciones.find((a) => a.tipo === tipo)?.entidad.nombre ?? null;
    return { EPS: nombre(TipoEntidadSS.EPS), ARL: nombre(TipoEntidadSS.ARL), AFP: nombre(TipoEntidadSS.AFP) };
  }
}

function comoPeriodoLiquidado(periodo: AusentismoDetalle['periodos'][number]): PeriodoLiquidado {
  return {
    anio: periodo.anio,
    mes: periodo.mes,
    dias: periodo.dias,
    diasEmpleador: periodo.diasEmpleador,
    diasEps: periodo.diasEps,
    diasArl: periodo.diasArl,
    diasAfp: periodo.diasAfp,
    diasLaborados: periodo.diasLaborados,
    diasDescuento: periodo.diasDescuento,
    valorEmpleador: periodo.valorEmpleador,
    valorEps: periodo.valorEps,
    valorArl: periodo.valorArl,
    valorAfp: periodo.valorAfp,
    valorDescuento: periodo.valorDescuento,
  };
}

function totalesComoTexto(totales: TotalesLiquidacion) {
  return {
    dias: totales.dias,
    diasEmpleador: totales.diasEmpleador,
    diasEps: totales.diasEps,
    diasArl: totales.diasArl,
    diasAfp: totales.diasAfp,
    diasLaborados: totales.diasLaborados,
    diasDescuento: totales.diasDescuento,
    valorEmpleador: textoDecimal(totales.valorEmpleador),
    valorEps: textoDecimal(totales.valorEps),
    valorArl: textoDecimal(totales.valorArl),
    valorAfp: textoDecimal(totales.valorAfp),
    valorDescuento: textoDecimal(totales.valorDescuento),
  };
}

// Las entidades a las que hay algo que cobrarles: se crea su seguimiento de recobro pendiente (RF-SST-09).
function entidadesConValor(totales: TotalesLiquidacion): EntidadRecobro[] {
  return [
    totales.valorEps.greaterThan(0) ? EntidadRecobro.EPS : null,
    totales.valorArl.greaterThan(0) ? EntidadRecobro.ARL : null,
    totales.valorAfp.greaterThan(0) ? EntidadRecobro.AFP : null,
  ].filter((entidad): entidad is EntidadRecobro => entidad !== null);
}
