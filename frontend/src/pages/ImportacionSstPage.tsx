import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Dato, ListaProblemas, Tarjeta } from '../components/importacion/piezas'
import {
  confirmarCargaSst,
  descargarPlantillaCargaSst,
  listarCargasSst,
  validarCargaSst,
  type CargaSstHistorial,
  type ResultadoCargaSst,
  type ResultadoValidacionCargaSst,
  type ResumenCargaSst,
} from '../lib/api'
import { formatearFecha } from '../lib/formato'
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, cantidad, TAMANO_MAXIMO_MB } from '../lib/importacion'

// Con `soloFilas` (cuando el archivo tiene errores y por eso no se guardaría nada) se muestran solo las filas leídas, no lo que "se cargaría".
function Resumen({ resumen, soloFilas = false }: { resumen: ResumenCargaSst; soloFilas?: boolean }) {
  const { trabajadores, asistencias } = resumen
  return (
    <>
      {!soloFilas && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Dato etiqueta="Trabajadores nuevos" valor={trabajadores.nuevos} detalle={trabajadores.existentes > 0 ? `${trabajadores.existentes} ya existían` : undefined} />
          <Dato etiqueta="Ausentismos" valor={resumen.ausentismos} />
          <Dato etiqueta="Entregas de EPP" valor={resumen.entregasEpp} />
          <Dato etiqueta="Asistencias" valor={asistencias.registradas} detalle={asistencias.yaRegistradas > 0 ? `${asistencias.yaRegistradas} ya estaban registradas` : undefined} />
        </div>
      )}
      <p className={`${soloFilas ? '' : 'mt-2 '}text-xs text-slate-500`}>
        Filas leídas: Trabajadores {resumen.filas.trabajadores} · Ausentismos {resumen.filas.ausentismos} · Entregas EPP {resumen.filas.entregasEpp} · Asistencias {resumen.filas.asistencias}
      </p>
    </>
  )
}

