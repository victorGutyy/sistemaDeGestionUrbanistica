import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { listarAusentismos, listarTiposAusentismo, listarTrabajadoresSst, type AusentismoFila, type TipoAusentismo, type TrabajadorSst } from '../../lib/api'
import { ETIQUETA_ENTIDAD_RECOBRO, ETIQUETA_ESTADO_RECOBRO, NOMBRES_MES, textoDiasAusentismo, textoPagadores, TONO_ESTADO_RECOBRO } from '../../lib/ausentismo'
import { formatearCOP, formatearFecha } from '../../lib/formato'
import { PERMISOS } from '../../lib/permisos'
import { Aviso, CLASE_BOTON, Insignia, Seccion } from '../formulario'
import { FormularioAusentismo } from './FormularioAusentismo'

const suma = (...valores: (string | undefined)[]) => valores.reduce((total, v) => total + Number(v ?? 0), 0)

function Tarjeta({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{valor}</p>
    </div>
  )
}

// Lista de incapacidades y licencias (RF-SST-01 a 03) con su registro. Los valores solo aparecen para quien puede verlos
// (sst.valores_ver): sin ese permiso el servidor no los manda. El diagnóstico nunca está en la lista, solo en el detalle.
export function ListaAusentismos() {
  const { tiene } = useAuth()
  const puedeGestionar = tiene(PERMISOS.SST_GESTIONAR)

  const [anio, setAnio] = useState(() => new Date().getFullYear())
  const [mes, setMes] = useState(0)
  const [tipoId, setTipoId] = useState('')
  const [trabajadorId, setTrabajadorId] = useState('')
  const [estado, setEstado] = useState<'VIGENTES' | 'ANULADOS' | 'TODOS'>('VIGENTES')
  const [filas, setFilas] = useState<AusentismoFila[] | null>(null)
  const [tipos, setTipos] = useState<TipoAusentismo[]>([])
  const [trabajadores, setTrabajadores] = useState<TrabajadorSst[]>([])
  const [registrando, setRegistrando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listarTiposAusentismo(true), listarTrabajadoresSst()])
      .then(([t, w]) => {
        setTipos(t)
        setTrabajadores(w)
      })
      .catch((err: Error) => setError(err.message))
  }, [])

  const cargar = useCallback(() => {
    listarAusentismos({ anio, mes: mes || undefined, tipoId: tipoId || undefined, trabajadorId: trabajadorId || undefined, estado })
      .then((lista) => {
        setFilas(lista)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [anio, mes, tipoId, trabajadorId, estado])

  useEffect(cargar, [cargar])

  const conValores = filas?.some((f) => f.totales.valorEmpleador !== undefined) ?? false
  const tiposActivos = useMemo(() => tipos.filter((t) => t.activo), [tipos])
  const trabajadoresActivos = useMemo(() => trabajadores.filter((t) => t.estado === 'ACTIVO'), [trabajadores])
  const vigentes = filas?.filter((f) => !f.anulada) ?? []
  const diasTotales = vigentes.reduce((total, f) => total + f.totales.dias, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="aus-anio" className="block text-xs text-slate-500">
            Año
          </label>
          <input id="aus-anio" type="number" min={2000} max={2100} value={anio} onChange={(e) => setAnio(Number(e.target.value) || anio)} className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-2 text-center text-sm" />
        </div>
        <select aria-label="Filtrar por mes" value={mes} onChange={(e) => setMes(Number(e.target.value))} className="rounded-md border border-slate-300 px-2 py-2 text-sm">
          <option value={0}>Todo el año</option>
          {NOMBRES_MES.map((nombre, i) => (
            <option key={nombre} value={i + 1}>
              {nombre.charAt(0).toUpperCase() + nombre.slice(1)}
            </option>
          ))}
        </select>
        <select aria-label="Filtrar por tipo" value={tipoId} onChange={(e) => setTipoId(e.target.value)} className="rounded-md border border-slate-300 px-2 py-2 text-sm">
          <option value="">Todos los tipos</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <select aria-label="Filtrar por trabajador" value={trabajadorId} onChange={(e) => setTrabajadorId(e.target.value)} className="max-w-[14rem] rounded-md border border-slate-300 px-2 py-2 text-sm">
          <option value="">Todos los trabajadores</option>
          {trabajadores.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <select aria-label="Filtrar por estado" value={estado} onChange={(e) => setEstado(e.target.value as 'VIGENTES' | 'ANULADOS' | 'TODOS')} className="rounded-md border border-slate-300 px-2 py-2 text-sm">
          <option value="VIGENTES">Vigentes</option>
          <option value="ANULADOS">Anulados</option>
          <option value="TODOS">Todos</option>
        </select>
        {puedeGestionar && !registrando && (
          <button type="button" className={`${CLASE_BOTON} sm:ml-auto`} onClick={() => { setOk(null); setRegistrando(true) }}>
            Registrar ausentismo
          </button>
        )}
      </div>

      <Aviso error={error} ok={ok} />

      {registrando && (
        <FormularioAusentismo
          trabajadores={trabajadoresActivos}
          tipos={tiposActivos}
          onRegistrado={(registrado, aviso) => {
            setRegistrando(false)
            setOk(aviso ?? `Ausentismo registrado: ${registrado.tipo.nombre} de ${registrado.trabajador.nombre}.`)
            cargar()
          }}
          onCancelar={() => setRegistrando(false)}
        />
      )}

      {filas && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tarjeta titulo="Registros" valor={String(vigentes.length)} />
          <Tarjeta titulo="Días de ausentismo" valor={String(diasTotales)} />
          {conValores && <Tarjeta titulo="A cargo del empleador" valor={formatearCOP(vigentes.reduce((t, f) => t + suma(f.totales.valorEmpleador), 0))} />}
          {conValores && <Tarjeta titulo="A cargo de EPS, ARL y AFP" valor={formatearCOP(vigentes.reduce((t, f) => t + suma(f.totales.valorEps, f.totales.valorArl, f.totales.valorAfp), 0))} />}
        </div>
      )}

      <Seccion titulo="Incapacidades y licencias" descripcion="Cada registro con quién paga cada día. Abre uno para ver su liquidación, el recobro y el certificado. Un registro no se edita: si hubo un error se anula con motivo y se registra de nuevo.">
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Trabajador</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Fechas</th>
                <th className="px-3 py-2 font-medium">Quién paga</th>
                {conValores && <th className="px-3 py-2 text-right font-medium">Valores</th>}
                <th className="px-3 py-2 font-medium">Recobro</th>
              </tr>
            </thead>
            <tbody>
              {filas && filas.length === 0 && (
                <tr>
                  <td colSpan={conValores ? 6 : 5} className="px-3 py-10 text-center text-slate-400">
                    No hay ausentismos con esos filtros.
                  </td>
                </tr>
              )}
              {filas?.map((f) => (
                <tr key={f.id} className={`border-b border-slate-100 align-top last:border-0 ${f.anulada ? 'bg-slate-50 text-slate-500' : ''}`}>
                  <td className="px-3 py-2">
                    <Link to={`/sst/ausentismo/${f.id}`} className="font-medium text-blue-600 hover:underline">
                      {f.trabajador.nombre}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {f.trabajador.documento}
                      {f.numeroDocumento && ` · ${f.numeroDocumento}`}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    {f.tipo.nombre}
                    <span className="mt-1 flex flex-wrap gap-1">
                      {f.esProrroga && <Insignia tono="azul">Prórroga</Insignia>}
                      {f.corregida && <Insignia tono="ambar">Corregida</Insignia>}
                      {f.anulada && <Insignia tono="gris">Anulada</Insignia>}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {formatearFecha(f.fechaInicio)} al {formatearFecha(f.fechaFin)}
                    <span className="block text-xs text-slate-500">{textoDiasAusentismo(f.dias)}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{textoPagadores(f.totales)}</td>
                  {conValores && (
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {suma(f.totales.valorEmpleador) > 0 && <p>Empleador {formatearCOP(f.totales.valorEmpleador)}</p>}
                      {suma(f.totales.valorEps, f.totales.valorArl, f.totales.valorAfp) > 0 && <p>Entidades {formatearCOP(suma(f.totales.valorEps, f.totales.valorArl, f.totales.valorAfp))}</p>}
                      {suma(f.totales.valorDescuento) > 0 && <p className="text-red-700">Descuento {formatearCOP(f.totales.valorDescuento)}</p>}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {f.recobros.length === 0 && <span className="text-slate-400">—</span>}
                      {f.recobros.map((r) => (
                        <Insignia key={r.id} tono={TONO_ESTADO_RECOBRO[r.estado]}>
                          {ETIQUETA_ENTIDAD_RECOBRO[r.entidad]}: {ETIQUETA_ESTADO_RECOBRO[r.estado].toLowerCase()}
                        </Insignia>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>
    </div>
  )
}
