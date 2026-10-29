import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  confirmarImportacion,
  descargarConciliacionImportacion,
  descargarPlantillaImportacion,
  listarImportaciones,
  validarImportacion,
  type FilaConciliacion,
  type ImportacionHistorial,
  type ResultadoImportacion,
  type ResultadoValidacionImportacion,
  type ResumenImportacion,
} from '../lib/api'
import { Dato, ListaProblemas, Tarjeta } from '../components/importacion/piezas'
import { formatearCOP, formatearFecha } from '../lib/formato'
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TAMANO_MAXIMO_MB } from '../lib/importacion'

function Resumen({ resumen }: { resumen: ResumenImportacion }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Dato etiqueta="Proyectos" valor={resumen.proyectos.nuevos} detalle={resumen.proyectos.existentes > 0 ? `${resumen.proyectos.existentes} ya existían` : undefined} />
      <Dato etiqueta="Manzanas nuevas" valor={resumen.manzanas.nuevas} />
      <Dato etiqueta="Lotes" valor={resumen.lotes.nuevos} detalle={resumen.lotes.existentes > 0 ? `${resumen.lotes.existentes} ya existían` : undefined} />
      <Dato etiqueta="Clientes" valor={resumen.clientes.nuevos} detalle={resumen.clientes.existentes > 0 ? `${resumen.clientes.existentes} ya existían` : undefined} />
      <Dato etiqueta="Ventas" valor={resumen.ventas} detalle={`${resumen.cuotas} cuotas`} />
      <Dato etiqueta="Abonos" valor={resumen.abonos} detalle={`${resumen.recibosHistoricos} recibos históricos (H-)`} />
      <Dato etiqueta="Valor de las ventas" valor={formatearCOP(resumen.valorVentas)} />
      <Dato etiqueta="Abonado" valor={formatearCOP(resumen.totalAbonado)} />
      <Dato etiqueta="Saldo por cobrar" valor={formatearCOP(resumen.totalSaldo)} />
    </div>
  )
}

const ETIQUETA_ESTADO = { COINCIDE: 'Coincide', DIFERENCIA: 'Diferencia', SIN_DATO: 'Sin dato del Excel' } as const
const ESTILO_ESTADO = {
  COINCIDE: 'bg-green-50 text-green-700',
  DIFERENCIA: 'bg-amber-100 text-amber-800',
  SIN_DATO: 'bg-slate-100 text-slate-600',
} as const

