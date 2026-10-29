import { useState, type FormEvent } from 'react'
import { corregirLiquidacionAusentismo, type AusentismoDetalle, type PeriodoAusentismo, type PeriodoCorregidoPayload } from '../../lib/api'
import { etiquetaMes, etiquetaMesTitulo } from '../../lib/ausentismo'
import { formatearCOP, formatearFecha } from '../../lib/formato'
import { formatearPorcentaje, pesosATexto } from '../../lib/seguridadSocial'
import { Aviso, CLASE_BOTON, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Insignia } from '../formulario'

const CAMPOS_DIAS = ['diasEmpleador', 'diasEps', 'diasArl', 'diasAfp', 'diasLaborados', 'diasDescuento'] as const
const CAMPOS_VALORES = ['valorEmpleador', 'valorEps', 'valorArl', 'valorAfp', 'valorDescuento'] as const
const ROTULO_DIAS: Record<(typeof CAMPOS_DIAS)[number], string> = {
  diasEmpleador: 'Empleador',
  diasEps: 'EPS',
  diasArl: 'ARL',
  diasAfp: 'AFP',
  diasLaborados: 'Laborados',
  diasDescuento: 'Descontar',
}
const ROTULO_VALOR: Record<(typeof CAMPOS_VALORES)[number], string> = {
  valorEmpleador: 'Empleador',
  valorEps: 'EPS',
  valorArl: 'ARL',
  valorAfp: 'AFP',
  valorDescuento: 'A descontar',
}

interface Props {
  ausentismo: AusentismoDetalle
  // Corregir exige gestionar y poder ver valores (el servidor lo vuelve a exigir).
  puedeCorregir: boolean
  onCambio: (ausentismo: AusentismoDetalle) => void
}

type Borrador = Record<string, string>
const clave = (p: PeriodoAusentismo, campo: string) => `${p.anio}-${p.mes}-${campo}`

function borradorDe(periodos: PeriodoAusentismo[]): Borrador {
  const borrador: Borrador = {}
  for (const p of periodos) {
    for (const campo of CAMPOS_DIAS) borrador[clave(p, campo)] = String(p[campo])
    for (const campo of CAMPOS_VALORES) borrador[clave(p, campo)] = String(Number(p[campo] ?? 0))
  }
  return borrador
}

