import { repartirAbono } from '../abonos/repartir-abono.js';
import { formatearCOP } from '../common/formato.util.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoLote, EstadoProyecto, FormaPago, MedioPago, TipoProyecto, TipoVendedor } from '../generated/prisma/enums.js';
import { generarPlanDePagos } from '../ventas/plan-de-pagos.js';
import { esVacia, leerCodigo, leerDecimal, leerEntero, leerFecha, leerOpcion, leerPesos, leerTexto, normalizarTexto, type Celda, type Lectura } from './celdas.js';
import type { FilaLeida, LibroLeido, ProblemaImportacion } from './leer-libro.js';
import { hojaPorClave, HOJAS, type ClaveHoja, type HojaPlantilla } from './plantilla-definicion.js';

// ---------------------------------------------------------------------------------------------
// Validación de la carga (RF-MIG-02). Es una función PURA: recibe el libro ya leído y una fotografía de lo que hay
// en el sistema, y devuelve los errores, los avisos y el plan de lo que se crearía. No toca la base de datos: por eso
// el modo de prueba nunca guarda nada y se prueba sin base.
//
// Errores = impiden guardar. Avisos = se pueden guardar, pero conviene revisarlos.
// ---------------------------------------------------------------------------------------------

const ETIQUETA_MEDIO: Record<string, MedioPago> = {
  Efectivo: MedioPago.EFECTIVO,
  Consignación: MedioPago.CONSIGNACION,
  Transferencia: MedioPago.TRANSFERENCIA,
  Nequi: MedioPago.NEQUI,
  Daviplata: MedioPago.DAVIPLATA,
  Cheque: MedioPago.CHEQUE,
  Tarjeta: MedioPago.TARJETA,
};

// Lo que hay hoy en el sistema y la carga necesita saber para validar.
export interface ContextoValidacion {
  // Día de hoy en Colombia, "aaaa-mm-dd".
  hoy: string;
  proyectos: {
    id: string;
    nombre: string;
    tipo: TipoProyecto;
    estado: EstadoProyecto;
    areaTotal: Prisma.Decimal;
    manzanas: { id: string; nombre: string }[];
    lotes: {
      id: string;
      numero: string;
      manzanaId: string | null;
      area: Prisma.Decimal;
      valorVenta: Prisma.Decimal;
      estado: EstadoLote;
      conVentaVigente: boolean;
    }[];
  }[];
  clientes: { documento: string; nombre: string }[];
  vendedores: { documento: string }[];
  cuentas: { id: string; alias: string; activa: boolean }[];
  mediosActivos: MedioPago[];
  // Referencias de abonos ACTIVOS ya registrados (cuenta + referencia en minúsculas).
  referencias: { cuentaId: string; referencia: string }[];
  // Cierres de caja cerrados o aprobados: no admiten abonos con fecha dentro de su período.
  cierresBloqueantes: { numeroTexto: string; desde: string; hasta: string }[];
}

export interface ProyectoPlan {
  fila: number;
  nombre: string;
  ubicacion: string | null;
  municipio: string | null;
  areaTotal: Prisma.Decimal;
  valorCompra: Prisma.Decimal | null;
  fechaCompra: string | null;
}
export interface ManzanaPlan {
  proyecto: string;
  proyectoId?: string;
  nombre: string;
}
export interface LotePlan {
  fila: number;
  clave: string;
  proyecto: string;
  proyectoId?: string;
  manzana: string | null;
  manzanaId?: string;
  numero: string;
  area: Prisma.Decimal;
  valorVenta: Prisma.Decimal;
  valorPorM2: Prisma.Decimal | null;
  linderos: string | null;
}
export interface ClientePlan {
  fila: number;
  documento: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
}
export interface VendedorPlan {
  documento: string;
  nombre: string;
  tipo: TipoVendedor;
}
export interface CuotaPlan {
  numero: number;
  fechaVencimiento: string;
  valor: Prisma.Decimal;
}
export interface AbonoPlan {
  fila: number;
  fecha: string;
  valor: Prisma.Decimal;
  medioPago: MedioPago;
  cuentaId: string | null;
  referencia: string | null;
}
export interface VentaPlan {
  fila: number;
  claveLote: string;
  loteId?: string;
  // "Proyecto · Manzana A · Lote 12", para mensajes y reportes.
  loteEtiqueta: string;
  documentoCliente: string;
  vendedorDocumento: string | null;
  fechaVenta: string;
  fechaCuotaInicial: string;
  formaPago: FormaPago;
  valorTotal: Prisma.Decimal;
  cuotaInicial: Prisma.Decimal;
  numeroCuotas: number | null;
  cuotas: CuotaPlan[];
  abonos: AbonoPlan[];
}

export interface PlanImportacion {
  proyectos: ProyectoPlan[];
  manzanas: ManzanaPlan[];
  lotes: LotePlan[];
  clientes: ClientePlan[];
  vendedores: VendedorPlan[];
  ventas: VentaPlan[];
}

export type EstadoConciliacion = 'COINCIDE' | 'DIFERENCIA' | 'SIN_DATO';

// Una fila del reporte de conciliación (RF-MIG-05): lo que el sistema calcula contra lo que decía el Excel.
// Los valores van como texto (pesos enteros) para que viajen y se guarden sin pérdida.
export interface FilaConciliacion {
  proyecto: string;
  manzana: string | null;
  lote: string;
  documentoCliente: string;
  cliente: string;
  formaPago: FormaPago;
  valorTotal: string;
  cuotaInicial: string;
  abonado: string;
  saldo: string;
  saldoSegunExcel: string | null;
  diferencia: string | null;
  estado: EstadoConciliacion;
  cuotasPagadas: number;
  cuotasTotales: number;
  abonos: number;
}

