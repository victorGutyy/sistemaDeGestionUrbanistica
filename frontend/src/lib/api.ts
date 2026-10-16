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

async function lanzarErrorHttp(respuesta: Response, path: string): Promise<never> {
  const cuerpo = await respuesta.json().catch(() => null)
  const mensaje = Array.isArray(cuerpo?.message) ? cuerpo.message.join(', ') : cuerpo?.message
  if (respuesta.status === 401) {
    const habiaSesion = obtenerToken() !== null
    borrarToken()
    // Un 401 sin sesión previa es un intento de ingreso fallido, no una sesión caída.
    if (habiaSesion) window.dispatchEvent(new Event(EVENTO_SESION_INVALIDA))
  }
  throw new Error(mensaje ?? `Error ${respuesta.status} al llamar ${path}`)
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
  // Solo viene en la respuesta de listarProyectos, no en obtenerProyecto.
  _count?: { lotes: number }
}

export function listarProyectos() {
  return solicitar<Proyecto[]>('/proyectos')
}

export interface CrearProyectoPayload {
  nombre: string
  ubicacion?: string
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
}

export interface ProyectoConLotes extends Proyecto {
  lotes: LoteDeProyecto[]
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
  numero: string
  area: string
  valorVenta: string
}

export function crearLote(payload: CrearLotePayload) {
  return solicitar<LoteDeProyecto>('/lotes', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
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
export type MedioPago = 'EFECTIVO' | 'CONSIGNACION' | 'TRANSFERENCIA' | 'NEQUI' | 'DAVIPLATA' | 'CHEQUE' | 'TARJETA'

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

export function abrirComprobante(abonoId: string) {
  return abrirArchivo(`/abonos/${abonoId}/comprobante`)
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
  rol: RolResumen
  estado: EstadoUsuario
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
}

export interface ActualizarUsuarioPayload {
  nombre?: string
  email?: string
  rolId?: string
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

export interface CategoriaGasto {
  id: string
  nombre: string
  activa: boolean
  esSistema: boolean
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
  comisiones: ComisionConfig[]
}

export function obtenerConfiguracion() {
  return solicitar<ConfiguracionCompleta>('/configuracion')
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

export function crearCategoriaGasto(nombre: string) {
  return solicitar<CategoriaGasto>('/configuracion/categorias-gasto', { method: 'POST', body: JSON.stringify({ nombre }) })
}

export function actualizarCategoriaGasto(id: string, payload: { nombre?: string; activa?: boolean }) {
  return solicitar<CategoriaGasto>(`/configuracion/categorias-gasto/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function actualizarComision(tipo: TipoVendedor, valor: string) {
  return solicitar<ComisionConfig>(`/configuracion/comisiones/${tipo}`, { method: 'PUT', body: JSON.stringify({ valor }) })
}
