import { HttpException, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MENSAJE_TRASLAPE } from '../ausentismo/ausentismo.service.js';
import { RegistrarAusentismoDto } from '../ausentismo/dto/ausentismo.dto.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import type { Prisma } from '../generated/prisma/client.js';
import { normalizarTexto } from '../importacion/celdas.js';
import type { LibroLeido, ProblemaImportacion } from '../importacion/leer-libro.js';
import { RegistrarAsistentesDto as ClaseRegistrarAsistentes } from '../sst/dto/capacitaciones.dto.js';
import { RegistrarEntregaEppDto as ClaseRegistrarEntrega } from '../sst/dto/epp.dto.js';
import { CrearTrabajadorDto as ClaseCrearTrabajador } from '../trabajadores/dto/crear-trabajador.dto.js';
import { interpretarAsistencia, interpretarAusentismo, interpretarEntregaEpp, interpretarTrabajador } from './interpretar.js';
import type { ClaveHojaSst } from './plantilla-sst-definicion.js';

// La carga de datos de seguridad y salud en el trabajo desde Excel (RF-SST-23). Corre las cuatro hojas (trabajadores,
// ausentismos, entregas de EPP y asistencias) con los MISMOS servicios que usan las pantallas: cada fila pasa por las reglas
// de siempre (traslapes, diagnóstico obligatorio, prórrogas, parámetros del año, fecha de ingreso, trabajador activo…) y por la
// auditoría. Todo corre dentro de la transacción que abre quien llama; cada fila va protegida por un punto de guardado, así una
// fila mala se anota con su error y las demás siguen. Quien llama decide qué hacer con el resultado: la prueba previa revierte
// todo; la confirmación solo guarda si no hubo ningún error.

type Db = Prisma.TransactionClient;

export interface ServiciosDeCarga {
  trabajadores: { crearEnTx(db: Db, dto: ClaseCrearTrabajador, usuario: UsuarioAutenticado): Promise<{ id: string; nombre: string }> };
  ausentismo: { registrarEnTx(db: Db, dto: RegistrarAusentismoDto, usuario: UsuarioAutenticado): Promise<{ id: string }> };
  epp: { registrarEntregaEnTx(db: Db, dto: ClaseRegistrarEntrega, usuario: UsuarioAutenticado, hoy: Date): Promise<unknown> };
  capacitaciones: { registrarAsistentesEnTx(db: Db, capacitacionId: string, dto: ClaseRegistrarAsistentes, usuario: UsuarioAutenticado): Promise<{ registrados: number; omitidos: number }> };
}

export interface ResumenCargaSst {
  // Filas con datos que se leyeron en cada hoja.
  filas: Record<ClaveHojaSst, number>;
  trabajadores: { nuevos: number; existentes: number };
  ausentismos: number;
  entregasEpp: number;
  asistencias: { registradas: number; yaRegistradas: number };
}

export interface ResultadoCarga {
  errores: ProblemaImportacion[];
  avisos: ProblemaImportacion[];
  resumen: ResumenCargaSst;
}

const registro = new Logger('ImportacionSst');
const SAVEPOINT = 'fila_carga_sst';
const MENSAJE_INTERNO = 'No se pudo guardar esta fila por un error interno. Revisa los datos de la fila; si sigue igual, avisa al desarrollador.';

// El mensaje de un error de una fila, en palabras. Lo que el servicio ya dijo (una respuesta con su mensaje) se muestra tal cual.
export function mensajeDelError(error: unknown): string {
  if (error instanceof HttpException) {
    const respuesta = error.getResponse();
    const mensaje = typeof respuesta === 'string' ? respuesta : (respuesta as { message?: string | string[] }).message;
    return Array.isArray(mensaje) ? mensaje.join('. ') : (mensaje ?? error.message);
  }
  // La base de datos también impide el traslape: su error trae el mismo texto que la validación.
  if (error instanceof Error && error.message.includes(MENSAJE_TRASLAPE)) return MENSAJE_TRASLAPE;
  registro.warn(`Error al cargar una fila: ${error instanceof Error ? error.message : String(error)}`);
  return MENSAJE_INTERNO;
}

