// Ayudas de la pantalla "Liquidar quincena" (CC-05). Son funciones puras, sin pantalla: calculan lo que se muestra mientras se
// llena la planilla. El servidor repite y valida todo: lo que se guarda es lo que él calcula.

// Fechas calendario "aaaa-mm-dd". Se trabaja con las partes del texto para no depender de la zona horaria del navegador.
const aPartes = (iso: string) => {
  const [anio, mes, dia] = iso.split('-').map(Number)
  return { anio, mes, dia }
}
const aISO = (anio: number, mes: number, dia: number) => `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
const ultimoDiaDelMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate()

export interface Periodo {
  inicio: string
  fin: string
}

// La quincena que contiene un día: del 1 al 15 o del 16 al fin de mes. Es la misma definición provisional del cierre de caja
// (backend/src/cierres-caja/periodo.ts); en la pantalla las fechas se pueden cambiar a mano.
export function quincenaDe(fechaISO: string): Periodo {
  const { anio, mes, dia } = aPartes(fechaISO)
  return dia <= 15 ? { inicio: aISO(anio, mes, 1), fin: aISO(anio, mes, 15) } : { inicio: aISO(anio, mes, 16), fin: aISO(anio, mes, ultimoDiaDelMes(anio, mes)) }
}

// La quincena inmediatamente anterior a la que contiene el día dado.
export function quincenaAnterior(fechaISO: string): Periodo {
  const { anio, mes, dia } = aPartes(fechaISO)
  if (dia > 15) return { inicio: aISO(anio, mes, 1), fin: aISO(anio, mes, 15) }
  const mesAnterior = mes === 1 ? 12 : mes - 1
  const anioAnterior = mes === 1 ? anio - 1 : anio
  return { inicio: aISO(anioAnterior, mesAnterior, 16), fin: aISO(anioAnterior, mesAnterior, ultimoDiaDelMes(anioAnterior, mesAnterior)) }
}

// La quincena más reciente que ya terminó: la de hoy si hoy es su último día o ya pasó, y si no, la anterior. Es la que se
// liquida normalmente.
export function ultimaQuincenaTerminada(hoyISO: string): Periodo {
  const actual = quincenaDe(hoyISO)
  return hoyISO >= actual.fin ? actual : quincenaAnterior(hoyISO)
}

// Días calendario de un período, contando el primero y el último; 0 si las fechas no sirven.
export function diasDelPeriodo(inicio: string, fin: string): number {
  if (!inicio || !fin) return 0
  const a = aPartes(inicio)
  const b = aPartes(fin)
  const dias = Math.round((Date.UTC(b.anio, b.mes - 1, b.dia) - Date.UTC(a.anio, a.mes - 1, a.dia)) / 86_400_000) + 1
  return Number.isFinite(dias) && dias > 0 ? dias : 0
}

// "7,5" y "7.5" significan lo mismo para quien escribe en Colombia. Devuelve 0 si no es un número.
export function aNumeroLiquidacion(texto: string): number {
  const numero = Number(texto.trim().replace(',', '.'))
  return Number.isFinite(numero) && numero > 0 ? numero : 0
}

// Los pesos se redondean al peso más cercano (la mitad hacia arriba), como en el servidor. El `toFixed` evita que un resto de
// punto flotante (27900,000000000004) cambie el redondeo.
const aPesos = (valor: number) => Math.round(Number(valor.toFixed(6)))

export interface EntradaFila {
  dias: number
  valorDia: number
  horasExtra: number
  valorHoraExtra: number
  anticipo: number
  descuento: number
}

export interface ResultadoFila {
  valorDias: number
  valorHorasExtra: number
  /** Días más horas extra: el costo que se carga a la obra. */
  devengado: number
  /** Lo que sale de caja: el devengado menos anticipo y descuento. */
  neto: number
}

export function calcularFila(entrada: EntradaFila): ResultadoFila {
  const valorDias = aPesos(entrada.dias * entrada.valorDia)
  const valorHorasExtra = aPesos(entrada.horasExtra * entrada.valorHoraExtra)
  const devengado = valorDias + valorHorasExtra
  return { valorDias, valorHorasExtra, devengado, neto: devengado - entrada.anticipo - entrada.descuento }
}
