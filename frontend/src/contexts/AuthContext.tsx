import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  borrarToken,
  guardarToken,
  login as loginApi,
  obtenerPerfil,
  obtenerToken,
  type UsuarioSesion,
} from '../lib/api'

interface AuthContextValue {
  usuario: UsuarioSesion | null
  cargando: boolean
  // El rol CONSULTA es de solo lectura en toda la app (regla reforzada
  // también en el backend, ver RolesGuard). Los botones de crear/editar
  // se ocultan cuando esto es false.
  puedeEditar: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const token = obtenerToken()
    const sesion = token ? obtenerPerfil().then(setUsuario).catch(() => borrarToken()) : Promise.resolve()
    sesion.finally(() => setCargando(false))
  }, [])

  async function login(email: string, password: string) {
    const respuesta = await loginApi(email, password)
    guardarToken(respuesta.accessToken)
    setUsuario(respuesta.usuario)
  }

  function logout() {
    borrarToken()
    setUsuario(null)
  }

  const puedeEditar = usuario?.rol !== 'CONSULTA'

  return (
    <AuthContext.Provider value={{ usuario, cargando, puedeEditar, login, logout }}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  const contexto = useContext(AuthContext)
  if (!contexto) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider')
  }
  return contexto
}
