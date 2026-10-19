import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { abrirSoporteMovimiento, anularMovimiento, obtenerMovimiento, type Movimiento } from '../lib/api'
import { formatearCOP, formatearFecha } from '../lib/formato'
import { PERMISOS } from '../lib/permisos'

const ETIQUETA_MEDIO_PAGO: Record<Movimiento['medioPago'], string> = {
  EFECTIVO: 'Efectivo',
  CONSIGNACION: 'Consignación',
  TRANSFERENCIA: 'Transferencia',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  CHEQUE: 'Cheque',
  TARJETA: 'Tarjeta',
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  if (!valor) return null
  return (
    <div>
      <dt className="text-xs text-slate-500">{etiqueta}</dt>
      <dd className="text-sm text-slate-900">{valor}</dd>
    </div>
  )
}

export function MovimientoDetallePage() {
  const { id } = useParams<{ id: string }>()
  const { tiene } = useAuth()
  const [movimiento, setMovimiento] = useState<Movimiento | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [anulando, setAnulando] = useState(false)

  useEffect(() => {
    if (!id) return
    obtenerMovimiento(id)
      .then(setMovimiento)
      .catch((err: Error) => setError(err.message))
  }, [id])

  async function handleSoporte() {
    if (!movimiento) return
    setError(null)
    try {
      await abrirSoporteMovimiento(movimiento.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el soporte')
    }
  }

  // Anular (solo gerente): el movimiento se conserva, marcado con el motivo, y deja de sumar en los totales.
  async function handleAnular() {
    if (!movimiento) return
    const motivo = window.prompt(
      `Anular ${movimiento.tipo === 'GASTO' ? 'el egreso' : 'el ingreso'} por ${formatearCOP(movimiento.valor)}.\nQuedará marcado como ANULADO y dejará de sumar en los totales.\n\nMotivo (queda registrado):`,
    )?.trim()
    if (!motivo) return
    if (motivo.length < 5) {
      setError('Explica el motivo de la anulación (mínimo 5 caracteres).')
      return
    }
    setAnulando(true)
    setError(null)
    try {
      setMovimiento(await anularMovimiento(movimiento.id, motivo))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular el movimiento')
    } finally {
      setAnulando(false)
    }
  }

  if (error && !movimiento) {
    return <p className="text-sm text-red-600">{error}</p>
  }
  if (!movimiento) {
    return <p className="text-sm text-slate-500">Cargando movimiento...</p>
  }

  const anulado = movimiento.estado === 'ANULADO'
  const esGasto = movimiento.tipo === 'GASTO'

  return (
    <div className="max-w-xl">
      <Link to="/finanzas" className="text-sm text-blue-600 hover:underline">
        ← Finanzas
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-900">{esGasto ? 'Egreso' : 'Ingreso'}</h1>
          <p className="text-sm text-slate-500">{movimiento.descripcion}</p>
        </div>
        <div className="text-right">
          <p className={`text-xl font-semibold ${anulado ? 'text-slate-400 line-through' : esGasto ? 'text-red-700' : 'text-green-700'}`}>
            {formatearCOP(movimiento.valor)}
          </p>
          {anulado && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">ANULADO</span>}
        </div>
      </div>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {anulado && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Anulado{movimiento.anuladoPor ? ` por ${movimiento.anuladoPor.nombre}` : ''}
          {movimiento.anuladoEn ? ` el ${formatearFecha(movimiento.anuladoEn)}` : ''}: {movimiento.motivoAnulacion}
        </div>
      )}

      <dl className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <Dato etiqueta="Fecha" valor={formatearFecha(movimiento.fecha)} />
        <Dato etiqueta="Categoría" valor={movimiento.categoria?.nombre} />
        <Dato etiqueta="Proyecto" valor={movimiento.proyecto?.nombre ?? 'General de la empresa'} />
        <Dato etiqueta="Equipo" valor={movimiento.equipo ? `${movimiento.equipo.nombre}${movimiento.equipo.placaSerie ? ` · ${movimiento.equipo.placaSerie}` : ''}` : movimiento.flota ? 'General de la flota' : null} />
        <Dato etiqueta="Período alquilado" valor={movimiento.periodoDesde && movimiento.periodoHasta ? `${movimiento.periodoDesde.split('-').reverse().join('/')} al ${movimiento.periodoHasta.split('-').reverse().join('/')}` : null} />
        <Dato etiqueta="Medio de pago" valor={ETIQUETA_MEDIO_PAGO[movimiento.medioPago]} />
        <Dato etiqueta={esGasto ? 'Cuenta de salida' : 'Cuenta de entrada'} valor={movimiento.cuenta ? `${movimiento.cuenta.alias} — ${movimiento.cuenta.banco}` : null} />
        <Dato etiqueta="Referencia" valor={movimiento.referencia} />
        <Dato etiqueta={esGasto ? 'Proveedor' : 'Cliente'} valor={movimiento.terceroNombre} />
        <Dato etiqueta="Documento o NIT" valor={movimiento.terceroDocumento} />
        <Dato etiqueta="Factura o recibo" valor={movimiento.numeroDocumento} />
        <Dato etiqueta="Registrado por" valor={movimiento.registradoPor?.nombre} />
      </dl>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        {movimiento.tieneSoporte ? (
          <button type="button" onClick={() => void handleSoporte()} className="font-medium text-blue-600 hover:underline">
            Ver soporte
          </button>
        ) : (
          <p className="text-slate-600">
            Sin soporte adjunto{movimiento.motivoSinSoporte ? `: ${movimiento.motivoSinSoporte}` : '.'}
          </p>
        )}
      </div>

      {movimiento.equipo && (
        <p className="mt-3 text-sm">
          <Link to={`/equipos/${movimiento.equipo.id}`} className="text-blue-600 hover:underline">
            Ver la ficha del equipo
          </Link>
        </p>
      )}

      {movimiento.ventaId && (
        <p className="mt-3 text-sm">
          <Link to={`/ventas/${movimiento.ventaId}`} className="text-blue-600 hover:underline">
            Ver la venta de este desistimiento
          </Link>
        </p>
      )}

      {!anulado && tiene(PERMISOS.FINANZAS_ANULAR) && (
        <button
          type="button"
          disabled={anulando}
          onClick={() => void handleAnular()}
          className="mt-6 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {anulando ? 'Anulando...' : 'Anular'}
        </button>
      )}
    </div>
  )
}
