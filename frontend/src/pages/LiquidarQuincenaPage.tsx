import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CuentaYReferencia } from '../components/CuentaYReferencia'
import { NuevoTrabajadorModal } from '../components/trabajador/NuevoTrabajadorModal'
import { Aviso, CLASE_BOTON, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Campo, Seccion } from '../components/formulario'
import {
  liquidarQuincena,
  listarCuentasActivas,
  listarMediosPago,
  listarPagosNomina,
  listarProyectos,
  listarTrabajadores,
  type CuentaBancaria,
  type LiquidarQuincenaPayload,
  type MedioPago,
  type MedioPagoConfig,
  type Proyecto,
  type ResultadoLiquidacion,
  type Trabajador,
} from '../lib/api'
import { formatearCOP, hoyEnBogota } from '../lib/formato'
import { aNumeroLiquidacion, calcularFila, diasDelPeriodo, quincenaAnterior, quincenaDe, ultimaQuincenaTerminada } from '../lib/liquidacion'

// Liquidar quincena (CC-05, RF-PER-21): una obra y una quincena, una tarjeta por trabajador, como el Excel de la empresa.
// Cada trabajador recibe UN pago por obra; si trabajó en dos obras, se liquida una obra y luego la otra.

interface Fila {
  clave: number
  trabajadorId: string
  dias: string
  valorDia: string
  horasExtra: string
  valorHoraExtra: string
  anticipo: string
  descuento: string
  observaciones: string
}

let siguienteClave = 1
const filaNueva = (trabajador: Trabajador, valorDia?: string | null): Fila => ({
  clave: siguienteClave++,
  trabajadorId: trabajador.id,
  dias: '',
  valorDia: valorDia ? String(Number(valorDia)) : trabajador.valorDia ? String(Number(trabajador.valorDia)) : '',
  horasExtra: '',
  valorHoraExtra: '',
  anticipo: '',
  descuento: '',
  observaciones: '',
})

const soloDigitos = (texto: string) => texto.replace(/\D/g, '')
// Días y horas admiten coma o punto decimal.
const soloNumero = (texto: string) => texto.replace(/[^\d.,]/g, '')

const entradaDe = (fila: Fila) => ({
  dias: aNumeroLiquidacion(fila.dias),
  valorDia: aNumeroLiquidacion(fila.valorDia),
  horasExtra: aNumeroLiquidacion(fila.horasExtra),
  valorHoraExtra: aNumeroLiquidacion(fila.valorHoraExtra),
  anticipo: aNumeroLiquidacion(fila.anticipo),
  descuento: aNumeroLiquidacion(fila.descuento),
})

function CampoFila({ id, etiqueta, children }: { id: string; etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-slate-500">
        {etiqueta}
      </label>
      {children}
    </div>
  )
}

const CLASE_INPUT_FILA = `${CLASE_INPUT} mt-0.5`

interface PropsFila {
  fila: Fila
  trabajador: Trabajador | undefined
  diasPeriodo: number
  onCambio: (cambios: Partial<Fila>) => void
  onQuitar: () => void
}

