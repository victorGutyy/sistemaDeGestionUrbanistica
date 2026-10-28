import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, CLASE_BOTON, CLASE_BOTON_PELIGRO, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Insignia, Seccion } from '../components/formulario'
import { AdjuntosSst } from '../components/sst/AdjuntosSst'
import { FormularioEntregaEpp } from '../components/sst/FormularioEntregaEpp'
import { useAuth } from '../contexts/AuthContext'
import {
  actualizarElementoEpp,
  anularEntregaEpp,
  crearElementoEpp,
  listarElementosEpp,
  listarEntregasEpp,
  listarTrabajadoresSst,
  marcarFirmaEntregaEpp,
  obtenerEntregaEpp,
  obtenerReposiciones,
  type ElementoEpp,
  type EntregaEpp,
  type EntregaEppDetalle,
  type EstadoReposicion,
  type MotivoEntregaEpp,
  type RespuestaReposiciones,
  type TrabajadorSst,
} from '../lib/api'
import { formatearFecha } from '../lib/formato'
import { PERMISOS } from '../lib/permisos'
import { ETIQUETA_ESTADO_REPOSICION, ETIQUETA_MOTIVO_EPP, textoDias, TONO_ESTADO_REPOSICION } from '../lib/sst'

type FiltroEstado = 'ATENCION' | 'TODOS' | EstadoReposicion

function Tarjeta({ titulo, valor, tono }: { titulo: string; valor: number; tono: 'rojo' | 'ambar' | 'verde' }) {
  const clase = valor === 0 && tono !== 'verde' ? 'border-slate-200 bg-white' : { rojo: 'border-red-200 bg-red-50', ambar: 'border-amber-200 bg-amber-50', verde: 'border-slate-200 bg-white' }[tono]
  return (
    <div className={`rounded-lg border p-4 ${clase}`}>
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{valor}</p>
    </div>
  )
}

