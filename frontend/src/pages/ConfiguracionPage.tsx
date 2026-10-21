import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { LogoEmpresa } from '../components/LogoEmpresa'
import { useAuth } from '../contexts/AuthContext'
import { useEmpresa } from '../contexts/EmpresaContext'
import {
  actualizarCategoriaGasto,
  actualizarCategoriaIngreso,
  actualizarComision,
  actualizarCuenta,
  actualizarEmpresa,
  actualizarMedioPago,
  actualizarParametros,
  actualizarTipoEquipo,
  crearCategoriaGasto,
  crearCategoriaIngreso,
  crearCuenta,
  crearTipoEquipo,
  exportarTodosLosDatos,
  obtenerConfiguracion,
  quitarLogo,
  subirLogo,
  type CategoriaGasto,
  type ComisionConfig,
  type ConfiguracionCompleta,
  type CuentaBancaria,
  type EmpresaConfig,
  type MedioPagoConfig,
  type TipoCuenta,
  type TipoEquipo,
  type TipoVendedor,
} from '../lib/api'
import { formatearCOP } from '../lib/formato'
import { esColorValido } from '../lib/marca'
import { PERMISOS } from '../lib/permisos'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
const CLASE_BOTON =
  'rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
const CLASE_BOTON_SECUNDARIO =
  'rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'

const ETIQUETA_TIPO_CUENTA: Record<TipoCuenta, string> = {
  AHORROS: 'Ahorros',
  CORRIENTE: 'Corriente',
  BILLETERA_DIGITAL: 'Billetera digital',
}

const ETIQUETA_VENDEDOR: Record<TipoVendedor, string> = {
  ASESOR_INMOBILIARIO: 'Asesor inmobiliario',
  REFERIDO: 'Otro referido',
}

// "2,5" y "2.5" significan lo mismo para quien escribe en Colombia.
function aNumero(texto: string) {
  return Number(texto.trim().replace(',', '.'))
}

// Los porcentajes llegan de la base como "30.00": se muestran sin ceros sobrantes.
function porcentajeATexto(valor: string | null) {
  return valor === null ? '' : String(Number(valor)).replace('.', ',')
}

function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
      <p className="text-sm text-slate-500">{descripcion}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Aviso({ error, ok }: { error: string | null; ok: string | null }) {
  if (error) {
    return <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
  }
  if (ok) {
    return <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{ok}</div>
  }
  return null
}

function Campo({ id, etiqueta, ayuda, children }: { id: string; etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {etiqueta}
      </label>
      {children}
      {ayuda && <p className="mt-1 text-xs text-slate-400">{ayuda}</p>}
    </div>
  )
}

// ---------- Empresa y marca ----------

