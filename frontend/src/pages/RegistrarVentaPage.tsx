import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  crearVenta,
  listarClientes,
  listarLotesVendibles,
  listarMediosPago,
  listarVendedores,
  obtenerParametrosVenta,
  type Cliente,
  type FormaPago,
  type Lote,
  type MedioPago,
  type MedioPagoConfig,
  type ParametrosVenta,
  type TipoVendedor,
  type Vendedor,
} from '../lib/api'
import { formatearCOP, hoyEnBogota } from '../lib/formato'

type OrigenCliente = 'existente' | 'nuevo'
type OrigenVendedor = 'ninguno' | 'existente' | 'nuevo'
type ModoCuotaInicial = 'porcentaje' | 'valor'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100'
const ETIQUETA_TIPO_VENDEDOR: Record<TipoVendedor, string> = {
  ASESOR_INMOBILIARIO: 'Asesor inmobiliario',
  REFERIDO: 'Otro referido',
}

// Los valores de venta son pesos enteros: se dejan solo los dígitos.
const soloDigitos = (texto: string) => texto.replace(/\D/g, '')
const pesos = (valor: string | number) => formatearCOP(Math.round(Number(valor) || 0))

export function RegistrarVentaPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [lotes, setLotes] = useState<Lote[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [mediosPago, setMediosPago] = useState<MedioPagoConfig[]>([])
  const [parametros, setParametros] = useState<ParametrosVenta | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [loteId, setLoteId] = useState(searchParams.get('loteId') ?? '')
  const [origenCliente, setOrigenCliente] = useState<OrigenCliente>('existente')
  const [clienteId, setClienteId] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteDocumento, setClienteDocumento] = useState('')
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [clienteEmail, setClienteEmail] = useState('')

  const [origenVendedor, setOrigenVendedor] = useState<OrigenVendedor>('ninguno')
  const [vendedorId, setVendedorId] = useState('')
  const [vendedorTipo, setVendedorTipo] = useState<TipoVendedor>('ASESOR_INMOBILIARIO')
  const [vendedorNombre, setVendedorNombre] = useState('')
  const [vendedorDocumento, setVendedorDocumento] = useState('')
  const [vendedorTelefono, setVendedorTelefono] = useState('')

  const [formaPago, setFormaPago] = useState<FormaPago>('CONTADO')
  const [valorTotal, setValorTotal] = useState('')
  const [modoCuota, setModoCuota] = useState<ModoCuotaInicial>('porcentaje')
  const [porcentaje, setPorcentaje] = useState('')
  const [cuotaInicialValor, setCuotaInicialValor] = useState('')
  const [numeroCuotas, setNumeroCuotas] = useState('12')
  const [fechaVenta, setFechaVenta] = useState(() => hoyEnBogota())
  const [cuotaRecibida, setCuotaRecibida] = useState(true)
  const [medioPago, setMedioPago] = useState<MedioPago | ''>('')
  const [fechaLimite, setFechaLimite] = useState('')
  const [motivoExcepcion, setMotivoExcepcion] = useState('')

  useEffect(() => {
    // Los medios de pago los pide quien puede registrar abonos; si el rol no puede, la cuota inicial se deja pendiente.
    Promise.all([
      listarLotesVendibles(),
      listarClientes(),
      listarVendedores(),
      obtenerParametrosVenta(),
      listarMediosPago().catch(() => [] as MedioPagoConfig[]),
    ])
      .then(([lotesRecibidos, clientesRecibidos, vendedoresRecibidos, parametrosRecibidos, medios]) => {
        setLotes(lotesRecibidos)
        setClientes(clientesRecibidos)
        setVendedores(vendedoresRecibidos)
        setParametros(parametrosRecibidos)
        setPorcentaje(String(Number(parametrosRecibidos.porcentajeCuotaInicial)))
        const activos = medios.filter((m) => m.activo)
        setMediosPago(activos)
        setMedioPago(activos[0]?.medio ?? '')

        const lotePreseleccionado = lotesRecibidos.find((lote) => lote.id === searchParams.get('loteId'))
        if (lotePreseleccionado) setValorTotal(String(Math.round(Number(lotePreseleccionado.valorVenta))))
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setCargando(false))
    // Solo debe correr al montar: solo nos interesa el loteId que llegó en la URL al abrir la página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function alSeleccionarLote(id: string) {
    setLoteId(id)
    const lote = lotes.find((l) => l.id === id)
    if (lote) setValorTotal(String(Math.round(Number(lote.valorVenta))))
  }

  // ---- Cálculos para mostrar en pantalla (el servidor repite y valida todo) ----
  const financiado = formaPago === 'FINANCIADO'
  const total = Number(valorTotal) || 0
  const cuotasNum = Number(numeroCuotas) || 0
  const cuotaInicial = !financiado
    ? total
    : modoCuota === 'porcentaje'
      ? Math.round((total * (Number(porcentaje) || 0)) / 100)
      : Number(cuotaInicialValor) || 0
  const minimaCuotaInicial = parametros ? Math.round((total * Number(parametros.porcentajeCuotaInicial)) / 100) : 0
  const razonesExcepcion: string[] = []
  if (financiado && parametros && total > 0) {
    if (cuotaInicial < minimaCuotaInicial) {
      razonesExcepcion.push(`La cuota inicial (${pesos(cuotaInicial)}) es menor al ${Number(parametros.porcentajeCuotaInicial)} % configurado (mínimo ${pesos(minimaCuotaInicial)}).`)
    }
    if (cuotasNum > parametros.plazoMaximoMeses) {
      razonesExcepcion.push(`El plazo (${cuotasNum} cuotas) supera el máximo de ${parametros.plazoMaximoMeses} meses.`)
    }
  }
  const esExcepcion = razonesExcepcion.length > 0
  const quedaPendiente = esExcepcion && !parametros?.puedeAutorizar
  const saldoFinanciado = Math.max(total - cuotaInicial, 0)
  const valorCuota = cuotasNum > 0 ? Math.round(saldoFinanciado / cuotasNum) : 0
  const puedeRegistrarPago = mediosPago.length > 0 && !quedaPendiente && cuotaInicial > 0

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)

    try {
      const venta = await crearVenta({
        loteId,
        ...(origenCliente === 'existente'
          ? { clienteId }
          : {
              clienteNuevo: {
                nombre: clienteNombre,
                documento: clienteDocumento,
                telefono: clienteTelefono || undefined,
                email: clienteEmail || undefined,
              },
            }),
        ...(origenVendedor === 'existente' ? { vendedorId } : {}),
        ...(origenVendedor === 'nuevo'
          ? { vendedorNuevo: { tipo: vendedorTipo, nombre: vendedorNombre, documento: vendedorDocumento, telefono: vendedorTelefono || undefined } }
          : {}),
        formaPago,
        valorTotal,
        ...(financiado
          ? {
              numeroCuotas: cuotasNum,
              ...(modoCuota === 'porcentaje' ? { cuotaInicialPorcentaje: porcentaje } : { cuotaInicial: cuotaInicialValor }),
            }
          : {}),
        fechaVenta,
        fechaLimiteCuotaInicial: !cuotaRecibida && fechaLimite ? fechaLimite : undefined,
        ...(puedeRegistrarPago && cuotaRecibida && medioPago ? { cuotaInicialRecibida: true, medioPago } : {}),
        motivoExcepcion: esExcepcion ? motivoExcepcion.trim() : undefined,
      })

      navigate('/ventas/' + venta.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la venta')
    } finally {
      setEnviando(false)
    }
  }

  if (cargando) {
    return <p className="text-sm text-slate-500">Cargando lotes y clientes...</p>
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold text-slate-900">Registrar venta</h1>
      <p className="text-sm text-slate-500">Elige un lote disponible o separado y las condiciones de pago.</p>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <label htmlFor="lote" className="block text-sm font-medium text-slate-700">
            Lote
          </label>
          <select id="lote" required value={loteId} onChange={(event) => alSeleccionarLote(event.target.value)} className={CLASE_INPUT}>
            <option value="" disabled>
              Selecciona un lote
            </option>
            {lotes.map((lote) => (
              <option key={lote.id} value={lote.id}>
                {lote.proyecto.nombre} — {lote.manzana ? `Mz. ${lote.manzana.nombre} · ` : ''}Lote {lote.numero}
                {lote.estado === 'SEPARADO' ? ' (separado)' : ''} ({lote.area} m², {formatearCOP(lote.valorVenta)})
              </option>
            ))}
          </select>
          {lotes.length === 0 && <p className="mt-1 text-xs text-amber-600">No hay lotes disponibles para vender.</p>}
        </div>

        <div>
          <span className="block text-sm font-medium text-slate-700">Comprador</span>
          <div className="mt-1 flex gap-4 text-sm text-slate-600">
            <label className="flex items-center gap-1">
              <input type="radio" checked={origenCliente === 'existente'} onChange={() => setOrigenCliente('existente')} />
              Cliente existente
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={origenCliente === 'nuevo'} onChange={() => setOrigenCliente('nuevo')} />
              Cliente nuevo
            </label>
          </div>

          {origenCliente === 'existente' ? (
            <select required value={clienteId} onChange={(event) => setClienteId(event.target.value)} className={CLASE_INPUT}>
              <option value="" disabled>
                Selecciona un cliente
              </option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nombre} — {cliente.documento}
                </option>
              ))}
            </select>
          ) : (
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input required placeholder="Nombre completo" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} className={CLASE_INPUT} />
              <input required placeholder="Documento" value={clienteDocumento} onChange={(e) => setClienteDocumento(e.target.value)} className={CLASE_INPUT} />
              <input placeholder="Teléfono (opcional)" value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)} className={CLASE_INPUT} />
              <input type="email" placeholder="Correo electrónico (opcional)" value={clienteEmail} onChange={(e) => setClienteEmail(e.target.value)} className={CLASE_INPUT} />
            </div>
          )}
        </div>

        <div>
          <span className="block text-sm font-medium text-slate-700">Vendedor (opcional)</span>
          <div className="mt-1 flex flex-wrap gap-4 text-sm text-slate-600">
            <label className="flex items-center gap-1">
              <input type="radio" checked={origenVendedor === 'ninguno'} onChange={() => setOrigenVendedor('ninguno')} />
              Sin vendedor
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={origenVendedor === 'existente'} onChange={() => setOrigenVendedor('existente')} />
              Ya registrado
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={origenVendedor === 'nuevo'} onChange={() => setOrigenVendedor('nuevo')} />
              Nuevo
            </label>
          </div>
          {origenVendedor === 'existente' && (
            <select required value={vendedorId} onChange={(event) => setVendedorId(event.target.value)} className={CLASE_INPUT}>
              <option value="" disabled>
                Selecciona un vendedor
              </option>
              {vendedores.map((vendedor) => (
                <option key={vendedor.id} value={vendedor.id}>
                  {vendedor.nombre} — {ETIQUETA_TIPO_VENDEDOR[vendedor.tipo]}
                </option>
              ))}
            </select>
          )}
          {origenVendedor === 'nuevo' && (
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <select value={vendedorTipo} onChange={(e) => setVendedorTipo(e.target.value as TipoVendedor)} className={CLASE_INPUT} aria-label="Tipo de vendedor">
                {(Object.keys(ETIQUETA_TIPO_VENDEDOR) as TipoVendedor[]).map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {ETIQUETA_TIPO_VENDEDOR[tipo]}
                  </option>
                ))}
              </select>
              <input required placeholder="Nombre completo" value={vendedorNombre} onChange={(e) => setVendedorNombre(e.target.value)} className={CLASE_INPUT} />
              <input required placeholder="Documento" value={vendedorDocumento} onChange={(e) => setVendedorDocumento(e.target.value)} className={CLASE_INPUT} />
              <input placeholder="Teléfono (opcional)" value={vendedorTelefono} onChange={(e) => setVendedorTelefono(e.target.value)} className={CLASE_INPUT} />
            </div>
          )}
        </div>

        <div>
          <span className="block text-sm font-medium text-slate-700">Forma de pago</span>
          <div className="mt-1 flex gap-4 text-sm text-slate-600">
            <label className="flex items-center gap-1">
              <input type="radio" checked={formaPago === 'CONTADO'} onChange={() => setFormaPago('CONTADO')} />
              Contado
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={formaPago === 'FINANCIADO'} onChange={() => setFormaPago('FINANCIADO')} />
              Financiado
            </label>
          </div>
        </div>

        <div>
          <label htmlFor="valorTotal" className="block text-sm font-medium text-slate-700">
            Valor total (pesos)
          </label>
          <input
            id="valorTotal"
            required
            inputMode="numeric"
            value={valorTotal}
            onChange={(event) => setValorTotal(soloDigitos(event.target.value))}
            className={CLASE_INPUT}
          />
          {total > 0 && <p className="mt-1 text-xs text-slate-500">{pesos(total)}</p>}
        </div>

        {financiado && (
          <div className="space-y-3 rounded-md border border-slate-200 p-3">
            <div className="flex flex-wrap gap-4 text-sm text-slate-600">
              <span className="font-medium text-slate-700">Cuota inicial:</span>
              <label className="flex items-center gap-1">
                <input type="radio" checked={modoCuota === 'porcentaje'} onChange={() => setModoCuota('porcentaje')} />
                En porcentaje
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={modoCuota === 'valor'} onChange={() => setModoCuota('valor')} />
                En valor
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {modoCuota === 'porcentaje' ? (
                <div>
                  <label htmlFor="porcentaje" className="block text-sm text-slate-700">
                    Porcentaje (%)
                  </label>
                  <input id="porcentaje" required inputMode="decimal" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value.replace(',', '.'))} className={CLASE_INPUT} />
                </div>
              ) : (
                <div>
                  <label htmlFor="cuotaInicialValor" className="block text-sm text-slate-700">
                    Valor (pesos)
                  </label>
                  <input
                    id="cuotaInicialValor"
                    required
                    inputMode="numeric"
                    value={cuotaInicialValor}
                    onChange={(e) => setCuotaInicialValor(soloDigitos(e.target.value))}
                    className={CLASE_INPUT}
                  />
                </div>
              )}
              <div>
                <label htmlFor="numeroCuotas" className="block text-sm text-slate-700">
                  Número de cuotas
                </label>
                <input id="numeroCuotas" required type="number" min={1} value={numeroCuotas} onChange={(e) => setNumeroCuotas(e.target.value)} className={CLASE_INPUT} />
              </div>
            </div>

            {total > 0 && (
              <p className="text-sm text-slate-600">
                Cuota inicial: <strong>{pesos(cuotaInicial)}</strong> · Saldo a financiar: <strong>{pesos(saldoFinanciado)}</strong> · {cuotasNum} cuotas de
                aproximadamente <strong>{pesos(valorCuota)}</strong>
                {parametros && Number(parametros.tasaFinanciacionMensual) > 0
                  ? ` más el interés del ${Number(parametros.tasaFinanciacionMensual)} % mensual`
                  : ' (sin interés)'}
              </p>
            )}
          </div>
        )}

        {esExcepcion && (
          <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">Esta venta es una excepción.</p>
            <ul className="list-disc pl-5">
              {razonesExcepcion.map((razon) => (
                <li key={razon}>{razon}</li>
              ))}
            </ul>
            <p>
              {parametros?.puedeAutorizar
                ? 'Como gerente, la autorizas tú: queda registrado con tu nombre y el motivo.'
                : 'Quedará pendiente de aprobación del gerente y el lote se apartará mientras tanto.'}
            </p>
            <div>
              <label htmlFor="motivoExcepcion" className="block font-medium">
                Motivo de la excepción
              </label>
              <textarea
                id="motivoExcepcion"
                required
                minLength={5}
                maxLength={500}
                rows={2}
                value={motivoExcepcion}
                onChange={(event) => setMotivoExcepcion(event.target.value)}
                className={`${CLASE_INPUT} bg-white`}
              />
            </div>
          </div>
        )}

        <div className="space-y-3 rounded-md border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-700">{financiado ? 'Pago de la cuota inicial' : 'Pago'}</p>
          {quedaPendiente ? (
            <p className="text-sm text-slate-500">El pago se registra después de que el gerente apruebe la venta.</p>
          ) : puedeRegistrarPago ? (
            <>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={cuotaRecibida} onChange={(e) => setCuotaRecibida(e.target.checked)} />
                {financiado ? 'Ya se recibió la cuota inicial completa' : 'Ya se recibió el pago completo'}
              </label>
              {cuotaRecibida ? (
                <div>
                  <label htmlFor="medioPago" className="block text-sm text-slate-700">
                    Medio de pago
                  </label>
                  <select id="medioPago" required value={medioPago} onChange={(e) => setMedioPago(e.target.value as MedioPago)} className={CLASE_INPUT}>
                    {mediosPago.map((medio) => (
                      <option key={medio.medio} value={medio.medio}>
                        {medio.etiqueta}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label htmlFor="fechaLimite" className="block text-sm text-slate-700">
                    Fecha límite para recibirla (opcional)
                  </label>
                  <input id="fechaLimite" type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} className={CLASE_INPUT} />
                  <p className="mt-1 text-xs text-slate-500">Queda como la cuota inicial pendiente: se paga después con abonos.</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">El pago se registra después, como abono a la cuota inicial.</p>
          )}
        </div>

        <div>
          <label htmlFor="fechaVenta" className="block text-sm font-medium text-slate-700">
            Fecha de venta
          </label>
          <input id="fechaVenta" required type="date" value={fechaVenta} onChange={(event) => setFechaVenta(event.target.value)} className={CLASE_INPUT} />
        </div>

        <button
          type="submit"
          disabled={enviando || lotes.length === 0}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {enviando ? 'Registrando...' : quedaPendiente ? 'Enviar para aprobación' : 'Registrar venta'}
        </button>
      </form>
    </div>
  )
}
