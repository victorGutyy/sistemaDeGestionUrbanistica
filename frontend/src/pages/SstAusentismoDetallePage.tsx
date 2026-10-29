import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AdjuntosAusentismo } from '../components/ausentismo/AdjuntosAusentismo'
import { FormularioEdicionAusentismo } from '../components/ausentismo/FormularioEdicionAusentismo'
import { FormularioRecobro } from '../components/ausentismo/FormularioRecobro'
import { LiquidacionAusentismo } from '../components/ausentismo/LiquidacionAusentismo'
import { Aviso, CLASE_BOTON_PELIGRO, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Dato, Insignia, Seccion } from '../components/formulario'
import { useAuth } from '../contexts/AuthContext'
import { anularAusentismo, obtenerAusentismo, type AusentismoDetalle, type EntidadRecobro } from '../lib/api'
import { ETIQUETA_ENTIDAD_RECOBRO, ETIQUETA_ESTADO_RECOBRO, textoDiasAusentismo, TONO_ESTADO_RECOBRO } from '../lib/ausentismo'
import { formatearCOP, formatearFecha } from '../lib/formato'
import { PERMISOS } from '../lib/permisos'

// Detalle de un ausentismo (RF-SST-01 a 09 y 21): sus datos, su liquidación, el recobro a las entidades y el certificado. El
// diagnóstico, las observaciones y el certificado son datos de salud: el servidor solo los manda a quien tiene permiso, y cada
// vez que se consultan queda en la auditoría. Los valores también dependen de su propio permiso.
export function SstAusentismoDetallePage() {
  const { id = '' } = useParams()
  const { tiene } = useAuth()
  const puedeGestionar = tiene(PERMISOS.SST_GESTIONAR)
  const puedeVerValores = tiene(PERMISOS.SST_VALORES_VER)
  const puedeVerDiagnostico = tiene(PERMISOS.SST_DIAGNOSTICOS_VER)

  const [ausentismo, setAusentismo] = useState<AusentismoDetalle | null>(null)
  const [editando, setEditando] = useState(false)
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [recobroEnEdicion, setRecobroEnEdicion] = useState<EntidadRecobro | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const cargar = useCallback(() => {
    obtenerAusentismo(id)
      .then((a) => {
        setAusentismo(a)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [id])

  useEffect(cargar, [cargar])

  async function anular(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      setAusentismo(await anularAusentismo(id, motivo.trim()))
      setAnulando(false)
      setOk('El ausentismo quedó anulado. Sus fechas ya se pueden usar en otro registro.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular el ausentismo')
    } finally {
      setEnviando(false)
    }
  }

  if (!ausentismo) {
    return error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-slate-500">Cargando ausentismo…</p>
  }

  const vigente = !ausentismo.anulada

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/sst/ausentismo" className="text-sm text-blue-600 hover:underline">
            ← Ausentismo
          </Link>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">
            {ausentismo.tipo.nombre} · {ausentismo.trabajador.nombre}
          </h2>
          <p className="text-sm text-slate-500">
            Del {formatearFecha(ausentismo.fechaInicio)} al {formatearFecha(ausentismo.fechaFin)} ({textoDiasAusentismo(ausentismo.dias)})
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {ausentismo.esProrroga && <Insignia tono="azul">Prórroga</Insignia>}
            {ausentismo.corregida && <Insignia tono="ambar">Liquidación corregida</Insignia>}
            {ausentismo.anulada && <Insignia tono="gris">Anulado</Insignia>}
          </div>
        </div>
        {puedeGestionar && vigente && !anulando && (
          <div className="flex gap-2">
            {!editando && (
              <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => { setOk(null); setEditando(true) }}>
                Editar datos
              </button>
            )}
            <button type="button" className={CLASE_BOTON_PELIGRO} onClick={() => { setOk(null); setAnulando(true) }}>
              Anular
            </button>
          </div>
        )}
      </div>

      <Aviso error={error} ok={ok} />

      {anulando && (
        <form onSubmit={anular} className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">Un ausentismo no se borra ni se edita: se anula con su motivo y, si hace falta, se registra de nuevo. Quedan su historial y el de su liquidación.</p>
          <input aria-label="Motivo de la anulación" required minLength={5} maxLength={500} placeholder="Motivo (mínimo 5 letras)" value={motivo} onChange={(e) => setMotivo(e.target.value)} className={CLASE_INPUT} />
          <div className="flex gap-2">
            <button type="submit" disabled={enviando} className={CLASE_BOTON_PELIGRO}>
              {enviando ? 'Anulando…' : 'Anular ausentismo'}
            </button>
            <button type="button" onClick={() => setAnulando(false)} className={CLASE_BOTON_SECUNDARIO}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {ausentismo.anulada && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Anulado {ausentismo.anuladaEn && `el ${formatearFecha(ausentismo.anuladaEn)}`}
          {ausentismo.anuladaPor && ` por ${ausentismo.anuladaPor.nombre}`}
          {ausentismo.motivoAnulacion && `: ${ausentismo.motivoAnulacion}`}
        </div>
      )}

      <Seccion titulo="Datos del ausentismo">
        {editando ? (
          <FormularioEdicionAusentismo
            ausentismo={ausentismo}
            puedeVerDiagnostico={puedeVerDiagnostico}
            onGuardado={(a) => {
              setAusentismo(a)
              setEditando(false)
              setOk('Datos actualizados.')
            }}
            onCancelar={() => setEditando(false)}
          />
        ) : (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Dato etiqueta="Trabajador">
              <Link to={`/sst/trabajadores/${ausentismo.trabajador.id}`} className="text-blue-600 hover:underline">
                {ausentismo.trabajador.nombre}
              </Link>
              <span className="block text-xs text-slate-500">{ausentismo.trabajador.documento}</span>
            </Dato>
            <Dato etiqueta="Cargo ese día">{ausentismo.cargoFoto}</Dato>
            <Dato etiqueta="Tipo">{ausentismo.tipo.nombre}</Dato>
            <Dato etiqueta="Primer día">{formatearFecha(ausentismo.fechaInicio)}</Dato>
            <Dato etiqueta="Último día">{formatearFecha(ausentismo.fechaFin)}</Dato>
            <Dato etiqueta="Días">{ausentismo.dias}</Dato>
            <Dato etiqueta="N.º de la incapacidad o del certificado">{ausentismo.numeroDocumento ?? '—'}</Dato>
            <Dato etiqueta="Prórroga">
              {ausentismo.esProrroga ? (
                ausentismo.prorrogaDe ? (
                  <Link to={`/sst/ausentismo/${ausentismo.prorrogaDe.id}`} className="text-blue-600 hover:underline">
                    Continúa la del {formatearFecha(ausentismo.prorrogaDe.fechaInicio)} al {formatearFecha(ausentismo.prorrogaDe.fechaFin)}
                  </Link>
                ) : (
                  `Sí, venía con ${ausentismo.diasPrevios} días acumulados`
                )
              ) : (
                'No'
              )}
            </Dato>
            {ausentismo.esProrroga && <Dato etiqueta="Días acumulados antes">{ausentismo.diasPrevios}</Dato>}
            <Dato etiqueta="EPS ese día">{ausentismo.epsFoto ?? '—'}</Dato>
            <Dato etiqueta="ARL ese día">{ausentismo.arlFoto ?? '—'}</Dato>
            <Dato etiqueta="Fondo de pensiones ese día">{ausentismo.afpFoto ?? '—'}</Dato>
            {puedeVerValores && ausentismo.salarioFoto !== undefined && <Dato etiqueta="Salario ese día">{formatearCOP(ausentismo.salarioFoto)}</Dato>}
            <Dato etiqueta="Registrado por">
              {ausentismo.registradaPor.nombre}
              <span className="block text-xs text-slate-500">{formatearFecha(ausentismo.createdAt)}</span>
            </Dato>
          </dl>
        )}
      </Seccion>

      {puedeVerDiagnostico && (
        <Seccion titulo="Datos de salud" descripcion="Dato sensible (Ley 1581 de 2012). Cada consulta queda en la auditoría y solo lo ven los roles con permiso.">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Dato etiqueta="Diagnóstico CIE-10">
              {ausentismo.diagnostico ? (
                <>
                  <span className="font-semibold">{ausentismo.diagnostico.codigo}</span> — {ausentismo.diagnostico.descripcion}
                </>
              ) : (
                'Sin diagnóstico'
              )}
            </Dato>
            <Dato etiqueta="Observaciones">{ausentismo.observaciones ?? '—'}</Dato>
          </dl>
        </Seccion>
      )}

      <Seccion titulo="Liquidación" descripcion="Quién paga cada día de este ausentismo, mes por mes. Es una liquidación de apoyo para la nómina, que se liquida fuera del sistema.">
        <LiquidacionAusentismo
          ausentismo={ausentismo}
          puedeCorregir={puedeGestionar && puedeVerValores && vigente}
          onCambio={(a) => {
            setAusentismo(a)
            setOk('Liquidación corregida. El cálculo original sigue guardado.')
          }}
        />
      </Seccion>

      <Seccion titulo="Recobro a las entidades" descripcion="Lo que la EPS, la ARL o el fondo de pensiones deben reconocer por esta incapacidad. El sistema solo lleva el seguimiento: no transmite nada a esas entidades.">
        {ausentismo.recobros.length === 0 && <p className="text-sm text-slate-400">Ninguna entidad tiene días a cargo en este ausentismo: no hay nada que cobrar.</p>}
        <ul className="divide-y divide-slate-100">
          {ausentismo.recobros.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {ETIQUETA_ENTIDAD_RECOBRO[r.entidad]} <Insignia tono={TONO_ESTADO_RECOBRO[r.estado]}>{ETIQUETA_ESTADO_RECOBRO[r.estado]}</Insignia>
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.fechaRadicacion && `Radicado el ${formatearFecha(r.fechaRadicacion)}`}
                    {r.fechaPago && ` · pagado el ${formatearFecha(r.fechaPago)}`}
                    {r.valorEsperado !== undefined && ` · esperado ${formatearCOP(r.valorEsperado)}`}
                    {r.valorReconocido && ` · reconocido ${formatearCOP(r.valorReconocido)}`}
                    {r.observaciones && ` · ${r.observaciones}`}
                  </p>
                </div>
                {puedeGestionar && puedeVerValores && vigente && recobroEnEdicion !== r.entidad && (
                  <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => { setOk(null); setRecobroEnEdicion(r.entidad) }}>
                    Actualizar
                  </button>
                )}
              </div>
              {recobroEnEdicion === r.entidad && (
                <div className="mt-2">
                  <FormularioRecobro
                    ausentismoId={ausentismo.id}
                    entidad={r.entidad}
                    actual={r}
                    onGuardado={() => {
                      setRecobroEnEdicion(null)
                      setOk('Recobro actualizado.')
                      cargar()
                    }}
                    onCancelar={() => setRecobroEnEdicion(null)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo="Certificado o soporte" descripcion="PDF, PNG o JPG de hasta 10 MB. Un certificado de incapacidad trae el diagnóstico escrito: solo lo abren quienes pueden ver diagnósticos, y cada apertura queda en la auditoría.">
        <AdjuntosAusentismo
          ausentismoId={ausentismo.id}
          puedeVer={puedeVerDiagnostico}
          puedeAdjuntar={puedeGestionar && vigente}
          onCambio={(mensaje) => setOk(mensaje)}
        />
      </Seccion>
    </div>
  )
}
