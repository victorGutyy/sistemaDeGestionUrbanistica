import { useEffect, useState } from 'react'
import { vistaPreviaPlan, type VistaPreviaPlan as Plan, type VistaPreviaPlanPayload } from '../lib/api'
import { formatearCOP, formatearFecha } from '../lib/formato'

interface Props {
  // Condiciones del plan; null mientras falten datos (valor total, cuota inicial o cuotas).
  condiciones: VistaPreviaPlanPayload | null
  // Lo que se recibe al vender (p. ej. la separación): se muestra como pagado y lo que queda por pagar de la cuota inicial.
  recibidoHoy?: number
}

// Muestra cómo quedaría el plan de pagos antes de registrar la venta (CC-08), con el mismo cálculo del servidor.
export function VistaPreviaPlan({ condiciones, recibidoHoy = 0 }: Props) {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const clave = condiciones ? JSON.stringify(condiciones) : ''

  useEffect(() => {
    if (!condiciones) {
      setPlan(null)
      setError(null)
      return
    }
    let vigente = true
    // Espera un momento para no consultar en cada tecla.
    const espera = setTimeout(() => {
      vistaPreviaPlan(condiciones)
        .then((respuesta) => {
          if (!vigente) return
          setPlan(respuesta)
          setError(null)
        })
        .catch((err: Error) => {
          if (!vigente) return
          setPlan(null)
          setError(err.message)
        })
    }, 450)
    return () => {
      vigente = false
      clearTimeout(espera)
    }
    // La clave resume las condiciones: solo se vuelve a consultar cuando cambian.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])

  if (!condiciones) return null
  if (error) return <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</p>
  if (!plan) return <p className="text-xs text-slate-400">Calculando el plan...</p>

  const inicial = plan.cuotaInicial
  const pendienteInicial = inicial ? Math.max(Number(inicial.valor) - recibidoHoy, 0) : 0

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <p className="border-b border-slate-100 px-3 py-2 text-sm font-medium text-slate-700">Así quedaría el plan de pagos</p>
      <ul className="divide-y divide-slate-100 text-sm">
        {inicial && (
          <li className="flex items-start justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="font-medium text-slate-900">Cuota inicial</p>
              <p className="text-xs text-slate-500">
                {recibidoHoy > 0 ? `Recibido hoy ${formatearCOP(recibidoHoy)}. ` : ''}
                {pendienteInicial > 0 ? `Saldo ${formatearCOP(pendienteInicial)} · vence ${formatearFecha(inicial.fechaLimite)}` : 'Pagada completa'}
              </p>
            </div>
            <p className="whitespace-nowrap text-slate-900">{formatearCOP(inicial.valor)}</p>
          </li>
        )}
        {plan.cuotas.map((cuota) => (
          <li key={cuota.numero} className="flex items-center justify-between gap-3 px-3 py-1.5">
            <div className="min-w-0">
              <p className="text-slate-800">Cuota {cuota.numero}</p>
              <p className="text-xs text-slate-500">Vence {formatearFecha(cuota.fechaVencimiento)}</p>
            </div>
            <p className="whitespace-nowrap text-slate-800">{formatearCOP(cuota.valor)}</p>
          </li>
        ))}
      </ul>
      <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
        Suma de las cuotas: <strong>{formatearCOP(plan.totalCuotas)}</strong> (saldo a financiar {formatearCOP(plan.saldoFinanciado)}). La última cuota absorbe el residuo
        del redondeo para que la suma cuadre exacta.
      </p>
    </div>
  )
}
