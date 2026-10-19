import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  abrirEstadoCuentaCliente,
  actualizarCliente,
  obtenerFichaCliente,
  type DatosCliente,
  type FichaCliente,
  type TipoDocumento,
  type VentaFicha,
} from '../lib/api'
import { ESTILO_SEMAFORO, ETIQUETA_SEMAFORO, ETIQUETA_TIPO_DOCUMENTO, TIPOS_DOCUMENTO } from '../lib/clientes'
import { formatearCOP, formatearFecha } from '../lib/formato'
import { PERMISOS } from '../lib/permisos'
import { CLASE_ESTADO_VENTA, ETIQUETA_ESTADO_VENTA, etiquetaCuota } from '../lib/ventas'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
const BOTON_SECUNDARIO =
  'w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:w-auto sm:py-2'
const BOTON_PRIMARIO = 'w-full rounded-md bg-blue-600 px-4 py-3 text-center text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto sm:py-2'

function Dato({ etiqueta, valor, alerta }: { etiqueta: string; valor: string; alerta?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${alerta ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
      <p className="text-xs text-slate-500">{etiqueta}</p>
      <p className={`mt-1 text-base font-semibold ${alerta ? 'text-red-700' : 'text-slate-900'}`}>{valor}</p>
    </div>
  )
}

function TarjetaVenta({ venta, puedeAbonar }: { venta: VentaFicha; puedeAbonar: boolean }) {
  const lugar = `${venta.lote.proyecto}${venta.lote.manzana ? ` · Mz. ${venta.lote.manzana}` : ''} · Lote ${venta.lote.numero}`
  const { cartera } = venta

  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words font-medium text-slate-900">{lugar}</p>
        <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_ESTADO_VENTA[venta.estado]}`}>{ETIQUETA_ESTADO_VENTA[venta.estado]}</span>
      </div>
      <p className="text-xs text-slate-500">
        {venta.formaPago === 'CONTADO' ? 'De contado' : 'Financiada'} · vendida el {formatearFecha(venta.fechaVenta)}
      </p>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-slate-500">Valor total</dt>
        <dd className="text-right text-slate-900">{formatearCOP(venta.valorTotal)}</dd>
        <dt className="text-slate-500">Pagado</dt>
        <dd className="text-right text-slate-900">{formatearCOP(venta.pagado)}</dd>
        {venta.saldo !== null && (
          <>
            <dt className="font-medium text-slate-600">Saldo</dt>
            <dd className="text-right font-medium text-slate-900">{formatearCOP(venta.saldo)}</dd>
          </>
        )}
      </dl>

      {cartera && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-medium ${ESTILO_SEMAFORO[cartera.semaforo]}`}>{ETIQUETA_SEMAFORO[cartera.semaforo]}</span>
          {cartera.cuotasVencidas > 0 && (
            <span className="font-medium text-red-700">
              {cartera.cuotasVencidas} cuota{cartera.cuotasVencidas === 1 ? '' : 's'} vencida{cartera.cuotasVencidas === 1 ? '' : 's'} · {formatearCOP(cartera.saldoVencido)}
            </span>
          )}
          {cartera.proximaCuota && (
            <span className="text-slate-500">
              Próxima: {etiquetaCuota(cartera.proximaCuota.numero)} · {formatearFecha(cartera.proximaCuota.fechaVencimiento)} · {formatearCOP(cartera.proximaCuota.valor)}
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {venta.vigente && puedeAbonar && Number(venta.saldo) > 0 && (
          <Link to={`/ventas/${venta.id}/abonos/nuevo`} className={BOTON_PRIMARIO}>
            Registrar abono
          </Link>
        )}
        <Link to={`/ventas/${venta.id}`} className={`${BOTON_SECUNDARIO} text-center`}>
          Ver venta
        </Link>
      </div>
    </li>
  )
}

