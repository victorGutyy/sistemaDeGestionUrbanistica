import { useState, type FormEvent } from 'react'
import { corregirPagoNomina, type CorregirPagoPayload, type CuentaBancaria, type MedioPago, type MedioPagoConfig, type PagoNomina } from '../../lib/api'
import { fechaParaInput, formatearCOP } from '../../lib/formato'
import { aNumeroLiquidacion, calcularFila } from '../../lib/liquidacion'
import { CuentaYReferencia } from '../CuentaYReferencia'
import { Aviso, CLASE_BOTON, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Campo } from '../formulario'

interface Props {
  pago: PagoNomina
  diasPeriodo: number
  mediosPago: MedioPagoConfig[]
  cuentas: CuentaBancaria[]
  // Se llama después de guardar, con los avisos para revisar (por ejemplo, días de más entre obras).
  onGuardado: (avisos: string[]) => void
  onCancelar: () => void
}

const soloDigitos = (texto: string) => texto.replace(/\D/g, '')
// Días y horas admiten coma o punto decimal.
const soloNumero = (texto: string) => texto.replace(/[^\d.,]/g, '')
const comoTexto = (valor: string | null | undefined) => (valor && Number(valor) > 0 ? String(Number(valor)) : '')
const sumaDe = (pago: PagoNomina, tipo: string) => pago.novedades.filter((n) => n.tipo === tipo).reduce((suma, n) => suma + Number(n.valor), 0)

