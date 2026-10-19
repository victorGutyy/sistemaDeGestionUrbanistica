import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { buscarClientes, type ClienteResumen } from '../lib/api'
import { SIGLA_TIPO_DOCUMENTO } from '../lib/clientes'
import { PERMISOS } from '../lib/permisos'

const ESPERA_BUSQUEDA_MS = 300

// Lista de clientes con búsqueda por nombre, documento o teléfono (RF-CLI-03). Quien está limitado a ciertos
// proyectos solo ve a los clientes con ventas en ellos.
export function ClientesPage() {
  const { tiene, alcanceTotal } = useAuth()
  const [texto, setTexto] = useState('')
  const [clientes, setClientes] = useState<ClienteResumen[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    // Se espera un momento después de la última tecla para no consultar en cada letra.
    const temporizador = setTimeout(() => {
      buscarClientes(texto)
        .then((lista) => {
          if (!vigente) return
          setClientes(lista)
          setError(null)
        })
        .catch((err: Error) => vigente && setError(err.message))
    }, texto ? ESPERA_BUSQUEDA_MS : 0)
    return () => {
      vigente = false
      clearTimeout(temporizador)
    }
  }, [texto])

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Clientes</h1>
          <p className="text-sm text-slate-500">Busca a un cliente para ver su ficha, su saldo y registrar un abono.</p>
        </div>
        {tiene(PERMISOS.CLIENTES_CREAR) && alcanceTotal && (
          <Link to="/clientes/nuevo" className="w-full rounded-md bg-blue-600 px-4 py-3 text-center text-sm font-medium text-white hover:bg-blue-700 sm:w-auto sm:py-2">
            Nuevo cliente
          </Link>
        )}
      </div>

      <label htmlFor="busqueda-clientes" className="mt-4 block text-sm font-medium text-slate-700">
        Buscar por nombre, documento o teléfono
      </label>
      <input
        id="busqueda-clientes"
        type="search"
        value={texto}
        onChange={(event) => setTexto(event.target.value)}
        maxLength={80}
        placeholder="Ejemplo: María, 1000000001, 300…"
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {clientes && (
        <>
          <p className="mt-4 text-xs text-slate-500">
            {clientes.length === 0 ? 'No hay clientes con esa búsqueda.' : `${clientes.length} cliente${clientes.length === 1 ? '' : 's'}${clientes.length >= 300 ? ' (se muestran los primeros 300: afina la búsqueda)' : ''}`}
          </p>
          <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {clientes.map((cliente) => (
              <li key={cliente.id}>
                <Link to={`/clientes/${cliente.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="break-words font-medium text-slate-900">{cliente.nombre}</p>
                    <p className="text-xs text-slate-500">
                      {SIGLA_TIPO_DOCUMENTO[cliente.tipoDocumento]} {cliente.documento}
                      {cliente.telefono ? ` · ${cliente.telefono}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {cliente._count.ventas} venta{cliente._count.ventas === 1 ? '' : 's'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {!clientes && !error && <p className="mt-4 text-sm text-slate-500">Cargando…</p>}
    </div>
  )
}