function FormularioEdicion({ cliente, onGuardado, onCancelar }: { cliente: DatosCliente; onGuardado: () => void; onCancelar: () => void }) {
  const [nombre, setNombre] = useState(cliente.nombre)
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>(cliente.tipoDocumento)
  const [telefono, setTelefono] = useState(cliente.telefono ?? '')
  const [email, setEmail] = useState(cliente.email ?? '')
  const [direccion, setDireccion] = useState(cliente.direccion ?? '')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setGuardando(true)
    try {
      await actualizarCliente(cliente.id, { nombre: nombre.trim(), tipoDocumento, telefono: telefono.trim(), email: email.trim(), direccion: direccion.trim() })
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-3">
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div>
        <label htmlFor="edit-nombre" className="block text-sm font-medium text-slate-700">
          Nombre completo
        </label>
        <input id="edit-nombre" required minLength={3} value={nombre} onChange={(e) => setNombre(e.target.value)} className={CLASE_INPUT} />
      </div>
      <div>
        <label htmlFor="edit-tipo" className="block text-sm font-medium text-slate-700">
          Tipo de documento
        </label>
        <select id="edit-tipo" value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value as TipoDocumento)} className={CLASE_INPUT}>
          {TIPOS_DOCUMENTO.map((tipo) => (
            <option key={tipo} value={tipo}>
              {ETIQUETA_TIPO_DOCUMENTO[tipo]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">El número de documento ({cliente.documento}) no se puede cambiar: es la identidad del cliente.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="edit-telefono" className="block text-sm font-medium text-slate-700">
            Teléfono
          </label>
          <input id="edit-telefono" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} className={CLASE_INPUT} />
        </div>
        <div>
          <label htmlFor="edit-email" className="block text-sm font-medium text-slate-700">
            Correo electrónico
          </label>
          <input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={CLASE_INPUT} />
        </div>
      </div>
      <div>
        <label htmlFor="edit-direccion" className="block text-sm font-medium text-slate-700">
          Dirección
        </label>
        <input id="edit-direccion" value={direccion} onChange={(e) => setDireccion(e.target.value)} className={CLASE_INPUT} />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={guardando} className={BOTON_PRIMARIO}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button type="button" onClick={onCancelar} disabled={guardando} className={BOTON_SECUNDARIO}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

// Ficha del cliente (RF-CLI-03): datos, autorización de datos (RF-CLI-04), resumen de cartera y sus ventas. Desde aquí
// se registra un abono (Clientes, ficha, Registrar abono: tres pasos, RNF-USA-02) y se abre el estado de cuenta en PDF.
export function ClienteDetallePage() {
  const { id } = useParams<{ id: string }>()
  const { tiene } = useAuth()
  const [ficha, setFicha] = useState<FichaCliente | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [confirmandoRetiro, setConfirmandoRetiro] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(() => {
    if (!id) return Promise.resolve()
    return obtenerFichaCliente(id)
      .then((recibida) => {
        setFicha(recibida)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [id])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function cambiarAutorizacion(autoriza: boolean) {
    if (!id) return
    setOcupado(true)
    setError(null)
    try {
      await actualizarCliente(id, { autorizaDatos: autoriza })
      setConfirmandoRetiro(false)
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la autorización')
    } finally {
      setOcupado(false)
    }
  }

  async function abrirPdf() {
    if (!id) return
    setError(null)
    try {
      await abrirEstadoCuentaCliente(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el estado de cuenta')
    }
  }

  if (error && !ficha) return <p className="text-sm text-red-600">{error}</p>
  if (!ficha) return <p className="text-sm text-slate-500">Cargando cliente…</p>

  const { cliente, resumen } = ficha
  const puedeEditar = tiene(PERMISOS.CLIENTES_EDITAR)
  const puedeAbonar = tiene(PERMISOS.ABONOS_REGISTRAR)
  const hayVencido = resumen.cuotasVencidas > 0

  return (
    <div className="max-w-3xl">
      <Link to="/clientes" className="text-sm text-blue-600 hover:underline">
        ← Clientes
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="break-words text-lg font-semibold text-slate-900">{cliente.nombre}</h1>
            {resumen.ventasVigentes > 0 && (
              <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${ESTILO_SEMAFORO[resumen.semaforo]}`}>{ETIQUETA_SEMAFORO[resumen.semaforo]}</span>
            )}
          </div>
          <p className="text-sm text-slate-500">
            {ETIQUETA_TIPO_DOCUMENTO[cliente.tipoDocumento]} {cliente.documento}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <button type="button" onClick={abrirPdf} className={BOTON_SECUNDARIO}>
            Estado de cuenta (PDF)
          </button>
        </div>
      </div>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato etiqueta="Total vendido" valor={formatearCOP(resumen.totalVendido)} />
        <Dato etiqueta="Total pagado" valor={formatearCOP(resumen.totalPagado)} />
        <Dato etiqueta="Saldo pendiente" valor={formatearCOP(resumen.saldo)} />
        <Dato etiqueta={`Vencido (${resumen.cuotasVencidas} cuota${resumen.cuotasVencidas === 1 ? '' : 's'})`} valor={formatearCOP(resumen.saldoVencido)} alerta={hayVencido} />
      </div>
      {hayVencido && (
        <p className="mt-2 text-sm text-slate-600">
          Interés de mora (informativo): <span className="font-medium text-slate-900">{ficha.moraConfigurada ? formatearCOP(resumen.interesMora) : 'sin tasa de mora definida'}</span>
          {!ficha.moraConfigurada && ' — el gerente la define en Configuración.'}
        </p>
      )}

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Datos de contacto</h2>
          {puedeEditar && !editando && (
            <button type="button" onClick={() => setEditando(true)} className="text-sm font-medium text-blue-600 hover:underline">
              Editar
            </button>
          )}
        </div>
        {editando ? (
          <div className="mt-3">
            <FormularioEdicion
              cliente={cliente}
              onCancelar={() => setEditando(false)}
              onGuardado={() => {
                setEditando(false)
                void cargar()
              }}
            />
          </div>
        ) : (
          <dl className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Teléfono</dt>
              <dd className="text-slate-900">{cliente.telefono ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Correo</dt>
              <dd className="break-words text-slate-900">{cliente.email ?? '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">Dirección</dt>
              <dd className="break-words text-slate-900">{cliente.direccion ?? '—'}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Autorización de tratamiento de datos</h2>
        {cliente.autorizaDatos ? (
          <p className="mt-1 text-sm text-green-700">
            Autorizó el {formatearFecha(cliente.fechaAutorizacion)}
            {cliente.autorizacionRegistradaPor ? ` (registrada por ${cliente.autorizacionRegistradaPor.nombre})` : ''}.
          </p>
        ) : (
          <p className="mt-1 text-sm text-amber-700">Todavía no hay una autorización registrada (Ley 1581 de 2012).</p>
        )}
        {puedeEditar && (
          <div className="mt-3">
            {!cliente.autorizaDatos ? (
              <button type="button" disabled={ocupado} onClick={() => void cambiarAutorizacion(true)} className={BOTON_SECUNDARIO}>
                Registrar autorización
              </button>
            ) : !confirmandoRetiro ? (
              <button type="button" onClick={() => setConfirmandoRetiro(true)} className={BOTON_SECUNDARIO}>
                Retirar autorización
              </button>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm text-amber-900">Se borrará la fecha y quién la registró (el cambio queda en la auditoría). ¿Retirar la autorización?</p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <button type="button" disabled={ocupado} onClick={() => void cambiarAutorizacion(false)} className={BOTON_PRIMARIO}>
                    Sí, retirar
                  </button>
                  <button type="button" disabled={ocupado} onClick={() => setConfirmandoRetiro(false)} className={BOTON_SECUNDARIO}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-slate-900">Ventas ({ficha.ventas.length})</h2>
        <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {ficha.ventas.map((venta) => (
            <TarjetaVenta key={venta.id} venta={venta} puedeAbonar={puedeAbonar} />
          ))}
          {ficha.ventas.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-400">Este cliente todavía no tiene ventas.</li>}
        </ul>
      </section>
    </div>
  )
}