// Corregir un pago ya liquidado por obra (CC-09, RF-PER-26): los mismos campos de la liquidación, el motivo y la vista del
// resultado. Solo se envía lo que cambió; el servidor recalcula, revisa el cierre de caja y deja todo en la auditoría.
export function CorregirPagoForm({ pago, diasPeriodo, mediosPago, cuentas, onGuardado, onCancelar }: Props) {
  const anticipoInicial = sumaDe(pago, 'ANTICIPO')
  const descuentoInicial = sumaDe(pago, 'DESCUENTO')
  // Novedades que este formulario no edita (incapacidad y horas extra de pagos anteriores): se conservan y cuentan en el total.
  const otrasResta = sumaDe(pago, 'INCAPACIDAD')
  const otrasSuma = sumaDe(pago, 'HORAS_EXTRA')

  const [dias, setDias] = useState(comoTexto(pago.dias))
  const [valorDia, setValorDia] = useState(comoTexto(pago.valorDia))
  const [horasExtra, setHorasExtra] = useState(comoTexto(pago.horasExtra))
  const [valorHoraExtra, setValorHoraExtra] = useState(comoTexto(pago.valorHoraExtra))
  const [anticipo, setAnticipo] = useState(anticipoInicial > 0 ? String(anticipoInicial) : '')
  const [descuento, setDescuento] = useState(descuentoInicial > 0 ? String(descuentoInicial) : '')
  const [observaciones, setObservaciones] = useState(pago.observaciones ?? '')
  const [fechaPago, setFechaPago] = useState(fechaParaInput(pago.fechaPago))
  const [medioPago, setMedioPago] = useState<MedioPago | ''>(pago.medioPago ?? mediosPago[0]?.medio ?? '')
  const [cuentaId, setCuentaId] = useState(pago.cuentaId ?? '')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const id = (campo: string) => `corregir-${pago.id}-${campo}`
  const entrada = {
    dias: aNumeroLiquidacion(dias),
    valorDia: aNumeroLiquidacion(valorDia),
    horasExtra: aNumeroLiquidacion(horasExtra),
    valorHoraExtra: aNumeroLiquidacion(valorHoraExtra),
    anticipo: aNumeroLiquidacion(anticipo),
    descuento: aNumeroLiquidacion(descuento),
  }
  const calculo = calcularFila(entrada)
  const neto = calculo.neto - otrasResta + otrasSuma
  const anterior = { devengado: Number(pago.valorDevengado ?? pago.valorPagado), pagado: Number(pago.valorPagado) }

  // Lo que cambió respecto al pago guardado.
  const cambios: Partial<CorregirPagoPayload> = {}
  if (entrada.dias !== Number(pago.dias ?? 0)) cambios.dias = String(entrada.dias)
  if (entrada.valorDia !== Number(pago.valorDia ?? 0)) cambios.valorDia = String(entrada.valorDia)
  if (entrada.horasExtra !== Number(pago.horasExtra ?? 0)) cambios.horasExtra = String(entrada.horasExtra)
  if (entrada.valorHoraExtra !== Number(pago.valorHoraExtra ?? 0)) cambios.valorHoraExtra = String(entrada.valorHoraExtra)
  if (entrada.anticipo !== anticipoInicial || entrada.descuento !== descuentoInicial) {
    // Reemplaza las novedades: se conservan las que el formulario no edita y se arman anticipo y descuento.
    cambios.novedades = [
      ...pago.novedades
        .filter((n) => n.tipo !== 'ANTICIPO' && n.tipo !== 'DESCUENTO')
        .map((n) => ({ tipo: n.tipo, valor: String(Number(n.valor)), descripcion: n.descripcion ?? undefined })),
      ...(entrada.anticipo > 0 ? [{ tipo: 'ANTICIPO' as const, valor: String(entrada.anticipo), descripcion: pago.novedades.find((n) => n.tipo === 'ANTICIPO')?.descripcion ?? undefined }] : []),
      ...(entrada.descuento > 0 ? [{ tipo: 'DESCUENTO' as const, valor: String(entrada.descuento), descripcion: pago.novedades.find((n) => n.tipo === 'DESCUENTO')?.descripcion ?? undefined }] : []),
    ]
  }
  if (observaciones.trim() !== (pago.observaciones ?? '')) cambios.observaciones = observaciones.trim()
  if (fechaPago !== fechaParaInput(pago.fechaPago)) cambios.fechaPago = fechaPago
  if (medioPago && medioPago !== pago.medioPago) cambios.medioPago = medioPago
  if (medioPago && medioPago !== 'EFECTIVO' && (medioPago !== pago.medioPago || cuentaId !== (pago.cuentaId ?? ''))) cambios.cuentaId = cuentaId || undefined
  const hayCambios = Object.keys(cambios).length > 0

  const demasiadosDias = diasPeriodo > 0 && entrada.dias > diasPeriodo

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (entrada.dias === 0) return setError('Escribe los días trabajados')
    if (entrada.valorDia === 0) return setError('Falta el valor día')
    if (entrada.horasExtra > 0 && entrada.valorHoraExtra === 0) return setError('Escribe el valor de la hora extra')
    if (motivo.trim().length < 10) return setError('Explica la corrección con al menos 10 caracteres')
    if (medioPago && medioPago !== 'EFECTIVO' && !cuentaId) return setError('Elige la cuenta de donde salió el dinero')
    setEnviando(true)
    try {
      const resultado = await corregirPagoNomina(pago.id, { ...cambios, motivo: motivo.trim() })
      onGuardado(resultado.avisos.map((a) => a.mensaje))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo corregir el pago')
    } finally {
      setEnviando(false)
    }
  }

  const campoFila = (campo: string, etiqueta: string, children: React.ReactNode) => (
    <div>
      <label htmlFor={id(campo)} className="block text-xs text-slate-500">
        {etiqueta}
      </label>
      {children}
    </div>
  )
  const claseFila = `${CLASE_INPUT} mt-0.5`

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <Aviso error={error} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {campoFila('dias', 'Días', <input id={id('dias')} inputMode="decimal" value={dias} onChange={(e) => setDias(soloNumero(e.target.value))} className={claseFila} />)}
        {campoFila('valorDia', 'Valor día', <input id={id('valorDia')} inputMode="numeric" value={valorDia} onChange={(e) => setValorDia(soloDigitos(e.target.value))} className={claseFila} />)}
        {campoFila('horasExtra', 'Horas extra', <input id={id('horasExtra')} inputMode="decimal" placeholder="0" value={horasExtra} onChange={(e) => setHorasExtra(soloNumero(e.target.value))} className={claseFila} />)}
        {campoFila('valorHoraExtra', 'Valor hora extra', <input id={id('valorHoraExtra')} inputMode="numeric" value={valorHoraExtra} onChange={(e) => setValorHoraExtra(soloDigitos(e.target.value))} className={claseFila} />)}
        {campoFila('anticipo', 'Anticipo', <input id={id('anticipo')} inputMode="numeric" value={anticipo} onChange={(e) => setAnticipo(soloDigitos(e.target.value))} className={claseFila} />)}
        {campoFila('descuento', 'Descuento', <input id={id('descuento')} inputMode="numeric" value={descuento} onChange={(e) => setDescuento(soloDigitos(e.target.value))} className={claseFila} />)}
      </div>
      {(otrasResta > 0 || otrasSuma > 0) && (
        <p className="text-xs text-slate-500">
          Este pago también tiene otras novedades (incapacidad u horas extra de antes) que se conservan y cuentan en el total.
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Campo id={id('fechaPago')} etiqueta="Fecha de pago">
          <input id={id('fechaPago')} type="date" required value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id={id('medioPago')} etiqueta="Medio de pago">
          <select id={id('medioPago')} value={medioPago} onChange={(e) => setMedioPago(e.target.value as MedioPago)} className={CLASE_INPUT}>
            {mediosPago.map((medio) => (
              <option key={medio.medio} value={medio.medio}>
                {medio.etiqueta}
              </option>
            ))}
          </select>
        </Campo>
        <div className="sm:col-span-3">
          <CuentaYReferencia
            medioPago={medioPago}
            cuentas={cuentas}
            cuentaId={cuentaId}
            onCuentaChange={setCuentaId}
            referencia=""
            onReferenciaChange={() => undefined}
            etiquetaCuenta="Cuenta de donde salió el dinero"
            mostrarReferencia={false}
          />
        </div>
      </div>

      <Campo id={id('observaciones')} etiqueta="Observaciones (opcional)">
        <input id={id('observaciones')} maxLength={300} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className={CLASE_INPUT} />
      </Campo>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <span className="text-slate-600">
          Devengado: {formatearCOP(anterior.devengado)} → <strong className="text-slate-900">{formatearCOP(calculo.devengado)}</strong>
        </span>
        <span className="text-slate-600">
          A pagar: {formatearCOP(anterior.pagado)} → <strong className={neto < 0 ? 'text-red-600' : 'text-slate-900'}>{formatearCOP(neto)}</strong>
        </span>
      </div>
      {demasiadosDias && <p className="text-xs text-amber-700">Más días ({dias}) que los del período ({diasPeriodo}). Revísalo.</p>}
      {neto < 0 && <p className="text-xs text-red-600">El anticipo y el descuento superan lo devengado.</p>}

      <Campo id={id('motivo')} etiqueta="¿Por qué se corrige?" ayuda="Queda en la auditoría. Mínimo 10 caracteres.">
        <textarea id={id('motivo')} required minLength={10} maxLength={500} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Se digitaron 10 días y eran 12" className={CLASE_INPUT} />
      </Campo>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={enviando || !hayCambios} className={CLASE_BOTON}>
          {enviando ? 'Guardando…' : 'Guardar corrección'}
        </button>
        <button type="button" onClick={onCancelar} disabled={enviando} className={CLASE_BOTON_SECUNDARIO}>
          Cancelar
        </button>
        {!hayCambios && <span className="text-xs text-slate-500">Cambia algún dato para poder guardar.</span>}
      </div>
    </form>
  )
}
