import { useEffect, useState, type FormEvent } from 'react'
import { listarAuditoria, obtenerCatalogoAuditoria, type CatalogoAuditoria, type PaginaAuditoria, type RegistroAuditoria } from '../lib/api'
import { camposDeAuditoria } from '../lib/auditoria'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

const FORMATO_FECHA_HORA = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

interface Filtros {
  desde: string
  hasta: string
  usuarioId: string
  entidad: string
  accion: string
  buscar: string
}

const SIN_FILTROS: Filtros = { desde: '', hasta: '', usuarioId: '', entidad: '', accion: '', buscar: '' }

// El antes y el después de un registro: lo que cambió resaltado y, si se quiere, también lo que quedó igual.
function Cambios({ registro }: { registro: RegistroAuditoria }) {
  const [verTodo, setVerTodo] = useState(false)
  const campos = camposDeAuditoria(registro.antes, registro.despues)
  const hayAntes = registro.antes !== null && registro.antes !== undefined
  const cambiados = campos.filter((campo) => campo.cambio)
  const mostrados = verTodo ? campos : cambiados

  if (campos.length === 0) {
    return <p className="mt-2 text-xs text-slate-500">Este registro no guardó valores adicionales.</p>
  }

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-600">
        {hayAntes ? 'Qué cambió (valor antes → valor después)' : 'Datos que quedaron registrados'}
      </p>
      <ul className="mt-2 space-y-2">
        {mostrados.map((campo) => (
          <li key={campo.campo} className={`rounded-md px-2 py-1.5 text-sm ${campo.cambio ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-white text-slate-500'}`}>
            <p className="text-xs font-medium text-slate-500">{campo.etiqueta}</p>
            {hayAntes ? (
              <p className="break-words text-slate-900">
                <span className={campo.soloDespues ? 'text-slate-400' : 'text-red-700 line-through decoration-red-300'}>{campo.antes}</span>
                <span className="mx-1.5 text-slate-400">→</span>
                <span className={campo.soloAntes ? 'text-slate-400' : 'font-medium text-green-800'}>{campo.despues}</span>
              </p>
            ) : (
              <p className="break-words text-slate-900">{campo.despues}</p>
            )}
          </li>
        ))}
        {mostrados.length === 0 && <li className="text-xs text-slate-500">Ningún campo cambió de valor.</li>}
      </ul>
      {hayAntes && campos.length > cambiados.length && (
        <button type="button" onClick={() => setVerTodo((v) => !v)} className="mt-2 text-xs font-medium text-blue-600 hover:underline">
          {verTodo ? 'Mostrar solo lo que cambió' : `Mostrar también lo que no cambió (${campos.length - cambiados.length})`}
        </button>
      )}
    </div>
  )
}

function TarjetaRegistro({ registro, catalogo }: { registro: RegistroAuditoria; catalogo: CatalogoAuditoria | null }) {
  const [abierto, setAbierto] = useState(false)
  const etiquetaEntidad = catalogo?.entidades.find((e) => e.valor === registro.entidad)?.etiqueta ?? registro.entidad
  const etiquetaAccion = catalogo?.acciones.find((a) => a.valor === registro.accion)?.etiqueta ?? registro.accion

  return (
    <li className="px-4 py-3 text-sm">
      <p className="text-slate-900">{registro.resumen}</p>
      <p className="mt-0.5 text-xs text-slate-500">
        {FORMATO_FECHA_HORA.format(new Date(registro.createdAt))} · {registro.usuarioNombre}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{etiquetaEntidad}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{etiquetaAccion}</span>
        <button type="button" onClick={() => setAbierto((v) => !v)} className="ml-auto text-xs font-medium text-blue-600 hover:underline">
          {abierto ? 'Ocultar cambios' : 'Ver cambios'}
        </button>
      </div>
      {abierto && (
        <>
          <p className="mt-2 text-xs text-slate-400">{registro.usuarioEmail}</p>
          <Cambios registro={registro} />
        </>
      )}
    </li>
  )
}