export interface ResumenImportacion {
  proyectos: { nuevos: number; existentes: number };
  manzanas: { nuevas: number };
  lotes: { nuevos: number; existentes: number };
  clientes: { nuevos: number; existentes: number };
  vendedores: { nuevos: number };
  ventas: number;
  cuotas: number;
  abonos: number;
  // Cada abono recibe un recibo histórico (serie H-).
  recibosHistoricos: number;
  valorVentas: string;
  totalAbonado: string;
  totalSaldo: string;
  conDiferencia: number;
}

export interface ResultadoValidacion {
  errores: ProblemaImportacion[];
  avisos: ProblemaImportacion[];
  plan: PlanImportacion;
  resumen: ResumenImportacion;
  conciliacion: FilaConciliacion[];
}

// ---------------------------------------------------------------------------------------------

class Colector {
  errores: ProblemaImportacion[] = [];
  avisos: ProblemaImportacion[] = [];
  error(hoja: string, fila: number | null, columna: string | undefined, mensaje: string) {
    this.errores.push({ hoja, fila, columna, mensaje });
  }
  aviso(hoja: string, fila: number | null, columna: string | undefined, mensaje: string) {
    this.avisos.push({ hoja, fila, columna, mensaje });
  }
}

// Lee los datos de una fila según el tipo de cada columna y anota los errores. `ok` queda en false si algo falló.
class LectorFila {
  ok = true;
  constructor(
    private readonly colector: Colector,
    readonly hoja: HojaPlantilla,
    readonly fila: FilaLeida,
  ) {}

  falla(clave: string, mensaje: string) {
    const columna = this.hoja.columnas.find((candidata) => candidata.clave === clave);
    this.colector.error(this.hoja.nombre, this.fila.fila, columna?.encabezado, mensaje);
    this.ok = false;
  }

  aviso(clave: string, mensaje: string) {
    const columna = this.hoja.columnas.find((candidata) => candidata.clave === clave);
    this.colector.aviso(this.hoja.nombre, this.fila.fila, columna?.encabezado, mensaje);
  }

  celda(clave: string): Celda | undefined {
    return this.fila.celdas[clave];
  }

  presente(clave: string): boolean {
    return !esVacia(this.celda(clave));
  }

  private leer<T>(clave: string, lector: (celda: Celda) => Lectura<T>): T | undefined {
    const columna = this.hoja.columnas.find((candidata) => candidata.clave === clave);
    const celda = this.celda(clave);
    if (celda === undefined || esVacia(celda)) {
      if (columna?.obligatoria) this.falla(clave, 'Falta este dato');
      return undefined;
    }
    const lectura = lector(celda);
    if (!lectura.ok) {
      this.falla(clave, lectura.mensaje);
      return undefined;
    }
    return lectura.valor;
  }

  texto(clave: string) {
    return this.leer(clave, leerTexto);
  }
  codigo(clave: string) {
    return this.leer(clave, leerCodigo);
  }
  pesos(clave: string) {
    return this.leer(clave, leerPesos);
  }
  decimal(clave: string) {
    return this.leer(clave, leerDecimal);
  }
  entero(clave: string) {
    return this.leer(clave, leerEntero);
  }
  fecha(clave: string) {
    return this.leer(clave, leerFecha);
  }
  opcion(clave: string) {
    const opciones = this.hoja.columnas.find((candidata) => candidata.clave === clave)?.opciones ?? [];
    return this.leer(clave, (celda) => leerOpcion(celda, opciones));
  }
}

const claveDe = (proyecto: string, manzana: string | null, numero: string) =>
  `${normalizarTexto(proyecto)}|${manzana ? normalizarTexto(manzana) : ''}|${normalizarTexto(numero)}`;

function etiquetaLote(proyecto: string, manzana: string | null, numero: string) {
  return `${proyecto}${manzana ? ` · Manzana ${manzana}` : ''} · Lote ${numero}`;
}

interface ProyectoConocido {
  nombre: string;
  id?: string;
  nuevo: boolean;
  ambiguo: boolean;
  tipo: TipoProyecto;
  estado: EstadoProyecto;
  areaTotal: Prisma.Decimal;
  manzanas: Map<string, { nombre: string; id?: string }>;
  areaExistente: Prisma.Decimal;
  areaNueva: Prisma.Decimal;
}

interface LoteConocido {
  clave: string;
  proyecto: ProyectoConocido;
  manzana: string | null;
  numero: string;
  id?: string;
  nuevo: boolean;
  estado: EstadoLote;
  conVentaVigente: boolean;
  area: Prisma.Decimal;
  valorVenta: Prisma.Decimal;
}

interface VentaTemporal {
  fila: number;
  lote: LoteConocido;
  documentoCliente: string;
  vendedorDocumento: string | null;
  fechaVenta: string;
  fechaCuotaInicial: string;
  formaPago: FormaPago;
  valorTotal: Prisma.Decimal;
  cuotaInicial: Prisma.Decimal;
  numeroCuotas: number | null;
  saldoSegunExcel: Prisma.Decimal | null;
  cuotasLeidas: { fila: number; numero: number; fecha: string; valor: Prisma.Decimal }[];
  abonos: AbonoPlan[];
}