function TarjetaTrabajador({ fila, trabajador, diasPeriodo, onCambio, onQuitar }: PropsFila) {
  const entrada = entradaDe(fila)
  const resultado = calcularFila(entrada)
  const id = (campo: string) => `${campo}-${fila.clave}`
  const sinValorDia = entrada.valorDia === 0
  const demasiadosDias = diasPeriodo > 0 && entrada.dias > diasPeriodo
  const netoNegativo = resultado.neto < 0

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{trabajador?.nombre ?? 'Trabajador'}</p>
          <p className="truncate text-xs text-slate-500">
            {trabajador?.cargo} · {trabajador?.documento}
          </p>
        </div>
        <button type="button" onClick={onQuitar} className="shrink-0 text-sm text-red-600 hover:underline">
          Quitar
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <CampoFila id={id('dias')} etiqueta="Días">
          <input id={id('dias')} inputMode="decimal" placeholder="0" value={fila.dias} onChange={(e) => onCambio({ dias: soloNumero(e.target.value) })} className={CLASE_INPUT_FILA} />
        </CampoFila>
        <CampoFila id={id('valorDia')} etiqueta="Valor día">
          <input id={id('valorDia')} inputMode="numeric" value={fila.valorDia} onChange={(e) => onCambio({ valorDia: soloDigitos(e.target.value) })} className={CLASE_INPUT_FILA} />
        </CampoFila>
        <CampoFila id={id('horasExtra')} etiqueta="Horas extra">
          <input id={id('horasExtra')} inputMode="decimal" placeholder="0" value={fila.horasExtra} onChange={(e) => onCambio({ horasExtra: soloNumero(e.target.value) })} className={CLASE_INPUT_FILA} />
        </CampoFila>
        <CampoFila id={id('valorHoraExtra')} etiqueta="Valor hora extra">
          <input id={id('valorHoraExtra')} inputMode="numeric" value={fila.valorHoraExtra} onChange={(e) => onCambio({ valorHoraExtra: soloDigitos(e.target.value) })} className={CLASE_INPUT_FILA} />
        </CampoFila>
        <CampoFila id={id('anticipo')} etiqueta="Anticipo">
          <input id={id('anticipo')} inputMode="numeric" value={fila.anticipo} onChange={(e) => onCambio({ anticipo: soloDigitos(e.target.value) })} className={CLASE_INPUT_FILA} />
        </CampoFila>
        <CampoFila id={id('descuento')} etiqueta="Descuento">
          <input id={id('descuento')} inputMode="numeric" value={fila.descuento} onChange={(e) => onCambio({ descuento: soloDigitos(e.target.value) })} className={CLASE_INPUT_FILA} />
        </CampoFila>
      </div>

      <div className="mt-2">
        <CampoFila id={id('observaciones')} etiqueta="Observaciones (opcional)">
          <input id={id('observaciones')} maxLength={300} value={fila.observaciones} onChange={(e) => onCambio({ observaciones: e.target.value })} className={CLASE_INPUT_FILA} />
        </CampoFila>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <span className="text-slate-600">
          Devengado (costo de la obra): <strong className="text-slate-900">{formatearCOP(resultado.devengado)}</strong>
        </span>
        <span className="text-slate-600">
          A pagar: <strong className={netoNegativo ? 'text-red-600' : 'text-slate-900'}>{formatearCOP(resultado.neto)}</strong>
        </span>
      </div>
      {sinValorDia && <p className="mt-1 text-xs text-red-600">Falta el valor día: escríbelo aquí o en la ficha del trabajador.</p>}
      {demasiadosDias && <p className="mt-1 text-xs text-amber-700">Más días ({fila.dias}) que los del período ({diasPeriodo}). Revísalo.</p>}
      {netoNegativo && <p className="mt-1 text-xs text-red-600">El anticipo y el descuento superan lo devengado.</p>}
    </div>
  )
}

