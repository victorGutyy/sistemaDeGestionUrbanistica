import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { crearCliente, type TipoDocumento } from '../lib/api'
import { ETIQUETA_TIPO_DOCUMENTO, TIPOS_DOCUMENTO } from '../lib/clientes'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

// Registro de un cliente sin hacer una venta (RF-CLI-01). El documento no se repite y no se puede cambiar después.
export function RegistrarClientePage() {
  const navigate = useNavigate()
  const [nombre, setNombre] = useState('')
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>('CC')
  const [documento, setDocumento] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [direccion, setDireccion] = useState('')
  const [autorizaDatos, setAutorizaDatos] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function guardar(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const cliente = await crearCliente({
        nombre: nombre.trim(),
        documento: documento.trim(),
        tipoDocumento,
        telefono: telefono.trim() || undefined,
        email: email.trim() || undefined,
        direccion: direccion.trim() || undefined,
        autorizaDatos: autorizaDatos || undefined,
      })
      navigate(`/clientes/${cliente.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el cliente')
      setEnviando(false)
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold text-slate-900">Nuevo cliente</h1>
      <p className="text-sm text-slate-500">Los datos del comprador. Las ventas y los abonos se registran después, desde su ficha.</p>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={guardar} className="mt-6 space-y-4">
        <div>
          <label htmlFor="nombre" className="block text-sm font-medium text-slate-700">
            Nombre completo
          </label>
          <input id="nombre" required minLength={3} value={nombre} onChange={(e) => setNombre(e.target.value)} className={CLASE_INPUT} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="tipoDocumento" className="block text-sm font-medium text-slate-700">
              Tipo de documento
            </label>
            <select id="tipoDocumento" value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value as TipoDocumento)} className={CLASE_INPUT}>
              {TIPOS_DOCUMENTO.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {ETIQUETA_TIPO_DOCUMENTO[tipo]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="documento" className="block text-sm font-medium text-slate-700">
              Número de documento
            </label>
            <input id="documento" required minLength={3} value={documento} onChange={(e) => setDocumento(e.target.value)} className={CLASE_INPUT} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="telefono" className="block text-sm font-medium text-slate-700">
              Teléfono (opcional)
            </label>
            <input id="telefono" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} className={CLASE_INPUT} />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Correo electrónico (opcional)
            </label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={CLASE_INPUT} />
          </div>
        </div>

        <div>
          <label htmlFor="direccion" className="block text-sm font-medium text-slate-700">
            Dirección (opcional)
          </label>
          <input id="direccion" value={direccion} onChange={(e) => setDireccion(e.target.value)} className={CLASE_INPUT} />
        </div>

        <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <input type="checkbox" checked={autorizaDatos} onChange={(e) => setAutorizaDatos(e.target.checked)} className="mt-0.5" />
          <span>
            El cliente autorizó el tratamiento de sus datos personales (Ley 1581 de 2012). Queda registrada la fecha y quién lo anotó.
          </span>
        </label>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto sm:py-2"
          >
            {enviando ? 'Guardando…' : 'Guardar cliente'}
          </button>
          <Link to="/clientes" className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-center text-sm font-medium text-slate-700 hover:bg-slate-50 sm:w-auto sm:py-2">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
