import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CorregirPagoForm } from '../components/nomina/CorregirPagoForm'
import { Aviso, Seccion } from '../components/formulario'
import { useAuth } from '../contexts/AuthContext'
import { listarCuentasActivas, listarMediosPago, listarPagosNomina, type CuentaBancaria, type MedioPagoConfig, type PagoNomina } from '../lib/api'
import { formatearCOP, formatearFecha } from '../lib/formato'
import { diasDelPeriodo } from '../lib/liquidacion'
import { PERMISOS } from '../lib/permisos'

const ETIQUETA_NOVEDAD: Record<string, string> = {
  HORAS_EXTRA: 'Horas extra',
  DESCUENTO: 'Descuento',
  INCAPACIDAD: 'Incapacidad',
  ANTICIPO: 'Anticipo',
}

// "2031-05-01" -> "01/05/2031" sin pasar por Date: una fecha sola se leería como UTC y saldría un día antes.
const diaMesAnio = (iso: string) => iso.split('-').reverse().join('/')

// Una liquidación ya hecha (una obra y una quincena): sus pagos y, para quien liquida la nómina, la corrección de cada uno
// (CC-09, RF-PER-26).
export function LiquidacionDetallePage() {
  const { tiene } = useAuth()
  const { proyectoId, inicio, fin } = useParams<{ proyectoId: string; inicio: string; fin: string }>()
  const [pagos, setPagos] = useState<PagoNomina[]>([])
  const [mediosPago, setMediosPago] = useState<MedioPagoConfig[]>([])
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [corrigiendo, setCorrigiendo] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const puedeCorregir = tiene(PERMISOS.NOMINA_GESTIONAR)

  const cargar = useCallback(() => {
    if (!proyectoId || !inicio || !fin) return
    listarPagosNomina({ proyectoId, periodoInicio: inicio, periodoFin: fin })
      .then((datos) => {
        setPagos([...datos].sort((a, b) => a.trabajador.nombre.localeCompare(b.trabajador.nombre, 'es')))
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setCargando(false))
  }, [proyectoId, inicio, fin])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    Promise.all([listarMediosPago(), listarCuentasActivas().catch(() => [] as CuentaBancaria[])])
      .then(([medios, cuentasActivas]) => {
        setMediosPago(medios.filter((m) => m.activo))
        setCuentas(cuentasActivas)
      })
      .catch(() => undefined)
  }, [])

  const obra = pagos[0]?.proyecto?.nombre ?? 'la obra'
  const devengado = pagos.reduce((suma, p) => suma + Number(p.valorDevengado ?? p.valorPagado), 0)
  const pagado = pagos.reduce((suma, p) => suma + Number(p.valorPagado), 0)
  const etiquetaMedio = (medio?: string) => mediosPago.find((m) => m.medio === medio)?.etiqueta ?? medio ?? '—'
  const diasPeriodo = inicio && fin ? diasDelPeriodo(inicio, fin) : 0
  const paramsLiquidar = new URLSearchParams({ obra: proyectoId ?? '', desde: inicio ?? '', hasta: fin ?? '' }).toString()

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <Link to="/nomina/liquidaciones" className="text-sm text-blue-600 hover:underline">
          ← Liquidaciones
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">{cargando ? 'Liquidación' : `Liquidación de ${obra}`}</h1>
        {inicio && fin && (
          <p className="text-sm text-slate-500">
            Quincena del {diaMesAnio(inicio)} al {diaMesAnio(fin)}
          </p>
        )}
      </div>

      <Aviso error={error} ok={aviso} />
      {avisos.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Para revisar (no impidieron guardar):</p>
          <ul className="mt-1 list-disc pl-5">
            {avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <Seccion
        titulo="Pagos de esta liquidación"
        descripcion={`${pagos.length} trabajador(es) · Devengado (costo de la obra): ${formatearCOP(devengado)} · Pagado: ${formatearCOP(pagado)}`}
        acciones={
          puedeCorregir ? (
            <Link to={`/nomina/liquidar?${paramsLiquidar}`} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Agregar un trabajador que faltó
            </Link>
          ) : undefined
        }
      >
        {!cargando && pagos.length === 0 && !error && <p className="text-sm text-slate-400">No hay pagos en esta liquidación.</p>}
        <ul className="space-y-3">
          {pagos.map((pago) => (
            <li key={pago.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link to={`/trabajadores/${pago.trabajador.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                    {pago.trabajador.nombre}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {pago.trabajador.cargo} · {pago.trabajador.documento}
                  </p>
                </div>
                {puedeCorregir && corrigiendo !== pago.id && (
                  <button
                    type="button"
                    onClick={() => {
                      setCorrigiendo(pago.id)
                      setAviso(null)
                      setAvisos([])
                    }}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Corregir
                  </button>
                )}
              </div>

              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-slate-500">Días × valor día</dt>
                  <dd className="text-slate-900">
                    {Number(pago.dias ?? 0)} × {formatearCOP(pago.valorDia ?? 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Horas extra</dt>
                  <dd className="text-slate-900">{Number(pago.horasExtra ?? 0) > 0 ? `${Number(pago.horasExtra)} × ${formatearCOP(pago.valorHoraExtra ?? 0)}` : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Devengado</dt>
                  <dd className="text-slate-900">{formatearCOP(pago.valorDevengado ?? pago.valorPagado)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Pagado</dt>
                  <dd className="font-medium text-slate-900">{formatearCOP(pago.valorPagado)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Novedades</dt>
                  <dd className="text-slate-900">
                    {pago.novedades.length === 0 ? '—' : pago.novedades.map((n) => `${ETIQUETA_NOVEDAD[n.tipo] ?? n.tipo}: ${formatearCOP(n.valor)}`).join(' · ')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Fecha de pago</dt>
                  <dd className="text-slate-900">{formatearFecha(pago.fechaPago)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Medio de pago</dt>
                  <dd className="text-slate-900">{etiquetaMedio(pago.medioPago)}</dd>
                </div>
                {pago.observaciones && (
                  <div>
                    <dt className="text-xs text-slate-500">Observaciones</dt>
                    <dd className="text-slate-900">{pago.observaciones}</dd>
                  </div>
                )}
              </dl>

              {corrigiendo === pago.id && (
                <CorregirPagoForm
                  pago={pago}
                  diasPeriodo={diasPeriodo}
                  mediosPago={mediosPago}
                  cuentas={cuentas}
                  onCancelar={() => setCorrigiendo(null)}
                  onGuardado={(avisosNuevos) => {
                    setCorrigiendo(null)
                    setAviso(`Se corrigió el pago de ${pago.trabajador.nombre}.`)
                    setAvisos(avisosNuevos)
                    cargar()
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      </Seccion>
    </div>
  )
}
