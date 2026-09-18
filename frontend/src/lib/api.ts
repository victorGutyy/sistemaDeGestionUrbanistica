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

export type Semaforo = 'VERDE' | 'AMARILLO' | 'ROJO'

export interface FilaCartera {
  cliente: Cliente
  semaforo: Semaforo
  saldoVencido: string
  interesMora: string
  proximaCuota: Cuota | null
}

export function listarCartera() {
  return solicitar<FilaCartera[]>('/cartera')
}

export interface FilaReporteCartera {
  proyectoId: string
  nombre: string
  saldoVencido: string
  interesMora: string
}

export interface ReporteCartera {
  porProyecto: FilaReporteCartera[]
  consolidado: { saldoVencido: string; interesMora: string }
}

export function obtenerReporteCartera() {
  return solicitar<ReporteCartera>('/cartera/reporte')
}

export type TipoMovimiento = 'INGRESO' | 'GASTO'

export interface Movimiento {
  id: string
  tipo: TipoMovimiento
  fecha: string
  valor: string
  concepto: string
  proyectoId: string | null
  proyecto: Proyecto | null
}

export interface CrearMovimientoPayload {
  tipo: TipoMovimiento
  fecha: string
  valor: string
  concepto: string
  proyectoId?: string
}

export function crearMovimiento(payload: CrearMovimientoPayload) {
  return solicitar<Movimiento>('/finanzas/movimientos', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function listarMovimientos(filtro?: { desde?: string; hasta?: string }) {
  const params = new URLSearchParams()
  if (filtro?.desde) params.set('desde', filtro.desde)
  if (filtro?.hasta) params.set('hasta', filtro.hasta)
  const query = params.toString()
  return solicitar<Movimiento[]>(`/finanzas/movimientos${query ? `?${query}` : ''}`)
}

export interface ResumenCaja {
  ingresosPorVentas: string
  ingresosGenerales: string
  gastos: string
  totalIngresos: string
  cajaNeta: string
}

export interface ResumenPorProyecto extends ResumenCaja {
  proyectoId: string
  nombre: string
}

export interface ConsolidadoCaja extends ResumenCaja {
  porProyecto: ResumenPorProyecto[]
}

export function obtenerConsolidadoCaja(filtro?: { desde?: string; hasta?: string }) {
  const params = new URLSearchParams()
  if (filtro?.desde) params.set('desde', filtro.desde)
  if (filtro?.hasta) params.set('hasta', filtro.hasta)
  const query = params.toString()
  return solicitar<ConsolidadoCaja>(`/finanzas/consolidado${query ? `?${query}` : ''}`)
}

export type EstadoTrabajador = 'ACTIVO' | 'INACTIVO'
export type TipoNovedad = 'HORAS_EXTRA' | 'DESCUENTO' | 'INCAPACIDAD'

export interface Trabajador {
  id: string
  nombre: string
  documento: string
  cargo: string
  salarioBase: string
  fechaIngreso: string
  telefono: string | null
  email: string | null
  estado: EstadoTrabajador
}

export interface CrearTrabajadorPayload {
  nombre: string
  documento: string
  cargo: string
  salarioBase: string
  fechaIngreso: string
  telefono?: string
  email?: string
}

export function listarTrabajadores() {
  return solicitar<Trabajador[]>('/trabajadores')
}

export function crearTrabajador(payload: CrearTrabajadorPayload) {
  return solicitar<Trabajador>('/trabajadores', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export interface NovedadNomina {
  id: string
  tipo: TipoNovedad
  valor: string
  descripcion: string | null
}

export interface PagoNomina {
  id: string
  trabajadorId: string
  periodoInicio: string
  periodoFin: string
  salarioBase: string
  valorPagado: string
  fechaPago: string
  novedades: NovedadNomina[]
  trabajador: Trabajador
}

export interface TrabajadorConPagos extends Trabajador {
  pagos: PagoNomina[]
}

export function obtenerTrabajador(id: string) {
  return solicitar<TrabajadorConPagos>(`/trabajadores/${id}`)
}

export interface CrearNovedadPayload {
  tipo: TipoNovedad
  valor: string
  descripcion?: string
}

export interface CrearPagoNominaPayload {
  trabajadorId: string
  periodoInicio: string
  periodoFin: string
  fechaPago: string
  novedades?: CrearNovedadPayload[]
}

export function crearPagoNomina(payload: CrearPagoNominaPayload) {
  return solicitar<PagoNomina>('/nomina/pagos', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