const CERO = new Prisma.Decimal(0);
const MAXIMO_CUOTAS = 240;
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isoLocal(fecha: Date): string {
  return `${String(fecha.getFullYear()).padStart(4, '0')}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

function formatearDia(iso: string): string {
  return iso.split('-').reverse().join('/');
}

export function validarImportacion(libro: LibroLeido, contexto: ContextoValidacion): ResultadoValidacion {
  const colector = new Colector();
  for (const problema of libro.problemas) colector.errores.push(problema);

  const plan: PlanImportacion = { proyectos: [], manzanas: [], lotes: [], clientes: [], vendedores: [], ventas: [] };
  let proyectosExistentes = 0;
  let lotesExistentes = 0;
  let clientesExistentes = 0;

  const filasDe = (clave: ClaveHoja) => libro.hojas[clave].filas;
  const lectorDe = (clave: ClaveHoja, fila: FilaLeida) => new LectorFila(colector, hojaPorClave(clave), fila);

  if (HOJAS.every((hoja) => filasDe(hoja.clave).length === 0) && colector.errores.length === 0) {
    colector.error('Archivo', null, undefined, 'El archivo no trae filas para importar. Llena al menos una de las hojas de la plantilla.');
  }

  // ----- Lo que ya existe en el sistema ---------------------------------------------------
  const proyectos = new Map<string, ProyectoConocido>();
  const lotes = new Map<string, LoteConocido>();
  for (const proyecto of contexto.proyectos) {
    const clave = normalizarTexto(proyecto.nombre);
    const manzanas = new Map(proyecto.manzanas.map((manzana) => [normalizarTexto(manzana.nombre), { nombre: manzana.nombre, id: manzana.id }]));
    const conocido: ProyectoConocido = {
      nombre: proyecto.nombre,
      id: proyecto.id,
      nuevo: false,
      ambiguo: proyectos.has(clave),
      tipo: proyecto.tipo,
      estado: proyecto.estado,
      areaTotal: proyecto.areaTotal,
      manzanas,
      areaExistente: proyecto.lotes.reduce((suma, lote) => suma.plus(lote.area), CERO),
      areaNueva: CERO,
    };
    if (!proyectos.has(clave)) proyectos.set(clave, conocido);
    else (proyectos.get(clave) as ProyectoConocido).ambiguo = true;

    for (const lote of proyecto.lotes) {
      const nombreManzana = lote.manzanaId ? (proyecto.manzanas.find((manzana) => manzana.id === lote.manzanaId)?.nombre ?? null) : null;
      const claveLote = claveDe(proyecto.nombre, nombreManzana, lote.numero);
      lotes.set(claveLote, {
        clave: claveLote,
        proyecto: proyectos.get(clave) as ProyectoConocido,
        manzana: nombreManzana,
        numero: lote.numero,
        id: lote.id,
        nuevo: false,
        estado: lote.estado,
        conVentaVigente: lote.conVentaVigente,
        area: lote.area,
        valorVenta: lote.valorVenta,
      });
    }
  }
  const clientes = new Map<string, { nombre: string; nuevo: boolean }>(contexto.clientes.map((cliente) => [cliente.documento, { nombre: cliente.nombre, nuevo: false }]));
  const vendedoresConocidos = new Set(contexto.vendedores.map((vendedor) => vendedor.documento));

  // ----- Proyectos --------------------------------------------------------------------------
  const filasProyectoVistas = new Set<string>();
  for (const fila of filasDe('proyectos')) {
    const lector = lectorDe('proyectos', fila);
    const nombre = lector.texto('nombre');
    const areaTotal = lector.decimal('areaTotal');
    const ubicacion = lector.texto('ubicacion');
    const municipio = lector.texto('municipio');
    const valorCompra = lector.pesos('valorCompra');
    const fechaCompra = lector.fecha('fechaCompra');
    if (nombre !== undefined && nombre.length < 3) lector.falla('nombre', 'El nombre debe tener al menos 3 letras');
    if (areaTotal !== undefined && areaTotal.lessThanOrEqualTo(0)) lector.falla('areaTotal', 'El área debe ser mayor a cero');
    if (fechaCompra !== undefined && fechaCompra > contexto.hoy) lector.falla('fechaCompra', 'La fecha de compra no puede ser futura');
    if (!lector.ok || nombre === undefined || areaTotal === undefined) continue;

    const clave = normalizarTexto(nombre);
    if (filasProyectoVistas.has(clave)) {
      lector.falla('nombre', `El proyecto "${nombre}" aparece repetido en esta hoja`);
      continue;
    }
    filasProyectoVistas.add(clave);

    const existente = proyectos.get(clave);
    if (existente) {
      proyectosExistentes += 1;
      if (existente.ambiguo) {
        lector.falla('nombre', `Hay más de un proyecto llamado "${nombre}" en el sistema: no se puede saber a cuál te refieres`);
      } else if (!existente.areaTotal.equals(areaTotal)) {
        lector.aviso('areaTotal', `El proyecto ya existe con área total ${existente.areaTotal.toString()} m² y no se modifica (el archivo dice ${areaTotal.toString()} m²)`);
      } else {
        lector.aviso('nombre', `El proyecto ya existe en el sistema: se reutiliza y no se modifica`);
      }
      continue;
    }
    plan.proyectos.push({ fila: fila.fila, nombre, ubicacion: ubicacion ?? null, municipio: municipio ?? null, areaTotal, valorCompra: valorCompra ?? null, fechaCompra: fechaCompra ?? null });
    proyectos.set(clave, {
      nombre,
      nuevo: true,
      ambiguo: false,
      tipo: TipoProyecto.LOTES,
      estado: EstadoProyecto.ACTIVO,
      areaTotal,
      manzanas: new Map(),
      areaExistente: CERO,
      areaNueva: CERO,
    });
  }

  // Encuentra el proyecto de una fila (de la hoja Proyectos o del sistema).
  const resolverProyecto = (lector: LectorFila, nombre: string | undefined): ProyectoConocido | undefined => {
    if (nombre === undefined) return undefined;
    const proyecto = proyectos.get(normalizarTexto(nombre));
    if (!proyecto) {
      lector.falla('proyecto', `El proyecto "${nombre}" no existe: agrégalo en la hoja Proyectos o créalo antes en el sistema`);
      return undefined;
    }
    if (proyecto.ambiguo) {
      lector.falla('proyecto', `Hay más de un proyecto llamado "${nombre}" en el sistema: no se puede saber a cuál te refieres`);
      return undefined;
    }
    return proyecto;
  };

  // ----- Lotes ------------------------------------------------------------------------------
  const lotesDeLaHoja = new Set<string>();
  for (const fila of filasDe('lotes')) {
    const lector = lectorDe('lotes', fila);
    const nombreProyecto = lector.texto('proyecto');
    const manzana = lector.texto('manzana');
    const numero = lector.codigo('numero');
    const area = lector.decimal('area');
    const valorVenta = lector.pesos('valorVenta');
    const valorPorM2 = lector.pesos('valorPorM2');
    const linderos = lector.texto('linderos');
    if (area !== undefined && area.lessThanOrEqualTo(0)) lector.falla('area', 'El área debe ser mayor a cero');
    if (valorVenta !== undefined && valorVenta.lessThanOrEqualTo(0)) lector.falla('valorVenta', 'El precio debe ser mayor a cero');
    const proyecto = resolverProyecto(lector, nombreProyecto);
    if (!lector.ok || !proyecto || numero === undefined || area === undefined || valorVenta === undefined) continue;
    if (proyecto.tipo !== TipoProyecto.LOTES) {
      lector.falla('proyecto', `El proyecto "${proyecto.nombre}" no es de venta de lotes: no maneja lotes`);
      continue;
    }

    const nombreManzana = manzana ?? null;
    const clave = claveDe(proyecto.nombre, nombreManzana, numero);
    if (lotesDeLaHoja.has(clave)) {
      lector.falla('numero', `El lote ${numero} aparece repetido en esta hoja${nombreManzana ? ` (manzana ${nombreManzana})` : ''}`);
      continue;
    }
    lotesDeLaHoja.add(clave);

    const existente = lotes.get(clave);
    if (existente) {
      lotesExistentes += 1;
      if (!existente.area.equals(area) || !existente.valorVenta.equals(valorVenta)) {
        lector.aviso(
          'numero',
          `El lote ya existe con área ${existente.area.toString()} m² y precio ${formatearCOP(existente.valorVenta)}: no se modifica (el archivo dice ${area.toString()} m² y ${formatearCOP(valorVenta)})`,
        );
      } else {
        lector.aviso('numero', 'El lote ya existe en el sistema: se reutiliza y no se modifica');
      }
      continue;
    }

    if (!proyecto.nuevo && proyecto.estado === EstadoProyecto.FINALIZADO) {
      lector.falla('proyecto', `El proyecto "${proyecto.nombre}" ya está finalizado: no admite lotes nuevos`);
      continue;
    }

    let manzanaCanonica: string | null = null;
    let manzanaId: string | undefined;
    if (nombreManzana) {
      const claveManzana = normalizarTexto(nombreManzana);
      const conocida = proyecto.manzanas.get(claveManzana);
      if (conocida) {
        manzanaCanonica = conocida.nombre;
        manzanaId = conocida.id;
      } else {
        manzanaCanonica = nombreManzana;
        proyecto.manzanas.set(claveManzana, { nombre: nombreManzana });
        plan.manzanas.push({ proyecto: proyecto.nombre, proyectoId: proyecto.id, nombre: nombreManzana });
      }
    }

    const claveCanonica = claveDe(proyecto.nombre, manzanaCanonica, numero);
    plan.lotes.push({
      fila: fila.fila,
      clave: claveCanonica,
      proyecto: proyecto.nombre,
      proyectoId: proyecto.id,
      manzana: manzanaCanonica,
      manzanaId,
      numero,
      area,
      valorVenta,
      valorPorM2: valorPorM2 ?? null,
      linderos: linderos ?? null,
    });
    lotes.set(claveCanonica, {
      clave: claveCanonica,
      proyecto,
      manzana: manzanaCanonica,
      numero,
      nuevo: true,
      estado: EstadoLote.DISPONIBLE,
      conVentaVigente: false,
      area,
      valorVenta,
    });
    proyecto.areaNueva = proyecto.areaNueva.plus(area);
  }

  // El área de los lotes no debería superar la del proyecto (el sistema lo permite con confirmación; aquí es un aviso).
  for (const proyecto of proyectos.values()) {
    if (proyecto.areaNueva.greaterThan(0) && proyecto.areaExistente.plus(proyecto.areaNueva).greaterThan(proyecto.areaTotal)) {
      colector.aviso(
        'Lotes',
        null,
        undefined,
        `Los lotes del proyecto "${proyecto.nombre}" suman ${proyecto.areaExistente.plus(proyecto.areaNueva).toString()} m², más que su área total (${proyecto.areaTotal.toString()} m²)`,
      );
    }
  }

  // ----- Clientes ---------------------------------------------------------------------------
  const clientesDeLaHoja = new Set<string>();
  for (const fila of filasDe('clientes')) {
    const lector = lectorDe('clientes', fila);
    const documento = lector.codigo('documento');
    const nombre = lector.texto('nombre');
    const telefono = lector.codigo('telefono');
    const email = lector.texto('email');
    const direccion = lector.texto('direccion');
    if (documento !== undefined && documento.length < 3) lector.falla('documento', 'El documento debe tener al menos 3 caracteres');
    if (nombre !== undefined && nombre.length < 3) lector.falla('nombre', 'El nombre debe tener al menos 3 letras');
    if (email !== undefined && !FORMATO_EMAIL.test(email)) lector.falla('email', 'El correo no es válido');
    if (!lector.ok || documento === undefined || nombre === undefined) continue;

    if (clientesDeLaHoja.has(documento)) {
      lector.falla('documento', `El documento ${documento} aparece repetido en esta hoja`);
      continue;
    }
    clientesDeLaHoja.add(documento);

    const existente = clientes.get(documento);
    if (existente) {
      clientesExistentes += 1;
      if (normalizarTexto(existente.nombre) !== normalizarTexto(nombre)) {
        lector.aviso('documento', `El cliente ya existe como "${existente.nombre}" y no se modifica (el archivo dice "${nombre}")`);
      } else {
        lector.aviso('documento', 'El cliente ya existe en el sistema: se reutiliza y no se modifica');
      }
      continue;
    }
    plan.clientes.push({ fila: fila.fila, documento, nombre, telefono: telefono ?? null, email: email ?? null, direccion: direccion ?? null });
    clientes.set(documento, { nombre, nuevo: true });
  }

  // Encuentra el lote de una fila por proyecto + manzana + número.
  const resolverLote = (lector: LectorFila): LoteConocido | undefined => {
    const nombreProyecto = lector.texto('proyecto');
    const manzana = lector.texto('manzana');
    const numero = lector.codigo('numero');
    const proyecto = resolverProyecto(lector, nombreProyecto);
    if (!lector.ok || !proyecto || numero === undefined) return undefined;
    const lote = lotes.get(claveDe(proyecto.nombre, manzana ?? null, numero));
    if (!lote) {
      const enOtraManzana = [...lotes.values()].find((candidato) => candidato.proyecto === proyecto && normalizarTexto(candidato.numero) === normalizarTexto(numero));
      lector.falla(
        'numero',
        enOtraManzana
          ? `No existe el lote ${numero} ${manzana ? `en la manzana ${manzana}` : 'sin manzana'} del proyecto "${proyecto.nombre}". ¿Será el de la manzana ${enOtraManzana.manzana ?? '(sin manzana)'}?`
          : `No existe el lote ${numero} en el proyecto "${proyecto.nombre}": agrégalo en la hoja Lotes o créalo antes en el sistema`,
      );
      return undefined;
    }
    return lote;
  };

  // ----- Ventas -----------------------------------------------------------------------------
  const ventas = new Map<string, VentaTemporal>();
  const vendedoresNuevos = new Map<string, VendedorPlan>();
  for (const fila of filasDe('ventas')) {
    const lector = lectorDe('ventas', fila);
    const lote = resolverLote(lector);
    const documentoCliente = lector.codigo('documentoCliente');
    const fechaVenta = lector.fecha('fechaVenta');
    const formaPago = lector.opcion('formaPago');
    const valorTotal = lector.pesos('valorTotal');
    const cuotaInicialLeida = lector.pesos('cuotaInicial');
    const fechaCuotaInicial = lector.fecha('fechaCuotaInicial');
    const numeroCuotas = lector.entero('numeroCuotas');
    const saldoSegunExcel = lector.pesos('saldoSegunExcel');
    const vendedorTipo = lector.opcion('vendedorTipo');
    const vendedorDocumento = lector.codigo('vendedorDocumento');
    const vendedorNombre = lector.texto('vendedorNombre');

    if (valorTotal !== undefined && valorTotal.lessThanOrEqualTo(0)) lector.falla('valorTotal', 'El valor total debe ser mayor a cero');
    if (fechaVenta !== undefined && fechaVenta > contexto.hoy) lector.falla('fechaVenta', 'La fecha de la venta no puede ser futura');
    if (documentoCliente !== undefined && !clientes.has(documentoCliente)) {
      lector.falla('documentoCliente', `No existe el cliente con documento ${documentoCliente}: agrégalo en la hoja Clientes o créalo antes en el sistema`);
    }
    if (lote) {
      if (!lote.nuevo && lote.estado !== EstadoLote.DISPONIBLE) {
        lector.falla('numero', `El lote ya está ${lote.estado.toLowerCase()} en el sistema: solo se importan ventas de lotes disponibles`);
      } else if (lote.conVentaVigente) {
        lector.falla('numero', 'El lote ya tiene una venta en curso en el sistema');
      } else if (ventas.has(lote.clave)) {
        lector.falla('numero', `El lote ${lote.numero} ya tiene otra venta en esta hoja (fila ${(ventas.get(lote.clave) as VentaTemporal).fila})`);
      }
    }

    // Vendedor: los tres datos juntos o ninguno.
    const hayVendedor = [vendedorTipo, vendedorDocumento, vendedorNombre].some((valor) => valor !== undefined) || ['vendedorTipo', 'vendedorDocumento', 'vendedorNombre'].some((clave) => lector.presente(clave));
    if (hayVendedor) {
      if (!lector.presente('vendedorTipo')) lector.falla('vendedorTipo', 'Si indicas vendedor, falta el tipo (Asesor inmobiliario o Referido)');
      if (!lector.presente('vendedorDocumento')) lector.falla('vendedorDocumento', 'Si indicas vendedor, falta su documento');
      if (!lector.presente('vendedorNombre')) lector.falla('vendedorNombre', 'Si indicas vendedor, falta su nombre');
    }

    // Cuota inicial y cuotas según la forma de pago.
    let cuotaInicial: Prisma.Decimal | undefined;
    if (formaPago === 'Contado' && valorTotal !== undefined) {
      if (cuotaInicialLeida !== undefined && !cuotaInicialLeida.equals(valorTotal)) {
        lector.falla('cuotaInicial', 'En una venta de contado la cuota inicial es el valor total: deja esta celda vacía');
      }
      if (numeroCuotas !== undefined) lector.aviso('numeroCuotas', 'Una venta de contado no tiene cuotas: se ignora este dato');
      cuotaInicial = valorTotal;
    } else if (formaPago === 'Financiado' && valorTotal !== undefined) {
      if (cuotaInicialLeida === undefined) {
        if (!lector.presente('cuotaInicial')) lector.falla('cuotaInicial', 'En una venta financiada indica la cuota inicial (0 si no hubo)');
      } else if (cuotaInicialLeida.greaterThan(valorTotal)) {
        lector.falla('cuotaInicial', 'La cuota inicial no puede ser mayor al valor total');
      } else if (cuotaInicialLeida.equals(valorTotal)) {
        lector.falla('cuotaInicial', 'La cuota inicial cubre todo el valor: registra la venta como de contado');
      } else {
        cuotaInicial = cuotaInicialLeida;
      }
      if (numeroCuotas !== undefined && (numeroCuotas < 1 || numeroCuotas > MAXIMO_CUOTAS)) {
        lector.falla('numeroCuotas', `El número de cuotas debe estar entre 1 y ${MAXIMO_CUOTAS}`);
      }
    }

    if (!lector.ok || !lote || documentoCliente === undefined || fechaVenta === undefined || !formaPago || valorTotal === undefined || cuotaInicial === undefined) continue;

    const venta: VentaTemporal = {
      fila: fila.fila,
      lote,
      documentoCliente,
      vendedorDocumento: vendedorDocumento ?? null,
      fechaVenta,
      fechaCuotaInicial: fechaCuotaInicial ?? fechaVenta,
      formaPago: formaPago === 'Contado' ? FormaPago.CONTADO : FormaPago.FINANCIADO,
      valorTotal,
      cuotaInicial,
      numeroCuotas: formaPago === 'Financiado' ? (numeroCuotas ?? null) : null,
      saldoSegunExcel: saldoSegunExcel ?? null,
      cuotasLeidas: [],
      abonos: [],
    };
    ventas.set(lote.clave, venta);

    if (vendedorDocumento !== undefined && vendedorNombre !== undefined && vendedorTipo !== undefined) {
      if (!vendedoresConocidos.has(vendedorDocumento) && !vendedoresNuevos.has(vendedorDocumento)) {
        vendedoresNuevos.set(vendedorDocumento, {
          documento: vendedorDocumento,
          nombre: vendedorNombre,
          tipo: vendedorTipo === 'Referido' ? TipoVendedor.REFERIDO : TipoVendedor.ASESOR_INMOBILIARIO,
        });
      }
    }
  }
  plan.vendedores = [...vendedoresNuevos.values()];

  // ----- Cuotas (opcional) ------------------------------------------------------------------
  for (const fila of filasDe('cuotas')) {
    const lector = lectorDe('cuotas', fila);
    const lote = resolverLote(lector);
    const numero = lector.entero('cuota');
    const fecha = lector.fecha('fechaVencimiento');
    const valor = lector.pesos('valor');
    if (numero !== undefined && numero < 1) lector.falla('cuota', 'La cuota debe ser 1 o mayor (la cuota inicial va en la hoja Ventas)');
    if (valor !== undefined && valor.lessThanOrEqualTo(0)) lector.falla('valor', 'El valor de la cuota debe ser mayor a cero');
    if (!lector.ok || !lote || numero === undefined || fecha === undefined || valor === undefined) continue;

    const venta = ventas.get(lote.clave);
    if (!venta) {
      lector.falla('numero', `El lote ${lote.numero} no tiene una venta válida en la hoja Ventas`);
      continue;
    }
    if (venta.formaPago === FormaPago.CONTADO) {
      lector.falla('numero', 'Una venta de contado no tiene cuotas');
      continue;
    }
    if (venta.cuotasLeidas.some((cuota) => cuota.numero === numero)) {
      lector.falla('cuota', `La cuota ${numero} de este lote aparece repetida`);
      continue;
    }
    venta.cuotasLeidas.push({ fila: fila.fila, numero, fecha, valor });
  }

  // ----- Abonos -----------------------------------------------------------------------------
  const cuentasPorAlias = new Map<string, { id: string; activa: boolean }[]>();
  for (const cuenta of contexto.cuentas) {
    const clave = normalizarTexto(cuenta.alias);
    cuentasPorAlias.set(clave, [...(cuentasPorAlias.get(clave) ?? []), { id: cuenta.id, activa: cuenta.activa }]);
  }
  const referenciasUsadas = new Map<string, string>();
  for (const referencia of contexto.referencias) referenciasUsadas.set(`${referencia.cuentaId}|${referencia.referencia}`, 'el sistema');

  for (const fila of filasDe('abonos')) {
    const lector = lectorDe('abonos', fila);
    const lote = resolverLote(lector);
    const fecha = lector.fecha('fecha');
    const valor = lector.pesos('valor');
    const etiquetaMedio = lector.opcion('medioPago');
    const alias = lector.texto('cuenta');
    const referencia = lector.codigo('referencia');
    if (valor !== undefined && valor.lessThanOrEqualTo(0)) lector.falla('valor', 'El valor del pago debe ser mayor a cero');
    if (fecha !== undefined && fecha > contexto.hoy) lector.falla('fecha', 'La fecha del pago no puede ser futura');
    if (fecha !== undefined) {
      const cierre = contexto.cierresBloqueantes.find((candidato) => fecha >= candidato.desde && fecha <= candidato.hasta);
      if (cierre) {
        lector.falla('fecha', `El ${formatearDia(fecha)} pertenece al cierre de caja ${cierre.numeroTexto} (del ${formatearDia(cierre.desde)} al ${formatearDia(cierre.hasta)}), que ya está cerrado`);
      }
    }

    const medioPago = etiquetaMedio ? ETIQUETA_MEDIO[etiquetaMedio] : undefined;
    if (medioPago && !contexto.mediosActivos.includes(medioPago)) {
      lector.falla('medioPago', `El medio de pago "${etiquetaMedio}" no está habilitado en la configuración`);
    }

    let cuentaId: string | null = null;
    if (medioPago === MedioPago.EFECTIVO) {
      if (alias !== undefined) lector.aviso('cuenta', 'El pago en efectivo no lleva cuenta: se ignora este dato');
    } else if (medioPago) {
      if (alias === undefined) {
        lector.falla('cuenta', 'Indica la cuenta donde entró el dinero (obligatoria cuando el pago no es en efectivo)');
      } else {
        const candidatas = cuentasPorAlias.get(normalizarTexto(alias)) ?? [];
        if (candidatas.length === 0) lector.falla('cuenta', `No existe una cuenta con el alias "${alias}": créala antes en Configuración`);
        else if (candidatas.length > 1) lector.falla('cuenta', `Hay más de una cuenta con el alias "${alias}": cámbiale el alias a una para poder distinguirlas`);
        else if (!candidatas[0].activa) lector.falla('cuenta', `La cuenta "${alias}" está desactivada`);
        else cuentaId = candidatas[0].id;
      }
    }

    if (cuentaId && referencia !== undefined) {
      const clave = `${cuentaId}|${referencia.toLowerCase()}`;
      const donde = referenciasUsadas.get(clave);
      if (donde) {
        lector.falla('referencia', donde === 'el sistema' ? 'Esa referencia ya está registrada en esa cuenta en el sistema' : `Esa referencia ya aparece en esa cuenta en la fila ${donde} de esta hoja`);
      } else {
        referenciasUsadas.set(clave, String(fila.fila));
      }
    }

    if (!lector.ok || !lote || fecha === undefined || valor === undefined || !medioPago) continue;
    const venta = ventas.get(lote.clave);
    if (!venta) {
      lector.falla('numero', `El lote ${lote.numero} no tiene una venta válida en la hoja Ventas: los abonos se cargan junto con su venta`);
      continue;
    }
    if (fecha < venta.fechaVenta) {
      lector.aviso('fecha', `El pago es anterior a la fecha de la venta (${formatearDia(venta.fechaVenta)}). Si fue la separación, está bien`);
    }
    venta.abonos.push({ fila: fila.fila, fecha, valor, medioPago, cuentaId, referencia: referencia ?? null });
  }

  // ----- Plan de cuotas, aplicación de abonos y conciliación -------------------------------
  const conciliacion: FilaConciliacion[] = [];
  let totalVentas = CERO;
  let totalAbonado = CERO;
  let totalSaldo = CERO;
  let totalCuotas = 0;
  let totalAbonos = 0;

  const ventasEnOrden = [...ventas.values()].sort((a, b) => a.fila - b.fila);
  for (const venta of ventasEnOrden) {
    const { lote } = venta;
    const etiqueta = etiquetaLote(lote.proyecto.nombre, lote.manzana, lote.numero);
    const nombreCliente = clientes.get(venta.documentoCliente)?.nombre ?? venta.documentoCliente;
    let cuotas: CuotaPlan[] = [];
    let numeroCuotas = venta.numeroCuotas;
    let planValido = true;

    if (venta.formaPago === FormaPago.FINANCIADO) {
      if (venta.cuotasLeidas.length > 0) {
        const ordenadas = venta.cuotasLeidas.slice().sort((a, b) => a.numero - b.numero);
        const saldoFinanciado = venta.valorTotal.minus(venta.cuotaInicial);
        const suma = ordenadas.reduce((total, cuota) => total.plus(cuota.valor), CERO);
        const filaVenta = venta.fila;
        if (ordenadas.some((cuota, indice) => cuota.numero !== indice + 1)) {
          colector.error('Cuotas', ordenadas[0].fila, 'Cuota', `Las cuotas del lote ${lote.numero} deben ser 1, 2, 3… sin saltos`);
          planValido = false;
        }
        if (!suma.equals(saldoFinanciado)) {
          colector.error('Cuotas', ordenadas[0].fila, 'Valor de la cuota', `Las cuotas del lote ${lote.numero} suman ${formatearCOP(suma)} pero el saldo financiado (valor total menos cuota inicial, fila ${filaVenta} de Ventas) es ${formatearCOP(saldoFinanciado)}`);
          planValido = false;
        }
        if (venta.numeroCuotas !== null && venta.numeroCuotas !== ordenadas.length) {
          colector.error('Ventas', filaVenta, 'Número de cuotas', `Dice ${venta.numeroCuotas} cuotas pero la hoja Cuotas trae ${ordenadas.length} para este lote`);
          planValido = false;
        }
        numeroCuotas = ordenadas.length;
        cuotas = ordenadas.map((cuota) => ({ numero: cuota.numero, fechaVencimiento: cuota.fecha, valor: cuota.valor }));
      } else if (venta.numeroCuotas === null) {
        colector.error('Ventas', venta.fila, 'Número de cuotas', 'Indica el número de cuotas o trae el plan completo en la hoja Cuotas');
        planValido = false;
      } else {
        // Sin hoja Cuotas: el mismo plan que genera el sistema al vender (saldo en cuotas mensuales, sin interés).
        cuotas = generarPlanDePagos({
          valorTotal: venta.valorTotal,
          cuotaInicial: venta.cuotaInicial,
          numeroCuotas: venta.numeroCuotas,
          tasaInteres: null,
          fechaVenta: parsearFechaLocal(venta.fechaVenta),
        }).map((cuota) => ({ numero: cuota.numero, fechaVencimiento: isoLocal(cuota.fechaVencimiento), valor: cuota.valor }));
      }
    }
    if (venta.cuotaInicial.greaterThan(0)) {
      cuotas.unshift({ numero: 0, fechaVencimiento: venta.fechaCuotaInicial, valor: venta.cuotaInicial });
    }

    // Los abonos se aplican como lo hace el sistema: en orden de fecha, a las cuotas pendientes por vencimiento.
    const pagado = new Map<number, Prisma.Decimal>(cuotas.map((cuota) => [cuota.numero, CERO]));
    let abonado = CERO;
    const abonosOrdenados = venta.abonos.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.fila - b.fila));
    const abonosAceptados: AbonoPlan[] = [];
    if (planValido) {
      for (const abono of abonosOrdenados) {
        const { partes, sobrante } = repartirAbono(
          abono.valor,
          cuotas.map((cuota) => ({
            id: String(cuota.numero),
            numero: cuota.numero,
            fechaVencimiento: parsearFechaLocal(cuota.fechaVencimiento),
            valor: cuota.valor,
            pagado: pagado.get(cuota.numero) ?? CERO,
          })),
        );
        if (sobrante.greaterThan(0)) {
          const saldoPendiente = venta.valorTotal.minus(abonado);
          colector.error(
            'Abonos',
            abono.fila,
            'Valor pagado',
            saldoPendiente.lessThanOrEqualTo(0)
              ? `La venta del lote ${lote.numero} ya está pagada por completo con los abonos anteriores`
              : `El pago de ${formatearCOP(abono.valor)} supera el saldo pendiente de la venta del lote ${lote.numero} (${formatearCOP(saldoPendiente)}) al aplicar los abonos por fecha`,
          );
          continue;
        }
        for (const parte of partes) pagado.set(parte.numero, (pagado.get(parte.numero) ?? CERO).plus(parte.valor));
        abonado = abonado.plus(abono.valor);
        abonosAceptados.push(abono);
      }
    }

    const saldo = venta.valorTotal.minus(abonado);
    const cuotasPagadas = cuotas.filter((cuota) => (pagado.get(cuota.numero) ?? CERO).greaterThanOrEqualTo(cuota.valor)).length;
    const diferencia = venta.saldoSegunExcel === null ? null : saldo.minus(venta.saldoSegunExcel);
    const estado: EstadoConciliacion = diferencia === null ? 'SIN_DATO' : diferencia.equals(0) ? 'COINCIDE' : 'DIFERENCIA';
    if (estado === 'DIFERENCIA' && diferencia) {
      colector.aviso(
        'Ventas',
        venta.fila,
        'Saldo según el Excel',
        `El saldo calculado por el sistema (${formatearCOP(saldo)}) no coincide con el del Excel (${formatearCOP(venta.saldoSegunExcel as Prisma.Decimal)}): diferencia de ${formatearCOP(diferencia)}`,
      );
    }

    plan.ventas.push({
      fila: venta.fila,
      claveLote: lote.clave,
      loteId: lote.id,
      loteEtiqueta: etiqueta,
      documentoCliente: venta.documentoCliente,
      vendedorDocumento: venta.vendedorDocumento,
      fechaVenta: venta.fechaVenta,
      fechaCuotaInicial: venta.fechaCuotaInicial,
      formaPago: venta.formaPago,
      valorTotal: venta.valorTotal,
      cuotaInicial: venta.cuotaInicial,
      numeroCuotas,
      cuotas,
      abonos: abonosAceptados,
    });
    conciliacion.push({
      proyecto: lote.proyecto.nombre,
      manzana: lote.manzana,
      lote: lote.numero,
      documentoCliente: venta.documentoCliente,
      cliente: nombreCliente,
      formaPago: venta.formaPago,
      valorTotal: venta.valorTotal.toString(),
      cuotaInicial: venta.cuotaInicial.toString(),
      abonado: abonado.toString(),
      saldo: saldo.toString(),
      saldoSegunExcel: venta.saldoSegunExcel === null ? null : venta.saldoSegunExcel.toString(),
      diferencia: diferencia === null ? null : diferencia.toString(),
      estado,
      cuotasPagadas,
      cuotasTotales: cuotas.length,
      abonos: abonosAceptados.length,
    });
    totalVentas = totalVentas.plus(venta.valorTotal);
    totalAbonado = totalAbonado.plus(abonado);
    totalSaldo = totalSaldo.plus(saldo);
    totalCuotas += cuotas.length;
    totalAbonos += abonosAceptados.length;
  }

  const resumen: ResumenImportacion = {
    proyectos: { nuevos: plan.proyectos.length, existentes: proyectosExistentes },
    manzanas: { nuevas: plan.manzanas.length },
    lotes: { nuevos: plan.lotes.length, existentes: lotesExistentes },
    clientes: { nuevos: plan.clientes.length, existentes: clientesExistentes },
    vendedores: { nuevos: plan.vendedores.length },
    ventas: plan.ventas.length,
    cuotas: totalCuotas,
    abonos: totalAbonos,
    recibosHistoricos: totalAbonos,
    valorVentas: totalVentas.toString(),
    totalAbonado: totalAbonado.toString(),
    totalSaldo: totalSaldo.toString(),
    conDiferencia: conciliacion.filter((fila) => fila.estado === 'DIFERENCIA').length,
  };

  return { errores: colector.errores, avisos: colector.avisos, plan, resumen, conciliacion };
}
