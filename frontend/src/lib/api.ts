import { hoyEnBogota } from './formato'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
const CLAVE_TOKEN = 'sistemaUrbanismo.token'

export function obtenerToken() {
  return localStorage.getItem(CLAVE_TOKEN)
}

export function guardarToken(token: string) {
  localStorage.setItem(CLAVE_TOKEN, token)
}

export function borrarToken() {
  localStorage.removeItem(CLAVE_TOKEN)
}

// Evento que avisa a la app de que el servidor ya no acepta la sesión (usuario
// desactivado, contraseña restablecida, sesión vencida): AuthContext lo escucha.
export const EVENTO_SESION_INVALIDA = 'sesion-invalida'

export class ErrorApi extends Error {
  estado: number
  // Código de negocio que manda el servidor en algunos errores (p. ej. AREA_EXCEDIDA).
  codigo?: string

  constructor(mensaje: string, estado: number, codigo?: string) {
    super(mensaje)
    this.estado = estado
    this.codigo = codigo
  }
}

async function lanzarErrorHttp(respuesta: Response, path: string): Promise<never> {
  const cuerpo = await respuesta.json().catch(() => null)
  const mensaje = Array.isArray(cuerpo?.message) ? cuerpo.message.join(', ') : cuerpo?.message
  if (respuesta.status === 401) {
    const habiaSesion = obtenerToken() !== null
    borrarToken()
    // Un 401 sin sesión previa es un intento de ingreso fallido, no una sesión caída.
    if (habiaSesion) window.dispatchEvent(new Event(EVENTO_SESION_INVALIDA))
  }
  throw new ErrorApi(mensaje ?? `Error ${respuesta.status} al llamar ${path}`, respuesta.status, cuerpo?.codigo)
}

async function solicitar<T>(path: string, options?: RequestInit): Promise<T> {
  // Si el body es FormData (subida de archivos), no fijamos Content-Type:
  // el navegador debe poner el boundary del multipart él mismo.
  const esFormData = options?.body instanceof FormData
  const token = obtenerToken()
  const respuesta = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(esFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })

  if (!respuesta.ok) {
    await lanzarErrorHttp(respuesta, path)
  }

  return respuesta.json()
}

// Un enlace <a href="…/api/…"> no puede mandar el token de sesión, así que los
// archivos protegidos (reportes, comprobantes) se piden con fetch y luego se
// entregan al navegador como un archivo local (blob).
async function pedirArchivo(path: string): Promise<Blob> {
  const token = obtenerToken()
  const respuesta = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!respuesta.ok) {
    await lanzarErrorHttp(respuesta, path)
  }
  return respuesta.blob()
}