function SeccionEmpresa({ empresa, onGuardada }: { empresa: EmpresaConfig; onGuardada: (e: EmpresaConfig) => void }) {
  const { recargarMarca, marca } = useEmpresa()
  const [razonSocial, setRazonSocial] = useState(empresa.razonSocial)
  const [nombreComercial, setNombreComercial] = useState(empresa.nombreComercial)
  const [nit, setNit] = useState(empresa.nit)
  const [direccion, setDireccion] = useState(empresa.direccion ?? '')
  const [telefonos, setTelefonos] = useState(empresa.telefonos ?? '')
  const [correo, setCorreo] = useState(empresa.correo ?? '')
  const [colorPrimario, setColorPrimario] = useState(empresa.colorPrimario)
  const [textoLegal, setTextoLegal] = useState(empresa.textoLegalRecibo ?? '')
  const [prefijoRecibo, setPrefijoRecibo] = useState(empresa.prefijoRecibo)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const [procesandoLogo, setProcesandoLogo] = useState(false)
  const [errorLogo, setErrorLogo] = useState<string | null>(null)
  const inputLogo = useRef<HTMLInputElement>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setOk(null)
    if (!esColorValido(colorPrimario)) {
      setError('El color debe tener el formato #rrggbb, por ejemplo #2563eb')
      return
    }
    setEnviando(true)
    try {
      const guardada = await actualizarEmpresa({
        razonSocial: razonSocial.trim(),
        nombreComercial: nombreComercial.trim(),
        nit: nit.trim(),
        direccion: direccion.trim() || undefined,
        telefonos: telefonos.trim() || undefined,
        correo: correo.trim() || undefined,
        colorPrimario,
        textoLegalRecibo: textoLegal.trim() || undefined,
        prefijoRecibo: prefijoRecibo.trim(),
      })
      onGuardada(guardada)
      await recargarMarca()
      setOk('Datos de la empresa guardados.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setEnviando(false)
    }
  }

  async function handleLogo(archivo: File | undefined) {
    if (!archivo) return
    setErrorLogo(null)
    setProcesandoLogo(true)
    try {
      await subirLogo(archivo)
      await recargarMarca()
    } catch (err) {
      setErrorLogo(err instanceof Error ? err.message : 'No se pudo subir el logo')
    } finally {
      setProcesandoLogo(false)
      if (inputLogo.current) inputLogo.current.value = ''
    }
  }

  async function handleQuitarLogo() {
    setErrorLogo(null)
    setProcesandoLogo(true)
    try {
      await quitarLogo()
      await recargarMarca()
    } catch (err) {
      setErrorLogo(err instanceof Error ? err.message : 'No se pudo quitar el logo')
    } finally {
      setProcesandoLogo(false)
    }
  }

  return (
    <Seccion
      titulo="Empresa y marca"
      descripcion="Estos datos aparecen en el ingreso, el menú, los recibos, los reportes y los correos a los clientes."
    >
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <LogoEmpresa className="h-16 w-16" />
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={CLASE_BOTON_SECUNDARIO} disabled={procesandoLogo} onClick={() => inputLogo.current?.click()}>
              {procesandoLogo ? 'Procesando...' : marca.tieneLogo ? 'Cambiar logo' : 'Subir logo'}
            </button>
            {marca.tieneLogo && (
              <button type="button" className={CLASE_BOTON_SECUNDARIO} disabled={procesandoLogo} onClick={handleQuitarLogo}>
                Quitar logo
              </button>
            )}
          </div>
          <p className="text-xs text-slate-400">PNG, JPG o WebP, hasta 2 MB. Sin logo se muestra un ícono genérico.</p>
          <input
            ref={inputLogo}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => void handleLogo(event.target.files?.[0])}
          />
        </div>
      </div>
      {errorLogo && <Aviso error={errorLogo} ok={null} />}

      <Aviso error={error} ok={ok} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="razonSocial" etiqueta="Razón social">
            <input id="razonSocial" required value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} className={CLASE_INPUT} />
          </Campo>
          <Campo id="nombreComercial" etiqueta="Nombre comercial" ayuda="Es el nombre que ven los usuarios y los clientes.">
            <input id="nombreComercial" required value={nombreComercial} onChange={(e) => setNombreComercial(e.target.value)} className={CLASE_INPUT} />
          </Campo>
          <Campo id="nit" etiqueta="NIT">
            <input id="nit" required value={nit} onChange={(e) => setNit(e.target.value)} className={CLASE_INPUT} />
          </Campo>
          <Campo id="correo" etiqueta="Correo de contacto">
            <input id="correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} className={CLASE_INPUT} />
          </Campo>
          <Campo id="direccion" etiqueta="Dirección">
            <input id="direccion" value={direccion} onChange={(e) => setDireccion(e.target.value)} className={CLASE_INPUT} />
          </Campo>
          <Campo id="telefonos" etiqueta="Teléfonos">
            <input id="telefonos" value={telefonos} onChange={(e) => setTelefonos(e.target.value)} className={CLASE_INPUT} />
          </Campo>
        </div>

        <Campo id="colorPrimario" etiqueta="Color principal" ayuda="Cambia los botones y resaltados de toda la aplicación.">
          <div className="mt-1 flex items-center gap-3">
            <input
              id="colorPrimario"
              type="color"
              value={esColorValido(colorPrimario) ? colorPrimario : '#2563eb'}
              onChange={(e) => setColorPrimario(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-md border border-slate-300 bg-white p-1"
            />
            <input
              aria-label="Código del color"
              value={colorPrimario}
              onChange={(e) => setColorPrimario(e.target.value)}
              maxLength={7}
              className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </Campo>

        <Campo
          id="prefijoRecibo"
          etiqueta="Prefijo de los recibos de caja"
          ayuda="Letras mayúsculas, números y guion (hasta 10). Ejemplo: RC- da RC-000001. Los recibos ya emitidos conservan el prefijo con que salieron."
        >
          <input
            id="prefijoRecibo"
            required
            maxLength={10}
            value={prefijoRecibo}
            onChange={(e) => setPrefijoRecibo(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
            className={CLASE_INPUT}
          />
        </Campo>

        <Campo id="textoLegal" etiqueta="Texto legal al pie del recibo" ayuda="Opcional. Se imprime al final de cada recibo de pago.">
          <textarea id="textoLegal" rows={3} maxLength={1000} value={textoLegal} onChange={(e) => setTextoLegal(e.target.value)} className={CLASE_INPUT} />
        </Campo>

        <button type="submit" disabled={enviando} className={CLASE_BOTON}>
          {enviando ? 'Guardando...' : 'Guardar datos de la empresa'}
        </button>
      </form>
    </Seccion>
  )
}

// ---------- Parámetros del negocio ----------

function SeccionParametros({ empresa, onGuardada }: { empresa: EmpresaConfig; onGuardada: (e: EmpresaConfig) => void }) {
  const [cuotaInicial, setCuotaInicial] = useState(porcentajeATexto(empresa.porcentajeCuotaInicial))
  const [plazo, setPlazo] = useState(String(empresa.plazoMaximoMeses))
  const [financiacion, setFinanciacion] = useState(porcentajeATexto(empresa.tasaFinanciacionMensual))
  const [mora, setMora] = useState(porcentajeATexto(empresa.tasaMoraMensual))
  const [diasGracia, setDiasGracia] = useState(String(empresa.diasGraciaMora))
  const [diasAmarillo, setDiasAmarillo] = useState(String(empresa.diasSemaforoAmarillo))
  const [diasRecordatorio, setDiasRecordatorio] = useState(String(empresa.diasAntesRecordatorio))
  const [diasEntreAvisosMora, setDiasEntreAvisosMora] = useState(String(empresa.diasEntreAvisosMora))
  const [enviarRecibo, setEnviarRecibo] = useState(empresa.enviarReciboPorCorreo)
  const [intentosLogin, setIntentosLogin] = useState(String(empresa.intentosMaximosLogin))
  const [minutosBloqueo, setMinutosBloqueo] = useState(String(empresa.minutosBloqueoLogin))
  const [minutosInactividad, setMinutosInactividad] = useState(String(empresa.minutosInactividad))
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setOk(null)
    setEnviando(true)
    try {
      const guardada = await actualizarParametros({
        porcentajeCuotaInicial: aNumero(cuotaInicial),
        plazoMaximoMeses: aNumero(plazo),
        tasaFinanciacionMensual: aNumero(financiacion),
        tasaMoraMensual: mora.trim() === '' ? null : aNumero(mora),
        diasGraciaMora: aNumero(diasGracia),
        diasSemaforoAmarillo: aNumero(diasAmarillo),
        diasAntesRecordatorio: aNumero(diasRecordatorio),
        diasEntreAvisosMora: aNumero(diasEntreAvisosMora),
        enviarReciboPorCorreo: enviarRecibo,
        intentosMaximosLogin: aNumero(intentosLogin),
        minutosBloqueoLogin: aNumero(minutosBloqueo),
        minutosInactividad: aNumero(minutosInactividad),
      })
      onGuardada(guardada)
      setOk('Parámetros guardados. Se aplican desde ahora en cartera, mora y recordatorios.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Seccion titulo="Parámetros del negocio" descripcion="Reglas de venta, cartera y recordatorios. Puedes cambiarlas cuando el negocio lo requiera.">
      <Aviso error={error} ok={ok} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="cuotaInicial" etiqueta="Cuota inicial (%)" ayuda="Porcentaje del valor del lote que se pide al firmar.">
            <input id="cuotaInicial" required inputMode="decimal" value={cuotaInicial} onChange={(e) => setCuotaInicial(e.target.value)} className={CLASE_INPUT} />
          </Campo>
          <Campo id="plazo" etiqueta="Plazo máximo (meses)">
            <input id="plazo" required inputMode="numeric" value={plazo} onChange={(e) => setPlazo(e.target.value)} className={CLASE_INPUT} />
          </Campo>
          <Campo id="financiacion" etiqueta="Interés de financiación mensual (%)" ayuda="0 = el saldo se financia sin interés.">
            <input id="financiacion" required inputMode="decimal" value={financiacion} onChange={(e) => setFinanciacion(e.target.value)} className={CLASE_INPUT} />
          </Campo>
          <Campo id="mora" etiqueta="Interés de mora mensual (%)" ayuda="Déjalo vacío mientras no se defina: no se cobrará interés de mora.">
            <input id="mora" inputMode="decimal" value={mora} onChange={(e) => setMora(e.target.value)} className={CLASE_INPUT} />
          </Campo>
          <Campo id="diasGracia" etiqueta="Días de gracia antes de cobrar mora">
            <input id="diasGracia" required inputMode="numeric" value={diasGracia} onChange={(e) => setDiasGracia(e.target.value)} className={CLASE_INPUT} />
          </Campo>
          <Campo id="diasAmarillo" etiqueta="Días de aviso del semáforo amarillo" ayuda="Cuántos días antes del vencimiento el cliente pasa a “próximo a vencer”.">
            <input id="diasAmarillo" required inputMode="numeric" value={diasAmarillo} onChange={(e) => setDiasAmarillo(e.target.value)} className={CLASE_INPUT} />
          </Campo>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-medium text-slate-800">Avisos a clientes</p>
          <p className="text-xs text-slate-500">Los correos salen solos cada mañana (8:00 a. m., hora de Colombia). Cada aviso queda en el historial de Notificaciones.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="diasRecordatorio" etiqueta="Días antes del vencimiento para el recordatorio por correo">
            <input id="diasRecordatorio" required inputMode="numeric" value={diasRecordatorio} onChange={(e) => setDiasRecordatorio(e.target.value)} className={CLASE_INPUT} />
          </Campo>
          <Campo id="diasEntreAvisosMora" etiqueta="Días entre avisos de mora" ayuda="Cada cuántos días se le repite el aviso a un cliente con cuotas vencidas.">
            <input id="diasEntreAvisosMora" required inputMode="numeric" value={diasEntreAvisosMora} onChange={(e) => setDiasEntreAvisosMora(e.target.value)} className={CLASE_INPUT} />
          </Campo>
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={enviarRecibo} onChange={(e) => setEnviarRecibo(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
          <span>
            Enviar el recibo en PDF al correo del cliente al registrar un abono
            <span className="block text-xs text-slate-500">Si el cliente no tiene correo, o el correo de la empresa no está configurado, el aviso queda como omitido.</span>
          </span>
        </label>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-medium text-slate-800">Seguridad de la sesión</p>
          <p className="text-xs text-slate-500">Protegen las cuentas frente a claves adivinadas y equipos desatendidos.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="intentosLogin" etiqueta="Intentos fallidos antes de bloquear la cuenta">
            <input id="intentosLogin" required inputMode="numeric" value={intentosLogin} onChange={(e) => setIntentosLogin(e.target.value)} className={CLASE_INPUT} />
          </Campo>
          <Campo id="minutosBloqueo" etiqueta="Minutos que dura el bloqueo">
            <input id="minutosBloqueo" required inputMode="numeric" value={minutosBloqueo} onChange={(e) => setMinutosBloqueo(e.target.value)} className={CLASE_INPUT} />
          </Campo>
          <Campo id="minutosInactividad" etiqueta="Minutos de inactividad para cerrar la sesión" ayuda="Aplica desde el próximo ingreso de cada persona.">
            <input id="minutosInactividad" required inputMode="numeric" value={minutosInactividad} onChange={(e) => setMinutosInactividad(e.target.value)} className={CLASE_INPUT} />
          </Campo>
        </div>
        <button type="submit" disabled={enviando} className={CLASE_BOTON}>
          {enviando ? 'Guardando...' : 'Guardar parámetros'}
        </button>
      </form>
    </Seccion>
  )
}

// ---------- Cuentas de recaudo ----------

function FilaCuenta({ cuenta, onCambio }: { cuenta: CuentaBancaria; onCambio: (c: CuentaBancaria) => void }) {
  const [editando, setEditando] = useState(false)
  const [banco, setBanco] = useState(cuenta.banco)
  const [tipo, setTipo] = useState<TipoCuenta>(cuenta.tipo)
  const [numero, setNumero] = useState(cuenta.numero)
  const [alias, setAlias] = useState(cuenta.alias)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(payload: Parameters<typeof actualizarCuenta>[1]) {
    setError(null)
    setEnviando(true)
    try {
      onCambio(await actualizarCuenta(cuenta.id, payload))
      setEditando(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setEnviando(false)
    }
  }

  const porConfigurar = cuenta.numero === 'POR CONFIGURAR'

  return (
    <li className="py-3">
      {editando ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void guardar({ banco: banco.trim(), tipo, numero: numero.trim(), alias: alias.trim() })
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input aria-label="Banco" required value={banco} onChange={(e) => setBanco(e.target.value)} className={CLASE_INPUT} />
            <select aria-label="Tipo de cuenta" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCuenta)} className={CLASE_INPUT}>
              {Object.entries(ETIQUETA_TIPO_CUENTA).map(([valor, etiqueta]) => (
                <option key={valor} value={valor}>
                  {etiqueta}
                </option>
              ))}
            </select>
            <input aria-label="Número de cuenta" required value={numero} onChange={(e) => setNumero(e.target.value)} className={CLASE_INPUT} />
            <input aria-label="Nombre para identificarla" required value={alias} onChange={(e) => setAlias(e.target.value)} className={CLASE_INPUT} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={enviando} className={CLASE_BOTON}>
              Guardar
            </button>
            <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">
              {cuenta.alias}{' '}
              <span className={cuenta.activa ? 'ml-1 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700' : 'ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500'}>
                {cuenta.activa ? 'Activa' : 'Inactiva'}
              </span>
            </p>
            <p className="text-xs text-slate-500">
              {cuenta.banco} · {ETIQUETA_TIPO_CUENTA[cuenta.tipo]} · {cuenta.numero}
            </p>
            {porConfigurar && <p className="text-xs text-amber-700">Falta el número real de la cuenta.</p>}
          </div>
          <div className="flex gap-2">
            <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => setEditando(true)}>
              Editar
            </button>
            <button type="button" disabled={enviando} className={CLASE_BOTON_SECUNDARIO} onClick={() => void guardar({ activa: !cuenta.activa })}>
              {cuenta.activa ? 'Desactivar' : 'Activar'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </li>
  )
}

function SeccionCuentas({ cuentas, onCambio }: { cuentas: CuentaBancaria[]; onCambio: (c: CuentaBancaria[]) => void }) {
  const [banco, setBanco] = useState('')
  const [tipo, setTipo] = useState<TipoCuenta>('AHORROS')
  const [numero, setNumero] = useState('')
  const [alias, setAlias] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCrear(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const nueva = await crearCuenta({ banco: banco.trim(), tipo, numero: numero.trim(), alias: alias.trim() })
      onCambio([...cuentas, nueva])
      setBanco('')
      setNumero('')
      setAlias('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Seccion
      titulo="Cuentas de recaudo"
      descripcion="Cuentas donde los clientes consignan o transfieren. Las cuentas no se borran: se desactivan."
    >
      <ul className="divide-y divide-slate-100">
        {cuentas.map((cuenta) => (
          <FilaCuenta key={cuenta.id} cuenta={cuenta} onCambio={(c) => onCambio(cuentas.map((x) => (x.id === c.id ? c : x)))} />
        ))}
        {cuentas.length === 0 && <li className="py-3 text-sm text-slate-500">Aún no hay cuentas registradas.</li>}
      </ul>

      <form onSubmit={handleCrear} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
        <p className="text-sm font-medium text-slate-700">Agregar cuenta</p>
        <Aviso error={error} ok={null} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input aria-label="Banco" placeholder="Banco" required value={banco} onChange={(e) => setBanco(e.target.value)} className={CLASE_INPUT} />
          <select aria-label="Tipo de cuenta" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCuenta)} className={CLASE_INPUT}>
            {Object.entries(ETIQUETA_TIPO_CUENTA).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
          <input aria-label="Número de cuenta" placeholder="Número de cuenta" required value={numero} onChange={(e) => setNumero(e.target.value)} className={CLASE_INPUT} />
          <input aria-label="Nombre para identificarla" placeholder="Nombre (ej. Bancolombia principal)" required value={alias} onChange={(e) => setAlias(e.target.value)} className={CLASE_INPUT} />
        </div>
        <button type="submit" disabled={enviando} className={CLASE_BOTON}>
          {enviando ? 'Agregando...' : 'Agregar cuenta'}
        </button>
      </form>
    </Seccion>
  )
}

// ---------- Medios de pago ----------

function SeccionMediosPago({ medios, onCambio }: { medios: MedioPagoConfig[]; onCambio: (m: MedioPagoConfig[]) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [cambiando, setCambiando] = useState<string | null>(null)

  async function alternar(medio: MedioPagoConfig) {
    setError(null)
    setCambiando(medio.medio)
    try {
      onCambio(await actualizarMedioPago(medio.medio, !medio.activo))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el medio de pago')
    } finally {
      setCambiando(null)
    }
  }

  return (
    <Seccion titulo="Medios de pago" descripcion="Los medios activos son los que aparecen al registrar un abono. Los abonos ya registrados no cambian.">
      <Aviso error={error} ok={null} />
      <ul className="divide-y divide-slate-100">
        {medios.map((medio) => (
          <li key={medio.medio} className="flex items-center justify-between gap-3 py-2.5">
            <label htmlFor={`medio-${medio.medio}`} className="text-sm text-slate-800">
              {medio.etiqueta}
            </label>
            <input
              id={`medio-${medio.medio}`}
              type="checkbox"
              checked={medio.activo}
              disabled={cambiando === medio.medio}
              onChange={() => void alternar(medio)}
              className="h-5 w-5 accent-blue-600"
            />
          </li>
        ))}
      </ul>
    </Seccion>
  )
}

// ---------- Categorías de gasto ----------

interface PropsCategorias {
  titulo: string
  descripcion: string
  categorias: CategoriaGasto[]
  onCambio: (c: CategoriaGasto[]) => void
  crear: (nombre: string, soloMaquinaria?: boolean) => Promise<CategoriaGasto>
  // Solo las categorías de gasto pueden ser propias de la maquinaria (RF-MAQ-06).
  permiteSoloMaquinaria?: boolean
  actualizar: (id: string, payload: { activa?: boolean }) => Promise<CategoriaGasto>
}

// Las categorías de gasto y las de ingreso se administran igual (RF-CFG-08 y RF-CFG-11).
function SeccionCategorias({ titulo, descripcion, categorias, onCambio, crear, actualizar, permiteSoloMaquinaria }: PropsCategorias) {
  const [nombre, setNombre] = useState('')
  const [soloMaquinaria, setSoloMaquinaria] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCrear(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const nueva = await crear(nombre.trim(), permiteSoloMaquinaria ? soloMaquinaria : false)
      onCambio([...categorias, nueva])
      setNombre('')
      setSoloMaquinaria(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la categoría')
    } finally {
      setEnviando(false)
    }
  }

  async function alternar(categoria: CategoriaGasto) {
    setError(null)
    try {
      const actualizada = await actualizar(categoria.id, { activa: !categoria.activa })
      onCambio(categorias.map((c) => (c.id === actualizada.id ? actualizada : c)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la categoría')
    }
  }

  return (
    <Seccion titulo={titulo} descripcion={descripcion}>
      <Aviso error={error} ok={null} />
      <ul className="divide-y divide-slate-100">
        {categorias.map((categoria) => (
          <li key={categoria.id} className="flex items-center justify-between gap-3 py-2.5">
            <p className="min-w-0 truncate text-sm text-slate-800">
              {categoria.nombre}
              {categoria.esSistema && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">Del sistema</span>}
              {categoria.soloMaquinaria && <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">Solo maquinaria</span>}
              {!categoria.activa && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">Inactiva</span>}
            </p>
            {!categoria.esSistema && (
              <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => void alternar(categoria)}>
                {categoria.activa ? 'Desactivar' : 'Activar'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {permiteSoloMaquinaria && (
        <label className="mt-4 flex items-start gap-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
          <input type="checkbox" checked={soloMaquinaria} onChange={(e) => setSoloMaquinaria(e.target.checked)} className="mt-0.5" />
          <span>La próxima categoría es propia de la maquinaria: solo se ofrece en proyectos de maquinaria (no se puede cambiar después).</span>
        </label>
      )}
      <form onSubmit={handleCrear} className={`flex flex-col gap-2 sm:flex-row ${permiteSoloMaquinaria ? 'mt-2' : 'mt-4 border-t border-slate-100 pt-4'}`}>
        <input aria-label="Nueva categoría" placeholder="Nueva categoría" required minLength={2} maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
        <button type="submit" disabled={enviando} className={CLASE_BOTON}>
          Agregar
        </button>
      </form>
    </Seccion>
  )
}

// Tipos de equipo de maquinaria (RF-MAQ-02): se desactivan, no se borran.
function SeccionTiposEquipo({ tipos, onCambio }: { tipos: TipoEquipo[]; onCambio: (t: TipoEquipo[]) => void }) {
  const [nombre, setNombre] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCrear(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const nuevo = await crearTipoEquipo(nombre.trim())
      onCambio([...tipos, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
      setNombre('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el tipo de equipo')
    } finally {
      setEnviando(false)
    }
  }

  async function alternar(tipo: TipoEquipo) {
    setError(null)
    try {
      const actualizado = await actualizarTipoEquipo(tipo.id, { activo: !tipo.activo })
      onCambio(tipos.map((t) => (t.id === actualizado.id ? actualizado : t)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el tipo de equipo')
    }
  }

  return (
    <Seccion titulo="Tipos de equipo" descripcion="Para clasificar los equipos de los proyectos de maquinaria (excavadora, retroexcavadora, volqueta…). Un tipo desactivado ya no se ofrece al registrar equipos nuevos, pero los equipos que lo tienen lo conservan.">
      <Aviso error={error} ok={null} />
      <ul className="divide-y divide-slate-100">
        {tipos.map((tipo) => (
          <li key={tipo.id} className="flex items-center justify-between gap-3 py-2.5">
            <p className="min-w-0 truncate text-sm text-slate-800">
              {tipo.nombre}
              {!tipo.activo && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">Inactivo</span>}
            </p>
            <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => void alternar(tipo)}>
              {tipo.activo ? 'Desactivar' : 'Activar'}
            </button>
          </li>
        ))}
        {tipos.length === 0 && <li className="py-3 text-sm text-slate-400">Todavía no hay tipos de equipo.</li>}
      </ul>
      <form onSubmit={handleCrear} className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
        <input aria-label="Nuevo tipo de equipo" placeholder="Nuevo tipo de equipo" required minLength={2} maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
        <button type="submit" disabled={enviando} className={CLASE_BOTON}>
          Agregar
        </button>
      </form>
    </Seccion>
  )
}

// ---------- Comisiones ----------

function FilaComision({ comision, onCambio }: { comision: ComisionConfig; onCambio: (c: ComisionConfig) => void }) {
  const [valor, setValor] = useState(String(Number(comision.valor)))
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setOk(null)
    setEnviando(true)
    try {
      // Solo dígitos: "1.000.000" y "1000000" se aceptan por igual.
      const limpio = valor.replace(/[.\s]/g, '').replace(',', '.')
      onCambio(await actualizarComision(comision.tipo, limpio))
      setOk('Guardado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="py-3">
      <label htmlFor={`comision-${comision.tipo}`} className="block text-sm font-medium text-slate-700">
        {ETIQUETA_VENDEDOR[comision.tipo]} <span className="font-normal text-slate-400">(actual: {formatearCOP(comision.valor)})</span>
      </label>
      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
        <input id={`comision-${comision.tipo}`} required inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
        <button type="submit" disabled={enviando} className={CLASE_BOTON}>
          Guardar
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      {ok && !error && <p className="mt-1 text-sm text-green-700">{ok}</p>}
    </form>
  )
}

function SeccionComisiones({ comisiones, onCambio }: { comisiones: ComisionConfig[]; onCambio: (c: ComisionConfig[]) => void }) {
  return (
    <Seccion titulo="Comisiones de venta" descripcion="Valor fijo en pesos que se paga por cada venta, según quién la trajo.">
      <div className="divide-y divide-slate-100">
        {comisiones.map((comision) => (
          <FilaComision key={comision.tipo} comision={comision} onCambio={(c) => onCambio(comisiones.map((x) => (x.tipo === c.tipo ? c : x)))} />
        ))}
      </div>
    </Seccion>
  )
}

// Exportación completa (RNF-LEG-02): la empresa se lleva todos sus datos a Excel cuando quiera.
function SeccionExportacion() {
  const [exportando, setExportando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function exportar() {
    setExportando(true)
    setError(null)
    try {
      await exportarTodosLosDatos()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo exportar')
    } finally {
      setExportando(false)
    }
  }

  return (
    <Seccion
      titulo="Exportar todos mis datos a Excel"
      descripcion="Descarga un libro de Excel con todos los datos de la empresa, una hoja por tipo de dato (proyectos, lotes, clientes, ventas, cuotas, abonos, recibos, egresos, nómina, auditoría y más). No incluye contraseñas ni los archivos adjuntos. Cada exportación queda registrada en la auditoría."
    >
      <Aviso error={error} ok={null} />
      <button type="button" onClick={exportar} disabled={exportando} className={`${CLASE_BOTON} w-full py-3 sm:w-auto sm:py-2`}>
        {exportando ? 'Preparando el archivo…' : 'Exportar todos los datos'}
      </button>
      {exportando && <p className="mt-2 text-xs text-slate-500">Con muchos datos puede tardar unos segundos.</p>}
    </Seccion>
  )
}

// ---------- Página ----------

export function ConfiguracionPage() {
  const { tiene } = useAuth()
  const [config, setConfig] = useState<ConfiguracionCompleta | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    obtenerConfiguracion()
      .then(setConfig)
      .catch((err: Error) => setError(err.message))
  }, [])

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>
  }
  if (!config) {
    return <p className="text-sm text-slate-500">Cargando configuración...</p>
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Configuración</h1>
        <p className="text-sm text-slate-500">Datos de la empresa y reglas del negocio. Solo el gerente puede cambiarlas.</p>
      </div>

      <SeccionEmpresa empresa={config.empresa} onGuardada={(empresa) => setConfig({ ...config, empresa })} />
      <SeccionParametros empresa={config.empresa} onGuardada={(empresa) => setConfig({ ...config, empresa })} />
      <SeccionCuentas cuentas={config.cuentas} onCambio={(cuentas) => setConfig({ ...config, cuentas })} />
      <SeccionMediosPago medios={config.mediosPago} onCambio={(mediosPago) => setConfig({ ...config, mediosPago })} />
      <SeccionCategorias
        titulo="Categorías de gasto"
        descripcion="Para clasificar los egresos. Las del sistema (Nómina, Comisiones, Devolución por desistimiento) no se pueden quitar."
        categorias={config.categoriasGasto}
        onCambio={(categoriasGasto) => setConfig({ ...config, categoriasGasto })}
        crear={crearCategoriaGasto}
        actualizar={actualizarCategoriaGasto}
        permiteSoloMaquinaria
      />
      <SeccionCategorias
        titulo="Categorías de ingreso"
        descripcion="Para clasificar los ingresos que no son cuotas ni abonos de lotes (esos se suman solos), por ejemplo un anticipo de remodelación."
        categorias={config.categoriasIngreso}
        onCambio={(categoriasIngreso) => setConfig({ ...config, categoriasIngreso })}
        crear={crearCategoriaIngreso}
        actualizar={actualizarCategoriaIngreso}
      />
      <SeccionTiposEquipo tipos={config.tiposEquipo} onCambio={(tiposEquipo) => setConfig({ ...config, tiposEquipo })} />
      <SeccionComisiones comisiones={config.comisiones} onCambio={(comisiones) => setConfig({ ...config, comisiones })} />
      {tiene(PERMISOS.EXPORTACION_COMPLETA) && <SeccionExportacion />}
    </div>
  )
}
