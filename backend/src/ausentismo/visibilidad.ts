import { PERMISOS } from '../auth/permisos.js';

// Quién ve qué de un ausentismo (RF-USR-11, RNF-LEG-03, RNF-SEG-08). Hay dos clases de datos delicados y cada una tiene su
// permiso, independiente del otro:
//  - los datos de salud (el diagnóstico CIE-10, las observaciones y el certificado adjunto): sst.diagnosticos_ver;
//  - los valores (salario, valor diario, lo que paga cada entidad y los recobros): sst.valores_ver.
// Todo lo que sale hacia una pantalla, un Excel o un PDF debe pasar por aquí: el servidor quita lo que el rol no puede ver,
// no la pantalla. Los días de cada pagador no son valores y los ven todos los que usan el módulo.

export interface VistaAusentismo {
  verDiagnosticos: boolean;
  verValores: boolean;
}

export function vistaDe(usuario: { permisos: readonly string[] }): VistaAusentismo {
  return {
    verDiagnosticos: usuario.permisos.includes(PERMISOS.SST_DIAGNOSTICOS_VER),
    verValores: usuario.permisos.includes(PERMISOS.SST_VALORES_VER),
  };
}

const CAMPOS_DE_SALUD = ['diagnosticoId', 'diagnostico', 'observaciones', 'documentos'] as const;
const CAMPOS_DE_VALORES = ['salarioFoto', 'baseDiaria', 'pisoDiario', 'parametrosLiquidacion', 'liquidacionCalculada', 'motivoCorreccion'] as const;
const VALORES_DEL_PERIODO = ['valorEmpleador', 'valorEps', 'valorArl', 'valorAfp', 'valorDescuento'] as const;
const CAMPOS_DEL_RECOBRO_CON_VALORES = ['valorReconocido', 'observaciones'] as const;

type Objeto = Record<string, unknown>;

function sin(objeto: Objeto, campos: readonly string[]): Objeto {
  const copia: Objeto = { ...objeto };
  for (const campo of campos) {
    delete copia[campo];
  }
  return copia;
}

function conListaSin(objeto: Objeto, campo: string, quitar: readonly string[]): Objeto {
  const lista = objeto[campo];
  return Array.isArray(lista) ? { ...objeto, [campo]: lista.map((elemento) => sin(elemento as Objeto, quitar)) } : objeto;
}

// Deja en un ausentismo (tal como lo devuelve la base de datos, con sus relaciones) solo lo que esta vista puede ver.
export function presentarAusentismo(registro: Objeto, vista: VistaAusentismo): Objeto {
  let resultado: Objeto = { ...registro };
  if (!vista.verDiagnosticos) {
    resultado = sin(resultado, CAMPOS_DE_SALUD);
    // El conteo de certificados adjuntos también delata que hay uno.
    const conteo = resultado._count;
    if (conteo && typeof conteo === 'object') {
      resultado._count = sin(conteo as Objeto, ['documentos']);
    }
  }
  if (!vista.verValores) {
    resultado = sin(resultado, CAMPOS_DE_VALORES);
    resultado = conListaSin(resultado, 'periodos', VALORES_DEL_PERIODO);
    resultado = conListaSin(resultado, 'recobros', CAMPOS_DEL_RECOBRO_CON_VALORES);
    const totales = resultado.totales;
    if (totales && typeof totales === 'object') {
      resultado.totales = sin(totales as Objeto, VALORES_DEL_PERIODO);
    }
  }
  return resultado;
}

// Una fila de la lista de recobros: lo que se espera cobrar y lo reconocido son valores, y las observaciones pueden decir
// cuánto pagó o rechazó la entidad.
export function presentarRecobro(fila: Objeto, vista: VistaAusentismo): Objeto {
  return vista.verValores ? { ...fila } : sin(fila, ['valorEsperado', 'valorReconocido', 'observaciones']);
}

// El resumen mensual: los días y los registros los ven todos los que usan el módulo; los valores, quien puede ver valores.
export function presentarResumen<T extends { meses: readonly object[]; total: object }>(resumen: T, vista: VistaAusentismo): T {
  if (vista.verValores) {
    return resumen;
  }
  return { ...resumen, meses: resumen.meses.map((mes) => sin(mes as Objeto, ['valores'])), total: sin(resumen.total as Objeto, ['valores']) };
}
