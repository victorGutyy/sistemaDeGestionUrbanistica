import { useEffect, useState, type FormEvent } from 'react'
import {
  actualizarDiagnosticoCie10,
  actualizarTipoAusentismo,
  crearDiagnosticoCie10,
  crearTipoAusentismo,
  listarDiagnosticosCie10,
  listarTiposAusentismo,
  type DiagnosticoCie10,
  type ReglaAusentismo,
  type TipoAusentismo,
} from '../../lib/api'
import { ETIQUETA_REGLA, REGLAS, REGLAS_CON_PORCENTAJE } from '../../lib/ausentismo'
import { aNumero, formatearPorcentaje } from '../../lib/seguridadSocial'
import { Aviso, CLASE_BOTON, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Campo, Insignia, Seccion } from '../formulario'

// ---------- Tipos de ausentismo (RF-CFG-14) ----------

function FilaTipo({ tipo, onCambio }: { tipo: TipoAusentismo; onCambio: (t: TipoAusentismo) => void }) {
  const lleva = REGLAS_CON_PORCENTAJE.includes(tipo.regla)
  const [nombre, setNombre] = useState(tipo.nombre)
  const [porcentaje, setPorcentaje] = useState(tipo.porcentaje === null ? '' : String(Number(tipo.porcentaje)).replace('.', ','))
  const [requiere, setRequiere] = useState(tipo.requiereDiagnostico)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function guardar(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setOk(null)
    setEnviando(true)
    try {
      onCambio(await actualizarTipoAusentismo(tipo.id, { nombre: nombre.trim(), requiereDiagnostico: requiere, ...(lleva ? { porcentaje: aNumero(porcentaje) } : {}) }))
      setOk('Guardado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setEnviando(false)
    }
  }

  async function alternar() {
    setError(null)
    try {
      onCambio(await actualizarTipoAusentismo(tipo.id, { activo: !tipo.activo }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar')
    }
  }

  return (
    <div className="py-3">
      <form onSubmit={guardar} className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-slate-800">{tipo.codigo}</p>
          {!tipo.activo && <Insignia tono="ambar">Inactivo</Insignia>}
          <span className="text-xs text-slate-500">{ETIQUETA_REGLA[tipo.regla]}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo id={`tipo-nombre-${tipo.id}`} etiqueta="Nombre">
            <input id={`tipo-nombre-${tipo.id}`} required minLength={3} maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} className={CLASE_INPUT} />
          </Campo>
          {lleva && (
            <Campo id={`tipo-pct-${tipo.id}`} etiqueta="Porcentaje (%)" ayuda={`Hoy: ${formatearPorcentaje(tipo.porcentaje, 2)} del valor diario.`}>
              <input id={`tipo-pct-${tipo.id}`} required inputMode="decimal" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} className={CLASE_INPUT} />
            </Campo>
          )}
          <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
            <input type="checkbox" checked={requiere} onChange={(e) => setRequiere(e.target.checked)} className="h-4 w-4" />
            Exige diagnóstico CIE-10
          </label>
        </div>
        {tipo.diaEventoComoLaborado && <p className="text-xs text-slate-500">El día del evento se paga como laborado y la ARL paga desde el día siguiente.</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={enviando} className={CLASE_BOTON}>
            Guardar
          </button>
          <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => void alternar()}>
            {tipo.activo ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      </form>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      {ok && !error && <p className="mt-1 text-sm text-green-700">{ok}</p>}
    </div>
  )
}

function FormularioTipoNuevo({ onCreado }: { onCreado: (t: TipoAusentismo) => void }) {
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [regla, setRegla] = useState<ReglaAusentismo>('PAGA_EMPLEADOR')
  const [porcentaje, setPorcentaje] = useState('100')
  const [requiere, setRequiere] = useState(false)
  const [diaEvento, setDiaEvento] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lleva = REGLAS_CON_PORCENTAJE.includes(regla)

  async function crear(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      onCreado(
        await crearTipoAusentismo({
          codigo: codigo.trim().toUpperCase().replace(/\s+/g, '_'),
          nombre: nombre.trim(),
          regla,
          requiereDiagnostico: requiere,
          ...(lleva ? { porcentaje: aNumero(porcentaje) } : {}),
          ...(regla === 'ORIGEN_LABORAL' ? { diaEventoComoLaborado: diaEvento } : {}),
        }),
      )
      setCodigo('')
      setNombre('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el tipo')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={crear} className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:p-4">
      <p className="text-sm font-medium text-slate-800">Agregar un tipo</p>
      <Aviso error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="tipo-nuevo-codigo" etiqueta="Clave" ayuda="Mayúsculas, números y guion bajo (LICENCIA_ESTUDIO). No se puede cambiar después.">
          <input id="tipo-nuevo-codigo" required maxLength={60} value={codigo} onChange={(e) => setCodigo(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="tipo-nuevo-nombre" etiqueta="Nombre">
          <input id="tipo-nuevo-nombre" required minLength={3} maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="tipo-nuevo-regla" etiqueta="Cómo se liquida" ayuda="La regla no se puede cambiar después: se desactiva el tipo y se crea otro.">
          <select id="tipo-nuevo-regla" value={regla} onChange={(e) => setRegla(e.target.value as ReglaAusentismo)} className={CLASE_INPUT}>
            {REGLAS.map((r) => (
              <option key={r} value={r}>
                {ETIQUETA_REGLA[r]}
              </option>
            ))}
          </select>
        </Campo>
        {lleva && (
          <Campo id="tipo-nuevo-pct" etiqueta="Porcentaje (%)">
            <input id="tipo-nuevo-pct" required inputMode="decimal" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} className={CLASE_INPUT} />
          </Campo>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={requiere} onChange={(e) => setRequiere(e.target.checked)} className="h-4 w-4" />
        Exige diagnóstico CIE-10
      </label>
      {regla === 'ORIGEN_LABORAL' && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={diaEvento} onChange={(e) => setDiaEvento(e.target.checked)} className="h-4 w-4" />
          El día del evento se paga como laborado (accidente de trabajo)
        </label>
      )}
      <button type="submit" disabled={enviando} className={CLASE_BOTON}>
        {enviando ? 'Creando…' : 'Agregar tipo'}
      </button>
    </form>
  )
}

export function SeccionTiposAusentismo() {
  const [tipos, setTipos] = useState<TipoAusentismo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listarTiposAusentismo(true)
      .then(setTipos)
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <Seccion
      titulo="Tipos de ausentismo"
      descripcion="Cada tipo se liquida con una regla fija. El porcentaje de los tipos con porcentaje se puede ajustar; el de las incapacidades sale de los parámetros legales del año. El asesor laboral debe confirmar las reglas y los porcentajes."
    >
      <Aviso error={error} />
      {!tipos && !error && <p className="text-sm text-slate-500">Cargando…</p>}
      {tipos && (
        <div className="space-y-4">
          <div className="divide-y divide-slate-100">
            {tipos.map((tipo) => (
              <FilaTipo key={tipo.id} tipo={tipo} onCambio={(t) => setTipos(tipos.map((x) => (x.id === t.id ? t : x)))} />
            ))}
          </div>
          <FormularioTipoNuevo onCreado={(t) => setTipos([...tipos, t])} />
        </div>
      )}
    </Seccion>
  )
}

// ---------- Diagnósticos CIE-10 (RF-CFG-14) ----------

export function SeccionDiagnosticos() {
  const [texto, setTexto] = useState('')
  const [lista, setLista] = useState<DiagnosticoCie10[]>([])
  const [codigo, setCodigo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  useEffect(() => {
    const espera = setTimeout(() => {
      listarDiagnosticosCie10({ q: texto, incluirInactivos: true, limite: 15 })
        .then((l) => setLista(l))
        .catch((err: Error) => setError(err.message))
    }, 250)
    return () => clearTimeout(espera)
  }, [texto])

  async function agregar(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setOk(null)
    setEnviando(true)
    try {
      const nuevo = await crearDiagnosticoCie10(codigo.trim().toUpperCase(), descripcion.trim())
      setOk(`Se agregó ${nuevo.codigo}.`)
      setCodigo('')
      setDescripcion('')
      setTexto(nuevo.codigo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar el diagnóstico')
    } finally {
      setEnviando(false)
    }
  }

  async function alternar(d: DiagnosticoCie10) {
    setError(null)
    try {
      const actualizado = await actualizarDiagnosticoCie10(d.id, { activo: !d.activo })
      setLista(lista.map((x) => (x.id === actualizado.id ? actualizado : x)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el diagnóstico')
    }
  }

  return (
    <Seccion
      titulo="Diagnósticos CIE-10"
      descripcion="Catálogo de referencia con los diagnósticos más usados en incapacidades; no es el listado oficial completo. Quien gestiona SST agrega los que falten. El código no se puede cambiar: se desactiva y se agrega el correcto."
    >
      <Aviso error={error} ok={ok} />
      <input aria-label="Buscar diagnóstico" placeholder="Buscar por código o por nombre" value={texto} onChange={(e) => setTexto(e.target.value)} className={CLASE_INPUT} />
      <ul className="mt-3 divide-y divide-slate-100">
        {lista.length === 0 && <li className="py-2 text-sm text-slate-400">No hay códigos con ese texto.</li>}
        {lista.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 py-2">
            <p className="min-w-0 text-sm text-slate-800">
              <span className="font-semibold">{d.codigo}</span> — {d.descripcion}
              {!d.activo && (
                <span className="ml-2">
                  <Insignia tono="ambar">Inactivo</Insignia>
                </span>
              )}
            </p>
            <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => void alternar(d)}>
              {d.activo ? 'Desactivar' : 'Activar'}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-slate-400">Se muestran los primeros resultados: afina la búsqueda para ver otros.</p>
      <form onSubmit={agregar} className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
        <Campo id="cie-codigo" etiqueta="Código" ayuda="Por ejemplo, J06.9">
          <input id="cie-codigo" required maxLength={8} value={codigo} onChange={(e) => setCodigo(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="cie-descripcion" etiqueta="Descripción">
          <input id="cie-descripcion" required minLength={3} maxLength={200} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <button type="submit" disabled={enviando} className={CLASE_BOTON}>
          Agregar
        </button>
      </form>
    </Seccion>
  )
}