// Auditoría (RF-AUD-02): solo el gerente. No se puede editar ni borrar nada de aquí (RF-AUD-03).
export function AuditoriaPage() {
  const [catalogo, setCatalogo] = useState<CatalogoAuditoria | null>(null)
  const [formulario, setFormulario] = useState<Filtros>(SIN_FILTROS)
  const [aplicados, setAplicados] = useState<Filtros>(SIN_FILTROS)
  const [pagina, setPagina] = useState(1)
  const [resultado, setResultado] = useState<PaginaAuditoria | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    obtenerCatalogoAuditoria()
      .then(setCatalogo)
      .catch((err: Error) => setError(err.message))
  }, [])

  useEffect(() => {
    let vigente = true
    listarAuditoria({
      desde: aplicados.desde,
      hasta: aplicados.hasta,
      usuarioId: aplicados.usuarioId,
      entidad: aplicados.entidad,
      accion: aplicados.accion,
      buscar: aplicados.buscar.trim(),
      pagina,
    })
      .then((recibido) => {
        if (!vigente) return
        setResultado(recibido)
        setError(null)
      })
      .catch((err: Error) => vigente && setError(err.message))
      .finally(() => vigente && setCargando(false))
    return () => {
      vigente = false
    }
  }, [aplicados, pagina])

  function buscar(event: FormEvent) {
    event.preventDefault()
    setCargando(true)
    setPagina(1)
    setAplicados(formulario)
  }

  function limpiar() {
    setCargando(true)
    setFormulario(SIN_FILTROS)
    setAplicados(SIN_FILTROS)
    setPagina(1)
  }

  function cambiarPagina(nueva: number) {
    setCargando(true)
    setPagina(nueva)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const hayFiltros = Object.values(aplicados).some(Boolean)

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold text-slate-900">Auditoría</h1>
      <p className="text-sm text-slate-500">
        Quién hizo cada cambio importante, cuándo y qué valores tenía antes y después. Solo se puede consultar: ningún registro se edita ni se borra.
      </p>

      <form onSubmit={buscar} className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="desde" className="block text-sm font-medium text-slate-700">
              Desde
            </label>
            <input id="desde" type="date" value={formulario.desde} onChange={(e) => setFormulario({ ...formulario, desde: e.target.value })} className={CLASE_INPUT} />
          </div>
          <div>
            <label htmlFor="hasta" className="block text-sm font-medium text-slate-700">
              Hasta
            </label>
            <input id="hasta" type="date" value={formulario.hasta} onChange={(e) => setFormulario({ ...formulario, hasta: e.target.value })} className={CLASE_INPUT} />
          </div>
        </div>

        <div>
          <label htmlFor="usuario" className="block text-sm font-medium text-slate-700">
            Usuario
          </label>
          <select id="usuario" value={formulario.usuarioId} onChange={(e) => setFormulario({ ...formulario, usuarioId: e.target.value })} className={CLASE_INPUT}>
            <option value="">Todos</option>
            {catalogo?.usuarios.map((usuario) => (
              <option key={usuario.id} value={usuario.id}>
                {usuario.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="entidad" className="block text-sm font-medium text-slate-700">
              Tipo de registro
            </label>
            <select id="entidad" value={formulario.entidad} onChange={(e) => setFormulario({ ...formulario, entidad: e.target.value })} className={CLASE_INPUT}>
              <option value="">Todos</option>
              {catalogo?.entidades.map((entidad) => (
                <option key={entidad.valor} value={entidad.valor}>
                  {entidad.etiqueta}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="accion" className="block text-sm font-medium text-slate-700">
              Acción
            </label>
            <select id="accion" value={formulario.accion} onChange={(e) => setFormulario({ ...formulario, accion: e.target.value })} className={CLASE_INPUT}>
              <option value="">Todas</option>
              {catalogo?.acciones.map((accion) => (
                <option key={accion.valor} value={accion.valor}>
                  {accion.etiqueta}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="buscar" className="block text-sm font-medium text-slate-700">
            Buscar en el detalle
          </label>
          <input
            id="buscar"
            maxLength={80}
            value={formulario.buscar}
            onChange={(e) => setFormulario({ ...formulario, buscar: e.target.value })}
            placeholder="Nombre, número de recibo, lote…"
            className={CLASE_INPUT}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={cargando}
            className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto sm:py-2"
          >
            {cargando ? 'Buscando...' : 'Buscar'}
          </button>
          {(hayFiltros || Object.values(formulario).some(Boolean)) && (
            <button
              type="button"
              onClick={limpiar}
              className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:w-auto sm:py-2"
            >
              Quitar filtros
            </button>
          )}
        </div>
      </form>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {resultado && (
        <>
          <p className="mt-4 text-xs text-slate-500">
            {resultado.total === 0 ? 'No hay registros con esos filtros.' : `${resultado.total} registro${resultado.total === 1 ? '' : 's'} · Página ${resultado.pagina} de ${resultado.paginas}`}
          </p>
          <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {resultado.registros.map((registro) => (
              <TarjetaRegistro key={registro.id} registro={registro} catalogo={catalogo} />
            ))}
            {resultado.registros.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-400">Sin registros.</li>}
          </ul>

          {resultado.paginas > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={cargando || resultado.pagina <= 1}
                onClick={() => cambiarPagina(resultado.pagina - 1)}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                ← Anterior
              </button>
              <span className="text-xs text-slate-500">
                Página {resultado.pagina} de {resultado.paginas}
              </span>
              <button
                type="button"
                disabled={cargando || resultado.pagina >= resultado.paginas}
                onClick={() => cambiarPagina(resultado.pagina + 1)}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
