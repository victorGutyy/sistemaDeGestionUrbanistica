const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

async function solicitar<T>(path: string, options?: RequestInit): Promise<T> {
  // Si el body es FormData (subida de archivos), no fijamos Content-Type:
  // el navegador debe poner el boundary del multipart él mismo.
  const esFormData = options?.body instanceof FormData
  const respuesta = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: esFormData ? options?.headers : { 'Content-Type': 'application/json', ...options?.headers },
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

export type EstadoCuota = 'PENDIENTE' | 'PARCIAL' | 'PAGADA'
export type MedioPago = 'EFECTIVO' | 'TRANSFERENCIA' | 'CHEQUE' | 'TARJETA'

export interface Cuota {
  id: string
  numero: number
  fechaVencimiento: string
  valor: string
  estado: EstadoCuota
}

export interface EstadoCuenta {
  totalPagado: string
  saldoPendiente: string
  proximaCuota: Cuota | null
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
  // Solo viene en la respuesta de obtenerVenta (GET /ventas/:id), no al crear.
  estadoCuenta?: EstadoCuenta
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

export interface Abono {
  id: string
  ventaId: string
  cuotaId: string | null
  fecha: string
  valor: string
  medioPago: MedioPago
  comprobanteUrl: string | null
}

export function listarAbonosPorVenta(ventaId: string) {
  return solicitar<Abono[]>(`/abonos?ventaId=${ventaId}`)
}

export function crearAbono(formData: FormData) {
  return solicitar<Abono>('/abonos', {
    method: 'POST',
    body: formData,
  })
}

export function urlComprobante(abonoId: string) {
  return `${API_URL}/abonos/${abonoId}/comprobante`
}