// Detalle de una entrega: adjuntos (el acta), firma del recibido y anulación con motivo.
function DetalleEntrega({ entregaId, puedeGestionar, onCambio }: { entregaId: string; puedeGestionar: boolean; onCambio: () => void }) {
  const [detalle, setDetalle] = useState<EntregaEppDetalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cargar = useCallback(() => {
    obtenerEntregaEpp(entregaId)
      .then(setDetalle)
      .catch((err: Error) => setError(err.message))
  }, [entregaId])

  useEffect(cargar, [cargar])

  async function firmar() {
    setError(null)
    setEnviando(true)
    try {
      await marcarFirmaEntregaEpp(entregaId)
      cargar()
      onCambio()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo marcar la firma')
    } finally {
      setEnviando(false)
    }
  }

  async function anular(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await anularEntregaEpp(entregaId, motivo.trim())
      setAnulando(false)
      cargar()
      onCambio()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular la entrega')
    } finally {
      setEnviando(false)
    }
  }

  if (!detalle) return <p className="px-4 py-3 text-sm text-slate-500">{error ?? 'Cargando…'}</p>

  return (
    <div className="space-y-3 bg-slate-50 px-4 py-3">
      <Aviso error={error} />
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-slate-500">Entregó</dt>
          <dd>{detalle.entregadoPor}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Registró</dt>
          <dd>{detalle.registradaPor.nombre}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Vida útil de esta entrega</dt>
          <dd>{detalle.vidaUtilDias} días</dd>
        </div>
      </dl>
      {detalle.anulada && (
        <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          Anulada el {formatearFecha(detalle.anuladaEn)}
          {detalle.anuladaPor && ` por ${detalle.anuladaPor.nombre}`}: {detalle.motivoAnulacion}
        </p>
      )}

      <div>
        <p className="mb-1 text-sm font-medium text-slate-800">Acta y otros documentos</p>
        <AdjuntosSst ruta="epp/entregas" registroId={entregaId} documentos={detalle.documentos} puedeAdjuntar={puedeGestionar && !detalle.anulada} onCambio={() => { cargar(); onCambio() }} etiquetaAdjuntar="Adjuntar acta" />
      </div>

      {puedeGestionar && !detalle.anulada && (
        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
          {!detalle.firmoRecibido && (
            <button type="button" disabled={enviando} onClick={() => void firmar()} className={CLASE_BOTON_SECUNDARIO}>
              Marcar que firmó el recibido
            </button>
          )}
          {!anulando && (
            <button type="button" onClick={() => setAnulando(true)} className={CLASE_BOTON_PELIGRO}>
              Anular entrega
            </button>
          )}
        </div>
      )}
      {anulando && (
        <form onSubmit={anular} className="max-w-md space-y-2 rounded-md border border-red-200 bg-red-50/50 p-3">
          <p className="text-sm text-slate-700">Una entrega no se edita ni se borra: si hubo un error, se anula con su motivo y se registra la correcta.</p>
          <input aria-label="Motivo de la anulación" required minLength={5} maxLength={300} placeholder="Motivo (mínimo 5 letras)" value={motivo} onChange={(e) => setMotivo(e.target.value)} className={CLASE_INPUT} />
          <div className="flex gap-2">
            <button type="submit" disabled={enviando} className={CLASE_BOTON}>
              Confirmar anulación
            </button>
            <button type="button" onClick={() => setAnulando(false)} className={CLASE_BOTON_SECUNDARIO}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// Catálogo de elementos con su vida útil (RF-SST-12). Cambiar la vida útil no altera las entregas ya hechas.
function CatalogoEpp({ elementos, puedeGestionar, onCambio }: { elementos: ElementoEpp[]; puedeGestionar: boolean; onCambio: (e: ElementoEpp[]) => void }) {
  const [nombre, setNombre] = useState('')
  const [vida, setVida] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function crear(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const nuevo = await crearElementoEpp(nombre.trim(), Number(vida))
      onCambio([...elementos, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
      setNombre('')
      setVida('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el elemento')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <details className="rounded-lg border border-slate-200 bg-white">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">
        Catálogo de elementos <span className="font-normal text-slate-400">({elementos.filter((e) => e.activo).length} activos)</span>
      </summary>
      <div className="border-t border-slate-100 px-4 py-3">
        <p className="text-sm text-slate-500">La vida útil se copia a cada entrega el día que se hace: cambiarla aquí no mueve las reposiciones de entregas anteriores.</p>
        <Aviso error={error} />
        <ul className="mt-2 divide-y divide-slate-100">
          {elementos.map((elemento) => (
            <FilaElemento key={elemento.id} elemento={elemento} puedeGestionar={puedeGestionar} onCambio={(actualizado) => onCambio(elementos.map((e) => (e.id === actualizado.id ? actualizado : e)))} />
          ))}
        </ul>
        {puedeGestionar && (
          <form onSubmit={crear} className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row">
            <input aria-label="Nombre del nuevo elemento" placeholder="Nuevo elemento" required minLength={2} maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} className={CLASE_INPUT} />
            <input aria-label="Vida útil en días" placeholder="Vida útil (días)" required type="number" min={1} max={3650} value={vida} onChange={(e) => setVida(e.target.value)} className={`${CLASE_INPUT} sm:max-w-[10rem]`} />
            <button type="submit" disabled={enviando} className={`${CLASE_BOTON} sm:mt-1`}>
              Agregar
            </button>
          </form>
        )}
      </div>
    </details>
  )
}

function FilaElemento({ elemento, puedeGestionar, onCambio }: { elemento: ElementoEpp; puedeGestionar: boolean; onCambio: (e: ElementoEpp) => void }) {
  const [vida, setVida] = useState(String(elemento.vidaUtilDias))
  const [error, setError] = useState<string | null>(null)

  async function guardar(cambios: { vidaUtilDias?: number; activo?: boolean }) {
    setError(null)
    try {
      onCambio(await actualizarElementoEpp(elemento.id, cambios))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <li className="py-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 text-sm text-slate-800">
          {elemento.nombre}
          {!elemento.activo && (
            <span className="ml-2">
              <Insignia tono="ambar">Inactivo</Insignia>
            </span>
          )}
        </p>
        {puedeGestionar ? (
          <div className="flex items-center gap-2">
            <input aria-label={`Vida útil de ${elemento.nombre} en días`} type="number" min={1} max={3650} value={vida} onChange={(e) => setVida(e.target.value)} className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <span className="text-xs text-slate-500">días</span>
            {Number(vida) !== elemento.vidaUtilDias && (
              <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => void guardar({ vidaUtilDias: Number(vida) })}>
                Guardar
              </button>
            )}
            <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => void guardar({ activo: !elemento.activo })}>
              {elemento.activo ? 'Desactivar' : 'Activar'}
            </button>
          </div>
        ) : (
          <span className="text-sm text-slate-600">{elemento.vidaUtilDias} días</span>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </li>
  )
}

// Pestaña de elementos de protección personal: qué toca reponer, las entregas y el catálogo (RF-SST-12 a 14 y 21).
export function SstEppPage() {
  const { tiene } = useAuth()
  const puedeGestionar = tiene(PERMISOS.SST_GESTIONAR)

  const [trabajadores, setTrabajadores] = useState<TrabajadorSst[]>([])
  const [elementos, setElementos] = useState<ElementoEpp[]>([])
  const [reposiciones, setReposiciones] = useState<RespuestaReposiciones | null>(null)
  const [entregas, setEntregas] = useState<EntregaEpp[]>([])
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('ATENCION')
  const [filtroTrabajador, setFiltroTrabajador] = useState('')
  const [filtroElemento, setFiltroElemento] = useState('')
  const [incluirAnuladas, setIncluirAnuladas] = useState(false)
  const [formulario, setFormulario] = useState<{ trabajadorId: string; elementoId: string; motivo: MotivoEntregaEpp } | 'nuevo' | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const cargarReposiciones = useCallback(() => {
    obtenerReposiciones({ estado: filtroEstado === 'ATENCION' ? undefined : filtroEstado })
      .then(setReposiciones)
      .catch((err: Error) => setError(err.message))
  }, [filtroEstado])

  const cargarEntregas = useCallback(() => {
    listarEntregasEpp({ trabajadorId: filtroTrabajador, elementoId: filtroElemento, incluirAnuladas })
      .then(setEntregas)
      .catch((err: Error) => setError(err.message))
  }, [filtroTrabajador, filtroElemento, incluirAnuladas])

  useEffect(() => {
    Promise.all([listarTrabajadoresSst(), listarElementosEpp(true)])
      .then(([lista, catalogo]) => {
        setTrabajadores(lista)
        setElementos(catalogo)
      })
      .catch((err: Error) => setError(err.message))
  }, [])

  useEffect(cargarReposiciones, [cargarReposiciones])
  useEffect(cargarEntregas, [cargarEntregas])

  const activos = useMemo(() => trabajadores.filter((t) => t.estado === 'ACTIVO'), [trabajadores])
  const elementosActivos = useMemo(() => elementos.filter((e) => e.activo), [elementos])

  function alRegistrar(entrega: EntregaEpp) {
    setFormulario(null)
    setOk(`Entrega registrada: ${entrega.cantidad} × ${entrega.elemento.nombre} a ${entrega.trabajador.nombre}.`)
    cargarReposiciones()
    cargarEntregas()
  }

  function alCambiar() {
    cargarReposiciones()
    cargarEntregas()
  }

  return (
    <div className="space-y-6">
      <Aviso error={error} ok={ok} />

      {reposiciones && (
        <div className="grid grid-cols-3 gap-3">
          <Tarjeta titulo="Vencidos" valor={reposiciones.resumen.vencidos} tono="rojo" />
          <Tarjeta titulo={`Por reponer (${reposiciones.diasAlerta} días)`} valor={reposiciones.resumen.porReponer} tono="ambar" />
          <Tarjeta titulo="Vigentes" valor={reposiciones.resumen.vigentes} tono="verde" />
        </div>
      )}

      {puedeGestionar && !formulario && (
        <div>
          <button type="button" className={CLASE_BOTON} onClick={() => { setOk(null); setFormulario('nuevo') }}>
            Registrar entrega de EPP
          </button>
        </div>
      )}
      {formulario && (
        <FormularioEntregaEpp
          trabajadores={activos}
          elementos={elementosActivos}
          inicial={formulario === 'nuevo' ? undefined : formulario}
          onRegistrada={alRegistrar}
          onCancelar={() => setFormulario(null)}
        />
      )}

      <Seccion
        titulo="Reposiciones"
        descripcion="La última entrega de cada trabajador y elemento, con su fecha de reposición. Al registrar una entrega nueva, el reloj de ese elemento se reinicia."
        acciones={
          <select aria-label="Qué reposiciones ver" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="ATENCION">Lo que pide atención</option>
            <option value="VENCIDO">Solo vencidos</option>
            <option value="POR_REPONER">Solo por reponer</option>
            <option value="VIGENTE">Solo vigentes</option>
            <option value="TODOS">Todos</option>
          </select>
        }
      >
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Trabajador</th>
                <th className="px-3 py-2 font-medium">Elemento</th>
                <th className="px-3 py-2 font-medium">Última entrega</th>
                <th className="px-3 py-2 font-medium">Reposición</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                {puedeGestionar && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {reposiciones && reposiciones.reposiciones.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                    {filtroEstado === 'ATENCION' ? 'Nada por reponer ni vencido.' : 'No hay reposiciones con ese estado.'}
                  </td>
                </tr>
              )}
              {reposiciones?.reposiciones.map((r) => (
                <tr key={r.entregaId} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">
                    <Link to={`/sst/trabajadores/${r.trabajador.id}`} className="text-blue-600 hover:underline">
                      {r.trabajador.nombre}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{r.elemento.nombre}</td>
                  <td className="px-3 py-2">{formatearFecha(r.ultimaEntrega)}</td>
                  <td className="px-3 py-2">
                    {formatearFecha(r.proximaReposicion)}
                    <span className="block text-xs text-slate-500">{textoDias(r.diasRestantes)}</span>
                  </td>
                  <td className="px-3 py-2">
                    <Insignia tono={TONO_ESTADO_REPOSICION[r.estado]}>{ETIQUETA_ESTADO_REPOSICION[r.estado]}</Insignia>
                  </td>
                  {puedeGestionar && (
                    <td className="px-3 py-2 text-right">
                      <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => { setOk(null); setFormulario({ trabajadorId: r.trabajador.id, elementoId: r.elemento.id, motivo: 'REPOSICION_VIDA_UTIL' }) }}>
                        Reponer
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>

      <Seccion titulo="Entregas" descripcion="Cada entrega con su acta. No se editan ni se borran: un error se corrige anulándola.">
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select aria-label="Filtrar por trabajador" value={filtroTrabajador} onChange={(e) => setFiltroTrabajador(e.target.value)} className="rounded-md border border-slate-300 px-2 py-2 text-sm">
            <option value="">Todos los trabajadores</option>
            {trabajadores.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
          <select aria-label="Filtrar por elemento" value={filtroElemento} onChange={(e) => setFiltroElemento(e.target.value)} className="rounded-md border border-slate-300 px-2 py-2 text-sm">
            <option value="">Todos los elementos</option>
            {elementos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={incluirAnuladas} onChange={(e) => setIncluirAnuladas(e.target.checked)} />
            Incluir anuladas
          </label>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Trabajador</th>
                <th className="px-3 py-2 font-medium">Elemento</th>
                <th className="px-3 py-2 font-medium">Motivo</th>
                <th className="px-3 py-2 font-medium">Recibido</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {entregas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                    No hay entregas registradas con esos filtros.
                  </td>
                </tr>
              )}
              {entregas.map((e) => (
                <FragmentoEntrega key={e.id} entrega={e} abierta={abierta === e.id} onAlternar={() => setAbierta(abierta === e.id ? null : e.id)} puedeGestionar={puedeGestionar} onCambio={alCambiar} />
              ))}
            </tbody>
          </table>
        </div>
        {entregas.length >= 500 && <p className="mt-2 text-xs text-slate-500">Se muestran las 500 entregas más recientes: usa los filtros para acotar.</p>}
      </Seccion>

      <CatalogoEpp elementos={elementos} puedeGestionar={puedeGestionar} onCambio={setElementos} />
    </div>
  )
}

function FragmentoEntrega({ entrega, abierta, onAlternar, puedeGestionar, onCambio }: { entrega: EntregaEpp; abierta: boolean; onAlternar: () => void; puedeGestionar: boolean; onCambio: () => void }) {
  return (
    <>
      <tr className={`border-b border-slate-100 ${entrega.anulada ? 'text-slate-400' : ''}`}>
        <td className="px-3 py-2">{formatearFecha(entrega.fecha)}</td>
        <td className="px-3 py-2">{entrega.trabajador.nombre}</td>
        <td className="px-3 py-2">
          {entrega.cantidad} × {entrega.elemento.nombre}
          {entrega.tallaReferencia && <span className="block text-xs text-slate-500">{entrega.tallaReferencia}</span>}
        </td>
        <td className="px-3 py-2">{ETIQUETA_MOTIVO_EPP[entrega.motivo]}</td>
        <td className="px-3 py-2">
          {entrega.anulada ? <Insignia tono="gris">Anulada</Insignia> : entrega.firmoRecibido ? <Insignia tono="verde">Firmó</Insignia> : <Insignia tono="ambar">Sin firma</Insignia>}
          {(entrega._count?.documentos ?? 0) > 0 && <span className="ml-1 text-xs text-slate-500">· {entrega._count?.documentos} adj.</span>}
        </td>
        <td className="px-3 py-2 text-right">
          <button type="button" className="text-sm text-blue-600 hover:underline" onClick={onAlternar} aria-expanded={abierta}>
            {abierta ? 'Ocultar' : 'Ver'}
          </button>
        </td>
      </tr>
      {abierta && (
        <tr className="border-b border-slate-100">
          <td colSpan={6} className="p-0">
            <DetalleEntrega entregaId={entrega.id} puedeGestionar={puedeGestionar} onCambio={onCambio} />
          </td>
        </tr>
      )}
    </>
  )
}