// Descarga el archivo con el nombre indicado.
async function descargarArchivo(path: string, nombreArchivo: string) {
  const blob = await pedirArchivo(path)
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombreArchivo
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// Abre el archivo en una pestaña nueva. La pestaña se abre en el mismo
// instante del clic (antes del fetch) para que el bloqueador de ventanas
// emergentes del navegador no la rechace.
async function abrirArchivo(path: string) {
  const ventana = window.open('', '_blank')
  try {
    const blob = await pedirArchivo(path)
    const url = URL.createObjectURL(blob)
    if (ventana) {
      ventana.location.href = url
    } else {
      window.location.href = url
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (error) {
    ventana?.close()
    throw error
  }
}

export type EstadoLote = 'DISPONIBLE' | 'SEPARADO' | 'VENDIDO' | 'ESCRITURADO' | 'DESISTIDO'
export type TipoProyecto = 'LOTES' | 'REMODELACION' | 'MAQUINARIA'
export type AccionLote = 'SEPARAR' | 'LIBERAR' | 'VENDER' | 'ESCRITURAR' | 'DESISTIR' | 'REPONER'
export type FormaPago = 'CONTADO' | 'FINANCIADO'

// Apartado de un lote antes de formalizar la venta.
export interface Separacion {
  id: string
  estado: 'ACTIVA' | 'CONVERTIDA' | 'LIBERADA'
  nombreInteresado: string | null
  telefonoInteresado: string | null
  // Valor que dejó el interesado (informativo), en pesos.
  valor: string | null
  fechaLimite: string | null
  cliente: { id: string; nombre: string } | null
  registradaPor: { nombre: string }
}

export interface Lote {
  id: string
  numero: string
  area: string
  valorVenta: string
  estado: EstadoLote
  linderos: string | null
  proyecto: { id: string; nombre: string }
  manzana: Manzana | null
  // Solo viene en la lista de lotes: la separación activa, si la hay.
  separaciones?: Separacion[]
}

export interface Manzana {
  id: string
  nombre: string
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
  municipio: string | null
  tipo: TipoProyecto
  areaTotal: string
  estado: 'ACTIVO' | 'FINALIZADO'
  // Solo viene en la respuesta de listarProyectos, no en obtenerProyecto.
  _count?: { lotes: number }
}

export function listarProyectos() {
  return solicitar<Proyecto[]>('/proyectos')
}

export interface CrearProyectoPayload {
  nombre: string
  tipo?: TipoProyecto
  ubicacion?: string
  municipio?: string
  areaTotal: string
  valorCompra?: string
  fechaCompra?: string
}

export function crearProyecto(payload: CrearProyectoPayload) {
  return solicitar<Proyecto>('/proyectos', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export interface LoteDeProyecto {
  id: string
  numero: string
  area: string
  valorVenta: string
  estado: EstadoLote
  manzana: Manzana | null
}

// Los valores de área llegan como texto decimal ("1200", "-200").
export interface ResumenAreas {
  areaTotal: string
  areaSubdividida: string
  areaDisponible: string
}

export interface ProyectoConLotes extends Proyecto {
  manzanas: Manzana[]
  lotes: LoteDeProyecto[]
  resumenAreas: ResumenAreas
}

export function crearManzana(proyectoId: string, nombre: string) {
  return solicitar<Manzana>(`/proyectos/${proyectoId}/manzanas`, { method: 'POST', body: JSON.stringify({ nombre }) })
}

export function obtenerProyecto(id: string) {
  return solicitar<ProyectoConLotes>(`/proyectos/${id}`)
}

export function actualizarEstadoProyecto(id: string, estado: 'ACTIVO' | 'FINALIZADO') {
  return solicitar<Proyecto>(`/proyectos/${id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ estado }),
  })
}

export interface CrearLotePayload {
  proyectoId: string
  manzanaId?: string
  numero: string
  area: string
  linderos?: string
  valorPorM2?: string
  valorVenta: string
  // Confirma crear el lote aunque supere el área disponible del proyecto.
  confirmarExcesoArea?: boolean
}

export function crearLote(payload: CrearLotePayload) {
  return solicitar<LoteDeProyecto>('/lotes', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export interface FiltroLotes {
  proyectoId?: string
  manzanaId?: string
  estado?: EstadoLote
  buscar?: string
}

export function listarLotes(filtro: FiltroLotes = {}) {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(filtro)) {
    if (valor) params.set(clave, valor)
  }
  const consulta = params.toString()
  return solicitar<Lote[]>(`/lotes${consulta ? `?${consulta}` : ''}`)
}

// Lotes que se pueden vender: disponibles y separados.
export async function listarLotesVendibles() {
  const [disponibles, separados] = await Promise.all([
    listarLotes({ estado: 'DISPONIBLE' }),
    listarLotes({ estado: 'SEPARADO' }),
  ])
  return [...disponibles, ...separados]
}

export interface EventoLote {
  id: string
  tipo: 'CREACION' | 'CAMBIO_ESTADO' | 'CAMBIO_PRECIO'
  estadoAnterior: EstadoLote | null
  estadoNuevo: EstadoLote | null
  valorAnterior: string | null
  valorNuevo: string | null
  motivo: string | null
  createdAt: string
  usuario: { nombre: string }
}

export interface FichaLote {
  id: string
  numero: string
  area: string
  linderos: string | null
  valorPorM2: string | null
  valorVenta: string
  estado: EstadoLote
  escrituraNumero: string | null
  escrituraNotaria: string | null
  escrituraFecha: string | null
  proyecto: Proyecto
  manzana: Manzana | null
  separacionActiva: Separacion | null
  historial: EventoLote[]
  // Acciones manuales que aplican al estado actual.
  acciones: AccionLote[]
}

export function obtenerLote(id: string) {
  return solicitar<FichaLote>(`/lotes/${id}`)
}

export interface ActualizarLotePayload {
  area?: string
  linderos?: string
  valorPorM2?: string
  valorVenta?: string
  motivo?: string
  confirmarExcesoArea?: boolean
}

export function actualizarLote(id: string, payload: ActualizarLotePayload) {
  return solicitar<Lote>(`/lotes/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

export interface SepararLotePayload {
  clienteId?: string
  nombreInteresado?: string
  telefonoInteresado?: string
  valor?: string
  fechaLimite?: string
  motivo?: string
}

export function separarLote(id: string, datos: SepararLotePayload = {}) {
  return solicitar<Lote>(`/lotes/${id}/separar`, { method: 'POST', body: JSON.stringify(datos) })
}

export function liberarLote(id: string, motivo?: string) {
  return solicitar<Lote>(`/lotes/${id}/liberar`, { method: 'POST', body: JSON.stringify({ motivo }) })
}

export function escriturarLote(id: string, datos: { numero: string; notaria?: string; fecha: string }) {
  return solicitar<Lote>(`/lotes/${id}/escriturar`, { method: 'POST', body: JSON.stringify(datos) })
}

export function reponerLote(id: string, motivo: string) {
  return solicitar<Lote>(`/lotes/${id}/reponer`, { method: 'POST', body: JSON.stringify({ motivo }) })
}

export function listarClientes() {
  return solicitar<Cliente[]>('/clientes')
}

export type TipoDocumento = 'CC' | 'CE' | 'NIT' | 'PASAPORTE' | 'TI' | 'OTRO'

export interface ClienteResumen extends Cliente {
  tipoDocumento: TipoDocumento
  telefono: string | null
  email: string | null
  // Ventas del cliente dentro del alcance de quien consulta.
  _count: { ventas: number }
}

// Búsqueda por nombre, documento o teléfono.
export function buscarClientes(buscar?: string) {
  const texto = buscar?.trim()
  return solicitar<ClienteResumen[]>(`/clientes${texto ? `?buscar=${encodeURIComponent(texto)}` : ''}`)
}

export interface DatosCliente {
  id: string
  nombre: string
  documento: string
  tipoDocumento: TipoDocumento
  telefono: string | null
  email: string | null
  direccion: string | null
  autorizaDatos: boolean
  fechaAutorizacion: string | null
  autorizacionRegistradaPor: { nombre: string } | null
}

export interface CuotaFicha {
  numero: number
  fechaVencimiento: string
  valor: string
  pagado: string
  saldo: string
  estado: 'PENDIENTE' | 'PARCIAL' | 'PAGADA'
  vencida: boolean
  diasAtraso: number
  interesMora: string
}

export interface AbonoFicha {
  id: string
  fecha: string
  valor: string
  medioPago: MedioPago
  estado: 'ACTIVO' | 'ANULADO'
  recibo: { numeroTexto: string } | null
  cuentaDestino: { alias: string } | null
}

export interface VentaFicha {
  id: string
  estado: EstadoVenta
  formaPago: FormaPago
  fechaVenta: string
  valorTotal: string
  cuotaInicial: string
  lote: { id: string; numero: string; proyecto: string; manzana: string | null }
  // Solo una venta activa cuenta en los totales y tiene saldo.
  vigente: boolean
  pagado: string
  saldo: string | null
  cartera: {
    semaforo: Semaforo
    saldoVencido: string
    interesMora: string
    saldoPorVencer: string
    cuotasVencidas: number
    cuotasPendientes: number
    proximaCuota: { numero: number; fechaVencimiento: string; valor: string } | null
  } | null
  cuotas: CuotaFicha[]
  abonos: AbonoFicha[]
}

export interface FichaCliente {
  cliente: DatosCliente
  // false = la tasa de mora no está definida: el interés se muestra en $0 por falta de dato.
  moraConfigurada: boolean
  resumen: {
    semaforo: Semaforo
    ventasVigentes: number
    totalVendido: string
    totalPagado: string
    saldo: string
    saldoVencido: string
    interesMora: string
    saldoPorVencer: string
    cuotasVencidas: number
  }
  ventas: VentaFicha[]
}

export function obtenerFichaCliente(id: string) {
  return solicitar<FichaCliente>(`/clientes/${id}`)
}

export interface DatosNuevoCliente {
  nombre: string
  documento: string
  tipoDocumento: TipoDocumento
  telefono?: string
  email?: string
  direccion?: string
  autorizaDatos?: boolean
}

export function crearCliente(datos: DatosNuevoCliente) {
  return solicitar<DatosCliente>('/clientes', { method: 'POST', body: JSON.stringify(datos) })
}

// Solo se cambia lo que se envía; en teléfono, correo y dirección un texto vacío borra el dato.
export function actualizarCliente(id: string, datos: Partial<Omit<DatosNuevoCliente, 'documento'>>) {
  return solicitar<DatosCliente>(`/clientes/${id}`, { method: 'PATCH', body: JSON.stringify(datos) })
}

// Estado de cuenta del cliente en PDF (se abre en una pestaña nueva, con la sesión).
export function abrirEstadoCuentaCliente(id: string) {
  return abrirArchivo(`/clientes/${id}/estado-cuenta`)
}

// Exportación completa de todos los datos de la empresa a Excel (solo gerente).
export function exportarTodosLosDatos() {
  return descargarArchivo('/exportacion/completa', `exportacion-completa-${hoyEnBogota()}.xlsx`)
}

export interface ClienteNuevoPayload {
  nombre: string
  documento: string
  tipoDocumento?: TipoDocumento
  telefono?: string
  email?: string
  autorizaDatos?: boolean
}

export type EstadoVenta = 'PENDIENTE_APROBACION' | 'ACTIVA' | 'RECHAZADA' | 'DESISTIDA'

export interface Vendedor {
  id: string
  tipo: TipoVendedor
  nombre: string
  documento: string
  telefono: string | null
}

export interface VendedorNuevoPayload {
  tipo: TipoVendedor
  nombre: string
  documento: string
  telefono?: string
}

export interface CrearVentaPayload {
  loteId: string
  clienteId?: string
  clienteNuevo?: ClienteNuevoPayload
  vendedorId?: string
  vendedorNuevo?: VendedorNuevoPayload
  formaPago: FormaPago
  // Todo valor es en pesos enteros, como texto.
  valorTotal: string
  // En valor o en porcentaje (no ambos). Sin ninguno, el servidor usa el porcentaje configurado.
  cuotaInicial?: string
  cuotaInicialPorcentaje?: string
  numeroCuotas?: number
  fechaVenta?: string
  fechaLimiteCuotaInicial?: string
  // Registra de una vez el abono de la cuota inicial recibida.
  cuotaInicialRecibida?: boolean
  medioPago?: MedioPago
  cuentaDestinoId?: string
  referencia?: string
  // Obligatorio cuando la venta es una excepción.
  motivoExcepcion?: string
}

export interface ParametrosVenta {
  porcentajeCuotaInicial: string
  plazoMaximoMeses: number
  tasaFinanciacionMensual: string
  // true si quien registra la venta puede autorizar excepciones por sí mismo (gerente).
  puedeAutorizar: boolean
}

export function obtenerParametrosVenta() {
  return solicitar<ParametrosVenta>('/ventas/parametros')
}

export function listarVendedores() {
  return solicitar<Vendedor[]>('/ventas/vendedores')
}

export type EstadoCuota = 'PENDIENTE' | 'PARCIAL' | 'PAGADA'
export type MedioPago = 'EFECTIVO' | 'CONSIGNACION' | 'TRANSFERENCIA' | 'NEQUI' | 'DAVIPLATA' | 'CHEQUE' | 'TARJETA'

export interface Cuota {
  id: string
  numero: number
  fechaVencimiento: string
  valor: string
  estado: EstadoCuota
  // Lo aplicado por abonos activos. Solo viene en el detalle de la venta.
  pagado?: string
}

export interface EstadoCuenta {
  totalPagado: string
  saldoPendiente: string
  proximaCuota: Cuota | null
  // Cuotas vencidas, saldo vencido, mora y semáforo de la venta (solo si está activa).
  cartera?: {
    semaforo: Semaforo
    cuotasVencidas: number
    saldoVencido: string
    interesMora: string
    saldoPorVencer: string
    moraConfigurada: boolean
  } | null
}

export interface DocumentoVenta {
  id: string
  nombreOriginal: string
  tipoMime: string
  tamano: number
  descripcion: string | null
  createdAt: string
  subidoPor?: { nombre: string }
}

export interface Desistimiento {
  fecha: string
  motivo: string
  valorDevolver: string | null
  valorRetener: string | null
  registradoPor?: { nombre: string }
}

export interface Venta {
  id: string
  estado: EstadoVenta
  valorTotal: string
  cuotaInicial: string
  numeroCuotas: number | null
  formaPago: FormaPago
  fechaVenta: string
  cliente: Cliente
  lote: Lote
  cuotas: Cuota[]
  vendedor: Vendedor | null
  esExcepcion: boolean
  motivoExcepcion: string | null
  motivoRechazo: string | null
  resueltaEn: string | null
  registradaPor?: { nombre: string } | null
  resueltaPor?: { nombre: string } | null
  documentos?: DocumentoVenta[]
  desistimiento?: Desistimiento | null
  // Solo viene para quien puede ver comisiones.
  comision?: ComisionResumen | null
  abonos?: Abono[]
  // Solo viene en la respuesta de obtenerVenta (GET /ventas/:id), no al crear.
  estadoCuenta?: EstadoCuenta
}

export function listarVentas(estado?: EstadoVenta) {
  return solicitar<Venta[]>(`/ventas${estado ? `?estado=${estado}` : ''}`)
}

export function subirDocumentosVenta(ventaId: string, archivos: File[], descripcion?: string) {
  const formData = new FormData()
  for (const archivo of archivos) formData.append('documentos', archivo)
  if (descripcion) formData.append('descripcion', descripcion)
  return solicitar<DocumentoVenta[]>(`/ventas/${ventaId}/documentos`, { method: 'POST', body: formData })
}

// Se abre con descarga autenticada: un enlace directo no llevaría el token de sesión.
export function abrirDocumentoVenta(ventaId: string, documentoId: string) {
  return abrirArchivo(`/ventas/${ventaId}/documentos/${documentoId}`)
}

export interface DesistirVentaPayload {
  fecha: string
  motivo: string
  valorDevolver?: string
  valorRetener?: string
  // Obligatorios si hay valor a devolver: la devolución queda registrada como un egreso del proyecto.
  medioPagoDevolucion?: MedioPago
  cuentaDevolucionId?: string
  referenciaDevolucion?: string
  // Anula, en el mismo acto, la comisión de la venta si todavía está pendiente.
  anularComision?: boolean
}

export function desistirVenta(id: string, datos: DesistirVentaPayload) {
  return solicitar<Venta>(`/ventas/${id}/desistir`, { method: 'POST', body: JSON.stringify(datos) })
}

export function aprobarVenta(id: string) {
  return solicitar<Venta>(`/ventas/${id}/aprobar`, { method: 'POST' })
}

export function rechazarVenta(id: string, motivo: string) {
  return solicitar<Venta>(`/ventas/${id}/rechazar`, { method: 'POST', body: JSON.stringify({ motivo }) })
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

export type EstadoAbono = 'ACTIVO' | 'ANULADO'

export interface Abono {
  id: string
  ventaId: string
  fecha: string
  valor: string
  medioPago: MedioPago
  referencia: string | null
  comprobanteUrl: string | null
  estado: EstadoAbono
  anuladoEn: string | null
  motivoAnulacion: string | null
  recibo: { id: string; numeroTexto: string; esHistorico: boolean } | null
  cuentaDestino: { id: string; banco: string; alias: string } | null
  registradoPor: { nombre: string } | null
  anuladoPor: { nombre: string } | null
}

export interface AbonoRegistrado {
  id: string
  valor: string
  recibo: { id: string; numeroTexto: string }
  // Cómo se repartió el abono entre las cuotas.
  cuotasCubiertas: { numero: number; valor: string; completa: boolean }[]
}

export function listarAbonosPorVenta(ventaId: string) {
  return solicitar<Abono[]>(`/abonos?ventaId=${ventaId}`)
}

export function crearAbono(formData: FormData) {
  return solicitar<AbonoRegistrado>('/abonos', {
    method: 'POST',
    body: formData,
  })
}

export function anularAbono(abonoId: string, motivo: string) {
  return solicitar<Abono>(`/abonos/${abonoId}/anular`, { method: 'POST', body: JSON.stringify({ motivo }) })
}

export function abrirComprobante(abonoId: string) {
  return abrirArchivo(`/abonos/${abonoId}/comprobante`)
}

export function abrirRecibo(abonoId: string) {
  return abrirArchivo(`/abonos/${abonoId}/recibo`)
}

export interface ReciboResumen {
  abonoId: string
  ventaId: string
  recibo: { id: string; numeroTexto: string; esHistorico: boolean }
  fecha: string
  valor: string
  medioPago: MedioPago
  cuenta: { banco: string; alias: string } | null
  referencia: string | null
  estado: EstadoAbono
  cliente: { nombre: string; documento: string }
  lote: string
  proyecto: string
}

export interface FiltroRecibos {
  buscar?: string
  estado?: EstadoAbono
  desde?: string
  hasta?: string
}

export function buscarRecibos(filtro: FiltroRecibos = {}) {
  const query = new URLSearchParams()
  for (const [clave, valor] of Object.entries(filtro)) {
    if (valor) query.set(clave, valor)
  }
  const texto = query.toString()
  return solicitar<ReciboResumen[]>(`/recibos${texto ? `?${texto}` : ''}`)
}

export type Semaforo = 'VERDE' | 'AMARILLO' | 'ROJO'

export interface VentaDeCartera {
  id: string
  numeroLote: string
  nombreProyecto: string
}

export interface FilaCartera {
  cliente: Cliente
  semaforo: Semaforo
  saldoVencido: string
  interesMora: string
  proximaCuota: Cuota | null
  ventas: VentaDeCartera[]
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
  // false = el gerente aún no define la tasa de mora: el interés mostrado es $0 por falta de dato.
  moraConfigurada: boolean
  porProyecto: FilaReporteCartera[]
  consolidado: { saldoVencido: string; interesMora: string }
}

export function obtenerReporteCartera() {
  return solicitar<ReporteCartera>('/cartera/reporte')
}

export type TipoMovimiento = 'INGRESO' | 'GASTO'
export type EstadoMovimiento = 'ACTIVO' | 'ANULADO'
export type OrigenMovimiento = 'MANUAL' | 'DEVOLUCION_DESISTIMIENTO' | 'COMISION'

export interface Movimiento {
  id: string
  tipo: TipoMovimiento
  fecha: string
  valor: string
  descripcion: string
  proyectoId: string | null
  proyecto: { id: string; nombre: string } | null
  categoria: { id: string; nombre: string } | null
  medioPago: MedioPago
  cuenta: { id: string; banco: string; alias: string } | null
  referencia: string | null
  terceroNombre: string | null
  terceroDocumento: string | null
  numeroDocumento: string | null
  tieneSoporte: boolean
  motivoSinSoporte: string | null
  origen: OrigenMovimiento
  ventaId: string | null
  // Proyectos de maquinaria: el equipo (o "general de la flota") y, en el alquiler, el período alquilado.
  equipo: { id: string; nombre: string; placaSerie: string | null } | null
  flota: boolean
  periodoDesde: string | null
  periodoHasta: string | null
  estado: EstadoMovimiento
  registradoPor: { nombre: string } | null
  anuladoPor: { nombre: string } | null
  anuladoEn: string | null
  motivoAnulacion: string | null
  createdAt: string
}

// El movimiento se envía como formulario porque puede llevar el archivo del soporte (campo "soporte").
export function crearMovimiento(formData: FormData) {
  return solicitar<Movimiento>('/finanzas/movimientos', { method: 'POST', body: formData })
}

export interface FiltroMovimientos {
  desde?: string
  hasta?: string
  proyectoId?: string
  tipo?: TipoMovimiento
  estado?: EstadoMovimiento
}

export function listarMovimientos(filtro: FiltroMovimientos = {}) {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(filtro)) {
    if (valor) params.set(clave, valor)
  }
  const query = params.toString()
  return solicitar<Movimiento[]>(`/finanzas/movimientos${query ? `?${query}` : ''}`)
}

export function obtenerMovimiento(id: string) {
  return solicitar<Movimiento>(`/finanzas/movimientos/${id}`)
}

export function anularMovimiento(id: string, motivo: string) {
  return solicitar<Movimiento>(`/finanzas/movimientos/${id}/anular`, { method: 'POST', body: JSON.stringify({ motivo }) })
}

export function abrirSoporteMovimiento(id: string) {
  return abrirArchivo(`/finanzas/movimientos/${id}/soporte`)
}

// Una línea del detalle de finanzas de un proyecto: un movimiento o el abono de un cliente.
export interface FilaFinanzaProyecto {
  origen: 'ABONO' | 'MOVIMIENTO'
  id: string
  fecha: string
  tipo: TipoMovimiento
  categoria: string
  descripcion: string
  valor: string
  medioPago: MedioPago
  cuenta: string | null
  referencia: string | null
  tercero: string | null
  numeroDocumento: string | null
  tieneSoporte: boolean
  registradoPor: string | null
  estado: EstadoMovimiento
  recibo: string | null
  ventaId: string | null
  // Solo en proyectos de maquinaria: el equipo del movimiento, o "Flota (general)".
  equipo: string | null
}

export interface ResumenFinanzasProyecto {
  ingresosPorVentas: string
  otrosIngresos: string
  totalIngresos: string
  egresos: string
  utilidad: string
  valorVendido: string
  recaudadoVentas: string
  saldoPorCobrar: string
}

export interface FinanzasProyecto {
  proyecto: { id: string; nombre: string; tipo: string }
  resumen: ResumenFinanzasProyecto
  movimientos: FilaFinanzaProyecto[]
}

export function obtenerFinanzasProyecto(id: string, filtro: { desde?: string; hasta?: string } = {}) {
  const params = new URLSearchParams()
  if (filtro.desde) params.set('desde', filtro.desde)
  if (filtro.hasta) params.set('hasta', filtro.hasta)
  const query = params.toString()
  return solicitar<FinanzasProyecto>(`/finanzas/proyectos/${id}${query ? `?${query}` : ''}`)
}

// ---------- Maquinaria: equipos y tipos de equipo ----------

export type EstadoEquipo = 'ACTIVO' | 'EN_MANTENIMIENTO' | 'FUERA_DE_SERVICIO'

export interface TipoEquipo {
  id: string
  nombre: string
  activo: boolean
}

export interface Equipo {
  id: string
  proyectoId: string
  nombre: string
  tipoEquipoId: string
  tipoEquipo: { id: string; nombre: string }
  proyecto: { id: string; nombre: string }
  marca: string | null
  modelo: string | null
  anio: number | null
  placaSerie: string | null
  estado: EstadoEquipo
  bajaEn: string | null
  bajaMotivo: string | null
  bajaPor: { nombre: string } | null
  // Un equipo dado de baja se conserva con su historial, pero ya no recibe movimientos.
  deBaja: boolean
}

export interface MovimientoDeEquipo {
  id: string
  fecha: string
  tipo: TipoMovimiento
  categoria: string
  descripcion: string
  valor: string
  estado: EstadoMovimiento
  tercero: string | null
  periodoDesde: string | null
  periodoHasta: string | null
}

export interface FichaEquipo extends Equipo {
  totales: { ingresos: string; egresos: string; utilidad: string }
  movimientos: MovimientoDeEquipo[]
}

export function listarEquipos(proyectoId?: string, incluirBajas = false) {
  const params = new URLSearchParams()
  if (proyectoId) params.set('proyectoId', proyectoId)
  if (incluirBajas) params.set('incluirBajas', 'true')
  const query = params.toString()
  return solicitar<Equipo[]>(`/equipos${query ? `?${query}` : ''}`)
}

// Tipos de equipo activos, para elegir al registrar un equipo.
export function listarTiposEquipoActivos() {
  return solicitar<TipoEquipo[]>('/equipos/tipos')
}

export interface DatosEquipo {
  nombre: string
  tipoEquipoId: string
  marca?: string
  modelo?: string
  anio?: number | null
  placaSerie?: string
  estado?: EstadoEquipo
}

export function crearEquipo(proyectoId: string, datos: DatosEquipo) {
  return solicitar<Equipo>('/equipos', { method: 'POST', body: JSON.stringify({ proyectoId, ...datos }) })
}

export function obtenerEquipo(id: string) {
  return solicitar<FichaEquipo>(`/equipos/${id}`)
}

// Solo se cambia lo que se envía; en marca, modelo y placa un texto vacío borra el dato y en el año null lo borra.
export function actualizarEquipo(id: string, datos: Partial<DatosEquipo>) {
  return solicitar<FichaEquipo>(`/equipos/${id}`, { method: 'PATCH', body: JSON.stringify(datos) })
}

export function darDeBajaEquipo(id: string, motivo: string) {
  return solicitar<FichaEquipo>(`/equipos/${id}/baja`, { method: 'POST', body: JSON.stringify({ motivo }) })
}

export function reactivarEquipo(id: string) {
  return solicitar<FichaEquipo>(`/equipos/${id}/reactivar`, { method: 'POST' })
}

export function crearTipoEquipo(nombre: string) {
  return solicitar<TipoEquipo>('/configuracion/tipos-equipo', { method: 'POST', body: JSON.stringify({ nombre }) })
}

export function actualizarTipoEquipo(id: string, payload: { nombre?: string; activo?: boolean }) {
  return solicitar<TipoEquipo>(`/configuracion/tipos-equipo/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

// ---------- Auditoría ----------

export interface RegistroAuditoria {
  id: string
  createdAt: string
  usuarioId: string
  usuarioNombre: string
  usuarioEmail: string
  accion: string
  entidad: string
  entidadId: string | null
  resumen: string
  antes: unknown
  despues: unknown
}

export interface FiltroAuditoria {
  desde?: string
  hasta?: string
  usuarioId?: string
  entidad?: string
  accion?: string
  buscar?: string
  pagina?: number
  limite?: number
}

export interface PaginaAuditoria {
  registros: RegistroAuditoria[]
  total: number
  pagina: number
  limite: number
  paginas: number
}

export interface CatalogoAuditoria {
  entidades: { valor: string; etiqueta: string }[]
  acciones: { valor: string; etiqueta: string }[]
  usuarios: { id: string; nombre: string; email: string }[]
}

export function listarAuditoria(filtro: FiltroAuditoria = {}) {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(filtro)) {
    if (valor !== undefined && valor !== '') params.set(clave, String(valor))
  }
  const query = params.toString()
  return solicitar<PaginaAuditoria>(`/auditoria${query ? `?${query}` : ''}`)
}

export function obtenerCatalogoAuditoria() {
  return solicitar<CatalogoAuditoria>('/auditoria/catalogo')
}

// ---------- Importación desde Excel ----------

export interface ProblemaImportacion {
  hoja: string
  // Fila del Excel (la 1 es el encabezado); null si el problema es de toda la hoja o del archivo.
  fila: number | null
  columna?: string
  mensaje: string
}

export interface ResumenImportacion {
  proyectos: { nuevos: number; existentes: number }
  manzanas: { nuevas: number }
  lotes: { nuevos: number; existentes: number }
  clientes: { nuevos: number; existentes: number }
  vendedores: { nuevos: number }
  ventas: number
  cuotas: number
  abonos: number
  recibosHistoricos: number
  valorVentas: string
  totalAbonado: string
  totalSaldo: string
  conDiferencia: number
}

export interface FilaConciliacion {
  proyecto: string
  manzana: string | null
  lote: string
  documentoCliente: string
  cliente: string
  formaPago: 'CONTADO' | 'FINANCIADO'
  valorTotal: string
  cuotaInicial: string
  abonado: string
  saldo: string
  saldoSegunExcel: string | null
  diferencia: string | null
  estado: 'COINCIDE' | 'DIFERENCIA' | 'SIN_DATO'
  cuotasPagadas: number
  cuotasTotales: number
  abonos: number
}

export interface ResultadoValidacionImportacion {
  nombreArchivo: string
  // Identifica el archivo validado: la confirmación debe mandar el mismo archivo con esta huella.
  huella: string
  puedeConfirmar: boolean
  yaImportado: { fecha: string; por: string } | null
  totalErrores: number
  totalAvisos: number
  errores: ProblemaImportacion[]
  avisos: ProblemaImportacion[]
  resumen: ResumenImportacion
  conciliacion: FilaConciliacion[]
}

export interface ResultadoImportacion {
  id: string
  nombreArchivo: string
  createdAt: string
  resumen: ResumenImportacion & {
    ejecucion: { recibosHistoricos: { cantidad: number; primero: string | null; ultimo: string | null } }
  }
  conciliacion: FilaConciliacion[]
}

export interface ImportacionHistorial {
  id: string
  createdAt: string
  nombreArchivo: string
  resumen: ResumenImportacion
  usuario: { nombre: string }
}

export function descargarPlantillaImportacion() {
  return descargarArchivo('/importacion/plantilla', 'plantilla-importacion.xlsx')
}

function formularioImportacion(archivo: File, huella?: string) {
  const formData = new FormData()
  formData.append('archivo', archivo)
  if (huella) formData.append('huella', huella)
  return formData
}

// Modo de prueba: el servidor valida todo el archivo y NO guarda nada.
export function validarImportacion(archivo: File) {
  return solicitar<ResultadoValidacionImportacion>('/importacion/validar', { method: 'POST', body: formularioImportacion(archivo) })
}

// Confirmación: se manda el mismo archivo y la huella de la validación; el servidor valida otra vez y lo guarda todo o nada.
export function confirmarImportacion(archivo: File, huella: string) {
  return solicitar<ResultadoImportacion>('/importacion/confirmar', { method: 'POST', body: formularioImportacion(archivo, huella) })
}

export function listarImportaciones() {
  return solicitar<ImportacionHistorial[]>('/importacion')
}

export function descargarConciliacionImportacion(id: string) {
  return descargarArchivo(`/importacion/${id}/conciliacion`, `conciliacion-importacion-${id.slice(0, 8)}.xlsx`)
}

// ---------- Cierres de caja ----------

export type TipoCierre = 'DIARIO' | 'SEMANAL' | 'QUINCENAL'
export type EstadoCierre = 'BORRADOR' | 'CERRADO' | 'APROBADO' | 'DEVUELTO'

export interface EventoCierre {
  origen: 'ABONO' | 'INGRESO' | 'EGRESO' | 'NOMINA'
  id: string
  fecha: string
  // Una anulación es el movimiento contrario, en la fecha en que se anuló.
  clase: 'REGISTRO' | 'ANULACION'
  sentido: 'ENTRADA' | 'SALIDA'
  valor: string
  medioPago: MedioPago
  cuenta: string | null
  descripcion: string
  detalle: string | null
}

export interface ResumenCierre {
  desde: string
  hasta: string
  eventos: EventoCierre[]
  totales: {
    entradasBrutas: string
    reversasEntradas: string
    entradas: string
    salidasBrutas: string
    reversasSalidas: string
    salidas: string
    neto: string
  }
  porMedio: { medioPago: MedioPago; entradas: string; salidas: string; neto: string }[]
  porCuenta: { cuentaId: string | null; nombre: string; entradas: string; salidas: string; neto: string }[]
  efectivo: { inicial: string; entradas: string; salidas: string; esperado: string }
}

export interface CierreCaja {
  id: string
  numero: number | null
  numeroTexto: string | null
  tipo: TipoCierre
  desde: string
  hasta: string
  estado: EstadoCierre
  efectivoInicial: string
  efectivoEsperado: string | null
  efectivoContado: string | null
  diferencia: string | null
  explicacionDiferencia: string | null
  cerradoEn: string | null
  resueltoEn: string | null
  observacionGerente: string | null
  creadoPor: { nombre: string }
  cerradoPor: { nombre: string } | null
  resueltoPor: { nombre: string } | null
}

export interface CierreCajaDetalle extends CierreCaja {
  // Un borrador o un devuelto se calcula en vivo; uno cerrado o aprobado muestra su fotografía congelada.
  enVivo: boolean
  resumen: ResumenCierre
  historial: { estadoAnterior: EstadoCierre | null; estadoNuevo: EstadoCierre; usuario: string; observacion: string | null; fecha: string }[]
}

export interface ProximoCierre {
  esPrimero: boolean
  puedeCrear: boolean
  motivo: string | null
  desde: string | null
  hasta: string | null
  efectivoInicial: string | null
}

export function listarCierres() {
  return solicitar<CierreCaja[]>('/cierres-caja')
}

export function obtenerProximoCierre(tipo?: TipoCierre) {
  return solicitar<ProximoCierre>(`/cierres-caja/proximo${tipo ? `?tipo=${tipo}` : ''}`)
}

export function obtenerCierre(id: string) {
  return solicitar<CierreCajaDetalle>(`/cierres-caja/${id}`)
}

export function crearCierre(payload: { tipo: TipoCierre; desde?: string; efectivoInicial?: string }) {
  return solicitar<CierreCajaDetalle>('/cierres-caja', { method: 'POST', body: JSON.stringify(payload) })
}

export function cerrarCierre(id: string, payload: { efectivoContado: string; explicacionDiferencia?: string }) {
  return solicitar<CierreCajaDetalle>(`/cierres-caja/${id}/cerrar`, { method: 'POST', body: JSON.stringify(payload) })
}

export function aprobarCierre(id: string, observacion?: string) {
  return solicitar<CierreCajaDetalle>(`/cierres-caja/${id}/aprobar`, { method: 'POST', body: JSON.stringify({ observacion }) })
}

export function devolverCierre(id: string, observacion: string) {
  return solicitar<CierreCajaDetalle>(`/cierres-caja/${id}/devolver`, { method: 'POST', body: JSON.stringify({ observacion }) })
}

export function descartarCierre(id: string) {
  return solicitar<{ descartado: boolean }>(`/cierres-caja/${id}`, { method: 'DELETE' })
}

export function abrirPdfCierre(id: string) {
  return abrirArchivo(`/cierres-caja/${id}/pdf`)
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
  // Con qué se pagó y, si no fue en efectivo, de qué cuenta salió el dinero.
  medioPago: MedioPago
  cuentaId?: string
  novedades?: CrearNovedadPayload[]
}

export function crearPagoNomina(payload: CrearPagoNominaPayload) {
  return solicitar<PagoNomina>('/nomina/pagos', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export interface ResumenFilaProyecto {
  proyectoId: string
  nombre: string
  ingresosPorVentas: string
  ingresosGenerales: string
  gastos: string
  cajaNeta: string
  saldoVencido: string
  interesMora: string
  saldoPorVencer: string
}

export interface ResumenDashboard {
  periodo: { desde: string | null; hasta: string | null }
  finanzas: {
    ingresosPorVentas: string
    ingresosGenerales: string
    gastos: string
    totalIngresos: string
    cajaNeta: string
  }
  cartera: {
    saldoVencido: string
    interesMora: string
    saldoPorVencer: string
  }
  porProyecto: ResumenFilaProyecto[]
  // Comisiones por pagar; solo viene para quien puede ver comisiones.
  comisionesPendientes?: { cantidad: number; valor: string }
}

function construirQueryPeriodo(filtro?: { desde?: string; hasta?: string }) {
  const params = new URLSearchParams()
  if (filtro?.desde) params.set('desde', filtro.desde)
  if (filtro?.hasta) params.set('hasta', filtro.hasta)
  return params
}

export function obtenerDashboard(filtro?: { desde?: string; hasta?: string }) {
  const query = construirQueryPeriodo(filtro).toString()
  return solicitar<ResumenDashboard>(`/dashboard${query ? `?${query}` : ''}`)
}

export function exportarDashboard(formato: 'pdf' | 'excel', filtro?: { desde?: string; hasta?: string }) {
  const params = construirQueryPeriodo(filtro)
  params.set('formato', formato)
  const extension = formato === 'pdf' ? 'pdf' : 'xlsx'
  return descargarArchivo(`/dashboard/exportar?${params.toString()}`, `reporte-general.${extension}`)
}

export interface ResultadoRecordatorios {
  enviados: number
  omitidosSinCorreo: number
}

export function ejecutarRecordatorios() {
  return solicitar<ResultadoRecordatorios>('/recordatorios/ejecutar', { method: 'POST' })
}

export type EstadoUsuario = 'ACTIVO' | 'INACTIVO'

export interface RolResumen {
  id: string
  clave: string
  nombre: string
}

export interface UsuarioSesion {
  id: string
  nombre: string
  email: string
  rol: RolResumen
  // Permisos del rol (ver lib/permisos.ts). Solo sirven para mostrar u ocultar opciones.
  permisos: string[]
  // null = ve todos los proyectos; una lista = solo esos.
  proyectoIds: string[] | null
}

export interface RolConPermisos extends RolResumen {
  descripcion: string | null
  permisos: string[]
  esSistema: boolean
  limitablePorProyecto: boolean
}

export function listarRoles() {
  return solicitar<{ roles: RolConPermisos[]; catalogoDePermisos: string[] }>('/roles')
}

export interface RespuestaLogin {
  accessToken: string
  usuario: UsuarioSesion
}

export function login(email: string, password: string) {
  return solicitar<RespuestaLogin>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function obtenerPerfil() {
  return solicitar<UsuarioSesion>('/auth/me')
}

export interface Usuario {
  id: string
  nombre: string
  email: string
  rol: RolResumen & { limitablePorProyecto: boolean }
  estado: EstadoUsuario
  // false = solo ve los proyectos de proyectosPermitidos.
  todosLosProyectos: boolean
  proyectosPermitidos: { proyectoId: string }[]
  ultimoIngreso: string | null
  // Si es una fecha futura, la cuenta está bloqueada por intentos fallidos.
  bloqueadoHasta: string | null
  createdAt: string
}

export interface CrearUsuarioPayload {
  nombre: string
  email: string
  password: string
  rolId: string
  todosLosProyectos?: boolean
  proyectoIds?: string[]
}

export interface ActualizarUsuarioPayload {
  nombre?: string
  email?: string
  rolId?: string
  todosLosProyectos?: boolean
  proyectoIds?: string[]
}

export function listarUsuarios() {
  return solicitar<Usuario[]>('/usuarios')
}

export function crearUsuario(payload: CrearUsuarioPayload) {
  return solicitar<Usuario>('/usuarios', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function actualizarEstadoUsuario(id: string, estado: EstadoUsuario) {
  return solicitar<Usuario>(`/usuarios/${id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ estado }),
  })
}

export function actualizarUsuario(id: string, payload: ActualizarUsuarioPayload) {
  return solicitar<Usuario>(`/usuarios/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

export function restablecerPasswordUsuario(id: string, password: string) {
  return solicitar<Usuario>(`/usuarios/${id}/password`, { method: 'POST', body: JSON.stringify({ password }) })
}

export function desbloquearUsuario(id: string) {
  return solicitar<Usuario>(`/usuarios/${id}/desbloquear`, { method: 'POST' })
}

// ---------- Configuración de la empresa ----------

export interface MarcaPublica {
  nombreComercial: string
  nombreProducto: string
  colorPrimario: string
  // Minutos sin actividad tras los cuales se cierra la sesión.
  minutosInactividad: number
  tieneLogo: boolean
  version: number
}

// Sin sesión: se pide antes de iniciar sesión para pintar la marca en el ingreso.
export function obtenerMarcaPublica() {
  return solicitar<MarcaPublica>('/configuracion/publica')
}

export function urlLogo(version: number) {
  return `${API_URL}/configuracion/logo?v=${version}`
}

export interface EmpresaConfig {
  razonSocial: string
  nombreComercial: string
  nit: string
  direccion: string | null
  telefonos: string | null
  correo: string | null
  logoRuta: string | null
  colorPrimario: string
  textoLegalRecibo: string | null
  prefijoRecibo: string
  nombreProducto: string
  // Los porcentajes llegan como texto decimal ("30", "2.5").
  porcentajeCuotaInicial: string
  plazoMaximoMeses: number
  tasaFinanciacionMensual: string
  tasaMoraMensual: string | null
  diasGraciaMora: number
  diasSemaforoAmarillo: number
  diasAntesRecordatorio: number
  intentosMaximosLogin: number
  minutosBloqueoLogin: number
  minutosInactividad: number
}

export type TipoCuenta = 'AHORROS' | 'CORRIENTE' | 'BILLETERA_DIGITAL'
export type TipoVendedor = 'ASESOR_INMOBILIARIO' | 'REFERIDO'

export interface CuentaBancaria {
  id: string
  banco: string
  tipo: TipoCuenta
  numero: string
  alias: string
  activa: boolean
}

export interface MedioPagoConfig {
  medio: MedioPago
  etiqueta: string
  activo: boolean
}

// Las categorías de ingreso tienen la misma forma que las de gasto.
export type CategoriaIngreso = CategoriaGasto

export interface CategoriaGasto {
  id: string
  nombre: string
  activa: boolean
  esSistema: boolean
  // RF-MAQ-06: solo se ofrece en proyectos de maquinaria. Solo las categorías de gasto lo tienen.
  soloMaquinaria?: boolean
}

export interface ComisionConfig {
  tipo: TipoVendedor
  valor: string
}

export interface ConfiguracionCompleta {
  empresa: EmpresaConfig
  cuentas: CuentaBancaria[]
  mediosPago: MedioPagoConfig[]
  categoriasGasto: CategoriaGasto[]
  categoriasIngreso: CategoriaIngreso[]
  comisiones: ComisionConfig[]
  tiposEquipo: TipoEquipo[]
}

export function obtenerConfiguracion() {
  return solicitar<ConfiguracionCompleta>('/configuracion')
}

// Cuentas donde puede entrar el dinero de un abono: solo las activas.
export async function listarCuentasActivas() {
  const { cuentas } = await obtenerConfiguracion()
  return cuentas.filter((cuenta) => cuenta.activa)
}

export function listarMediosPago() {
  return solicitar<MedioPagoConfig[]>('/configuracion/medios-pago')
}

export interface ActualizarEmpresaPayload {
  razonSocial: string
  nombreComercial: string
  nit: string
  direccion?: string
  telefonos?: string
  correo?: string
  colorPrimario: string
  textoLegalRecibo?: string
  prefijoRecibo?: string
}

export function actualizarEmpresa(payload: ActualizarEmpresaPayload) {
  return solicitar<EmpresaConfig>('/configuracion/empresa', { method: 'PUT', body: JSON.stringify(payload) })
}

export interface ActualizarParametrosPayload {
  porcentajeCuotaInicial: number
  plazoMaximoMeses: number
  tasaFinanciacionMensual: number
  tasaMoraMensual: number | null
  diasGraciaMora: number
  diasSemaforoAmarillo: number
  diasAntesRecordatorio: number
  intentosMaximosLogin: number
  minutosBloqueoLogin: number
  minutosInactividad: number
}

export function actualizarParametros(payload: ActualizarParametrosPayload) {
  return solicitar<EmpresaConfig>('/configuracion/parametros', { method: 'PUT', body: JSON.stringify(payload) })
}

export function subirLogo(archivo: File) {
  const formData = new FormData()
  formData.append('logo', archivo)
  return solicitar<MarcaPublica>('/configuracion/logo', { method: 'POST', body: formData })
}

export function quitarLogo() {
  return solicitar<MarcaPublica>('/configuracion/logo', { method: 'DELETE' })
}

export interface CuentaPayload {
  banco: string
  tipo: TipoCuenta
  numero: string
  alias: string
}

export function crearCuenta(payload: CuentaPayload) {
  return solicitar<CuentaBancaria>('/configuracion/cuentas', { method: 'POST', body: JSON.stringify(payload) })
}

export function actualizarCuenta(id: string, payload: Partial<CuentaPayload> & { activa?: boolean }) {
  return solicitar<CuentaBancaria>(`/configuracion/cuentas/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

export function actualizarMedioPago(medio: MedioPago, activo: boolean) {
  return solicitar<MedioPagoConfig[]>(`/configuracion/medios-pago/${medio}`, {
    method: 'PATCH',
    body: JSON.stringify({ activo }),
  })
}

export function crearCategoriaGasto(nombre: string, soloMaquinaria = false) {
  return solicitar<CategoriaGasto>('/configuracion/categorias-gasto', { method: 'POST', body: JSON.stringify({ nombre, ...(soloMaquinaria ? { soloMaquinaria: true } : {}) }) })
}

export function actualizarCategoriaGasto(id: string, payload: { nombre?: string; activa?: boolean }) {
  return solicitar<CategoriaGasto>(`/configuracion/categorias-gasto/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function crearCategoriaIngreso(nombre: string) {
  return solicitar<CategoriaIngreso>('/configuracion/categorias-ingreso', { method: 'POST', body: JSON.stringify({ nombre }) })
}

export function actualizarCategoriaIngreso(id: string, payload: { nombre?: string; activa?: boolean }) {
  return solicitar<CategoriaIngreso>(`/configuracion/categorias-ingreso/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function actualizarComision(tipo: TipoVendedor, valor: string) {
  return solicitar<ComisionConfig>(`/configuracion/comisiones/${tipo}`, { method: 'PUT', body: JSON.stringify({ valor }) })
}

// ---------- Comisiones de venta (RF-COM-01 a 04, RF-REP-08) ----------

export type EstadoComision = 'PENDIENTE' | 'PAGADA' | 'ANULADA'

// Lo que trae el detalle de una venta.
export interface ComisionResumen {
  id: string
  estado: EstadoComision
  valor: string
  tipoVendedor: TipoVendedor
  motivoAnulacion: string | null
}

export interface Comision {
  id: string
  ventaId: string
  vendedorId: string
  tipoVendedor: TipoVendedor
  valor: string
  estado: EstadoComision
  pagadaEn: string | null
  anuladaEn: string | null
  motivoAnulacion: string | null
  createdAt: string
  vendedor: { id: string; nombre: string; documento: string; tipo: TipoVendedor }
  venta: {
    id: string
    fechaVenta: string
    estado: EstadoVenta
    cliente: { id: string; nombre: string }
    lote: { id: string; numero: string; manzana: { nombre: string } | null; proyecto: { id: string; nombre: string } }
  }
  // El egreso que pagó la comisión (también lo conserva una comisión pagada y luego anulada).
  movimiento: {
    id: string
    fecha: string
    medioPago: MedioPago
    referencia: string | null
    estado: EstadoMovimiento
    motivoSinSoporte: string | null
    tieneSoporte: boolean
    cuenta: { id: string; banco: string; alias: string } | null
  } | null
  pagadaPor: { nombre: string } | null
  anuladaPor: { nombre: string } | null
}

export interface ListaComisiones {
  comisiones: Comision[]
  totales: Record<EstadoComision, { cantidad: number; valor: string }>
}

export interface FiltroComisiones {
  vendedorId?: string
  estado?: EstadoComision
  proyectoId?: string
  desde?: string
  hasta?: string
  // A qué fecha se refiere el rango: la de la venta (por defecto) o la del pago.
  fechaPor?: 'venta' | 'pago'
}

function construirQueryComisiones(filtro: FiltroComisiones) {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(filtro)) {
    if (valor) params.set(clave, valor)
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function listarComisiones(filtro: FiltroComisiones = {}) {
  return solicitar<ListaComisiones>(`/comisiones${construirQueryComisiones(filtro)}`)
}

export function obtenerComision(id: string) {
  return solicitar<Comision>(`/comisiones/${id}`)
}

// El pago se envía como formulario porque puede llevar el archivo del soporte (campo "soporte").
export function pagarComision(id: string, formData: FormData) {
  return solicitar<Comision>(`/comisiones/${id}/pagar`, { method: 'POST', body: formData })
}

export function anularComision(id: string, motivo: string) {
  return solicitar<Comision>(`/comisiones/${id}/anular`, { method: 'POST', body: JSON.stringify({ motivo }) })
}

export function exportarComisiones(filtro: FiltroComisiones = {}) {
  return descargarArchivo(`/comisiones/exportar${construirQueryComisiones(filtro)}`, 'comisiones.xlsx')
}

// ---------- Reportes (RF-REP-04 a 11) ----------

export type TipoColumnaReporte = 'texto' | 'pesos' | 'fecha' | 'entero'

export interface ColumnaReporte {
  clave: string
  encabezado: string
  tipo: TipoColumnaReporte
  peso?: number
}

// texto: tal cual · pesos: pesos enteros como texto · fecha: "aaaa-mm-dd" · entero: número.
export type FilaReporte = Record<string, string | number | null>

export interface SeccionReporte {
  titulo: string
  nota?: string
  columnas: ColumnaReporte[]
  filas: FilaReporte[]
  totales?: FilaReporte
  // Si el detalle se recortó en el servidor: cuántas filas había.
  filasTotales?: number
}

export interface ReporteGenerado {
  clave: string
  titulo: string
  descripcion: string
  filtros: { etiqueta: string; valor: string }[]
  generadoEn: string
  secciones: SeccionReporte[]
}

export type TipoFiltroReporte = 'fecha' | 'proyecto' | 'medioPago' | 'cuenta' | 'usuario' | 'categoriaGasto' | 'estadoLote' | 'granularidad'
export type ClaveFiltroReporte = 'desde' | 'hasta' | 'proyectoId' | 'medioPago' | 'cuentaId' | 'usuarioId' | 'categoriaId' | 'estadoLote' | 'granularidad'

export interface FiltroDefinido {
  clave: ClaveFiltroReporte
  etiqueta: string
  tipo: TipoFiltroReporte
  obligatorio?: boolean
}

export interface DefinicionReporte {
  clave: string
  titulo: string
  descripcion: string
  filtros: FiltroDefinido[]
}

interface OpcionReporte {
  valor: string
  etiqueta: string
}

export interface CatalogoReportes {
  reportes: DefinicionReporte[]
  opciones: {
    proyectos: { id: string; nombre: string }[]
    cuentas: { id: string; alias: string; banco: string }[]
    usuarios: { id: string; nombre: string }[]
    categoriasGasto: { id: string; nombre: string }[]
    mediosPago: OpcionReporte[]
    estadosLote: OpcionReporte[]
    granularidades: OpcionReporte[]
  }
}

export type FiltrosReporte = Partial<Record<ClaveFiltroReporte, string>>

function queryDeReporte(filtros: FiltrosReporte, extra: Record<string, string> = {}) {
  const params = new URLSearchParams(extra)
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor) params.set(clave, valor)
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function obtenerCatalogoReportes() {
  return solicitar<CatalogoReportes>('/reportes')
}

export function generarReporte(clave: string, filtros: FiltrosReporte) {
  return solicitar<ReporteGenerado>(`/reportes/${clave}${queryDeReporte(filtros)}`)
}

export function exportarReporte(clave: string, filtros: FiltrosReporte, formato: 'pdf' | 'excel') {
  const rango = filtros.desde || filtros.hasta ? `-${filtros.desde ?? 'inicio'}-a-${filtros.hasta ?? 'hoy'}` : ''
  return descargarArchivo(`/reportes/${clave}/exportar${queryDeReporte(filtros, { formato })}`, `${clave}${rango}.${formato === 'pdf' ? 'pdf' : 'xlsx'}`)
}
