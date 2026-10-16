import type { CuentaBancaria, MedioPago } from '../lib/api'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

interface Props {
  medioPago: MedioPago | ''
  cuentas: CuentaBancaria[]
  cuentaId: string
  onCuentaChange: (id: string) => void
  referencia: string
  onReferenciaChange: (texto: string) => void
}

// Cuenta donde entró el dinero y referencia de la transacción. El efectivo no tiene ninguna de las dos.
export function CuentaYReferencia({ medioPago, cuentas, cuentaId, onCuentaChange, referencia, onReferenciaChange }: Props) {
  if (!medioPago || medioPago === 'EFECTIVO') return null

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="cuentaDestino" className="block text-sm font-medium text-slate-700">
          Cuenta donde entró el dinero
        </label>
        <select id="cuentaDestino" required value={cuentaId} onChange={(event) => onCuentaChange(event.target.value)} className={CLASE_INPUT}>
          <option value="">Elige una cuenta…</option>
          {cuentas.map((cuenta) => (
            <option key={cuenta.id} value={cuenta.id}>
              {cuenta.alias} — {cuenta.banco}
            </option>
          ))}
        </select>
        {cuentas.length === 0 && (
          <p className="mt-1 text-xs text-amber-700">No hay cuentas activas. El gerente debe activar una en Configuración.</p>
        )}
      </div>
      <div>
        <label htmlFor="referencia" className="block text-sm font-medium text-slate-700">
          Referencia de la transacción
        </label>
        <input
          id="referencia"
          maxLength={80}
          value={referencia}
          onChange={(event) => onReferenciaChange(event.target.value)}
          placeholder="Opcional, p. ej. número de aprobación"
          className={CLASE_INPUT}
        />
        <p className="mt-1 text-xs text-slate-500">No se puede repetir en la misma cuenta.</p>
      </div>
    </div>
  )
}
