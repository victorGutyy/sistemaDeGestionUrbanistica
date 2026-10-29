import { esVacia, leerCodigo, leerDecimal, leerEntero, leerFecha, leerOpcion, leerPesos, leerTexto, type Celda, type Lectura } from '../importacion/celdas.js';
import type { FilaLeida, ProblemaImportacion } from '../importacion/leer-libro.js';
import type { HojaPlantilla } from '../importacion/plantilla-definicion.js';
import { HOJAS_SST, MOTIVOS_DE_ENTREGA_EPP, SI_NO, TIPOS_DE_CONTRATO, type ClaveHojaSst } from './plantilla-sst-definicion.js';

// Lectura de una fila de cada hoja (RF-SST-23). Funciones puras: reciben la fila tal como salió del Excel y devuelven los datos
// ya convertidos, o TODOS los problemas de esa fila (no solo el primero) con su hoja, fila y columna, para poder corregirla de
// una vez. No consultan la base de datos: eso lo hace la carga.

export interface Interpretada<T> {
  datos: T | null;
  errores: ProblemaImportacion[];
}

export interface DatosTrabajador {
  documento: string;
  tipoDocumento?: string;
  nombres: string;
  apellidos: string;
  cargo: string;
  tipoContrato?: string;
  salarioBase: string;
  fechaIngreso: string;
  area?: string;
  sexo?: string;
  fechaNacimiento?: string;
  telefono?: string;
  celular?: string;
  email?: string;
}

export interface DatosAusentismo {
  documento: string;
  tipo: string;
  fechaInicio: string;
  fechaFin: string;
  numeroDocumento?: string;
  cie10?: string;
  esProrroga: boolean;
  diasPrevios?: number;
  observaciones?: string;
}

export interface DatosEntregaEpp {
  documento: string;
  elemento: string;
  fecha: string;
  cantidad: number;
  tallaReferencia?: string;
  motivo: string;
  entregadoPor?: string;
  firmoRecibido: boolean;
}

