import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { obtenerMarcaPublica, urlLogo, type MarcaPublica } from '../lib/api'
import { aplicarColorPrimario, COLOR_PRIMARIO_POR_DEFECTO } from '../lib/marca'

// Marca neutra mientras llega la respuesta (o si el servidor no responde):
// la app nunca debe quedar sin nombre ni sin color.
const MARCA_INICIAL: MarcaPublica = {
  nombreComercial: '',
  nombreProducto: 'Urbanix',
  colorPrimario: COLOR_PRIMARIO_POR_DEFECTO,
  minutosInactividad: 30,
  tieneLogo: false,
  version: 0,
}

interface EmpresaContextValue {
  marca: MarcaPublica
  // URL del logo, o null si la empresa no ha subido uno (se muestra el genérico).
  logoUrl: string | null
  // Se llama después de guardar la configuración para repintar la marca sin recargar la página.
  recargarMarca: () => Promise<void>
}

const EmpresaContext = createContext<EmpresaContextValue | null>(null)

export function EmpresaProvider({ children }: { children: ReactNode }) {
  const [marca, setMarca] = useState<MarcaPublica>(MARCA_INICIAL)

  const recargarMarca = useCallback(async () => {
    try {
      setMarca(await obtenerMarcaPublica())
    } catch {
      // Sin respuesta del servidor se conserva la marca que ya había.
    }
  }, [])

  useEffect(() => {
    obtenerMarcaPublica()
      .then(setMarca)
      .catch(() => {
        // Sin respuesta del servidor se queda la marca neutra.
      })
  }, [])

  useEffect(() => {
    aplicarColorPrimario(marca.colorPrimario)
    document.title = marca.nombreComercial ? `${marca.nombreComercial} · ${marca.nombreProducto}` : marca.nombreProducto
  }, [marca])

  const logoUrl = marca.tieneLogo ? urlLogo(marca.version) : null

  return <EmpresaContext.Provider value={{ marca, logoUrl, recargarMarca }}>{children}</EmpresaContext.Provider>
}

export function useEmpresa() {
  const contexto = useContext(EmpresaContext)
  if (!contexto) {
    throw new Error('useEmpresa debe usarse dentro de un EmpresaProvider')
  }
  return contexto
}
