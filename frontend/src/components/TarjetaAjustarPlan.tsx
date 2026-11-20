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
// Tope de digitación para el número de cuotas de un plan (el mismo del servidor).
const MAXIMO_CUOTAS = 240

// Una cuota que todavía no existe: nace al ampliar el plazo, con valor 0 hasta que se reparte el saldo.
const cuotaNueva = (numero: number) => ({ numero, valor: '0', estado: 'PENDIENTE', fechaVencimiento: '', pagado: '0' }) as unknown as Cuota

// Ajustar el plan de una venta ya registrada (CC-08): las fechas y/o los valores de las cuotas que todavía no están pagadas, y
// ampliar el plazo agregando cuotas al final. El total del plan no cambia (lo que se baja en una cuota se sube en otra) y lo ya
// pagado no se toca.
export function TarjetaAjustarPlan({ ventaId, cuotas, puedeAjustar, onCambio }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [fechaInicial, setFechaInicial] = useState('')
  const [fechaPrimera, setFechaPrimera] = useState('')
  // Fecha de cada cuota pendiente elegida una por una (null = se usa la fecha de la primera pendiente).
  const [porCuota, setPorCuota] = useState<Record<number, string> | null>(null)
  // Valor de cada cuota que se puede cambiar (null = no se cambian los valores).
  const [valores, setValores] = useState<Record<number, string> | null>(null)
  // Ampliar el plazo: el número TOTAL de cuotas mensuales que debe quedar.
  const [ampliar, setAmpliar] = useState(false)
  const [numeroNuevo, setNumeroNuevo] = useState('')
  const [vista, setVista] = useState<RespuestaAjustarPlan | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!puedeAjustar || cuotas.length === 0) return null

  const cuotaCero = cuotas.find((c) => c.numero === 0)
  const inicialEditable = cuotaCero && cuotaCero.estado !== 'PAGADA'
  const pendientes = cuotas.filter((c) => c.numero >= 1 && c.estado !== 'PAGADA').sort((a, b) => a.numero - b.numero)
  const primeraPendiente = pendientes[0]
  if (!inicialEditable && !primeraPendiente) return null

  // Ampliar el plazo: cuántas cuotas mensuales tiene hoy el plan y las nuevas que se agregarían.
  const cuotasActuales = Math.max(0, ...cuotas.filter((c) => c.numero >= 1).map((c) => c.numero))
  const numeroDeseado = Number(numeroNuevo) || 0
  const ampliaValida = ampliar && numeroDeseado > cuotasActuales && numeroDeseado <= MAXIMO_CUOTAS
  const nuevas = ampliaValida ? Array.from({ length: numeroDeseado - cuotasActuales }, (_, i) => cuotaNueva(cuotasActuales + 1 + i)) : []

  // Las cuotas cuyo valor se puede cambiar: la cuota inicial (si no está pagada), las pendientes y las nuevas.
  const editables = [...(inicialEditable && cuotaCero ? [cuotaCero] : []), ...pendientes, ...nuevas]
  const esNueva = (c: Cuota) => c.numero > cuotasActuales
  const valorActual = (c: Cuota) => Number(c.valor)
  const valorEditado = (c: Cuota) => (valores && valores[c.numero] !== undefined && valores[c.numero] !== '' ? Number(valores[c.numero]) : valorActual(c))
  // El total del plan (con lo pagado y todo) no puede cambiar.
  const totalPlan = cuotas.reduce((suma, c) => suma + valorActual(c), 0)
  const totalNuevo = cuotas.reduce((suma, c) => suma + valorEditado(c), 0) + nuevas.reduce((suma, c) => suma + valorEditado(c), 0)
  const diferencia = totalNuevo - totalPlan
  const cambiaValores = valores !== null && editables.some((c) => valorEditado(c) !== valorActual(c))

  const datos = () => ({
    motivo: motivo.trim(),
    fechaCuotaInicial: inicialEditable && fechaInicial ? fechaInicial : undefined,
    fechaPrimeraCuotaPendiente: !porCuota && primeraPendiente && fechaPrimera ? fechaPrimera : undefined,
    fechasCuotas: porCuota
      ? [...pendientes, ...nuevas].map((c) => ({ numero: c.numero, fecha: porCuota[c.numero] ?? '' })).filter((f) => f.fecha)
      : undefined,
    valoresCuotas: valores ? editables.filter((c) => valorEditado(c) !== valorActual(c)).map((c) => ({ numero: c.numero, valor: String(valorEditado(c)) })) : undefined,
    numeroCuotas: ampliaValida ? numeroDeseado : undefined,
  })

  // Reparte en partes iguales lo que falta por pagar entre las cuotas mensuales pendientes (y las nuevas): lo que queda del total,
  // después de lo ya pagado y de la cuota inicial (con el valor que lleva en pantalla). La última absorbe el residuo.
  function repartir(aRepartirEntre: Cuota[], base: Record<number, string>) {
    const pagadas = cuotas.filter((c) => c.estado === 'PAGADA' && c.numero >= 1).reduce((suma, c) => suma + valorActual(c), 0)
    const inicial = cuotaCero ? Number(base[0] ?? valorActual(cuotaCero)) : 0
    const aRepartir = totalPlan - pagadas - inicial
    const parte = Math.floor(aRepartir / aRepartirEntre.length)
    const resultado = { ...base }
    aRepartirEntre.forEach((c, i) => {
      resultado[c.numero] = String(i === aRepartirEntre.length - 1 ? aRepartir - parte * (aRepartirEntre.length - 1) : parte)
    })
    return resultado
  }

  const valoresDeHoy = () => Object.fromEntries([...(inicialEditable && cuotaCero ? [cuotaCero] : []), ...pendientes].map((c) => [c.numero, String(valorActual(c))]))

  function alternarPorCuota(activar: boolean) {
    setVista(null)
    setPorCuota(activar ? Object.fromEntries(pendientes.map((c) => [c.numero, fechaParaInput(c.fechaVencimiento)])) : null)
  }

  function alternarValores(activar: boolean) {
    setVista(null)
    setValores(activar ? valoresDeHoy() : null)
  }

  function repartirEnPartesIguales() {
    if (!valores || pendientes.length + nuevas.length === 0) return
    setVista(null)
    setValores(repartir([...pendientes, ...nuevas], valores))
  }

  // Al escribir el número de cuotas, si es válido, se reparte el saldo entre todas las que quedarían (en partes iguales, editable).
  function cambiarNumero(texto: string) {
    const digitos = soloDigitos(texto)
    setNumeroNuevo(digitos)
    setVista(null)
    const n = Number(digitos)
    if (n > cuotasActuales && n <= MAXIMO_CUOTAS) {
      const base = Object.fromEntries(Object.entries(valores ?? valoresDeHoy()).filter(([numero]) => Number(numero) <= cuotasActuales))
      const lasNuevas = Array.from({ length: n - cuotasActuales }, (_, i) => cuotaNueva(cuotasActuales + 1 + i))
      setValores(repartir([...pendientes, ...lasNuevas], base))
    }
  }

  function alternarAmpliar(activar: boolean) {
    setVista(null)
    setAmpliar(activar)
    if (!activar) {
      // Sin ampliar, el reparto automático ya no tiene sentido: se vuelve a los valores de hoy.
      setNumeroNuevo('')
      setValores(null)
      if (porCuota) setPorCuota(Object.fromEntries(Object.entries(porCuota).filter(([numero]) => Number(numero) <= cuotasActuales)))
    }
  }

  function cerrar() {
    setAbierto(false)
    setMotivo('')
    setFechaInicial('')
    setFechaPrimera('')
    setPorCuota(null)
    setValores(null)
    setAmpliar(false)
    setNumeroNuevo('')
    setVista(null)
    setError(null)
  }

  // Cualquier cambio en el formulario invalida la vista previa: hay que volver a verla antes de guardar.
  const alCambiar = (poner: (valor: string) => void) => (valor: string) => {
    poner(valor)
    setVista(null)
  }

  const hayAlgoQueAjustar = Boolean(fechaInicial || fechaPrimera || porCuota || cambiaValores || ampliaValida)
  const totalCuadra = !valores || diferencia === 0
  // Al ampliar hay que decir cómo queda el valor de cada cuota nueva: sin valores no se puede ver ni guardar.
  const faltaElReparto = ampliar && !ampliaValida

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
    const agregadas = vista.cambios.filter((c) => c.nueva).length
    const cambiaDinero = vista.cambios.some((c) => c.valorAntes !== c.valorDespues)
    const aviso =
      agregadas > 0
        ? `El plan pasará de ${vista.numeroCuotasAntes} a ${vista.numeroCuotasDespues} cuotas: se agregan ${agregadas} cuota(s) nueva(s) y se ajustan los valores de las demás. El total del plan y lo ya pagado no cambian. ¿Guardar el ajuste?`
        : cambiaDinero
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
            Cambia las fechas y los valores de las cuotas que faltan por pagar, o amplía el plazo agregando cuotas (por ejemplo, para reorganizar la venta según el contrato). El total del plan y lo ya pagado no cambian.
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
                Solo aparecen las cuotas que faltan por pagar{nuevas.length > 0 ? ' y las nuevas (si dejas la fecha de una nueva vacía, cae mes a mes después de la anterior)' : ''}. Las fechas deben ir en orden.
              </p>
              <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto text-sm">
                {[...pendientes, ...nuevas].map((cuota) => (
                  <li key={cuota.numero} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                    <span className="text-slate-800">
                      {etiquetaCuota(cuota.numero)}
                      {esNueva(cuota) && <span className="ml-1 text-xs text-blue-700">(nueva)</span>}
                    </span>
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

          <p className="pt-1 text-sm font-medium text-slate-700">Número de cuotas</p>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={ampliar} onChange={(e) => alternarAmpliar(e.target.checked)} />
            Ampliar el plazo (agregar cuotas al final)
          </label>
          {ampliar && (
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <Campo
                id="ajuste-numero-cuotas"
                etiqueta="Cuántas cuotas mensuales debe tener el plan en total"
                ayuda={`Hoy tiene ${cuotasActuales}. Escribe un número mayor: las cuotas que ya existen se conservan y se agregan las del final. El saldo que falta se reparte entre todas las que quedan.`}
              >
                <input
                  id="ajuste-numero-cuotas"
                  inputMode="numeric"
                  value={numeroNuevo}
                  onChange={(e) => cambiarNumero(e.target.value)}
                  placeholder={String(cuotasActuales + 1)}
                  className={`${CLASE_INPUT} max-w-32`}
                />
              </Campo>
              {faltaElReparto && numeroNuevo !== '' && (
                <p className="mt-1 text-xs text-amber-700">
                  {numeroDeseado <= cuotasActuales ? `Escribe un número mayor a ${cuotasActuales}.` : `El máximo es ${MAXIMO_CUOTAS} cuotas.`}
                </p>
              )}
              {ampliaValida && (
                <p className="mt-1 text-xs text-slate-500">
                  Se agregan {nuevas.length} cuota(s): de la {cuotasActuales + 1} a la {numeroDeseado}. Revisa abajo el valor de cada una; puedes cambiarlo.
                </p>
              )}
            </div>
          )}

          <p className="pt-1 text-sm font-medium text-slate-700">Valores</p>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={valores !== null} disabled={ampliaValida} onChange={(e) => alternarValores(e.target.checked)} />
            Cambiar el valor de las cuotas que faltan
            {ampliaValida && <span className="text-xs text-slate-500">(al ampliar el plazo se reparte el saldo)</span>}
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
                      <p className="text-slate-800">
                        {etiquetaCuota(cuota.numero)}
                        {esNueva(cuota) && <span className="ml-1 text-xs text-blue-700">(nueva)</span>}
                      </p>
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
                {pendientes.length + nuevas.length > 0 && (
                  <button type="button" onClick={repartirEnPartesIguales} className={CLASE_BOTON_SECUNDARIO}>
                    Repartir lo que falta en partes iguales
                  </button>
                )}
              </div>
            </div>
          )}

          {vista && (
            <div className="rounded-md border border-blue-200 bg-white">
              <p className="border-b border-blue-100 px-3 py-2 text-sm font-medium text-slate-700">
                Así quedaría el plan
                {vista.numeroCuotasDespues !== vista.numeroCuotasAntes && (
                  <span className="ml-2 font-normal text-slate-600">
                    (de {vista.numeroCuotasAntes} a {vista.numeroCuotasDespues} cuotas)
                  </span>
                )}
              </p>
              <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto text-sm">
                {vista.cambios.map((cambio) => {
                  const cambiaFecha = !cambio.nueva && fechaParaInput(cambio.antes) !== fechaParaInput(cambio.despues)
                  const cambiaValor = cambio.valorAntes !== cambio.valorDespues
                  return (
                    <li key={cambio.cuotaId} className="flex flex-wrap items-start justify-between gap-2 px-3 py-1.5">
                      <span className="text-slate-800">
                        {etiquetaCuota(cambio.numero)}
                        {cambio.nueva && <span className="ml-1 text-xs text-blue-700">(nueva)</span>}
                      </span>
                      <span className="text-right text-slate-600">
                        {cambio.nueva && <span className="block">Vence el {formatearFecha(cambio.despues)}</span>}
                        {cambiaFecha && (
                          <span className="block">
                            {formatearFecha(cambio.antes)} → <strong className="text-slate-900">{formatearFecha(cambio.despues)}</strong>
                          </span>
                        )}
                        {cambiaValor && (
                          <span className="block">
                            {cambio.nueva ? <strong className="text-slate-900">{formatearCOP(cambio.valorDespues)}</strong> : (
                              <>
                                {formatearCOP(cambio.valorAntes)} → <strong className="text-slate-900">{formatearCOP(cambio.valorDespues)}</strong>
                              </>
                            )}
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
            <button type="submit" disabled={trabajando || !hayAlgoQueAjustar || !totalCuadra || faltaElReparto} className={vista ? CLASE_BOTON_SECUNDARIO : CLASE_BOTON}>
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
