import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CuentaYReferencia } from '../components/CuentaYReferencia'
import { useAuth } from '../contexts/AuthContext'
import {
  crearMovimiento,
  listarProyectos,
  obtenerConfiguracion,
  type CategoriaGasto,
  type CuentaBancaria,
  type MedioPago,
  type MedioPagoConfig,
  type Proyecto,
  type TipoMovimiento,
} from '../lib/api'
import { formatearCOP, hoyEnBogota } from '../lib/formato'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

// Registro de un egreso o un ingreso (RF-EGR-01, 02, 03 y 09).
export function RegistrarMovimientoPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { alcanceTotal } = useAuth()

  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [categoriasGasto, setCategoriasGasto] = useState<CategoriaGasto[]>([])
  const [categoriasIngreso, setCategoriasIngreso] = useState<CategoriaGasto[]>([])
  const [mediosPago, setMediosPago] = useState<MedioPagoConfig[]>([])
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [tipo, setTipo] = useState<TipoMovimiento>('GASTO')
  const [fecha, setFecha] = useState(() => hoyEnBogota())
  const [valor, setValor] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [proyectoId, setProyectoId] = useState(() => searchParams.get('proyectoId') ?? '')
  const [categoriaId, setCategoriaId] = useState('')
  const [medioPago, setMedioPago] = useState<MedioPago | ''>('')
  const [cuentaId, setCuentaId] = useState('')
  const [referencia, setReferencia] = useState('')
  const [terceroNombre, setTerceroNombre] = useState('')
  const [terceroDocumento, setTerceroDocumento] = useState('')
  const [numeroDocumento, setNumeroDocumento] = useState('')
  const [soporte, setSoporte] = useState<File | null>(null)
  const [motivoSinSoporte, setMotivoSinSoporte] = useState('')

  useEffect(() => {
    Promise.all([listarProyectos(), obtenerConfiguracion()])
      .then(([proyectosRecibidos, configuracion]) => {
        setProyectos(proyectosRecibidos)
        setCategoriasGasto(configuracion.categoriasGasto.filter((c) => c.activa))
        setCategoriasIngreso(configuracion.categoriasIngreso.filter((c) => c.activa))
        const activos = configuracion.mediosPago.filter((m) => m.activo)
        setMediosPago(activos)
        setMedioPago(activos[0]?.medio ?? '')
        setCuentas(configuracion.cuentas.filter((cuenta) => cuenta.activa))
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setCargando(false))
  }, [])

  const esGasto = tipo === 'GASTO'
  const categorias = esGasto ? categoriasGasto : categoriasIngreso
  const valorNumero = Number(valor) || 0

  function cambiarTipo(nuevo: TipoMovimiento) {
    setTipo(nuevo)
    // Las categorías de gasto y de ingreso son listas distintas.
    setCategoriaId('')
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!medioPago) {
      setError('No hay medios de pago habilitados')
      return
    }
    setEnviando(true)

    try {
      const formData = new FormData()
      formData.append('tipo', tipo)
      formData.append('fecha', fecha)
      formData.append('valor', valor)
      formData.append('descripcion', descripcion.trim())
      if (proyectoId) formData.append('proyectoId', proyectoId)
      formData.append('categoriaId', categoriaId)
      formData.append('medioPago', medioPago)
      if (medioPago !== 'EFECTIVO' && cuentaId) formData.append('cuentaId', cuentaId)
      if (referencia.trim()) formData.append('referencia', referencia.trim())
      if (terceroNombre.trim()) formData.append('terceroNombre', terceroNombre.trim())
      if (terceroDocumento.trim()) formData.append('terceroDocumento', terceroDocumento.trim())
      if (numeroDocumento.trim()) formData.append('numeroDocumento', numeroDocumento.trim())
      if (soporte) formData.append('soporte', soporte)
      else if (esGasto) formData.append('motivoSinSoporte', motivoSinSoporte.trim())

      const creado = await crearMovimiento(formData)
      navigate(`/finanzas/movimientos/${creado.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el movimiento')
    } finally {
      setEnviando(false)
    }
  }

  if (cargando) {
    return <p className="text-sm text-slate-500">Cargando...</p>
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold text-slate-900">Registrar {esGasto ? 'egreso' : 'ingreso'}</h1>
      <p className="text-sm text-slate-500">Un egreso o ingreso de la empresa, de un proyecto o general. Los pagos de clientes por lotes se registran como abonos.</p>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <span className="block text-sm font-medium text-slate-700">Tipo</span>
          <div className="mt-1 flex gap-6 text-sm text-slate-700">
            <label className="flex items-center gap-2 py-1">
              <input type="radio" checked={esGasto} onChange={() => cambiarTipo('GASTO')} />
              Egreso (gasto)
            </label>
            <label className="flex items-center gap-2 py-1">
              <input type="radio" checked={!esGasto} onChange={() => cambiarTipo('INGRESO')} />
              Ingreso
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="categoria" className="block text-sm font-medium text-slate-700">
              Categoría
            </label>
            <select id="categoria" required value={categoriaId} onChange={(event) => setCategoriaId(event.target.value)} className={CLASE_INPUT}>
              <option value="">Elige una categoría…</option>
              {categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="proyecto" className="block text-sm font-medium text-slate-700">
              Proyecto
            </label>
            <select id="proyecto" value={proyectoId} onChange={(event) => setProyectoId(event.target.value)} className={CLASE_INPUT}>
              {alcanceTotal && <option value="">General de la empresa (sin proyecto)</option>}
              {!alcanceTotal && <option value="">Elige un proyecto…</option>}
              {proyectos.map((proyecto) => (
                <option key={proyecto.id} value={proyecto.id}>
                  {proyecto.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="descripcion" className="block text-sm font-medium text-slate-700">
            Descripción
          </label>
          <input
            id="descripcion"
            required
            minLength={3}
            maxLength={300}
            value={descripcion}
            onChange={(event) => setDescripcion(event.target.value)}
            placeholder="Ej. Cemento para la obra, arriendo de oficina, anticipo de remodelación…"
            className={CLASE_INPUT}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="valor" className="block text-sm font-medium text-slate-700">
              Valor (pesos)
            </label>
            <input
              id="valor"
              required
              inputMode="numeric"
              value={valor}
              onChange={(event) => setValor(event.target.value.replace(/\D/g, '').replace(/^0+/, ''))}
              className={CLASE_INPUT}
            />
            {valorNumero > 0 && <p className="mt-1 text-xs text-slate-500">{formatearCOP(valorNumero)}</p>}
          </div>
          <div>
            <label htmlFor="fecha" className="block text-sm font-medium text-slate-700">
              Fecha
            </label>
            <input id="fecha" required type="date" max={hoyEnBogota()} value={fecha} onChange={(event) => setFecha(event.target.value)} className={CLASE_INPUT} />
          </div>
        </div>

        <div>
          <label htmlFor="medioPago" className="block text-sm font-medium text-slate-700">
            Medio de pago
          </label>
          <select id="medioPago" value={medioPago} onChange={(event) => setMedioPago(event.target.value as MedioPago)} className={CLASE_INPUT}>
            {mediosPago.map((medio) => (
              <option key={medio.medio} value={medio.medio}>
                {medio.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <CuentaYReferencia
          medioPago={medioPago}
          cuentas={cuentas}
          cuentaId={cuentaId}
          onCuentaChange={setCuentaId}
          referencia={referencia}
          onReferenciaChange={setReferencia}
          etiquetaCuenta={esGasto ? 'Cuenta de donde salió el dinero' : 'Cuenta donde entró el dinero'}
          ayudaReferencia=""
        />

        <fieldset className="space-y-3 rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium text-slate-700">{esGasto ? 'Proveedor' : 'Cliente'} (opcional)</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="terceroNombre" className="block text-sm text-slate-700">
                Nombre
              </label>
              <input id="terceroNombre" maxLength={120} value={terceroNombre} onChange={(e) => setTerceroNombre(e.target.value)} className={CLASE_INPUT} />
            </div>
            <div>
              <label htmlFor="terceroDocumento" className="block text-sm text-slate-700">
                Documento o NIT
              </label>
              <input id="terceroDocumento" maxLength={40} value={terceroDocumento} onChange={(e) => setTerceroDocumento(e.target.value)} className={CLASE_INPUT} />
            </div>
          </div>
          <div>
            <label htmlFor="numeroDocumento" className="block text-sm text-slate-700">
              Número de factura o recibo
            </label>
            <input id="numeroDocumento" maxLength={60} value={numeroDocumento} onChange={(e) => setNumeroDocumento(e.target.value)} className={CLASE_INPUT} />
          </div>
        </fieldset>

        <div>
          <label htmlFor="soporte" className="block text-sm font-medium text-slate-700">
            Soporte {esGasto ? '(obligatorio, o explica por qué no hay)' : '(opcional)'} — imagen o PDF
          </label>
          <input
            id="soporte"
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            onChange={(event) => setSoporte(event.target.files?.[0] ?? null)}
            className="mt-1 w-full text-sm text-slate-700"
          />
        </div>

        {esGasto && !soporte && (
          <div>
            <label htmlFor="motivoSinSoporte" className="block text-sm font-medium text-slate-700">
              ¿Por qué no hay soporte?
            </label>
            <textarea
              id="motivoSinSoporte"
              required
              rows={2}
              maxLength={300}
              value={motivoSinSoporte}
              onChange={(event) => setMotivoSinSoporte(event.target.value)}
              placeholder="Ej. El proveedor no entregó factura"
              className={CLASE_INPUT}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={enviando || valorNumero <= 0}
          className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto sm:py-2"
        >
          {enviando ? 'Registrando...' : `Registrar ${esGasto ? 'egreso' : 'ingreso'}`}
        </button>
      </form>
    </div>
  )
}