// Carga de datos de seguridad y salud en el trabajo desde Excel (RF-SST-23): solo el gerente. Primero se corre la carga completa
// SIN guardar y se muestra lo que pasaría; solo después de revisarla se confirma, y entra completa o no entra nada. Cada fila pasa
// por las mismas reglas que al digitarla en el sistema.
export function ImportacionSstPage() {
  const entradaArchivo = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [validacion, setValidacion] = useState<ResultadoValidacionCargaSst | null>(null)
  const [resultado, setResultado] = useState<ResultadoCargaSst | null>(null)
  const [historial, setHistorial] = useState<CargaSstHistorial[] | null>(null)
  const [trabajando, setTrabajando] = useState<'plantilla' | 'validar' | 'confirmar' | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function cargarHistorial() {
    listarCargasSst()
      .then(setHistorial)
      .catch((err: Error) => setError(err.message))
  }

  useEffect(() => {
    let vigente = true
    listarCargasSst()
      .then((lista) => vigente && setHistorial(lista))
      .catch((err: Error) => vigente && setError(err.message))
    return () => {
      vigente = false
    }
  }, [])

  function alElegirArchivo(event: ChangeEvent<HTMLInputElement>) {
    const elegido = event.target.files?.[0] ?? null
    setValidacion(null)
    setResultado(null)
    setConfirmando(false)
    setError(null)
    if (elegido && elegido.size > TAMANO_MAXIMO_MB * 1024 * 1024) {
      setArchivo(null)
      setError(`El archivo pesa más de ${TAMANO_MAXIMO_MB} MB. Divide la carga en varios archivos.`)
      return
    }
    setArchivo(elegido)
  }

  async function descargarPlantilla() {
    setTrabajando('plantilla')
    setError(null)
    try {
      await descargarPlantillaCargaSst()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setTrabajando(null)
    }
  }

  async function validar() {
    if (!archivo) return
    setTrabajando('validar')
    setError(null)
    setValidacion(null)
    setResultado(null)
    setConfirmando(false)
    try {
      setValidacion(await validarCargaSst(archivo))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setTrabajando(null)
    }
  }

  async function confirmar() {
    if (!archivo || !validacion) return
    setTrabajando('confirmar')
    setError(null)
    try {
      setResultado(await confirmarCargaSst(archivo, validacion.huella))
      setValidacion(null)
      setArchivo(null)
      if (entradaArchivo.current) entradaArchivo.current.value = ''
      cargarHistorial()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setTrabajando(null)
      setConfirmando(false)
    }
  }

  const ocupado = trabajando !== null

  return (
    <div>
      <p className="mt-3 text-sm text-slate-500">
        Carga trabajadores, ausentismos, entregas de EPP y asistencias a capacitaciones desde la plantilla. Primero se revisa sin guardar nada; solo se guarda cuando tú lo confirmas.
      </p>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Tarjeta numero={1} titulo="Descarga la plantilla y llénala">
        <p className="text-sm text-slate-600">
          Trae una hoja de instrucciones y una hoja por tipo de dato (Trabajadores, Ausentismos, Entregas EPP y Asistencias). Los trabajadores se identifican por su documento. Cada fila pasa por las mismas reglas que al digitarla en el sistema.
        </p>
        <p className="mt-3 text-sm font-medium text-slate-700">Antes de cargar, ten en cuenta:</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Los elementos de EPP y las capacitaciones deben existir antes: la carga no los crea.</li>
          <li>Un ausentismo se liquida con el salario actual del trabajador y los parámetros legales del año en que empieza (Configuración → Seguridad social).</li>
          <li>Una prórroga necesita los días que llevaba la incapacidad anterior. Los certificados no se cargan.</li>
          <li>Los trabajadores que ya existen no se modifican. Lo que se carga no se puede borrar: se anula con motivo y se registra el correcto.</li>
          <li>El diagnóstico (código CIE-10) y las observaciones son datos de salud: solo los ven los roles con permiso.</li>
        </ul>
        <button type="button" onClick={descargarPlantilla} disabled={ocupado} className={`mt-3 ${BOTON_SECUNDARIO}`}>
          {trabajando === 'plantilla' ? 'Descargando…' : 'Descargar plantilla (.xlsx)'}
        </button>
      </Tarjeta>

      <Tarjeta numero={2} titulo="Sube el archivo y revisa el resultado">
        <label htmlFor="archivo-carga-sst" className="block text-sm font-medium text-slate-700">
          Archivo de Excel (.xlsx, máximo {TAMANO_MAXIMO_MB} MB)
        </label>
        <input
          id="archivo-carga-sst"
          ref={entradaArchivo}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={alElegirArchivo}
          disabled={ocupado}
          className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        <button type="button" onClick={validar} disabled={!archivo || ocupado} className={`mt-3 ${BOTON_PRIMARIO}`}>
          {trabajando === 'validar' ? 'Revisando…' : 'Revisar sin guardar'}
        </button>

        {validacion && (
          <div className="mt-4">
            {validacion.yaImportado ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Este mismo archivo ya se cargó el {formatearFecha(validacion.yaImportado.fecha)} por {validacion.yaImportado.por}. Si necesitas cargar más datos, usa un archivo con datos nuevos.
              </div>
            ) : validacion.totalErrores > 0 ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                El archivo tiene {cantidad(validacion.totalErrores, 'error', 'errores')}. Corrígelos en el Excel y vuelve a revisarlo: no se ha guardado nada, ni siquiera lo que está bien.
              </div>
            ) : (
              <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                El archivo no tiene errores. Esto es lo que se guardaría (todavía no se ha guardado nada):
              </div>
            )}

            <div className="mt-3">
              <Resumen resumen={validacion.resumen} soloFilas={validacion.totalErrores > 0} />
            </div>

            <ListaProblemas titulo="Errores que hay que corregir" problemas={validacion.errores} total={validacion.totalErrores} tono="error" />
            <ListaProblemas titulo="Avisos para revisar (no impiden guardar)" problemas={validacion.avisos} total={validacion.totalAvisos} tono="aviso" />

            {validacion.puedeConfirmar && (
              <div className="mt-4 border-t border-slate-200 pt-4">
                {!confirmando ? (
                  <button type="button" onClick={() => setConfirmando(true)} disabled={ocupado} className={BOTON_PRIMARIO}>
                    Confirmar y guardar
                  </button>
                ) : (
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                    <p className="text-sm text-blue-900">
                      Se guardarán {cantidad(validacion.resumen.trabajadores.nuevos, 'trabajador nuevo', 'trabajadores nuevos')}, {cantidad(validacion.resumen.ausentismos, 'ausentismo', 'ausentismos')},{' '}
                      {cantidad(validacion.resumen.entregasEpp, 'entrega de EPP', 'entregas de EPP')} y {cantidad(validacion.resumen.asistencias.registradas, 'asistencia', 'asistencias')}. Entra todo o no entra nada. Lo que se carga no se puede borrar:
                      si algo queda mal, se anula con motivo y se registra el correcto. ¿Confirmas?
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <button type="button" onClick={confirmar} disabled={ocupado} className={BOTON_PRIMARIO}>
                        {trabajando === 'confirmar' ? 'Guardando…' : 'Sí, guardar'}
                      </button>
                      <button type="button" onClick={() => setConfirmando(false)} disabled={ocupado} className={BOTON_SECUNDARIO}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {resultado && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3">
            <p className="text-sm font-medium text-green-900">Carga guardada: {resultado.nombreArchivo}</p>
            <div className="mt-3">
              <Resumen resumen={resultado.resumen} />
            </div>
            <ListaProblemas titulo="Avisos de la carga" problemas={resultado.avisos} total={resultado.totalAvisos} tono="aviso" />
          </div>
        )}
      </Tarjeta>

      <Tarjeta numero={3} titulo="Cargas anteriores">
        {historial === null ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : historial.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no se ha cargado ningún archivo de seguridad y salud.</p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
            {historial.map((carga) => (
              <li key={carga.id} className="px-3 py-2 text-sm">
                <p className="break-words font-medium text-slate-900">{carga.nombreArchivo}</p>
                <p className="text-xs text-slate-500">
                  {formatearFecha(carga.createdAt)} · {carga.usuario.nombre} · {cantidad(carga.resumen.trabajadores.nuevos, 'trabajador nuevo', 'trabajadores nuevos')} · {cantidad(carga.resumen.ausentismos, 'ausentismo', 'ausentismos')} ·{' '}
                  {cantidad(carga.resumen.entregasEpp, 'entrega de EPP', 'entregas de EPP')} · {cantidad(carga.resumen.asistencias.registradas, 'asistencia', 'asistencias')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  )
}
