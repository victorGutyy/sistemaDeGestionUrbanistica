import { formatearCOP, formatearFecha } from './formato'

// ---------------------------------------------------------------------------------------------
// Ayudas para mostrar la auditoría (RF-AUD-02): convierten el JSON "antes" y "después" de cada registro en una
// lista de campos con nombres legibles, valores formateados (pesos, fechas, Sí/No) y marca de lo que cambió.
// Solo para mostrar: lo que se guardó en el servidor nunca se modifica aquí.
// ---------------------------------------------------------------------------------------------

// Nombres de campo que no salen bien de partir el camelCase.
const NOMBRES_CAMPO: Record<string, string> = {
  nit: 'NIT',
  valorPorM2: 'Valor por m²',
  area: 'Área',
  cuentaId: 'Cuenta',
  cuentaDestinoId: 'Cuenta de destino',
  proyectoId: 'Proyecto',
  ventaId: 'Venta',
  loteId: 'Lote',
  clienteId: 'Cliente',
  vendedorId: 'Vendedor',
  abonoId: 'Abono',
  trabajadorId: 'Trabajador',
  proyectoIds: 'Proyectos permitidos',
  todosLosProyectos: 'Ve todos los proyectos',
  contrasenaCambiada: 'Contraseña cambiada',
  logoRuta: 'Logo',
  motivoSinSoporte: 'Motivo de no tener soporte',
  conSoporte: 'Con soporte',
}

// Campos que son dinero (pesos): se muestran como $1.234.567.
const CAMPOS_DINERO = new Set([
  'valor',
  'valorVenta',
  'valorPorM2',
  'valorTotal',
  'cuotaInicial',
  'saldoAnterior',
  'saldoNuevo',
  'efectivoInicial',
  'efectivoEsperado',
  'efectivoContado',
  'diferencia',
  'entradas',
  'salidas',
  'salarioBase',
  'valorPagado',
  'valorDevolver',
  'valorRetener',
  'valorCompra',
  'pagado',
])

// Campos cuyo texto es un código del sistema y se escribe en español legible.
const VALORES_CODIGO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  CONSIGNACION: 'Consignación',
  TRANSFERENCIA: 'Transferencia',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  CHEQUE: 'Cheque',
  TARJETA: 'Tarjeta',
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
  ANULADO: 'Anulado',
  ACTIVA: 'Activa',
  PENDIENTE_APROBACION: 'Pendiente de aprobación',
  RECHAZADA: 'Rechazada',
  DESISTIDA: 'Desistida',
  DISPONIBLE: 'Disponible',
  SEPARADO: 'Separado',
  VENDIDO: 'Vendido',
  ESCRITURADO: 'Escriturado',
  DESISTIDO: 'Desistido',
  BORRADOR: 'Borrador',
  CERRADO: 'Cerrado',
  APROBADO: 'Aprobado',
  DEVUELTO: 'Devuelto',
  GASTO: 'Egreso',
  INGRESO: 'Ingreso',
  CONTADO: 'De contado',
  FINANCIADO: 'Financiado',
  FINALIZADO: 'Finalizado',
  DIARIO: 'Diario',
  SEMANAL: 'Semanal',
  QUINCENAL: 'Quincenal',
}

const ISO_FECHA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/

// "valorVenta" → "Valor venta"; "separacion.nombreInteresado" → "Separación · Nombre interesado".
export function etiquetaCampo(ruta: string): string {
  return ruta
    .split('.')
    .map((parte) => {
      if (NOMBRES_CAMPO[parte]) return NOMBRES_CAMPO[parte]
      const texto = parte.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
      return texto.charAt(0).toUpperCase() + texto.slice(1)
    })
    .join(' · ')
}

export function formatearValorAuditoria(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
  const ultimo = campo.split('.').pop() ?? campo
  if (typeof valor === 'number' || (typeof valor === 'string' && /^-?\d+(\.\d+)?$/.test(valor))) {
    if (CAMPOS_DINERO.has(ultimo)) return formatearCOP(valor as string | number)
    return String(valor)
  }
  if (typeof valor === 'string') {
    if (ISO_FECHA_HORA.test(valor) || ISO_DIA.test(valor)) {
      // Un día de calendario ("2026-10-12") se escribe tal cual; un instante se lleva al día de Colombia.
      if (ISO_DIA.test(valor)) {
        const [anio, mes, dia] = valor.split('-')
        return `${dia}/${mes}/${anio}`
      }
      return formatearFecha(valor)
    }
    return VALORES_CODIGO[valor] ?? valor
  }
  if (Array.isArray(valor)) return valor.length === 0 ? '—' : valor.map((elemento) => (typeof elemento === 'object' ? JSON.stringify(elemento) : String(elemento))).join('; ')
  return JSON.stringify(valor)
}

export interface CampoAuditoria {
  campo: string
  etiqueta: string
  antes: string
  despues: string
  cambio: boolean
  // Estaba antes y ya no, o no estaba antes (se agregó): sirve para decidir cómo mostrarlo.
  soloAntes: boolean
  soloDespues: boolean
}

type Objeto = Record<string, unknown>

const esObjeto = (valor: unknown): valor is Objeto => typeof valor === 'object' && valor !== null && !Array.isArray(valor)

// Aplana los objetos anidados a "ruta.campo" para compararlos campo a campo.
function aplanar(valor: unknown, prefijo = '', salida: Record<string, unknown> = {}): Record<string, unknown> {
  if (!esObjeto(valor)) return salida
  for (const [clave, contenido] of Object.entries(valor)) {
    const ruta = prefijo ? `${prefijo}.${clave}` : clave
    if (esObjeto(contenido)) aplanar(contenido, ruta, salida)
    else salida[ruta] = contenido
  }
  return salida
}

// Compara el "antes" y el "después" de un registro y devuelve cada campo con su valor en cada momento.
export function camposDeAuditoria(antes: unknown, despues: unknown): CampoAuditoria[] {
  const a = aplanar(antes)
  const d = aplanar(despues)
  const claves = [...new Set([...Object.keys(a), ...Object.keys(d)])]
  return claves.map((campo) => {
    const textoAntes = formatearValorAuditoria(campo, a[campo])
    const textoDespues = formatearValorAuditoria(campo, d[campo])
    const enAntes = campo in a
    const enDespues = campo in d
    return {
      campo,
      etiqueta: etiquetaCampo(campo),
      antes: textoAntes,
      despues: textoDespues,
      cambio: !enAntes || !enDespues || textoAntes !== textoDespues,
      soloAntes: enAntes && !enDespues,
      soloDespues: !enAntes && enDespues,
    }
  })
}
