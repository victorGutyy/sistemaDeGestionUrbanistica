const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

async function solicitar<T>(path: string, options?: RequestInit): Promise<T> {
  const respuesta = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => null)
    const mensaje = Array.isArray(cuerpo?.message) ? cuerpo.message.join(', ') : cuerpo?.message
    throw new Error(mensaje ?? `Error ${respuesta.status} al llamar ${path}`)
  }

  return respuesta.json()
}

export type EstadoLote = 'DISPONIBLE' | 'RESERVADO' | 'VENDIDO'
export type FormaPago = 'CONTADO' | 'FINANCIADO'

export interface Lote {
  id: string
  numero: string
  area: string
  valorVenta: string
  estado: EstadoLote
  proyecto: { id: string; nombre: string }
}

export interface Cliente {
  id: string
  nombre: string
  documento: string
}

export interface Proyecto {
  id: string
  nombre: string
  ubicacion: string | null
  areaTotal: string
  estado: 'ACTIVO' | 'FINALIZADO'
  _count: { lotes: number }
}

export function listarProyectos() {
  return solicitar<Proyecto[]>('/proyectos')
}

export function listarLotesDisponibles() {
  return solicitar<Lote[]>('/lotes?estado=DISPONIBLE')
}

export function listarClientes() {
  return solicitar<Cliente[]>('/clientes')
}

export interface ClienteNuevoPayload {
  nombre: string
  documento: string
  telefono?: string
  email?: string
}

export interface CrearVentaPayload {
  loteId: string
  clienteId?: string
  clienteNuevo?: ClienteNuevoPayload
  formaPago: FormaPago
  valorTotal: string
  cuotaInicial: string
  numeroCuotas?: number
  tasaInteres?: string
  fechaVenta?: string
}

export interface Cuota {
  numero: number
  fechaVencimiento: string
  valor: string
}

export interface Venta {
  id: string
  valorTotal: string
  cuotaInicial: string
  formaPago: FormaPago
  fechaVenta: string
  cliente: Cliente
  lote: Lote
  cuotas: Cuota[]
}

export function crearVenta(payload: CrearVentaPayload) {
  return solicitar<Venta>('/ventas', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function obtenerVenta(id: string) {
  return solicitar<Venta>(`/ventas/${id}`)
}
