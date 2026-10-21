import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { prepararWhatsApp, reenviarReciboPorCorreo, type TipoNotificacion } from '../lib/api'
import { ETIQUETA_ESTADO_NOTIFICACION } from '../lib/notificaciones'
import { PERMISOS } from '../lib/permisos'

const CLASE_BASE = 'rounded-md text-sm font-medium disabled:opacity-50'
const CLASE_BOTON_AVISO = `${CLASE_BASE} border border-slate-300 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50`
const CLASE_ENLACE_AVISO = 'whitespace-nowrap font-medium text-blue-600 hover:underline disabled:opacity-50'

interface PropsWhatsApp {
  tipo: TipoNotificacion
  ventaId: string
  abonoId?: string
  cuotaId?: string
  etiqueta?: string
  // "boton" para botones de formulario, "enlace" para listas compactas.
  estilo?: 'boton' | 'enlace'
}

// Abre WhatsApp con el mensaje listo (RF-NOT-04). La ventana se abre en el mismo clic, antes de pedir el mensaje al
// servidor, porque el navegador bloquea las ventanas que se abren después de esperar una respuesta. El sistema no
// envía nada: la persona revisa el texto y lo manda.
export function BotonWhatsApp({ tipo, ventaId, abonoId, cuotaId, etiqueta = 'WhatsApp', estilo = 'boton' }: PropsWhatsApp) {
  const { tiene } = useAuth()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!tiene(PERMISOS.NOTIFICACIONES_ENVIAR)) return null

  async function abrir() {
    setError(null)
    setOcupado(true)
    const ventana = window.open('', '_blank')
    try {
      const { url } = await prepararWhatsApp({ tipo, ventaId, abonoId, cuotaId })
      if (ventana) {
        ventana.opener = null
        ventana.location.href = url
      } else {
        window.location.href = url
      }
    } catch (err) {
      ventana?.close()
      setError(err instanceof Error ? err.message : 'No se pudo preparar el mensaje')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button type="button" disabled={ocupado} onClick={() => void abrir()} className={estilo === 'boton' ? CLASE_BOTON_AVISO : CLASE_ENLACE_AVISO}>
        {ocupado ? 'Preparando...' : etiqueta}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}

interface PropsCorreo {
  abonoId: string
  etiqueta?: string
  estilo?: 'boton' | 'enlace'
}

// Envía el recibo en PDF al correo del cliente (RF-NOT-01). El servidor responde si salió, falló o se omitió.
export function BotonCorreoRecibo({ abonoId, etiqueta = 'Enviar por correo', estilo = 'boton' }: PropsCorreo) {
  const { tiene } = useAuth()
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState<{ texto: string; bueno: boolean } | null>(null)

  if (!tiene(PERMISOS.NOTIFICACIONES_ENVIAR)) return null

  async function enviar() {
    setMensaje(null)
    setOcupado(true)
    try {
      const resultado = await reenviarReciboPorCorreo(abonoId)
      setMensaje(
        resultado.estado === 'ENVIADA'
          ? { texto: 'Recibo enviado al correo del cliente.', bueno: true }
          : { texto: `${ETIQUETA_ESTADO_NOTIFICACION[resultado.estado]}: ${resultado.detalle ?? 'no se pudo enviar'}`, bueno: false },
      )
    } catch (err) {
      setMensaje({ texto: err instanceof Error ? err.message : 'No se pudo enviar el recibo', bueno: false })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button type="button" disabled={ocupado} onClick={() => void enviar()} className={estilo === 'boton' ? CLASE_BOTON_AVISO : CLASE_ENLACE_AVISO}>
        {ocupado ? 'Enviando...' : etiqueta}
      </button>
      {mensaje && <span className={`text-xs ${mensaje.bueno ? 'text-green-700' : 'text-red-600'}`}>{mensaje.texto}</span>}
    </span>
  )
}
