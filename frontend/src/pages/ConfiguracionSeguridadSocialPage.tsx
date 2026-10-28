import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, CLASE_BOTON, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Campo, Insignia, Seccion } from '../components/formulario'
import {
  actualizarClaseRiesgoArl,
  actualizarEntidadSS,
  actualizarParametroLegal,
  crearEntidadSS,
  crearParametroLegal,
  obtenerCatalogosSeguridadSocial,
  validarParametroLegal,
  type CatalogosSeguridadSocial,
  type ClaseRiesgoArl,
  type DatosParametroLegal,
  type EntidadSS,
  type ParametroLegal,
  type TipoEntidadSS,
} from '../lib/api'
import { formatearCOP, formatearFecha } from '../lib/formato'
import { aNumero, ETIQUETA_TIPO_ENTIDAD, formatearPorcentaje, pesosATexto, TIPOS_ENTIDAD } from '../lib/seguridadSocial'

// Texto para un campo numérico: sin ceros sobrantes y con coma decimal.
const numeroATexto = (valor: string | number) => String(Number(valor)).replace('.', ',')

// ---------- Parámetros legales por año (RF-CFG-13) ----------

interface Borrador {
  anio: string
  smmlv: string
  auxilioTransporte: string
  topeAuxilioSmmlv: string
  porcentajeIncapacidadTramo1: string
  porcentajeIncapacidadTramo2: string
  porcentajeIncapacidadLaboral: string
  diasEmpleador: string
  diasTramo1Hasta: string
  diasTramo2Hasta: string
  diasBaseMes: string
  notas: string
}

function borradorDe(parametro: ParametroLegal | null, anio: number): Borrador {
  return {
    anio: String(anio),
    smmlv: parametro ? String(Number(parametro.smmlv)) : '',
    auxilioTransporte: parametro ? String(Number(parametro.auxilioTransporte)) : '',
    topeAuxilioSmmlv: parametro ? numeroATexto(parametro.topeAuxilioSmmlv) : '2',
    porcentajeIncapacidadTramo1: parametro ? numeroATexto(parametro.porcentajeIncapacidadTramo1) : '',
    porcentajeIncapacidadTramo2: parametro ? numeroATexto(parametro.porcentajeIncapacidadTramo2) : '',
    porcentajeIncapacidadLaboral: parametro ? numeroATexto(parametro.porcentajeIncapacidadLaboral) : '',
    diasEmpleador: parametro ? String(parametro.diasEmpleador) : '',
    diasTramo1Hasta: parametro ? String(parametro.diasTramo1Hasta) : '',
    diasTramo2Hasta: parametro ? String(parametro.diasTramo2Hasta) : '',
    diasBaseMes: parametro ? String(parametro.diasBaseMes) : '30',
    notas: parametro?.notas ?? '',
  }
}

function datosDe(b: Borrador): DatosParametroLegal {
  return {
    smmlv: pesosATexto(b.smmlv),
    auxilioTransporte: pesosATexto(b.auxilioTransporte),
    topeAuxilioSmmlv: aNumero(b.topeAuxilioSmmlv),
    porcentajeIncapacidadTramo1: aNumero(b.porcentajeIncapacidadTramo1),
    porcentajeIncapacidadTramo2: aNumero(b.porcentajeIncapacidadTramo2),
    porcentajeIncapacidadLaboral: aNumero(b.porcentajeIncapacidadLaboral),
    diasEmpleador: Number(b.diasEmpleador),
    diasTramo1Hasta: Number(b.diasTramo1Hasta),
    diasTramo2Hasta: Number(b.diasTramo2Hasta),
    diasBaseMes: Number(b.diasBaseMes),
    notas: b.notas.trim(),
  }
}

