import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  borrarToken,
  EVENTO_SESION_INVALIDA,
  guardarToken,
  login as loginApi,
  obtenerPerfil,
  obtenerToken,
  type UsuarioSesion,
} from '../lib/api'
import { useEmpresa } from './EmpresaContext'

interface AuthContextValue {
  usuario: UsuarioSesion | null
  cargando: boolean
  // Dice si el rol del usuario incluye un permiso (ver lib/permisos.ts). Sirve
  // para mostrar u ocultar botones y menús; el servidor valida cada acción igual.
  tiene: (permiso: string) => boolean
  // Mensaje para la pantalla de ingreso cuando la sesión se cerró sola.
  avisoSesion: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const EVENTOS_DE_ACTIVIDAD = ['mousedown', 'keydown', 'touchstart', 'scroll', 'pointermove'] as const
const REVISION_INACTIVIDAD_MS = 15_000

export function AuthProvider({ children }: { children: ReactNode }) {
  const { marca } = useEmpresa()
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null)
  const [cargando, setCargando] = useState(true)
  const [avisoSesion, setAvisoSesion] = useState<string | null>(null)
  const ultimaActividad = useRef(0)

  useEffect(() => {
    const token = obtenerToken()
    const sesion = token ? obtenerPerfil().then(setUsuario).catch(() => borrarToken()) : Promise.resolve()
    sesion.finally(() => setCargando(false))
  }, [])

  // El servidor dejó de aceptar la sesión (cuenta desactivada, contraseña
  // restablecida, token vencido): se vuelve a la pantalla de ingreso.
  useEffect(() => {
    function alSesionInvalida() {
      setUsuario(null)
      setAvisoSesion('Tu sesión terminó. Ingresa de nuevo para continuar.')
    }
    window.addEventListener(EVENTO_SESION_INVALIDA, alSesionInvalida)
    return () => window.removeEventListener(EVENTO_SESION_INVALIDA, alSesionInvalida)
  }, [])

  // Cierre por inactividad. Se compara contra la hora de la última actividad
  // (no con un temporizador largo) porque el navegador puede congelar los
  // temporizadores si el equipo se suspende o la pestaña queda en segundo plano.
  const minutosInactividad = marca.minutosInactividad
  useEffect(() => {
    if (!usuario) return

    ultimaActividad.current = Date.now()
    const registrarActividad = () => {
      ultimaActividad.current = Date.now()
    }
    const revisar = () => {
      if (Date.now() - ultimaActividad.current >= minutosInactividad * 60_000) {
        borrarToken()
        setUsuario(null)
        setAvisoSesion(`Tu sesión se cerró por ${minutosInactividad} ${minutosInactividad === 1 ? 'minuto' : 'minutos'} de inactividad.`)
      }
    }

    for (const evento of EVENTOS_DE_ACTIVIDAD) window.addEventListener(evento, registrarActividad, { passive: true })
    document.addEventListener('visibilitychange', revisar)
    const intervalo = window.setInterval(revisar, REVISION_INACTIVIDAD_MS)

    return () => {
      for (const evento of EVENTOS_DE_ACTIVIDAD) window.removeEventListener(evento, registrarActividad)
      document.removeEventListener('visibilitychange', revisar)
      window.clearInterval(intervalo)
    }
  }, [usuario, minutosInactividad])

  async function login(email: string, password: string) {
    const respuesta = await loginApi(email, password)
    guardarToken(respuesta.accessToken)
    setAvisoSesion(null)
    setUsuario(respuesta.usuario)
  }

  function logout() {
    borrarToken()
    setAvisoSesion(null)
    setUsuario(null)
  }

  const tiene = useCallback((permiso: string) => usuario?.permisos.includes(permiso) ?? false, [usuario])

  return (
    <AuthContext.Provider value={{ usuario, cargando, tiene, avisoSesion, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const contexto = useContext(AuthContext)
  if (!contexto) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider')
  }
  return contexto
}