function Conciliacion({ filas }: { filas: FilaConciliacion[] }) {
  const [abierta, setAbierta] = useState(false)
  const conDiferencia = filas.filter((fila) => fila.estado === 'DIFERENCIA').length
  if (filas.length === 0) return null

  return (
    <div className="mt-4">
      <button type="button" onClick={() => setAbierta((v) => !v)} className="text-sm font-medium text-blue-600 hover:underline">
        {abierta ? 'Ocultar' : 'Ver'} la conciliación de saldos ({filas.length} venta{filas.length === 1 ? '' : 's'}
        {conDiferencia > 0 ? `, ${conDiferencia} con diferencia` : ''})
      </button>
      {abierta && (
        <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
          {filas.map((fila, indice) => (
            <li key={indice} className={`px-3 py-2 text-sm ${fila.estado === 'DIFERENCIA' ? 'bg-amber-50' : 'bg-white'}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 break-words font-medium text-slate-900">
                  {fila.proyecto}
                  {fila.manzana ? ` · Manzana ${fila.manzana}` : ''} · Lote {fila.lote}
                </p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ESTILO_ESTADO[fila.estado]}`}>{ETIQUETA_ESTADO[fila.estado]}</span>
              </div>
              <p className="text-xs text-slate-500">
                {fila.cliente} · {fila.formaPago === 'CONTADO' ? 'De contado' : 'Financiada'} · {fila.cuotasPagadas}/{fila.cuotasTotales} cuotas pagadas
              </p>
              <dl className="mt-1 grid grid-cols-2 gap-x-3 text-xs">
                <dt className="text-slate-500">Valor total</dt>
                <dd className="text-right text-slate-900">{formatearCOP(fila.valorTotal)}</dd>
                <dt className="text-slate-500">Abonado</dt>
                <dd className="text-right text-slate-900">{formatearCOP(fila.abonado)}</dd>
                <dt className="text-slate-500">Saldo según el sistema</dt>
                <dd className="text-right font-medium text-slate-900">{formatearCOP(fila.saldo)}</dd>
                {fila.saldoSegunExcel !== null && (
                  <>
                    <dt className="text-slate-500">Saldo según el Excel</dt>
                    <dd className="text-right text-slate-900">{formatearCOP(fila.saldoSegunExcel)}</dd>
                  </>
                )}
                {fila.diferencia !== null && fila.estado === 'DIFERENCIA' && (
                  <>
                    <dt className="font-medium text-amber-800">Diferencia</dt>
                    <dd className="text-right font-medium text-amber-800">{formatearCOP(fila.diferencia)}</dd>
                  </>
                )}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Carga de datos desde Excel (RF-MIG-01 a 05): solo el gerente. Primero se valida SIN guardar y solo después de
// revisar el resultado se confirma; la carga entra completa o no entra nada.
export function ImportacionPage() {
  const entradaArchivo = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [validacion, setValidacion] = useState<ResultadoValidacionImportacion | null>(null)
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)
  const [historial, setHistorial] = useState<ImportacionHistorial[] | null>(null)
  const [trabajando, setTrabajando] = useState<'plantilla' | 'validar' | 'confirmar' | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function cargarHistorial() {
    listarImportaciones()
      .then(setHistorial)
      .catch((err: Error) => setError(err.message))
  }

  useEffect(() => {
    let vigente = true
    listarImportaciones()
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
      await descargarPlantillaImportacion()
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
      setValidacion(await validarImportacion(archivo))
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
      setResultado(await confirmarImportacion(archivo, validacion.huella))
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

  async function descargarConciliacion(id: string) {
    setError(null)
    try {
      await descargarConciliacionImportacion(id)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const ocupado = trabajando !== null

  return (
    <div>
      <p className="mt-3 text-sm text-slate-500">
        Carga proyectos, lotes, clientes, ventas con su plan de cuotas y abonos históricos desde la plantilla. Primero se revisa sin guardar nada; solo se guarda cuando tú lo confirmas.
      </p>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Tarjeta numero={1} titulo="Descarga la plantilla y llénala">
        <p className="text-sm text-slate-600">
          Trae una hoja de instrucciones y una hoja por tipo de dato. Los lotes se identifican por proyecto, manzana y número; los clientes, por su documento. Las cuentas bancarias deben estar creadas antes en Configuración.
        </p>
        <button type="button" onClick={descargarPlantilla} disabled={ocupado} className={`mt-3 ${BOTON_SECUNDARIO}`}>
          {trabajando === 'plantilla' ? 'Descargando…' : 'Descargar plantilla (.xlsx)'}
        </button>
      </Tarjeta>

      <Tarjeta numero={2} titulo="Sube el archivo y revisa el resultado">
        <label htmlFor="archivo-importacion" className="block text-sm font-medium text-slate-700">
          Archivo de Excel (.xlsx, máximo {TAMANO_MAXIMO_MB} MB)
        </label>
        <input
          id="archivo-importacion"
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
                Este mismo archivo ya se importó el {formatearFecha(validacion.yaImportado.fecha)} por {validacion.yaImportado.por}. Si necesitas cargar más datos, usa un archivo con datos nuevos.
              </div>
            ) : validacion.totalErrores > 0 ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                El archivo tiene {validacion.totalErrores} error{validacion.totalErrores === 1 ? '' : 'es'}. Corrígelos en el Excel y vuelve a revisarlo: no se ha guardado nada.
              </div>
            ) : (
              <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                El archivo no tiene errores. Esto es lo que se guardaría (todavía no se ha guardado nada):
              </div>
            )}

            <div className="mt-3">
              <Resumen resumen={validacion.resumen} />
            </div>

            <ListaProblemas titulo="Errores que hay que corregir" problemas={validacion.errores} total={validacion.totalErrores} tono="error" />
            <ListaProblemas titulo="Avisos para revisar (no impiden guardar)" problemas={validacion.avisos} total={validacion.totalAvisos} tono="aviso" />
            <Conciliacion filas={validacion.conciliacion} />

            {validacion.puedeConfirmar && (
              <div className="mt-4 border-t border-slate-200 pt-4">
                {!confirmando ? (
                  <button type="button" onClick={() => setConfirmando(true)} disabled={ocupado} className={BOTON_PRIMARIO}>
                    Confirmar y guardar
                  </button>
                ) : (
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                    <p className="text-sm text-blue-900">
                      Se guardarán {validacion.resumen.ventas} venta{validacion.resumen.ventas === 1 ? '' : 's'}, {validacion.resumen.abonos} abono{validacion.resumen.abonos === 1 ? '' : 's'} con recibo histórico y los datos que los acompañan. Entra todo o no entra nada, y no se puede deshacer desde aquí. ¿Confirmas?
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
            <p className="text-sm font-medium text-green-900">Importación guardada: {resultado.nombreArchivo}</p>
            <p className="mt-1 text-sm text-green-800">
              {resultado.resumen.ventas} venta{resultado.resumen.ventas === 1 ? '' : 's'} y {resultado.resumen.abonos} abono{resultado.resumen.abonos === 1 ? '' : 's'}.
              {resultado.resumen.ejecucion.recibosHistoricos.cantidad > 0 &&
                ` Recibos históricos del ${resultado.resumen.ejecucion.recibosHistoricos.primero} al ${resultado.resumen.ejecucion.recibosHistoricos.ultimo}.`}
            </p>
            <div className="mt-3">
              <Resumen resumen={resultado.resumen} />
            </div>
            <Conciliacion filas={resultado.conciliacion} />
            <button type="button" onClick={() => descargarConciliacion(resultado.id)} className={`mt-3 ${BOTON_SECUNDARIO}`}>
              Descargar la conciliación (Excel)
            </button>
          </div>
        )}
      </Tarjeta>

      <Tarjeta numero={3} titulo="Importaciones anteriores">
        {historial === null ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : historial.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no se ha importado ningún archivo.</p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
            {historial.map((importacion) => (
              <li key={importacion.id} className="px-3 py-2 text-sm">
                <p className="break-words font-medium text-slate-900">{importacion.nombreArchivo}</p>
                <p className="text-xs text-slate-500">
                  {formatearFecha(importacion.createdAt)} · {importacion.usuario.nombre} · {importacion.resumen.ventas} venta{importacion.resumen.ventas === 1 ? '' : 's'} · {importacion.resumen.abonos} abono{importacion.resumen.abonos === 1 ? '' : 's'}
                </p>
                <button type="button" onClick={() => descargarConciliacion(importacion.id)} className="mt-1 text-xs font-medium text-blue-600 hover:underline">
                  Descargar conciliación (Excel)
                </button>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  )
}
