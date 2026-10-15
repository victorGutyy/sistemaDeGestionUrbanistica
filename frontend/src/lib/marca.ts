// Aplica el color de la empresa a toda la interfaz.
//
// Las pantallas usan las clases de Tailwind "blue-*" (bg-blue-600, text-blue-700…),
// que por dentro leen variables CSS (--color-blue-600). En vez de reescribir cada
// clase, redefinimos esas variables a partir de UN solo color: el que el gerente
// elige en Configuración. Los tonos claros y oscuros se derivan mezclando con
// blanco o negro.

export const COLOR_PRIMARIO_POR_DEFECTO = '#2563eb'

const REGEX_COLOR = /^#[0-9a-fA-F]{6}$/

// Tonos que usa la app, como [variable, porcentaje del color base, color con el que se mezcla].
const TONOS: [numero: number, porcentajeBase: number, mezclarCon: 'white' | 'black' | null][] = [
  [50, 8, 'white'],
  [100, 16, 'white'],
  [200, 30, 'white'],
  [300, 50, 'white'],
  [400, 75, 'white'],
  [500, 90, 'white'],
  [600, 100, null],
  [700, 82, 'black'],
  [800, 66, 'black'],
  [900, 50, 'black'],
]

export function esColorValido(color: string) {
  return REGEX_COLOR.test(color)
}

export function aplicarColorPrimario(color: string) {
  const base = esColorValido(color) ? color : COLOR_PRIMARIO_POR_DEFECTO
  const estilo = document.documentElement.style
  for (const [numero, porcentaje, mezclarCon] of TONOS) {
    const valor = mezclarCon ? `color-mix(in srgb, ${base} ${porcentaje}%, ${mezclarCon})` : base
    estilo.setProperty(`--color-blue-${numero}`, valor)
  }
}