export interface DatosAsistencia {
  documento: string;
  tema: string;
  fechaProgramada: string;
  firmo: boolean;
  calificacion?: number;
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hojaDe(clave: ClaveHojaSst): HojaPlantilla<ClaveHojaSst> {
  const hoja = HOJAS_SST.find((candidata) => candidata.clave === clave);
  if (!hoja) throw new Error(`La plantilla no tiene la hoja ${clave}`);
  return hoja;
}

// Lo común de leer una fila: ubica cada problema en su columna y acumula todos.
function lector(clave: ClaveHojaSst, fila: FilaLeida) {
  const hoja = hojaDe(clave);
  const errores: ProblemaImportacion[] = [];
  const encabezadoDe = (columna: string) => hoja.columnas.find((c) => c.clave === columna)?.encabezado ?? columna;
  const falla = (columna: string, mensaje: string) => errores.push({ hoja: hoja.nombre, fila: fila.fila, columna: encabezadoDe(columna), mensaje });

  // Lee una columna con la lectora que le toca. Si está vacía y es obligatoria, es un problema; si es opcional, queda sin valor.
  function leer<T>(columna: string, lectora: (celda: Celda) => Lectura<T>): T | undefined {
    const celda = fila.celdas[columna];
    if (esVacia(celda)) {
      if (hoja.columnas.find((c) => c.clave === columna)?.obligatoria) falla(columna, 'Es obligatorio');
      return undefined;
    }
    const lectura = lectora(celda as Celda);
    if (!lectura.ok) {
      falla(columna, lectura.mensaje);
      return undefined;
    }
    return lectura.valor;
  }

  const texto = (columna: string, maximo?: number, minimo?: number) =>
    leer(columna, (celda) => {
      const lectura = leerTexto(celda);
      if (!lectura.ok) return lectura;
      if (maximo !== undefined && lectura.valor.length > maximo) return { ok: false, mensaje: `Máximo ${maximo} caracteres` } as const;
      if (minimo !== undefined && lectura.valor.length < minimo) return { ok: false, mensaje: `Mínimo ${minimo} caracteres` } as const;
      return lectura;
    });
  const opcion = (columna: string, opciones: string[]) => leer(columna, (celda) => leerOpcion(celda, opciones));
  const siNo = (columna: string): boolean | undefined => {
    const valor = opcion(columna, SI_NO);
    return valor === undefined ? undefined : valor === 'Sí';
  };

  return { errores, falla, leer, texto, opcion, siNo };
}

// ---------- Trabajadores ----------

export function interpretarTrabajador(fila: FilaLeida): Interpretada<DatosTrabajador> {
  const l = lector('trabajadores', fila);
  const documento = l.leer('documento', (celda) => {
    const lectura = leerCodigo(celda);
    return lectura.ok && lectura.valor.length < 3 ? ({ ok: false, mensaje: 'Mínimo 3 caracteres' } as const) : lectura;
  });
  const tipoDocumento = l.opcion('tipoDocumento', hojaDe('trabajadores').columnas.find((c) => c.clave === 'tipoDocumento')?.opciones ?? []);
  const nombres = l.texto('nombres', 80);
  const apellidos = l.texto('apellidos', 80);
  const cargo = l.texto('cargo', 120, 2);
  const contrato = l.opcion('tipoContrato', Object.keys(TIPOS_DE_CONTRATO));
  const salarioBase = l.leer('salarioBase', leerPesos);
  const fechaIngreso = l.leer('fechaIngreso', leerFecha);
  const area = l.texto('area', 80);
  const sexo = l.opcion('sexo', hojaDe('trabajadores').columnas.find((c) => c.clave === 'sexo')?.opciones ?? []);
  const fechaNacimiento = l.leer('fechaNacimiento', leerFecha);
  const telefono = l.texto('telefono', 30);
  const celular = l.texto('celular', 30);
  const email = l.leer('email', (celda) => {
    const lectura = leerTexto(celda);
    return lectura.ok && !CORREO.test(lectura.valor) ? ({ ok: false, mensaje: 'No es un correo válido' } as const) : lectura;
  });

  if (l.errores.length > 0 || documento === undefined || nombres === undefined || apellidos === undefined || cargo === undefined || salarioBase === undefined || fechaIngreso === undefined) {
    return { datos: null, errores: l.errores };
  }
  return {
    datos: {
      documento,
      tipoDocumento: tipoDocumento?.toUpperCase(),
      nombres,
      apellidos,
      cargo,
      tipoContrato: contrato === undefined ? undefined : TIPOS_DE_CONTRATO[contrato],
      salarioBase: salarioBase.toString(),
      fechaIngreso,
      area,
      sexo: sexo?.toUpperCase(),
      fechaNacimiento,
      telefono,
      celular,
      email,
    },
    errores: [],
  };
}

// ---------- Ausentismos ----------

export function interpretarAusentismo(fila: FilaLeida): Interpretada<DatosAusentismo> {
  const l = lector('ausentismos', fila);
  const documento = l.leer('documento', leerCodigo);
  const tipo = l.texto('tipo', 80);
  const fechaInicio = l.leer('fechaInicio', leerFecha);
  const fechaFin = l.leer('fechaFin', leerFecha);
  const numeroDocumento = l.texto('numeroDocumento', 60);
  const cie10 = l.texto('cie10', 12);
  const prorroga = l.siNo('prorroga');
  const diasPrevios = l.leer('diasPrevios', leerEntero);
  const observaciones = l.texto('observaciones', 1000);

  if (fechaInicio !== undefined && fechaFin !== undefined && fechaFin < fechaInicio) {
    l.falla('fechaFin', 'La fecha de fin no puede ser anterior a la de inicio');
  }
  if (prorroga === true && diasPrevios === undefined && !l.errores.some((e) => e.columna === 'Días previos')) {
    l.falla('diasPrevios', 'En una prórroga indica cuántos días llevaba acumulados la incapacidad anterior');
  }
  if (prorroga !== true && diasPrevios !== undefined) {
    l.falla('diasPrevios', 'Los días previos solo van en una prórroga: marca "Es prórroga" como Sí');
  }

  if (l.errores.length > 0 || documento === undefined || tipo === undefined || fechaInicio === undefined || fechaFin === undefined) {
    return { datos: null, errores: l.errores };
  }
  return {
    datos: { documento, tipo, fechaInicio, fechaFin, numeroDocumento, cie10: cie10?.toUpperCase(), esProrroga: prorroga === true, diasPrevios, observaciones },
    errores: [],
  };
}

// ---------- Entregas de EPP ----------

export function interpretarEntregaEpp(fila: FilaLeida): Interpretada<DatosEntregaEpp> {
  const l = lector('entregasEpp', fila);
  const documento = l.leer('documento', leerCodigo);
  const elemento = l.texto('elemento', 120);
  const fecha = l.leer('fecha', leerFecha);
  const cantidad = l.leer('cantidad', (celda) => {
    const lectura = leerEntero(celda);
    return lectura.ok && (lectura.valor < 1 || lectura.valor > 1000) ? ({ ok: false, mensaje: 'Debe ser un número de 1 a 1000' } as const) : lectura;
  });
  const tallaReferencia = l.texto('tallaReferencia', 30);
  const motivo = l.opcion('motivo', Object.keys(MOTIVOS_DE_ENTREGA_EPP));
  const entregadoPor = l.texto('entregadoPor', 120);
  const firmo = l.siNo('firmo');

  if (l.errores.length > 0 || documento === undefined || elemento === undefined || fecha === undefined || cantidad === undefined || motivo === undefined) {
    return { datos: null, errores: l.errores };
  }
  return {
    datos: { documento, elemento, fecha, cantidad, tallaReferencia, motivo: MOTIVOS_DE_ENTREGA_EPP[motivo], entregadoPor, firmoRecibido: firmo === true },
    errores: [],
  };
}

// ---------- Asistencias ----------

export function interpretarAsistencia(fila: FilaLeida): Interpretada<DatosAsistencia> {
  const l = lector('asistencias', fila);
  const documento = l.leer('documento', leerCodigo);
  const tema = l.texto('tema', 200);
  const fechaProgramada = l.leer('fechaProgramada', leerFecha);
  const firmo = l.siNo('firmo');
  const calificacion = l.leer('calificacion', (celda) => {
    const lectura = leerDecimal(celda);
    if (!lectura.ok) return lectura;
    const valor = Number(lectura.valor.toString());
    return valor > 5 ? ({ ok: false, mensaje: 'Debe estar entre 0 y 5' } as const) : ({ ok: true, valor } as const);
  });

  if (l.errores.length > 0 || documento === undefined || tema === undefined || fechaProgramada === undefined) {
    return { datos: null, errores: l.errores };
  }
  return { datos: { documento, tema, fechaProgramada, firmo: firmo === true, calificacion }, errores: [] };
}