function FormularioParametro({
  inicial,
  anioFijo,
  validado,
  onGuardar,
  onCancelar,
}: {
  inicial: Borrador
  // Al editar, el año no se cambia.
  anioFijo: boolean
  validado: boolean
  onGuardar: (anio: number, datos: DatosParametroLegal) => Promise<void>
  onCancelar: () => void
}) {
  const [b, setB] = useState(inicial)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const poner = (campo: keyof Borrador) => (e: { target: { value: string } }) => setB({ ...b, [campo]: e.target.value })

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await onGuardar(Number(b.anio), datosDe(b))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-4 rounded-md border border-slate-200 bg-slate-50 p-3 sm:p-4">
      <Aviso error={error} />
      {validado && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Estos valores ya están validados. Si cambias alguno, perderán la validación y habrá que validarlos de nuevo.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Campo id="p-anio" etiqueta="Año">
          <input id="p-anio" required inputMode="numeric" disabled={anioFijo} value={b.anio} onChange={poner('anio')} className={`${CLASE_INPUT} disabled:bg-slate-100`} />
        </Campo>
        <Campo id="p-smmlv" etiqueta="Salario mínimo mensual ($)">
          <input id="p-smmlv" required inputMode="decimal" value={b.smmlv} onChange={poner('smmlv')} className={CLASE_INPUT} />
        </Campo>
        <Campo id="p-auxilio" etiqueta="Auxilio de transporte ($)">
          <input id="p-auxilio" required inputMode="decimal" value={b.auxilioTransporte} onChange={poner('auxilioTransporte')} className={CLASE_INPUT} />
        </Campo>
        <Campo id="p-tope" etiqueta="Tope del auxilio (en salarios mínimos)" ayuda="Tiene auxilio quien gana hasta este número de salarios mínimos.">
          <input id="p-tope" required inputMode="decimal" value={b.topeAuxilioSmmlv} onChange={poner('topeAuxilioSmmlv')} className={CLASE_INPUT} />
        </Campo>
        <Campo id="p-base" etiqueta="Días base del mes">
          <input id="p-base" required inputMode="numeric" value={b.diasBaseMes} onChange={poner('diasBaseMes')} className={CLASE_INPUT} />
        </Campo>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700">Incapacidades (se usan en la liquidación de apoyo)</p>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Campo id="p-pt1" etiqueta="% primer tramo">
            <input id="p-pt1" required inputMode="decimal" value={b.porcentajeIncapacidadTramo1} onChange={poner('porcentajeIncapacidadTramo1')} className={CLASE_INPUT} />
          </Campo>
          <Campo id="p-pt2" etiqueta="% segundo tramo">
            <input id="p-pt2" required inputMode="decimal" value={b.porcentajeIncapacidadTramo2} onChange={poner('porcentajeIncapacidadTramo2')} className={CLASE_INPUT} />
          </Campo>
          <Campo id="p-plab" etiqueta="% origen laboral">
            <input id="p-plab" required inputMode="decimal" value={b.porcentajeIncapacidadLaboral} onChange={poner('porcentajeIncapacidadLaboral')} className={CLASE_INPUT} />
          </Campo>
          <Campo id="p-demp" etiqueta="Días a cargo del empleador">
            <input id="p-demp" required inputMode="numeric" value={b.diasEmpleador} onChange={poner('diasEmpleador')} className={CLASE_INPUT} />
          </Campo>
          <Campo id="p-dt1" etiqueta="Primer tramo hasta el día">
            <input id="p-dt1" required inputMode="numeric" value={b.diasTramo1Hasta} onChange={poner('diasTramo1Hasta')} className={CLASE_INPUT} />
          </Campo>
          <Campo id="p-dt2" etiqueta="Segundo tramo hasta el día">
            <input id="p-dt2" required inputMode="numeric" value={b.diasTramo2Hasta} onChange={poner('diasTramo2Hasta')} className={CLASE_INPUT} />
          </Campo>
        </div>
      </div>

      <Campo id="p-notas" etiqueta="Notas (opcional)" ayuda="Por ejemplo, el decreto o la fuente de los valores.">
        <input id="p-notas" maxLength={300} value={b.notas} onChange={poner('notas')} className={CLASE_INPUT} />
      </Campo>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={enviando} className={CLASE_BOTON}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancelar} className={CLASE_BOTON_SECUNDARIO}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function TarjetaParametro({ parametro, onCambio }: { parametro: ParametroLegal; onCambio: (p: ParametroLegal) => void }) {
  const [editando, setEditando] = useState(false)
  const [validando, setValidando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function validar() {
    setError(null)
    setValidando(true)
    try {
      onCambio({ ...parametro, ...(await validarParametroLegal(parametro.id)) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo validar')
    } finally {
      setValidando(false)
    }
  }

  return (
    <div className="rounded-md border border-slate-200 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-base font-semibold text-slate-900">{parametro.anio}</p>
          {parametro.validadoEn ? <Insignia tono="verde">Validado</Insignia> : <Insignia tono="ambar">Pendiente de validar</Insignia>}
        </div>
        {!editando && (
          <div className="flex gap-2">
            {!parametro.validadoEn && (
              <button type="button" disabled={validando} onClick={() => void validar()} className={CLASE_BOTON}>
                {validando ? 'Validando…' : 'Marcar como validado'}
              </button>
            )}
            <button type="button" onClick={() => setEditando(true)} className={CLASE_BOTON_SECUNDARIO}>
              Editar
            </button>
          </div>
        )}
      </div>
      {parametro.validadoEn && (
        <p className="mt-1 text-xs text-slate-500">
          Validado el {formatearFecha(parametro.validadoEn)}
          {parametro.validadoPor && ` por ${parametro.validadoPor.nombre}`}
        </p>
      )}
      <Aviso error={error} />
      {!editando ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-500">Salario mínimo</dt>
            <dd>{formatearCOP(parametro.smmlv)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Auxilio de transporte</dt>
            <dd>{formatearCOP(parametro.auxilioTransporte)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Tope del auxilio</dt>
            <dd>{numeroATexto(parametro.topeAuxilioSmmlv)} salarios mínimos</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Incapacidad: primer / segundo tramo</dt>
            <dd>
              {formatearPorcentaje(parametro.porcentajeIncapacidadTramo1, 2)} / {formatearPorcentaje(parametro.porcentajeIncapacidadTramo2, 2)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Incapacidad de origen laboral</dt>
            <dd>{formatearPorcentaje(parametro.porcentajeIncapacidadLaboral, 2)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Días: empleador / tramo 1 / tramo 2</dt>
            <dd>
              {parametro.diasEmpleador} / {parametro.diasTramo1Hasta} / {parametro.diasTramo2Hasta}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Días base del mes</dt>
            <dd>{parametro.diasBaseMes}</dd>
          </div>
          {parametro.notas && (
            <div className="col-span-2 sm:col-span-3">
              <dt className="text-xs text-slate-500">Notas</dt>
              <dd className="break-words">{parametro.notas}</dd>
            </div>
          )}
        </dl>
      ) : (
        <FormularioParametro
          inicial={borradorDe(parametro, parametro.anio)}
          anioFijo
          validado={parametro.validadoEn !== null}
          onGuardar={async (_anio, datos) => {
            const actualizado = await actualizarParametroLegal(parametro.id, datos)
            onCambio({ ...parametro, ...actualizado, validadoPor: actualizado.validadoEn ? parametro.validadoPor : null })
            setEditando(false)
          }}
          onCancelar={() => setEditando(false)}
        />
      )}
    </div>
  )
}

function SeccionParametros({ parametros, onCambio }: { parametros: ParametroLegal[]; onCambio: (p: ParametroLegal[]) => void }) {
  const [creando, setCreando] = useState(false)
  const masReciente = parametros[0] ?? null
  const anioSiguiente = masReciente ? masReciente.anio + 1 : new Date().getFullYear()

  return (
    <Seccion
      titulo="Parámetros legales por año"
      descripcion="Salario mínimo, auxilio de transporte y reglas de incapacidades de cada año. El asesor laboral debe validarlos: el sistema los usa tal como están escritos, no certifica el cumplimiento legal."
      acciones={
        !creando && (
          <button type="button" onClick={() => setCreando(true)} className={CLASE_BOTON_SECUNDARIO}>
            Agregar año
          </button>
        )
      }
    >
      {creando && (
        <div className="mb-4">
          <p className="text-sm text-slate-600">Se copian los valores del último año como punto de partida: ajústalos a los del año nuevo.</p>
          <FormularioParametro
            inicial={borradorDe(masReciente, anioSiguiente)}
            anioFijo={false}
            validado={false}
            onGuardar={async (anio, datos) => {
              const creado = await crearParametroLegal(anio, datos)
              onCambio([{ ...creado, validadoPor: null }, ...parametros].sort((a, b) => b.anio - a.anio))
              setCreando(false)
            }}
            onCancelar={() => setCreando(false)}
          />
        </div>
      )}
      <div className="space-y-3">
        {parametros.length === 0 && !creando && <p className="text-sm text-slate-400">Todavía no hay parámetros legales. Agrega los del año en curso.</p>}
        {parametros.map((p) => (
          <TarjetaParametro key={p.id} parametro={p} onCambio={(nuevo) => onCambio(parametros.map((x) => (x.id === nuevo.id ? nuevo : x)))} />
        ))}
      </div>
    </Seccion>
  )
}

// ---------- Entidades (RF-CFG-14) ----------

function GrupoEntidades({ tipo, entidades, onCambio }: { tipo: TipoEntidadSS; entidades: EntidadSS[]; onCambio: (e: EntidadSS[]) => void }) {
  const [nombre, setNombre] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const delTipo = entidades.filter((e) => e.tipo === tipo)

  async function crear(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const nueva = await crearEntidadSS(tipo, nombre.trim())
      onCambio([...entidades, nueva].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
      setNombre('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la entidad')
    } finally {
      setEnviando(false)
    }
  }

  async function alternar(entidad: EntidadSS) {
    setError(null)
    try {
      const actualizada = await actualizarEntidadSS(entidad.id, { activa: !entidad.activa })
      onCambio(entidades.map((e) => (e.id === actualizada.id ? actualizada : e)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la entidad')
    }
  }

  return (
    <details className="rounded-md border border-slate-200 px-3 py-2 sm:px-4">
      <summary className="cursor-pointer text-sm font-medium text-slate-800">
        {ETIQUETA_TIPO_ENTIDAD[tipo]} <span className="font-normal text-slate-400">({delTipo.filter((e) => e.activa).length} activas)</span>
      </summary>
      <div className="mt-2">
        <Aviso error={error} />
        <ul className="divide-y divide-slate-100">
          {delTipo.map((entidad) => (
            <li key={entidad.id} className="flex items-center justify-between gap-3 py-2">
              <p className="min-w-0 truncate text-sm text-slate-800">
                {entidad.nombre}
                {!entidad.activa && <span className="ml-2"><Insignia tono="ambar">Inactiva</Insignia></span>}
              </p>
              <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => void alternar(entidad)}>
                {entidad.activa ? 'Desactivar' : 'Activar'}
              </button>
            </li>
          ))}
          {delTipo.length === 0 && <li className="py-2 text-sm text-slate-400">Todavía no hay entidades de este tipo.</li>}
        </ul>
        <form onSubmit={crear} className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row">
          <input aria-label={`Nueva entidad: ${ETIQUETA_TIPO_ENTIDAD[tipo]}`} placeholder="Nombre de la entidad" required minLength={2} maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          <button type="submit" disabled={enviando} className={CLASE_BOTON}>
            Agregar
          </button>
        </form>
      </div>
    </details>
  )
}

function SeccionEntidades({ entidades, onCambio }: { entidades: EntidadSS[]; onCambio: (e: EntidadSS[]) => void }) {
  return (
    <Seccion titulo="Entidades" descripcion="EPS, fondos de pensión y de cesantías, ARL y cajas de compensación entre las que se elige al afiliar a un trabajador. Una entidad desactivada ya no se ofrece, pero las afiliaciones que la tienen la conservan.">
      <div className="space-y-2">
        {TIPOS_ENTIDAD.map((tipo) => (
          <GrupoEntidades key={tipo} tipo={tipo} entidades={entidades} onCambio={onCambio} />
        ))}
      </div>
    </Seccion>
  )
}

// ---------- Clases de riesgo de la ARL ----------

function FilaClase({ clase, onCambio }: { clase: ClaseRiesgoArl; onCambio: (c: ClaseRiesgoArl) => void }) {
  const [tasa, setTasa] = useState(numeroATexto(clase.tasa))
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function guardar(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setOk(null)
    setEnviando(true)
    try {
      onCambio(await actualizarClaseRiesgoArl(clase.id, { tasa: aNumero(tasa) }))
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
      onCambio(await actualizarClaseRiesgoArl(clase.id, { activa: !clase.activa }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar')
    }
  }

  return (
    <div className="py-3">
      <form onSubmit={guardar} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="sm:w-28">
          <p className="text-sm font-medium text-slate-800">
            Clase {clase.clase}
            {!clase.activa && <span className="ml-2"><Insignia tono="ambar">Inactiva</Insignia></span>}
          </p>
        </div>
        <Campo id={`tasa-${clase.clase}`} etiqueta="Tasa de cotización (%)">
          <input id={`tasa-${clase.clase}`} required inputMode="decimal" value={tasa} onChange={(e) => setTasa(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <div className="flex gap-2">
          <button type="submit" disabled={enviando} className={CLASE_BOTON}>
            Guardar
          </button>
          <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => void alternar()}>
            {clase.activa ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      </form>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      {ok && !error && <p className="mt-1 text-sm text-green-700">{ok}</p>}
    </div>
  )
}

function SeccionClases({ clases, onCambio }: { clases: ClaseRiesgoArl[]; onCambio: (c: ClaseRiesgoArl[]) => void }) {
  return (
    <Seccion titulo="Clases de riesgo de la ARL" descripcion="Las cinco clases de riesgo y la tasa con la que se cotiza en cada una (en porcentaje, por ejemplo 0,522). El asesor laboral debe confirmar las tasas.">
      <div className="divide-y divide-slate-100">
        {clases.map((clase) => (
          <FilaClase key={clase.id} clase={clase} onCambio={(c) => onCambio(clases.map((x) => (x.id === c.id ? c : x)))} />
        ))}
      </div>
    </Seccion>
  )
}

// ---------- Página ----------

export function ConfiguracionSeguridadSocialPage() {
  const [catalogos, setCatalogos] = useState<CatalogosSeguridadSocial | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    obtenerCatalogosSeguridadSocial()
      .then(setCatalogos)
      .catch((err: Error) => setError(err.message))
  }, [])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!catalogos) return <p className="text-sm text-slate-500">Cargando…</p>

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link to="/configuracion" className="text-sm text-blue-600 hover:underline">
          ← Configuración
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">Seguridad social</h1>
        <p className="text-sm text-slate-500">Parámetros legales, entidades y clases de riesgo. Solo el gerente puede cambiarlos; cada cambio queda en la auditoría.</p>
      </div>

      <SeccionParametros parametros={catalogos.parametrosLegales} onCambio={(parametrosLegales) => setCatalogos({ ...catalogos, parametrosLegales })} />
      <SeccionEntidades entidades={catalogos.entidades} onCambio={(entidades) => setCatalogos({ ...catalogos, entidades })} />
      <SeccionClases clases={catalogos.clasesRiesgo} onCambio={(clasesRiesgo) => setCatalogos({ ...catalogos, clasesRiesgo })} />
    </div>
  )
}
