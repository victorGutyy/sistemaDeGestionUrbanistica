import { useState, type FormEvent } from 'react'
import { ajustarPlanDePagos, type Cuota, type RespuestaAjustarPlan } from '../lib/api'
import { formatearFecha } from '../lib/formato'
import { etiquetaCuota } from '../lib/ventas'
import { Aviso, CLASE_BOTON, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Campo } from './formulario'

interface Props {
  ventaId: string
  cuotas: Cuota[]
  // Solo una venta activa y financiada tiene plan que ajustar, y solo con el permiso de ajustar el plan.
  puedeAjustar: boolean
  // Se llama después de guardar, para recargar la venta (las fechas y los avisos cambian).
  onCambio: () => void
}

// Reprogramar las fechas del plan de una venta ya registrada (CC-08): por ejemplo, cuando el contrato fija las cuotas desde
// una fecha propia. Solo cambian fechas de cuotas que todavía no están pagadas: los valores, lo pagado y el total no se tocan.
export function TarjetaAjustarPlan({ ventaId, cuotas, puedeAjustar, onCambio }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [fechaInicial, setFechaInicial] = useState('')
  const [fechaPrimera, setFechaPrimera] = useState('')
  const [vista, setVista] = useState<RespuestaAjustarPlan | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!puedeAjustar || cuotas.length === 0) return null

  const cuotaCero = cuotas.find((c) => c.numero === 0)
  const inicialEditable = cuotaCero && cuotaCero.estado !== 'PAGADA'
  const primeraPendiente = cuotas.filter((c) => c.numero >= 1 && c.estado !== 'PAGADA').sort((a, b) => a.numero - b.numero)[0]
  if (!inicialEditable && !primeraPendiente) return null

  const datos = () => ({
    motivo: motivo.trim(),
    fechaCuotaInicial: inicialEditable && fechaInicial ? fechaInicial : undefined,
    fechaPrimeraCuotaPendiente: primeraPendiente && fechaPrimera ? fechaPrimera : undefined,
  })

  function cerrar() {
    setAbierto(false)
    setMotivo('')
    setFechaInicial('')
    setFechaPrimera('')
    setVista(null)
    setError(null)
  }

  // Cualquier cambio en el formulario invalida la vista previa: hay que volver a verla antes de guardar.
  const alCambiar = (poner: (valor: string) => void) => (valor: string) => {
    poner(valor)
    setVista(null)
  }

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
    if (!window.confirm(`Se cambiarán las fechas de ${vista.cambios.length} cuota(s). Los valores y lo pagado no cambian. ¿Guardar el ajuste?`)) return
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
          <p className="text-xs text-slate-500">Cambia las fechas de las cuotas que faltan por pagar (por ejemplo, si el contrato las fija desde otra fecha). Los valores y lo pagado no cambian.</p>
        </div>
        {!abierto && (
          <button type="button" onClick={() => setAbierto(true)} className={CLASE_BOTON_SECUNDARIO}>
            Ajustar fechas
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
              placeholder="Ej. El contrato fija las cuotas desde febrero de 2027, los 5 de cada mes"
              className={CLASE_INPUT}
            />
          </Campo>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {inicialEditable && (
              <Campo id="ajuste-inicial" etiqueta="Nueva fecha límite de la cuota inicial" ayuda={`Hoy vence el ${formatearFecha(cuotaCero.fechaVencimiento)}.`}>
                <input id="ajuste-inicial" type="date" value={fechaInicial} onChange={(e) => alCambiar(setFechaInicial)(e.target.value)} className={CLASE_INPUT} />
              </Campo>
            )}
            {primeraPendiente && (
              <Campo
                id="ajuste-primera"
                etiqueta={`Fecha de la primera cuota pendiente (${etiquetaCuota(primeraPendiente.numero)})`}
                ayuda={`Hoy vence el ${formatearFecha(primeraPendiente.fechaVencimiento)}. Las siguientes caen el mismo día de cada mes.`}
              >
                <input id="ajuste-primera" type="date" value={fechaPrimera} onChange={(e) => alCambiar(setFechaPrimera)(e.target.value)} className={CLASE_INPUT} />
              </Campo>
            )}
          </div>

          {vista && (
            <div className="rounded-md border border-blue-200 bg-white">
              <p className="border-b border-blue-100 px-3 py-2 text-sm font-medium text-slate-700">Así quedarían las fechas</p>
              <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto text-sm">
                {vista.cambios.map((cambio) => (
                  <li key={cambio.cuotaId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                    <span className="text-slate-800">{etiquetaCuota(cambio.numero)}</span>
                    <span className="text-slate-600">
                      {formatearFecha(cambio.antes)} → <strong className="text-slate-900">{formatearFecha(cambio.despues)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={trabajando || (!fechaInicial && !fechaPrimera)} className={vista ? CLASE_BOTON_SECUNDARIO : CLASE_BOTON}>
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
          </div>
        </form>
      )}
    </section>
  )
}