// La liquidación de apoyo de un ausentismo (RF-SST-04 a 06 y 08): por mes, los días y el valor que le toca a cada pagador. Los
// días los ve todo el que usa el módulo; los valores, solo quien puede verlos. Se puede corregir a mano con un motivo (por
// ejemplo, lo que la EPS reconoció): el cálculo original queda guardado y la auditoría conserva el antes y el después.
export function LiquidacionAusentismo({ ausentismo, puedeCorregir, onCambio }: Props) {
  const { periodos, parametrosLiquidacion: parametros } = ausentismo
  const conValores = ausentismo.baseDiaria !== undefined
  const [corrigiendo, setCorrigiendo] = useState(false)
  const [borrador, setBorrador] = useState<Borrador>({})
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = (campo: (typeof CAMPOS_DIAS)[number] | (typeof CAMPOS_VALORES)[number]) => periodos.reduce((suma, p) => suma + Number((p as unknown as Record<string, string | number | undefined>)[campo] ?? 0), 0)

  function empezar() {
    setBorrador(borradorDe(periodos))
    setMotivo('')
    setError(null)
    setCorrigiendo(true)
  }

  // Los días de cada pagador deben seguir sumando los del mes: se avisa antes de enviar.
  const sumaDias = (p: PeriodoAusentismo) => CAMPOS_DIAS.reduce((suma, campo) => suma + (Number(borrador[clave(p, campo)]) || 0), 0)

  async function guardar(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const descuadrado = periodos.find((p) => sumaDias(p) !== p.dias)
    if (descuadrado) {
      setError(`Los días de cada pagador en ${etiquetaMes(descuadrado.anio, descuadrado.mes)} deben sumar ${descuadrado.dias}`)
      return
    }
    setEnviando(true)
    try {
      const payload: PeriodoCorregidoPayload[] = periodos.map((p) => ({
        anio: p.anio,
        mes: p.mes,
        diasEmpleador: Number(borrador[clave(p, 'diasEmpleador')]) || 0,
        diasEps: Number(borrador[clave(p, 'diasEps')]) || 0,
        diasArl: Number(borrador[clave(p, 'diasArl')]) || 0,
        diasAfp: Number(borrador[clave(p, 'diasAfp')]) || 0,
        diasLaborados: Number(borrador[clave(p, 'diasLaborados')]) || 0,
        diasDescuento: Number(borrador[clave(p, 'diasDescuento')]) || 0,
        valorEmpleador: pesosATexto(borrador[clave(p, 'valorEmpleador')] || '0'),
        valorEps: pesosATexto(borrador[clave(p, 'valorEps')] || '0'),
        valorArl: pesosATexto(borrador[clave(p, 'valorArl')] || '0'),
        valorAfp: pesosATexto(borrador[clave(p, 'valorAfp')] || '0'),
        valorDescuento: pesosATexto(borrador[clave(p, 'valorDescuento')] || '0'),
      }))
      onCambio(await corregirLiquidacionAusentismo(ausentismo.id, motivo.trim(), payload))
      setCorrigiendo(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo corregir la liquidación')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-4">
      {conValores && parametros && !parametros.parametrosValidados && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Los parámetros legales de {parametros.anio} todavía no estaban validados por el asesor laboral cuando se liquidó: tómalo como una cifra provisional. Esta es una liquidación de apoyo, no la nómina.
        </div>
      )}
      {conValores && parametros && (
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Valor diario</dt>
            <dd>{formatearCOP(ausentismo.baseDiaria)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Mínimo diario</dt>
            <dd>{formatearCOP(ausentismo.pisoDiario)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Parámetros de</dt>
            <dd>{parametros.anio}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Porcentajes (1.er tramo / 2.º / laboral)</dt>
            <dd>
              {formatearPorcentaje(parametros.porcentajeTramo1, 2)} / {formatearPorcentaje(parametros.porcentajeTramo2, 2)} / {formatearPorcentaje(parametros.porcentajeLaboral, 2)}
            </dd>
          </div>
        </dl>
      )}

      {ausentismo.corregida && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Insignia tono="azul">Corregida a mano</Insignia>{' '}
          {ausentismo.corregidaPor && `Por ${ausentismo.corregidaPor.nombre}`}
          {ausentismo.corregidaEn && ` el ${formatearFecha(ausentismo.corregidaEn)}`}
          {ausentismo.motivoCorreccion && `: ${ausentismo.motivoCorreccion}`}
          {!ausentismo.motivoCorreccion && '. El cálculo original sigue guardado.'}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Mes</th>
              <th className="px-3 py-2 text-right font-medium">Días</th>
              {CAMPOS_DIAS.map((campo) => (
                <th key={campo} className="px-3 py-2 text-right font-medium">
                  {ROTULO_DIAS[campo]}
                </th>
              ))}
              {conValores && <th className="px-3 py-2 text-right font-medium">Valores</th>}
            </tr>
          </thead>
          <tbody>
            {periodos.map((p) => (
              <tr key={`${p.anio}-${p.mes}`} className="border-b border-slate-100 align-top">
                <td className="px-3 py-2">{etiquetaMesTitulo(p.anio, p.mes)}</td>
                <td className="px-3 py-2 text-right">{p.dias}</td>
                {CAMPOS_DIAS.map((campo) => (
                  <td key={campo} className="px-3 py-2 text-right">
                    {p[campo] > 0 ? p[campo] : <span className="text-slate-300">0</span>}
                  </td>
                ))}
                {conValores && (
                  <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-slate-700">
                    {CAMPOS_VALORES.filter((campo) => Number(p[campo] ?? 0) > 0).map((campo) => (
                      <p key={campo}>
                        {ROTULO_VALOR[campo]} {formatearCOP(p[campo])}
                      </p>
                    ))}
                    {CAMPOS_VALORES.every((campo) => Number(p[campo] ?? 0) === 0) && '—'}
                  </td>
                )}
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold text-slate-900">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right">{periodos.reduce((suma, p) => suma + p.dias, 0)}</td>
              {CAMPOS_DIAS.map((campo) => (
                <td key={campo} className="px-3 py-2 text-right">
                  {total(campo)}
                </td>
              ))}
              {conValores && (
                <td className="whitespace-nowrap px-3 py-2 text-right text-xs">
                  {CAMPOS_VALORES.filter((campo) => total(campo) > 0).map((campo) => (
                    <p key={campo}>
                      {ROTULO_VALOR[campo]} {formatearCOP(total(campo))}
                    </p>
                  ))}
                </td>
              )}
            </tr>
          </tbody>
        </table>
      </div>

      {puedeCorregir && !corrigiendo && (
        <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={empezar}>
          Corregir la liquidación
        </button>
      )}

      {puedeCorregir && corrigiendo && (
        <form onSubmit={guardar} className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-3 sm:p-4">
          <p className="text-sm text-slate-700">
            Cambia los días de cada pagador (deben seguir sumando los del mes) y los valores. Escribe el motivo: por ejemplo, lo que la EPS reconoció. El cálculo original no se pierde.
          </p>
          <Aviso error={error} />
          {periodos.map((p) => (
            <div key={`${p.anio}-${p.mes}`} className="space-y-2">
              <p className="text-sm font-medium text-slate-800">
                {etiquetaMesTitulo(p.anio, p.mes)} <span className="font-normal text-slate-500">({p.dias} {p.dias === 1 ? 'día' : 'días'}; van {sumaDias(p)})</span>
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {CAMPOS_DIAS.map((campo) => (
                  <label key={campo} className="block text-xs text-slate-500">
                    Días {ROTULO_DIAS[campo].toLowerCase()}
                    <input inputMode="numeric" value={borrador[clave(p, campo)] ?? ''} onChange={(e) => setBorrador({ ...borrador, [clave(p, campo)]: e.target.value })} className={CLASE_INPUT} />
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {CAMPOS_VALORES.map((campo) => (
                  <label key={campo} className="block text-xs text-slate-500">
                    {ROTULO_VALOR[campo]} ($)
                    <input inputMode="numeric" value={borrador[clave(p, campo)] ?? ''} onChange={(e) => setBorrador({ ...borrador, [clave(p, campo)]: e.target.value })} className={CLASE_INPUT} />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <label className="block text-sm font-medium text-slate-700">
            Motivo de la corrección
            <input required minLength={5} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={CLASE_INPUT} />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={enviando} className={CLASE_BOTON}>
              {enviando ? 'Guardando…' : 'Guardar la corrección'}
            </button>
            <button type="button" onClick={() => setCorrigiendo(false)} className={CLASE_BOTON_SECUNDARIO}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
