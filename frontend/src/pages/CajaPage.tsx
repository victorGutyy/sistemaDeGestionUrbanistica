import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  crearCierre,
  listarCierres,
  obtenerProximoCierre,
  type CierreCaja,
  type ProximoCierre,
  type TipoCierre,
} from '../lib/api'
import { CLASE_ESTADO_CIERRE, ETIQUETA_ESTADO_CIERRE, ETIQUETA_TIPO_CIERRE, diaDeCierre as dia } from '../lib/cierres'
import { formatearCOP, formatearFecha, hoyEnBogota } from '../lib/formato'
import { PERMISOS } from '../lib/permisos'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

export function CajaPage() {
  const { tiene } = useAuth()
  const navigate = useNavigate()
  const puedeCerrar = tiene(PERMISOS.CAJA_CERRAR)

  const [cierres, setCierres] = useState<CierreCaja[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Nuevo cierre
  const [tipo, setTipo] = useState<TipoCierre>('SEMANAL')
  const [proximo, setProximo] = useState<ProximoCierre | null>(null)
  const [desde, setDesde] = useState('')
  const [efectivoInicial, setEfectivoInicial] = useState('')
  const [creando, setCreando] = useState(false)

  const recargar = useCallback(() => {
    listarCierres()
      .then(setCierres)
      .catch((err: Error) => setError(err.message))
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  useEffect(() => {
    if (!puedeCerrar) return
    let vigente = true
    obtenerProximoCierre(tipo)
      .then((recibido) => vigente && setProximo(recibido))
      .catch((err: Error) => vigente && setError(err.message))
    return () => {
      vigente = false
    }
  }, [tipo, puedeCerrar, cierres])

  async function handleCrear(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setCreando(true)
    try {
      const creado = await crearCierre({
        tipo,
        ...(proximo?.esPrimero ? { desde, efectivoInicial } : {}),
      })
      navigate(`/caja/${creado.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el cierre')
    } finally {
      setCreando(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold text-slate-900">Cierres de caja</h1>
      <p className="text-sm text-slate-500">
        Resumen de lo que entró y salió de la caja de la empresa en cada período, con el conteo del efectivo y la aprobación del gerente.
      </p>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {puedeCerrar && proximo && (
        <form onSubmit={handleCrear} className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Nuevo cierre</h2>

          <div>
            <label htmlFor="tipo" className="block text-sm font-medium text-slate-700">
              Tipo
            </label>
            <select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCierre)} className={CLASE_INPUT}>
              <option value="DIARIO">Diario</option>
              <option value="SEMANAL">Semanal (lunes a domingo)</option>
              <option value="QUINCENAL">Quincenal (1 al 15 y 16 al fin de mes)</option>
            </select>
          </div>

          {proximo.esPrimero ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Es el primer cierre de caja de la empresa: indica desde qué día empieza y cuánto efectivo hay en la caja ese día. Los siguientes empiezan
                solos el día después del anterior.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="desde" className="block text-sm font-medium text-slate-700">
                    Empieza el
                  </label>
                  <input id="desde" required type="date" max={hoyEnBogota()} value={desde} onChange={(e) => setDesde(e.target.value)} className={CLASE_INPUT} />
                </div>
                <div>
                  <label htmlFor="efectivoInicial" className="block text-sm font-medium text-slate-700">
                    Efectivo en la caja ese día (pesos)
                  </label>
                  <input
                    id="efectivoInicial"
                    required
                    inputMode="numeric"
                    value={efectivoInicial}
                    onChange={(e) => setEfectivoInicial(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))}
                    className={CLASE_INPUT}
                  />
                  {efectivoInicial && <p className="mt-1 text-xs text-slate-500">{formatearCOP(efectivoInicial)}</p>}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {proximo.desde && proximo.hasta ? (
                <p>
                  Cubrirá del <span className="font-medium">{dia(proximo.desde)}</span> al <span className="font-medium">{dia(proximo.hasta)}</span>, con{' '}
                  <span className="font-medium">{formatearCOP(proximo.efectivoInicial)}</span> de efectivo inicial (lo contado en el cierre anterior).
                </p>
              ) : (
                <p>Empieza el {proximo.desde ? dia(proximo.desde) : '—'}.</p>
              )}
            </div>
          )}

          {proximo.motivo && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{proximo.motivo}</p>}

          <button
            type="submit"
            disabled={creando || !proximo.puedeCrear}
            className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto sm:py-2"
          >
            {creando ? 'Generando...' : 'Generar cierre'}
          </button>
        </form>
      )}

      <h2 className="mt-8 text-sm font-semibold text-slate-900">Cierres anteriores</h2>
      <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {cierres && cierres.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-400">Todavía no hay cierres de caja.</li>}
        {cierres?.map((cierre) => {
          const hayDiferencia = cierre.diferencia !== null && Number(cierre.diferencia) !== 0
          return (
            <li key={cierre.id}>
              <Link to={`/caja/${cierre.id}`} className="block px-4 py-3 text-sm hover:bg-slate-50">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {cierre.numeroTexto ?? 'Borrador'} · {ETIQUETA_TIPO_CIERRE[cierre.tipo]}
                    </p>
                    <p className="text-xs text-slate-500">
                      Del {dia(cierre.desde)} al {dia(cierre.hasta)}
                      {cierre.cerradoEn ? ` · Cerrado el ${formatearFecha(cierre.cerradoEn)}` : ''}
                    </p>
                    {cierre.efectivoContado !== null && (
                      <p className={`text-xs ${hayDiferencia ? 'font-medium text-red-700' : 'text-slate-500'}`}>
                        Contado {formatearCOP(cierre.efectivoContado)}
                        {hayDiferencia ? ` · Diferencia ${formatearCOP(cierre.diferencia)}` : ' · Sin diferencia'}
                      </p>
                    )}
                  </div>
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_ESTADO_CIERRE[cierre.estado]}`}>
                    {ETIQUETA_ESTADO_CIERRE[cierre.estado]}
                  </span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
