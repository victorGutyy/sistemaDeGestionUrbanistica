import { useState, type FormEvent } from 'react'
import { ajustarPlanDePagos, type Cuota, type RespuestaAjustarPlan } from '../lib/api'
import { fechaParaInput, formatearCOP, formatearFecha } from '../lib/formato'
import { etiquetaCuota } from '../lib/ventas'
import { Aviso, CLASE_BOTON, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Campo } from './formulario'

interface Props {
  ventaId: string
  cuotas: Cuota[]
  // Solo una venta activa y financiada tiene plan que ajustar, y solo con el permiso de ajustar el plan.
  puedeAjustar: boolean
  // Se llama después de guardar, para recargar la venta (las fechas, los valores y los avisos cambian).
  onCambio: () => void
}

const soloDigitos = (texto: string) => texto.replace(/\D/g, '')

// Ajustar el plan de una venta ya registrada (CC-08): las fechas y/o los valores de las cuotas que todavía no están pagadas.
// El total del plan no cambia (lo que se baja en una cuota se sube en otra) y lo ya pagado no se toca.
export function TarjetaAjustarPlan({ ventaId, cuotas, puedeAjustar, onCambio }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [fechaInicial, setFechaInicial] = useState('')
  const [fechaPrimera, setFechaPrimera] = useState('')
  // Fecha de cada cuota pendiente elegida una por una (null = se usa la fecha de la primera pendiente).
  const [porCuota, setPorCuota] = useState<Record<number, string> | null>(null)
  // Valor de cada cuota que se puede cambiar (null = no se cambian los valores).
  const [valores, setValores] = useState<Record<number, string> | null>(null)
  const [vista, setVista] = useState<RespuestaAjustarPlan | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!puedeAjustar || cuotas.length === 0) return null

  const cuotaCero = cuotas.find((c) => c.numero === 0)
  const inicialEditable = cuotaCero && cuotaCero.estado !== 'PAGADA'
  const pendientes = cuotas.filter((c) => c.numero >= 1 && c.estado !== 'PAGADA').sort((a, b) => a.numero - b.numero)
  const primeraPendiente = pendientes[0]
  if (!inicialEditable && !primeraPendiente) return null

  // Las cuotas cuyo valor se puede cambiar: la cuota inicial (si no está pagada) y las pendientes.
  const editables = [...(inicialEditable && cuotaCero ? [cuotaCero] : []), ...pendientes]
  const valorActual = (c: Cuota) => Number(c.valor)
  const valorEditado = (c: Cuota) => (valores && valores[c.numero] !== undefined && valores[c.numero] !== '' ? Number(valores[c.numero]) : valorActual(c))
  // El total del plan (con lo pagado y todo) no puede cambiar.
  const totalPlan = cuotas.reduce((suma, c) => suma + valorActual(c), 0)
  const totalNuevo = cuotas.reduce((suma, c) => suma + valorEditado(c), 0)
  const diferencia = totalNuevo - totalPlan
  const cambiaValores = valores !== null && editables.some((c) => valorEditado(c) !== valorActual(c))

  const datos = () => ({
    motivo: motivo.trim(),
    fechaCuotaInicial: inicialEditable && fechaInicial ? fechaInicial : undefined,
    fechaPrimeraCuotaPendiente: !porCuota && primeraPendiente && fechaPrimera ? fechaPrimera : undefined,
    fechasCuotas: porCuota ? pendientes.map((c) => ({ numero: c.numero, fecha: porCuota[c.numero] })).filter((f) => f.fecha) : undefined,
    valoresCuotas: valores ? editables.filter((c) => valorEditado(c) !== valorActual(c)).map((c) => ({ numero: c.numero, valor: String(valorEditado(c)) })) : undefined,
  })

  function alternarPorCuota(activar: boolean) {
    setVista(null)
    setPorCuota(activar ? Object.fromEntries(pendientes.map((c) => [c.numero, fechaParaInput(c.fechaVencimiento)])) : null)
  }

  function alternarValores(activar: boolean) {
    setVista(null)
    setValores(activar ? Object.fromEntries(editables.map((c) => [c.numero, String(valorActual(c))])) : null)
  }

  // Reparte en partes iguales lo que falta por pagar entre las cuotas mensuales pendientes: lo que queda del total, después de
  // lo que ya está pagado y de la cuota inicial (con el valor que lleva en pantalla). La última absorbe el residuo.
  function repartirEnPartesIguales() {
    if (!valores || pendientes.length === 0) return
    const pagadas = cuotas.filter((c) => c.estado === 'PAGADA' && c.numero >= 1).reduce((suma, c) => suma + valorActual(c), 0)
    const inicial = cuotaCero ? valorEditado(cuotaCero) : 0
    const aRepartir = totalPlan - pagadas - inicial
    const base = Math.floor(aRepartir / pendientes.length)
    const nuevos = { ...valores }
    pendientes.forEach((c, i) => {
      nuevos[c.numero] = String(i === pendientes.length - 1 ? aRepartir - base * (pendientes.length - 1) : base)
    })
    setVista(null)
    setValores(nuevos)
  }

  function cerrar() {
    setAbierto(false)
    setMotivo('')
    setFechaInicial('')
    setFechaPrimera('')
    setPorCuota(null)
    setValores(null)
    setVista(null)
    setError(null)
  }

  // Cualquier cambio en el formulario invalida la vista previa: hay que volver a verla antes de guardar.
  const alCambiar = (poner: (valor: string) => void) => (valor: string) => {
    poner(valor)
    setVista(null)
  }

  const hayAlgoQueAjustar = Boolean(fechaInicial || fechaPrimera || porCuota || cambiaValores)
  const totalCuadra = !valores || diferencia === 0

  async function verCambios(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setTrabajando(true)
    try {
      setVista(await ajustarPlanDePagos(ventaId, { ...datos(), soloVistaPrevia: true }))
    } catch (err) {
      setVista(null)
      setError(err instanceof Error ? err.message : 'No se pudieron calcular los cambios')
    } finally {
      setTrabajando(false)
    }
  }

  async function guardar() {
    if (!vista) return
    const cambiaDinero = vista.cambios.some((c) => c.valorAntes !== c.valorDespues)
    const aviso = cambiaDinero
      ? `Se ajustarán ${vista.cambios.length} cuota(s), con cambios en sus valores. El total del plan y lo ya pagado no cambian. ¿Guardar el ajuste?`
      : `Se cambiarán las fechas de ${vista.cambios.length} cuota(s). Los valores y lo pagado no cambian. ¿Guardar el ajuste?`
    if (!window.confirm(aviso)) return
    setError(null)
    setTrabajando(true)
    try {
      await ajustarPlanDePagos(ventaId, datos())
      cerrar()
      onCambio()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el ajuste')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Ajustar el plan de pagos</h2>
          <p className="text-xs text-slate-500">
            Cambia las fechas y los valores de las cuotas que faltan por pagar (por ejemplo, para reorganizar la venta según el contrato). El total del plan y lo ya pagado no cambian.
          </p>
        </div>
        {!abierto && (
          <button type="button" onClick={() => setAbierto(true)} className={CLASE_BOTON_SECUNDARIO}>
            Ajustar plan
          </button>
        )}
      </div>

      {abierto && (
        <form onSubmit={verCambios} className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <Aviso error={error} />
          <Campo id="ajuste-motivo" etiqueta="¿Por qué se ajusta?" ayuda="Queda en la auditoría. Mínimo 10 caracteres.">
            <textarea
              id="ajuste-motivo"
              required
              minLength={10}
              maxLength={500}
              rows={2}
              value={motivo}
              onChange={(e) => alCambiar(setMotivo)(e.target.value)}
              placeholder="Ej. El contrato fija el saldo en dos cuotas distintas"
              className={CLASE_INPUT}
            />
          </Campo>

          <p className="text-sm font-medium text-slate-700">Fechas</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {inicialEditable && cuotaCero && (
              <Campo id="ajuste-inicial" etiqueta="Nueva fecha límite de la cuota inicial" ayuda={`Hoy vence el ${formatearFecha(cuotaCero.fechaVencimiento)}.`}>
                <input id="ajuste-inicial" type="date" value={fechaInicial} onChange={(e) => alCambiar(setFechaInicial)(e.target.value)} className={CLASE_INPUT} />
              </Campo>
            )}
            {primeraPendiente && !porCuota && (
              <Campo
                id="ajuste-primera"
                etiqueta={`Fecha de la primera cuota pendiente (${etiquetaCuota(primeraPendiente.numero)})`}
                ayuda={`Hoy vence el ${formatearFecha(primeraPendiente.fechaVencimiento)}. Las siguientes caen el mismo día de cada mes.`}
              >
                <input id="ajuste-primera" type="date" value={fechaPrimera} onChange={(e) => alCambiar(setFechaPrimera)(e.target.value)} className={CLASE_INPUT} />
              </Campo>
            )}
          </div>

          {primeraPendiente && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={porCuota !== null} onChange={(e) => alternarPorCuota(e.target.checked)} />
              Poner la fecha de cada cuota una por una
            </label>
          )}
          {porCuota && (
            <div className="rounded-md border border-slate-200 bg-white">
              <p className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
                Solo aparecen las cuotas que faltan por pagar. Cambia la fecha de las que lo necesiten; las fechas deben ir en orden.
              </p>
              <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto text-sm">
                {pendientes.map((cuota) => (
                  <li key={cuota.numero} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                    <span className="text-slate-800">{etiquetaCuota(cuota.numero)}</span>
                    <input
                      type="date"
                      aria-label={`Fecha de la ${etiquetaCuota(cuota.numero)}`}
                      value={porCuota[cuota.numero] ?? ''}
                      onChange={(e) => {
                        setVista(null)
                        setPorCuota({ ...porCuota, [cuota.numero]: e.target.value })
                      }}
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="pt-1 text-sm font-medium text-slate-700">Valores</p>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={valores !== null} onChange={(e) => alternarValores(e.target.checked)} />
            Cambiar el valor de las cuotas que faltan
          </label>
          {valores && (
            <div className="rounded-md border border-slate-200 bg-white">
              <p className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
                El total del plan no cambia: lo que bajes en una cuota, súbelo en otra. Una cuota con pagos no puede quedar por debajo de lo ya pagado.
              </p>
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-sm">
                {editables.map((cuota) => (
                  <li key={cuota.numero} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                    <div className="min-w-0">
                      <p className="text-slate-800">{etiquetaCuota(cuota.numero)}</p>
                      {Number(cuota.pagado ?? 0) > 0 && <p className="text-xs text-slate-500">Pagado {formatearCOP(cuota.pagado ?? 0)}</p>}
                    </div>
                    <input
                      inputMode="numeric"
                      aria-label={`Valor de la ${etiquetaCuota(cuota.numero)}`}
                      value={valores[cuota.numero] ?? ''}
                      onChange={(e) => {
                        setVista(null)
                        setValores({ ...valores, [cuota.numero]: soloDigitos(e.target.value) })
                      }}
                      className="w-36 rounded-md border border-slate-300 px-2 py-1 text-right text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </li>
                ))}
              </ul>
              <div className="space-y-2 border-t border-slate-100 px-3 py-2 text-sm">
                <p className={diferencia === 0 ? 'text-green-700' : 'text-amber-700'}>
                  Las cuotas suman <strong>{formatearCOP(totalNuevo)}</strong> y deben sumar <strong>{formatearCOP(totalPlan)}</strong>.{' '}
                  {diferencia === 0 ? 'Cuadra.' : `${diferencia < 0 ? 'Faltan' : 'Sobran'} ${formatearCOP(Math.abs(diferencia))} por distribuir.`}
                </p>
                {pendientes.length > 0 && (
                  <button type="button" onClick={repartirEnPartesIguales} className={CLASE_BOTON_SECUNDARIO}>
                    Repartir lo que falta en partes iguales
                  </button>
                )}
              </div>
            </div>
          )}

          {vista && (
            <div className="rounded-md border border-blue-200 bg-white">
              <p className="border-b border-blue-100 px-3 py-2 text-sm font-medium text-slate-700">Así quedaría el plan</p>
              <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto text-sm">
                {vista.cambios.map((cambio) => {
                  const cambiaFecha = fechaParaInput(cambio.antes) !== fechaParaInput(cambio.despues)
                  const cambiaValor = cambio.valorAntes !== cambio.valorDespues
                  return (
                    <li key={cambio.cuotaId} className="flex flex-wrap items-start justify-between gap-2 px-3 py-1.5">
                      <span className="text-slate-800">{etiquetaCuota(cambio.numero)}</span>
                      <span className="text-right text-slate-600">
                        {cambiaFecha && (
                          <span className="block">
                            {formatearFecha(cambio.antes)} → <strong className="text-slate-900">{formatearFecha(cambio.despues)}</strong>
                          </span>
                        )}
                        {cambiaValor && (
                          <span className="block">
                            {formatearCOP(cambio.valorAntes)} → <strong className="text-slate-900">{formatearCOP(cambio.valorDespues)}</strong>
                          </span>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
              <p className="border-t border-blue-100 px-3 py-2 text-xs text-slate-500">
                Total de las cuotas: <strong>{formatearCOP(vista.totalCuotas)}</strong> (no cambia).
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={trabajando || !hayAlgoQueAjustar || !totalCuadra} className={vista ? CLASE_BOTON_SECUNDARIO : CLASE_BOTON}>
              {trabajando && !vista ? 'Calculando...' : 'Ver cambios'}
            </button>
            {vista && (
              <button type="button" onClick={() => void guardar()} disabled={trabajando} className={CLASE_BOTON}>
                {trabajando ? 'Guardando...' : 'Guardar ajuste'}
              </button>
            )}
            <button type="button" onClick={cerrar} disabled={trabajando} className={CLASE_BOTON_SECUNDARIO}>
              Cancelar
            </button>
            {!totalCuadra && <span className="text-xs text-amber-700">Primero deja la diferencia en $0.</span>}
          </div>
        </form>
      )}
    </section>
  )
}