export function LiquidarQuincenaPage() {
  const hoy = hoyEnBogota()
  const inicial = ultimaQuincenaTerminada(hoy)
  // Desde una liquidación ya hecha se puede llegar aquí con la obra y la quincena elegidas (para agregar a quien faltó).
  const [parametros] = useSearchParams()
  const formatoFecha = /^\d{4}-\d{2}-\d{2}$/
  const desdeParametro = parametros.get('desde') ?? ''
  const hastaParametro = parametros.get('hasta') ?? ''

  const [obras, setObras] = useState<Proyecto[]>([])
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([])
  const [mediosPago, setMediosPago] = useState<MedioPagoConfig[]>([])
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
  const [cargando, setCargando] = useState(true)

  const [proyectoId, setProyectoId] = useState(parametros.get('obra') ?? '')
  const [periodoInicio, setPeriodoInicio] = useState(formatoFecha.test(desdeParametro) ? desdeParametro : inicial.inicio)
  const [periodoFin, setPeriodoFin] = useState(formatoFecha.test(hastaParametro) ? hastaParametro : inicial.fin)
  const [fechaPago, setFechaPago] = useState(hoy)
  const [medioPago, setMedioPago] = useState<MedioPago | ''>('')
  const [cuentaId, setCuentaId] = useState('')
  const [filas, setFilas] = useState<Fila[]>([])

  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoLiquidacion | null>(null)
  // CC-09: dar de alta a un trabajador sin salir de la liquidación.
  const [creandoTrabajador, setCreandoTrabajador] = useState(false)

  useEffect(() => {
    Promise.all([listarProyectos(), listarTrabajadores(), listarMediosPago(), listarCuentasActivas().catch(() => [] as CuentaBancaria[])])
      .then(([proyectos, personal, medios, cuentasActivas]) => {
        setObras(proyectos.filter((p) => p.estado === 'ACTIVO'))
        setTrabajadores(personal.filter((t) => t.estado === 'ACTIVO'))
        const activos = medios.filter((m) => m.activo)
        setMediosPago(activos)
        setMedioPago(activos[0]?.medio ?? '')
        setCuentas(cuentasActivas)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setCargando(false))
  }, [])

  const porId = useMemo(() => new Map(trabajadores.map((t) => [t.id, t])), [trabajadores])
  const disponibles = trabajadores.filter((t) => !filas.some((f) => f.trabajadorId === t.id))
  const diasPeriodo = diasDelPeriodo(periodoInicio, periodoFin)

  const totales = filas.reduce(
    (suma, fila) => {
      const r = calcularFila(entradaDe(fila))
      return { devengado: suma.devengado + r.devengado, neto: suma.neto + r.neto }
    },
    { devengado: 0, neto: 0 },
  )

  function usarQuincena(periodo: { inicio: string; fin: string }) {
    setPeriodoInicio(periodo.inicio)
    setPeriodoFin(periodo.fin)
  }

  function agregarTrabajador(id: string) {
    const trabajador = porId.get(id)
    if (trabajador) setFilas((actual) => [...actual, filaNueva(trabajador)])
  }

  // El trabajador recién creado entra a la lista y a la liquidación; todo lo digitado se conserva.
  function trabajadorCreado(trabajador: Trabajador) {
    setTrabajadores((actual) => [...actual, trabajador])
    setFilas((actual) => [...actual, filaNueva(trabajador)])
    setCreandoTrabajador(false)
    setError(null)
    setAviso(`Se registró a ${trabajador.nombre} y se agregó a la liquidación. Escribe sus días.`)
  }

  function cambiarFila(clave: number, cambios: Partial<Fila>) {
    setFilas((actual) => actual.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)))
  }

  // Trae a quienes trabajaron en esta obra la quincena anterior, sin días: solo hay que escribirlos.
  async function copiarQuincenaAnterior() {
    setError(null)
    setAviso(null)
    if (!proyectoId) {
      setError('Primero elige la obra')
      return
    }
    try {
      const anterior = quincenaAnterior(periodoInicio)
      const pagos = await listarPagosNomina({ proyectoId, periodoInicio: anterior.inicio, periodoFin: anterior.fin })
      const nuevos = pagos
        .filter((pago) => porId.has(pago.trabajadorId) && !filas.some((f) => f.trabajadorId === pago.trabajadorId))
        // El valor día vigente es el de la ficha; si no lo tiene, el que se usó la quincena anterior.
        .map((pago) => filaNueva(porId.get(pago.trabajadorId)!, porId.get(pago.trabajadorId)!.valorDia ?? pago.valorDia))
      if (nuevos.length === 0) {
        setAviso(`No hay trabajadores nuevos que copiar de esa obra del ${anterior.inicio.split('-').reverse().join('/')} al ${anterior.fin.split('-').reverse().join('/')}.`)
        return
      }
      setFilas((actual) => [...actual, ...nuevos])
      setAviso(`Se agregaron ${nuevos.length} trabajador(es) de la quincena anterior. Escribe los días de cada uno.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo copiar la quincena anterior')
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setAviso(null)
    if (!medioPago) {
      setError('No hay medios de pago habilitados')
      return
    }
    if (filas.length === 0) {
      setError('Agrega al menos un trabajador')
      return
    }
    for (const fila of filas) {
      const nombre = porId.get(fila.trabajadorId)?.nombre ?? 'Un trabajador'
      const entrada = entradaDe(fila)
      if (entrada.dias === 0) return setError(`${nombre}: escribe los días trabajados`)
      if (entrada.valorDia === 0) return setError(`${nombre}: falta el valor día`)
      if (entrada.horasExtra > 0 && entrada.valorHoraExtra === 0) return setError(`${nombre}: escribe el valor de la hora extra`)
    }

    const payload: LiquidarQuincenaPayload = {
      proyectoId,
      periodoInicio,
      periodoFin,
      fechaPago,
      medioPago,
      cuentaId: medioPago !== 'EFECTIVO' && cuentaId ? cuentaId : undefined,
      pagos: filas.map((fila) => {
        const entrada = entradaDe(fila)
        return {
          trabajadorId: fila.trabajadorId,
          dias: String(entrada.dias),
          valorDia: String(entrada.valorDia),
          horasExtra: entrada.horasExtra > 0 ? String(entrada.horasExtra) : undefined,
          valorHoraExtra: entrada.horasExtra > 0 ? String(entrada.valorHoraExtra) : undefined,
          novedades: [
            ...(entrada.anticipo > 0 ? [{ tipo: 'ANTICIPO' as const, valor: String(entrada.anticipo) }] : []),
            ...(entrada.descuento > 0 ? [{ tipo: 'DESCUENTO' as const, valor: String(entrada.descuento) }] : []),
          ],
          observaciones: fila.observaciones.trim() || undefined,
        }
      }),
    }

    setEnviando(true)
    try {
      const guardado = await liquidarQuincena(payload)
      setResultado(guardado)
      setFilas([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la liquidación')
    } finally {
      setEnviando(false)
    }
  }

  if (cargando) return <p className="text-sm text-slate-500">Cargando...</p>

  if (resultado) {
    return (
      <div className="max-w-3xl space-y-4">
        <Seccion titulo="Liquidación guardada" descripcion="Se guardó un pago por cada trabajador de la lista.">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-500">Trabajadores</dt>
              <dd className="text-sm font-medium text-slate-900">{resultado.totales.trabajadores}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Devengado (costo de la obra)</dt>
              <dd className="text-sm font-medium text-slate-900">{formatearCOP(resultado.totales.devengado)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Total pagado</dt>
              <dd className="text-sm font-medium text-slate-900">{formatearCOP(resultado.totales.pagado)}</dd>
            </div>
          </dl>
          {resultado.avisos.length > 0 && (
            <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Para revisar (no impidieron guardar):</p>
              <ul className="mt-1 list-disc pl-5">
                {resultado.avisos.map((a, i) => (
                  <li key={i}>{a.mensaje}</li>
                ))}
              </ul>
            </div>
          )}
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {resultado.pagos.map((pago) => (
              <li key={pago.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link to={`/trabajadores/${pago.trabajador.id}`} className="text-blue-600 hover:underline">
                  {pago.trabajador.nombre}
                </Link>
                <span className="text-slate-600">
                  {Number(pago.dias)} días · {formatearCOP(pago.valorPagado)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={CLASE_BOTON} onClick={() => setResultado(null)}>
              Liquidar otra obra
            </button>
            <Link to={`/nomina/liquidaciones/${proyectoId}/${periodoInicio}/${periodoFin}`} className={CLASE_BOTON_SECUNDARIO}>
              Ver o corregir esta liquidación
            </Link>
            <Link to="/nomina" className={CLASE_BOTON_SECUNDARIO}>
              Volver a Nómina
            </Link>
          </div>
        </Seccion>
      </div>
    )
  }

  return (
    <>
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="mt-2 text-lg font-semibold text-slate-900">Liquidar quincena</h1>
        <p className="text-sm text-slate-500">
          Una obra y una quincena. Cada trabajador recibe un pago por obra: si trabajó en dos obras, liquida una y luego la otra.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Aviso error={error} ok={aviso} />

        <Seccion titulo="Obra y período">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo id="obra" etiqueta="Obra (proyecto)">
              <select id="obra" required value={proyectoId} onChange={(e) => setProyectoId(e.target.value)} className={CLASE_INPUT}>
                <option value="">Elige la obra…</option>
                {obras.map((obra) => (
                  <option key={obra.id} value={obra.id}>
                    {obra.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="flex flex-wrap items-end gap-2">
              <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => usarQuincena(ultimaQuincenaTerminada(hoy))}>
                Última quincena terminada
              </button>
              <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => usarQuincena(quincenaDe(hoy))}>
                Quincena actual
              </button>
            </div>
            <Campo id="periodoInicio" etiqueta="Período desde">
              <input id="periodoInicio" required type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} className={CLASE_INPUT} />
            </Campo>
            <Campo id="periodoFin" etiqueta="Período hasta" ayuda={diasPeriodo > 0 ? `${diasPeriodo} días` : undefined}>
              <input id="periodoFin" required type="date" value={periodoFin} onChange={(e) => setPeriodoFin(e.target.value)} className={CLASE_INPUT} />
            </Campo>
            <Campo id="fechaPago" etiqueta="Fecha de pago">
              <input id="fechaPago" required type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} className={CLASE_INPUT} />
            </Campo>
            <Campo id="medioPago" etiqueta="Medio de pago">
              <select id="medioPago" value={medioPago} onChange={(e) => setMedioPago(e.target.value as MedioPago)} className={CLASE_INPUT}>
                {mediosPago.map((medio) => (
                  <option key={medio.medio} value={medio.medio}>
                    {medio.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <div className="mt-3">
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
        </Seccion>

        <Seccion
          titulo="Trabajadores"
          descripcion="Escribe los días de cada uno (admite medio día, por ejemplo 7,5). El valor día sale de su ficha y se puede cambiar aquí."
          acciones={
            <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => void copiarQuincenaAnterior()}>
              Copiar la quincena anterior de esta obra
            </button>
          }
        >
          <div className="space-y-3">
            {filas.map((fila) => (
              <TarjetaTrabajador
                key={fila.clave}
                fila={fila}
                trabajador={porId.get(fila.trabajadorId)}
                diasPeriodo={diasPeriodo}
                onCambio={(cambios) => cambiarFila(fila.clave, cambios)}
                onQuitar={() => setFilas((actual) => actual.filter((f) => f.clave !== fila.clave))}
              />
            ))}
            {filas.length === 0 && <p className="text-sm text-slate-400">Todavía no has agregado trabajadores.</p>}
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <label htmlFor="agregarTrabajador" className="block text-sm font-medium text-slate-700">
              Agregar un trabajador
            </label>
            <select id="agregarTrabajador" value="" onChange={(e) => agregarTrabajador(e.target.value)} className={CLASE_INPUT}>
              <option value="">{disponibles.length === 0 ? 'No quedan trabajadores activos por agregar' : 'Elige un trabajador…'}</option>
              {disponibles.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre} — {t.cargo}
                </option>
              ))}
            </select>
            <p className="mt-2 text-sm text-slate-500">
              ¿No está en la lista?{' '}
              <button type="button" onClick={() => setCreandoTrabajador(true)} className="font-medium text-blue-700 underline">
                Registrar un trabajador nuevo
              </button>{' '}
              sin salir de esta liquidación.
            </p>
          </div>
        </Seccion>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-600">
              <p>
                {filas.length} trabajador(es) · Devengado (costo de la obra): <strong className="text-slate-900">{formatearCOP(totales.devengado)}</strong>
              </p>
              <p>
                Total a pagar: <strong className="text-slate-900">{formatearCOP(totales.neto)}</strong>
              </p>
              <p className="text-xs text-slate-400">Valores de referencia: el servidor hace la cuenta definitiva al guardar.</p>
            </div>
            <button type="submit" disabled={enviando || filas.length === 0} className={`${CLASE_BOTON} w-full sm:w-auto`}>
              {enviando ? 'Guardando…' : 'Guardar liquidación'}
            </button>
          </div>
        </div>
      </form>
    </div>
    {creandoTrabajador && <NuevoTrabajadorModal onCreado={trabajadorCreado} onCerrar={() => setCreandoTrabajador(false)} />}
    </>
  )
}