// Las reglas de los DTO de siempre como red de seguridad: lo que las pantallas exigen, la carga también. Devuelve los mensajes.
function problemasDelDto<T extends object>(clase: new () => T, plano: object): string[] {
  return validateSync(plainToInstance(clase, plano) as object).flatMap((e) => Object.values(e.constraints ?? {}));
}

export async function cargarLibroSst(
  db: Db,
  libro: LibroLeido<ClaveHojaSst>,
  servicios: ServiciosDeCarga,
  usuario: UsuarioAutenticado,
  hoy = new Date(),
): Promise<ResultadoCarga> {
  const errores: ProblemaImportacion[] = [...libro.problemas];
  const avisos: ProblemaImportacion[] = [];
  const resumen: ResumenCargaSst = {
    filas: {
      trabajadores: libro.hojas.trabajadores.filas.length,
      ausentismos: libro.hojas.ausentismos.filas.length,
      entregasEpp: libro.hojas.entregasEpp.filas.length,
      asistencias: libro.hojas.asistencias.filas.length,
    },
    trabajadores: { nuevos: 0, existentes: 0 },
    ausentismos: 0,
    entregasEpp: 0,
    asistencias: { registradas: 0, yaRegistradas: 0 },
  };

  const nombreDeHoja: Record<ClaveHojaSst, string> = { trabajadores: 'Trabajadores', ausentismos: 'Ausentismos', entregasEpp: 'Entregas EPP', asistencias: 'Asistencias' };
  const problema = (hoja: ClaveHojaSst, fila: number, mensaje: string, columna?: string): ProblemaImportacion => ({ hoja: nombreDeHoja[hoja], fila, mensaje, ...(columna ? { columna } : {}) });

  // Una fila dentro de su punto de guardado: si falla, se deshace SOLO esa fila y se anota el error.
  async function protegida(hoja: ClaveHojaSst, fila: number, tarea: () => Promise<void>): Promise<boolean> {
    await db.$executeRawUnsafe(`SAVEPOINT ${SAVEPOINT}`);
    try {
      await tarea();
      await db.$executeRawUnsafe(`RELEASE SAVEPOINT ${SAVEPOINT}`);
      return true;
    } catch (error) {
      await db.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
      await db.$executeRawUnsafe(`RELEASE SAVEPOINT ${SAVEPOINT}`);
      errores.push(problema(hoja, fila, mensajeDelError(error)));
      return false;
    }
  }

  // ---- Búsquedas (con su caché: dentro de la transacción ven lo que las filas anteriores ya crearon) ----
  const trabajadores = new Map<string, { id: string; nombre: string }>();
  const documentosDeEstaCarga = new Map<string, number>();
  async function trabajadorPorDocumento(documento: string) {
    const guardado = trabajadores.get(documento);
    if (guardado) return guardado;
    const encontrado = await db.trabajador.findUnique({ where: { documento }, select: { id: true, nombre: true } });
    if (encontrado) trabajadores.set(documento, encontrado);
    return encontrado;
  }

  const tipos = await db.tipoAusentismo.findMany({ select: { id: true, codigo: true, nombre: true, activo: true } });
  const tiposPorTexto = new Map<string, (typeof tipos)[number]>();
  for (const tipo of tipos) {
    tiposPorTexto.set(normalizarTexto(tipo.nombre), tipo);
    tiposPorTexto.set(normalizarTexto(tipo.codigo), tipo);
  }
  const elementos = await db.elementoEpp.findMany({ select: { id: true, nombre: true } });
  const elementosPorNombre = new Map(elementos.map((e) => [normalizarTexto(e.nombre), e]));

  const diagnosticos = new Map<string, { id: string } | null>();
  async function diagnosticoPorCodigo(codigo: string) {
    if (!diagnosticos.has(codigo)) {
      diagnosticos.set(codigo, await db.diagnosticoCie10.findUnique({ where: { codigo }, select: { id: true } }));
    }
    return diagnosticos.get(codigo) ?? null;
  }

  const capacitacionesPorDia = new Map<string, { id: string; tema: string }[]>();
  async function capacitacionesDelDia(fecha: string) {
    if (!capacitacionesPorDia.has(fecha)) {
      const inicio = parsearFechaLocal(fecha);
      const siguiente = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 1);
      capacitacionesPorDia.set(fecha, await db.capacitacion.findMany({ where: { fechaProgramada: { gte: inicio, lt: siguiente } }, select: { id: true, tema: true } }));
    }
    return capacitacionesPorDia.get(fecha) ?? [];
  }

  // ---- 1. Trabajadores ----
  for (const fila of libro.hojas.trabajadores.filas) {
    const { datos, errores: delaFila } = interpretarTrabajador(fila);
    if (!datos) {
      errores.push(...delaFila);
      continue;
    }
    const repetida = documentosDeEstaCarga.get(datos.documento);
    if (repetida !== undefined) {
      errores.push(problema('trabajadores', fila.fila, `El documento ${datos.documento} ya aparece en la fila ${repetida} de esta hoja`, 'Documento'));
      continue;
    }
    documentosDeEstaCarga.set(datos.documento, fila.fila);

    if (await trabajadorPorDocumento(datos.documento)) {
      resumen.trabajadores.existentes += 1;
      avisos.push(problema('trabajadores', fila.fila, `Ya existe un trabajador con el documento ${datos.documento}: se usa el que está en el sistema, sin modificarlo`, 'Documento'));
      continue;
    }
    await protegida('trabajadores', fila.fila, async () => {
      const dto = { ...datos } as unknown as ClaseCrearTrabajador;
      const mensajes = problemasDelDto(ClaseCrearTrabajador, dto);
      if (mensajes.length > 0) throw new HttpException(`Valor no válido: ${mensajes.join('; ')}`, 400);
      const creado = await servicios.trabajadores.crearEnTx(db, dto, usuario);
      trabajadores.set(datos.documento, { id: creado.id, nombre: creado.nombre });
      resumen.trabajadores.nuevos += 1;
    });
  }

  // ---- 2. Ausentismos ----
  for (const fila of libro.hojas.ausentismos.filas) {
    const { datos, errores: delaFila } = interpretarAusentismo(fila);
    if (!datos) {
      errores.push(...delaFila);
      continue;
    }
    const trabajador = await trabajadorPorDocumento(datos.documento);
    if (!trabajador) {
      errores.push(problema('ausentismos', fila.fila, `No existe un trabajador con el documento ${datos.documento}: ni en el sistema ni en la hoja Trabajadores`, 'Documento del trabajador'));
      continue;
    }
    const tipo = tiposPorTexto.get(normalizarTexto(datos.tipo));
    if (!tipo) {
      const nombres = tipos.filter((t) => t.activo).map((t) => t.nombre).join(', ');
      errores.push(problema('ausentismos', fila.fila, `No existe el tipo de ausentismo "${datos.tipo}". Los tipos son: ${nombres}`, 'Tipo de ausentismo'));
      continue;
    }
    let diagnosticoId: string | undefined;
    if (datos.cie10) {
      const diagnostico = await diagnosticoPorCodigo(datos.cie10);
      if (!diagnostico) {
        errores.push(problema('ausentismos', fila.fila, `No existe el código CIE-10 ${datos.cie10} en el catálogo: agrégalo en Configuración → Seguridad social`, 'Código CIE-10'));
        continue;
      }
      diagnosticoId = diagnostico.id;
    }
    await protegida('ausentismos', fila.fila, async () => {
      const dto = {
        trabajadorId: trabajador.id,
        tipoId: tipo.id,
        fechaInicio: datos.fechaInicio,
        fechaFin: datos.fechaFin,
        diagnosticoId,
        numeroDocumento: datos.numeroDocumento,
        observaciones: datos.observaciones,
        esProrroga: datos.esProrroga || undefined,
        diasPrevios: datos.diasPrevios,
      } as unknown as RegistrarAusentismoDto;
      const mensajes = problemasDelDto(RegistrarAusentismoDto, dto);
      if (mensajes.length > 0) throw new HttpException(`Valor no válido: ${mensajes.join('; ')}`, 400);
      await servicios.ausentismo.registrarEnTx(db, dto, usuario);
      resumen.ausentismos += 1;
    });
  }

  // ---- 3. Entregas de EPP ----
  for (const fila of libro.hojas.entregasEpp.filas) {
    const { datos, errores: delaFila } = interpretarEntregaEpp(fila);
    if (!datos) {
      errores.push(...delaFila);
      continue;
    }
    const trabajador = await trabajadorPorDocumento(datos.documento);
    if (!trabajador) {
      errores.push(problema('entregasEpp', fila.fila, `No existe un trabajador con el documento ${datos.documento}: ni en el sistema ni en la hoja Trabajadores`, 'Documento del trabajador'));
      continue;
    }
    const elemento = elementosPorNombre.get(normalizarTexto(datos.elemento));
    if (!elemento) {
      errores.push(problema('entregasEpp', fila.fila, `No existe el elemento "${datos.elemento}" en el catálogo de EPP: créalo antes en Seguridad y salud → EPP`, 'Elemento'));
      continue;
    }
    await protegida('entregasEpp', fila.fila, async () => {
      const dto = {
        trabajadorId: trabajador.id,
        elementoId: elemento.id,
        fecha: datos.fecha,
        cantidad: datos.cantidad,
        tallaReferencia: datos.tallaReferencia,
        motivo: datos.motivo,
        entregadoPor: datos.entregadoPor,
        firmoRecibido: datos.firmoRecibido,
      } as unknown as ClaseRegistrarEntrega;
      const mensajes = problemasDelDto(ClaseRegistrarEntrega, dto);
      if (mensajes.length > 0) throw new HttpException(`Valor no válido: ${mensajes.join('; ')}`, 400);
      await servicios.epp.registrarEntregaEnTx(db, dto, usuario, hoy);
      resumen.entregasEpp += 1;
    });
  }

  // ---- 4. Asistencias ----
  for (const fila of libro.hojas.asistencias.filas) {
    const { datos, errores: delaFila } = interpretarAsistencia(fila);
    if (!datos) {
      errores.push(...delaFila);
      continue;
    }
    const trabajador = await trabajadorPorDocumento(datos.documento);
    if (!trabajador) {
      errores.push(problema('asistencias', fila.fila, `No existe un trabajador con el documento ${datos.documento}: ni en el sistema ni en la hoja Trabajadores`, 'Documento del trabajador'));
      continue;
    }
    const coinciden = (await capacitacionesDelDia(datos.fechaProgramada)).filter((c) => normalizarTexto(c.tema) === normalizarTexto(datos.tema));
    if (coinciden.length === 0) {
      errores.push(problema('asistencias', fila.fila, `No existe una capacitación "${datos.tema}" programada el ${datos.fechaProgramada.split('-').reverse().join('/')}: créala antes en Seguridad y salud → Capacitaciones`, 'Capacitación'));
      continue;
    }
    if (coinciden.length > 1) {
      errores.push(problema('asistencias', fila.fila, `Hay ${coinciden.length} capacitaciones con ese tema en esa fecha: no se sabe a cuál va la asistencia`, 'Capacitación'));
      continue;
    }
    await protegida('asistencias', fila.fila, async () => {
      const dto = { asistentes: [{ trabajadorId: trabajador.id, firmo: datos.firmo, calificacion: datos.calificacion }] } as unknown as ClaseRegistrarAsistentes;
      const mensajes = problemasDelDto(ClaseRegistrarAsistentes, dto);
      if (mensajes.length > 0) throw new HttpException(`Valor no válido: ${mensajes.join('; ')}`, 400);
      const resultado = await servicios.capacitaciones.registrarAsistentesEnTx(db, coinciden[0].id, dto, usuario);
      if (resultado.registrados > 0) {
        resumen.asistencias.registradas += resultado.registrados;
      } else {
        resumen.asistencias.yaRegistradas += resultado.omitidos;
        avisos.push(problema('asistencias', fila.fila, 'Este trabajador ya estaba registrado en esa capacitación: no se duplica', 'Documento del trabajador'));
      }
    });
  }

  if (Object.values(resumen.filas).every((cantidad) => cantidad === 0) && errores.length === 0) {
    errores.push({ hoja: 'Archivo', fila: null, mensaje: 'El archivo no tiene filas con datos para cargar' });
  }

  return { errores, avisos, resumen };
}
