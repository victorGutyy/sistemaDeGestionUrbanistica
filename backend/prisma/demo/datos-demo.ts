import type { UsuarioAutenticado } from '../../src/auth/usuario-autenticado.js';
import type { MedioPago } from '../../src/generated/prisma/enums.js';
import type { Contexto } from './contexto.js';
import { despues, hace, hoy, menor, sumarMesesISO } from './fechas.js';
import { correoInventado, documentoInventado, nombreInventado, telefonoInventado } from './nombres.js';

// ---------------------------------------------------------------------------------------------
// Datos de demostración de La Floresta (todo inventado). Se arman con los servicios reales del sistema y con fechas
// relativas a hoy, para que siempre haya clientes al día, por vencer y en mora.
// ---------------------------------------------------------------------------------------------

type Medio = Extract<MedioPago, 'EFECTIVO' | 'TRANSFERENCIA' | 'CONSIGNACION'>;
type VentaCreada = Awaited<ReturnType<Contexto['ventas']['crear']>>;

const log = (texto: string) => console.log(`  · ${texto}`);

const aISO = (fecha: Date) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
const redondear = (valor: number, a = 1000) => Math.round(valor / a) * a;

const VENDEDORES = [
  { tipo: 'ASESOR_INMOBILIARIO' as const, nombre: 'Luis Carlos Mejía Pérez', documento: '2000000001', telefono: '3100000001' },
  { tipo: 'ASESOR_INMOBILIARIO' as const, nombre: 'Marcela Duque Ríos', documento: '2000000002', telefono: '3100000002' },
  { tipo: 'REFERIDO' as const, nombre: 'Gustavo Henao Ocampo', documento: '2000000003', telefono: '3100000003' },
];

export interface ParametrosDemo {
  gerente: UsuarioAutenticado;
  admin: UsuarioAutenticado;
  emailSocio: string;
  passwordSocio: string;
}

export async function cargarDemo(ctx: Contexto, { gerente, admin, emailSocio, passwordSocio }: ParametrosDemo): Promise<void> {
  // ---- Configuración de la demostración ----
  const empresa = await ctx.configuracion.obtenerEmpresa();
  const numero = (valor: { toString(): string }) => Number(valor.toString());
  await ctx.configuracion.actualizarParametros(
    {
      porcentajeCuotaInicial: numero(empresa.porcentajeCuotaInicial),
      plazoMaximoMeses: empresa.plazoMaximoMeses,
      tasaFinanciacionMensual: numero(empresa.tasaFinanciacionMensual),
      // Valor de ejemplo para que se vea el interés de mora: la tasa real la define el cliente.
      tasaMoraMensual: 2,
      diasGraciaMora: 0,
      diasSemaforoAmarillo: empresa.diasSemaforoAmarillo,
      diasAntesRecordatorio: empresa.diasAntesRecordatorio,
      diasEntreAvisosMora: empresa.diasEntreAvisosMora,
      // Apagado en la demo: al cargar los datos se registran decenas de abonos y cada uno dispararía un aviso (omitido,
      // porque la demo no tiene correo). Se enciende desde Configuración al demostrar el envío del recibo.
      enviarReciboPorCorreo: false,
      intentosMaximosLogin: empresa.intentosMaximosLogin,
      minutosBloqueoLogin: empresa.minutosBloqueoLogin,
      minutosInactividad: empresa.minutosInactividad,
    },
    gerente,
  );
  const cuentasBase = await ctx.prisma.cuentaBancaria.findMany({ orderBy: { banco: 'asc' } });
  const [bancolombia, davivienda] = [cuentasBase.find((c) => c.banco === 'Bancolombia'), cuentasBase.find((c) => c.banco === 'Davivienda')];
  if (!bancolombia || !davivienda) throw new Error('Faltan las cuentas base de la semilla (Bancolombia y Davivienda)');
  await ctx.configuracion.actualizarCuenta(bancolombia.id, { numero: '000-000000-01', alias: 'Bancolombia ahorros (demostración)', activa: true }, gerente);
  await ctx.configuracion.actualizarCuenta(davivienda.id, { numero: '000-000000-02', alias: 'Davivienda ahorros (demostración)', activa: true }, gerente);
  const cuentas = [bancolombia.id, davivienda.id];
  log('Configuración de la demostración lista (tasa de mora de ejemplo y dos cuentas de recaudo)');

  // ---- Pagos: medio, cuenta y referencia únicas ----
  let secuencia = 0;
  const alternar = (k: number): Medio => (['EFECTIVO', 'TRANSFERENCIA', 'CONSIGNACION'] as const)[k % 3];
  const datosPago = (medio: Medio) => {
    secuencia += 1;
    return medio === 'EFECTIVO'
      ? { medioPago: medio }
      : { medioPago: medio, cuentaDestinoId: cuentas[secuencia % 2], referencia: `DEMO-${String(secuencia).padStart(5, '0')}` };
  };

  // ---- La Floresta: 9 manzanas de 15 lotes ----
  const floresta = await ctx.proyectos.crear(
    { nombre: 'La Floresta', ubicacion: 'Vereda Los Cedros (demostración)', municipio: 'Armenia', areaTotal: '20000', valorCompra: '1800000000', fechaCompra: hace(730) },
    gerente,
  );
  const lotes = new Map<string, Awaited<ReturnType<Contexto['lotes']['crear']>>>();
  const letras = 'ABCDEFGHI'.split('');
  for (const [indiceManzana, letra] of letras.entries()) {
    const manzana = await ctx.proyectos.crearManzana(floresta.id, { nombre: letra }, gerente);
    for (let n = 1; n <= 15; n++) {
      const area = 90 + (((indiceManzana * 15 + n) * 7) % 51);
      const valorPorM2 = 450_000 + (indiceManzana % 3) * 25_000;
      const lote = await ctx.lotes.crear(
        {
          proyectoId: floresta.id,
          manzanaId: manzana.id,
          numero: String(n),
          area: String(area),
          valorPorM2: String(valorPorM2),
          valorVenta: String(redondear(area * valorPorM2, 100_000)),
          linderos: `Frente de ${Math.round(Math.sqrt(area))} m sobre la vía interna de la manzana ${letra} (demostración)`,
        },
        gerente,
      );
      lotes.set(`${letra}${n}`, lote);
    }
  }
  log(`La Floresta: ${letras.length} manzanas y ${lotes.size} lotes`);

  // ---- Usuarios de la demostración ----
  const rolConsulta = await ctx.prisma.rolUsuario.findUniqueOrThrow({ where: { clave: 'CONSULTA' } });
  await ctx.usuarios.crear(
    { nombre: 'Socio de La Floresta (demostración)', email: emailSocio, password: passwordSocio, rolId: rolConsulta.id, todosLosProyectos: false, proyectoIds: [floresta.id] },
    gerente,
  );

  // ---- 15 clientes ----
  const clientes: Awaited<ReturnType<Contexto['clientes']['crear']>>[] = [];
  for (let i = 1; i <= 15; i++) {
    clientes.push(
      await ctx.clientes.crear(
        {
          nombre: i === 9 ? 'Constructora Los Cedros SAS' : nombreInventado(i),
          documento: i === 9 ? '900123456' : documentoInventado(i),
          tipoDocumento: i === 9 ? 'NIT' : 'CC',
          telefono: telefonoInventado(i),
          email: correoInventado(i),
          direccion: `Calle ${i} # ${i + 10}-${i + 20}, Armenia`,
          autorizaDatos: i % 3 !== 0,
        },
        admin,
      ),
    );
  }
  log(`${clientes.length} clientes`);

  // ---- Ventas ----
  interface OpcionesVenta {
    lote: string;
    cliente: number;
    forma: 'CONTADO' | 'FINANCIADO';
    fechaVenta: string;
    cuotas?: number;
    porcentaje?: number;
    pagadas?: number;
    // Fracción de la siguiente cuota que se abona (0 a 1).
    parcial?: number;
    medioInicial?: Medio;
    vendedor?: 0 | 1 | 2;
    usuario?: UsuarioAutenticado;
    motivoExcepcion?: string;
    sinCuotaInicialRecibida?: boolean;
  }

  async function vender(op: OpcionesVenta): Promise<VentaCreada> {
    const lote = lotes.get(op.lote);
    if (!lote) throw new Error(`No existe el lote ${op.lote}`);
    const venta = await ctx.ventas.crear(
      {
        loteId: lote.id,
        clienteId: clientes[op.cliente - 1].id,
        ...(op.vendedor !== undefined ? { vendedorNuevo: VENDEDORES[op.vendedor] } : {}),
        formaPago: op.forma,
        valorTotal: lote.valorVenta.toString(),
        ...(op.forma === 'FINANCIADO' ? { numeroCuotas: op.cuotas ?? 12, cuotaInicialPorcentaje: String(op.porcentaje ?? 30) } : {}),
        fechaVenta: op.fechaVenta,
        ...(op.sinCuotaInicialRecibida ? {} : { cuotaInicialRecibida: true, ...datosPago(op.medioInicial ?? 'EFECTIVO') }),
        ...(op.motivoExcepcion ? { motivoExcepcion: op.motivoExcepcion } : {}),
      },
      op.usuario ?? admin,
    );

    // Cada cuota pagada se abona cerca de su vencimiento, por orden (el sistema las aplica a la más antigua).
    for (let k = 1; k <= (op.pagadas ?? 0); k++) {
      const cuota = venta.cuotas.find((c) => c.numero === k);
      if (!cuota) throw new Error(`La venta de ${op.lote} no tiene la cuota ${k}`);
      await ctx.abonos.crear({ ventaId: venta.id, fecha: menor(aISO(cuota.fechaVencimiento), hace(1)), valor: cuota.valor.toString(), ...datosPago(alternar(k)) }, admin);
    }
    if (op.parcial) {
      const cuota = venta.cuotas.find((c) => c.numero === (op.pagadas ?? 0) + 1);
      if (!cuota) throw new Error(`La venta de ${op.lote} no tiene cuota para el abono parcial`);
      await ctx.abonos.crear({ ventaId: venta.id, fecha: hace(1), valor: String(redondear(numero(cuota.valor) * op.parcial)), medioPago: 'EFECTIVO' }, admin);
    }
    return venta;
  }

  // Contado
  const ventaA1 = await vender({ lote: 'A1', cliente: 1, forma: 'CONTADO', fechaVenta: hace(200), vendedor: 0 });
  await vender({ lote: 'A2', cliente: 2, forma: 'CONTADO', fechaVenta: hace(90), medioInicial: 'TRANSFERENCIA', vendedor: 1 });
  await vender({ lote: 'A3', cliente: 3, forma: 'CONTADO', fechaVenta: hace(40), medioInicial: 'CONSIGNACION' });

  // Financiadas al día
  const alDia = await vender({ lote: 'B1', cliente: 4, forma: 'FINANCIADO', fechaVenta: hace(100), pagadas: 3, vendedor: 0 });
  const ventaB2 = await vender({ lote: 'B2', cliente: 5, forma: 'FINANCIADO', fechaVenta: hace(160), pagadas: 5, medioInicial: 'TRANSFERENCIA', vendedor: 2 });
  await vender({ lote: 'B3', cliente: 6, forma: 'FINANCIADO', fechaVenta: hace(250), pagadas: 8, vendedor: 1 });
  await vender({ lote: 'B4', cliente: 7, forma: 'FINANCIADO', fechaVenta: hace(70), pagadas: 2 });
  await vender({ lote: 'B5', cliente: 8, forma: 'FINANCIADO', fechaVenta: hace(130), pagadas: 4, medioInicial: 'CONSIGNACION' });
  // El cliente 1 tiene una segunda compra: su ficha muestra varias ventas.
  await vender({ lote: 'B6', cliente: 1, forma: 'FINANCIADO', fechaVenta: hace(55), cuotas: 10, pagadas: 1, vendedor: 0 });

  // Por vencer (amarillo): la siguiente cuota vence en pocos días.
  await vender({ lote: 'C1', cliente: 9, forma: 'FINANCIADO', fechaVenta: sumarMesesISO(despues(3), -2), pagadas: 1, vendedor: 1 });
  await vender({ lote: 'C2', cliente: 10, forma: 'FINANCIADO', fechaVenta: sumarMesesISO(despues(4), -3), pagadas: 2 });

  // En mora (rojo): cuotas vencidas sin pagar.
  await vender({ lote: 'C3', cliente: 11, forma: 'FINANCIADO', fechaVenta: hace(100), pagadas: 1, vendedor: 2 });
  await vender({ lote: 'C4', cliente: 12, forma: 'FINANCIADO', fechaVenta: hace(75), pagadas: 0, parcial: 0.4 });

  // Venta ya pagada por completo, con recibos históricos (H-) y lote escriturado.
  const liquidada = await vender({ lote: 'D1', cliente: 13, forma: 'FINANCIADO', fechaVenta: hace(425), cuotas: 12, sinCuotaInicialRecibida: true, vendedor: 1 });
  for (const cuota of [...liquidada.cuotas].sort((a, b) => a.numero - b.numero)) {
    const medio = alternar(cuota.numero);
    const pago = datosPago(medio);
    await ctx.abonoHistorico({
      ventaId: liquidada.id,
      fecha: menor(aISO(cuota.fechaVencimiento), hace(1)),
      valor: cuota.valor,
      medioPago: medio,
      cuentaDestinoId: 'cuentaDestinoId' in pago ? pago.cuentaDestinoId : null,
      referencia: 'referencia' in pago ? pago.referencia : null,
      usuario: admin,
    });
  }
  await ctx.lotes.escriturar(lotes.get('D1')!.id, { numero: 'EP-2025-0345', notaria: 'Notaría Segunda de Armenia (demostración)', fecha: hace(20) }, gerente);

  // Excepción autorizada por el gerente (plazo mayor al máximo) y otra pendiente de aprobación.
  await vender({ lote: 'D2', cliente: 14, forma: 'FINANCIADO', fechaVenta: hace(45), cuotas: 18, pagadas: 1, usuario: gerente, motivoExcepcion: 'Compradora con ingresos por cosecha: plazo de 18 meses acordado por la gerencia (demostración)' });
  await vender({ lote: 'D3', cliente: 15, forma: 'FINANCIADO', fechaVenta: hoy(), porcentaje: 10, sinCuotaInicialRecibida: true, motivoExcepcion: 'Cuota inicial del 10 % por convenio con la empresa del comprador (demostración)' });

  // Desistimiento con devolución parcial (queda como egreso).
  const desistida = await vender({ lote: 'D4', cliente: 5, forma: 'FINANCIADO', fechaVenta: hace(80), pagadas: 2, vendedor: 0 });
  const pagado = numero(desistida.cuotaInicial) + desistida.cuotas.filter((c) => c.numero === 1 || c.numero === 2).reduce((total, c) => total + numero(c.valor), 0);
  const devolver = redondear(pagado * 0.6);
  await ctx.ventas.desistir(
    desistida.id,
    {
      fecha: hace(5),
      motivo: 'El comprador perdió su empleo y no puede continuar con el pago (demostración)',
      valorDevolver: String(devolver),
      valorRetener: String(redondear(pagado - devolver, 1)),
      medioPagoDevolucion: 'TRANSFERENCIA',
      cuentaDevolucionId: cuentas[1],
      referenciaDevolucion: `DEMO-DEV-${++secuencia}`,
      // RF-COM-04: la comisión pendiente de esta venta se anula junto con el desistimiento.
      anularComision: true,
    },
    gerente,
  );

  // Lotes separados.
  await ctx.lotes.separar(lotes.get('E1')!.id, { nombreInteresado: 'Carolina Beltrán', telefonoInteresado: '3000000099', valor: '2000000', fechaLimite: despues(10), motivo: 'Dejó un abono de separación (demostración)' }, admin);
  await ctx.lotes.separar(lotes.get('E2')!.id, { nombreInteresado: 'Ricardo Salcedo', telefonoInteresado: '3000000098', valor: '1500000', fechaLimite: despues(2) }, admin);

  // Un abono digitado dos veces y anulado por el gerente (queda el recibo con la marca ANULADO).
  const extra = await ctx.abonos.crear({ ventaId: alDia.id, fecha: hace(1), valor: '200000', medioPago: 'EFECTIVO' }, admin);
  await ctx.abonos.anular(extra.id, { motivo: 'Abono digitado dos veces por error (demostración)' }, gerente);
  log('Ventas, abonos con recibo, venta liquidada con recibos históricos, excepciones, desistimiento, separaciones y un abono anulado');

  // ---- Comisiones (las pendientes nacieron solas con cada venta con vendedor) ----
  const comisionDe = (ventaId: string) => ctx.prisma.comision.findUniqueOrThrow({ where: { ventaId } });
  // Una pagada en efectivo y otra por transferencia (cada pago crea su egreso en Finanzas).
  await ctx.comisiones.pagar((await comisionDe(ventaA1.id)).id, { fecha: hace(150), medioPago: 'EFECTIVO', motivoSinSoporte: 'Se pagó en efectivo y el asesor no entregó recibo (demostración)' }, gerente);
  await ctx.comisiones.pagar((await comisionDe(ventaB2.id)).id, { fecha: hace(120), medioPago: 'TRANSFERENCIA', cuentaId: cuentas[0], referencia: `DEMO-COM-${++secuencia}`, motivoSinSoporte: 'Soporte pendiente de escanear (demostración)' }, admin);
  // Una anulada con su motivo.
  await ctx.comisiones.anular((await comisionDe(liquidada.id)).id, { motivo: 'La comisión de esta venta antigua ya se pagó por fuera del sistema (demostración)' }, gerente);
  log('Comisiones: dos pagadas (con su egreso), una anulada, una anulada por desistimiento y las demás pendientes');

  // ---- Finanzas de La Floresta ----
  const categoriasGasto = new Map((await ctx.configuracion.listarCategoriasGasto()).map((c) => [c.nombre, c.id]));
  const categoriasIngreso = new Map((await ctx.configuracion.listarCategoriasIngreso()).map((c) => [c.nombre, c.id]));
  const categoriaGasto = (nombre: string) => categoriasGasto.get(nombre) ?? (() => { throw new Error(`Falta la categoría de gasto ${nombre}`); })();
  const categoriaIngreso = (nombre: string) => categoriasIngreso.get(nombre) ?? (() => { throw new Error(`Falta la categoría de ingreso ${nombre}`); })();

  const egresos: [number, number, string, string, Medio, string, string, string][] = [
    [58, 4_800_000, 'Materiales', 'Cemento y arena para las vías internas', 'TRANSFERENCIA', 'Ferretería Los Andes', '900100001', 'FV-1021'],
    [55, 1_250_000, 'Servicios públicos', 'Energía del campamento (mes anterior)', 'TRANSFERENCIA', 'Empresa de energía', '900100002', 'FV-8841'],
    [52, 780_000, 'Transporte', 'Flete de materiales a la obra', 'EFECTIVO', 'Transportes El Eje', '900100003', 'RC-301'],
    [47, 2_300_000, 'Trámites y legales', 'Honorarios de la abogada por escrituración', 'TRANSFERENCIA', 'Abogada de la empresa', '900100004', 'CC-77'],
    [44, 3_600_000, 'Materiales', 'Tubería y accesorios para el acueducto', 'CONSIGNACION', 'Distribuidora de Tubería Quindío', '900100005', 'FV-5532'],
    [40, 950_000, 'Publicidad', 'Pauta en redes y vallas de La Floresta', 'TRANSFERENCIA', 'Agencia de Publicidad Eje', '900100006', 'FV-310'],
    [36, 1_250_000, 'Servicios públicos', 'Energía del campamento', 'TRANSFERENCIA', 'Empresa de energía', '900100002', 'FV-9120'],
    [33, 5_400_000, 'Materiales', 'Gravilla y base para la vía principal', 'TRANSFERENCIA', 'Triturados del Quindío', '900100007', 'FV-2210'],
    [29, 420_000, 'Otros', 'Papelería y elementos de oficina', 'EFECTIVO', 'Papelería Central', '900100008', 'RC-118'],
    [25, 1_800_000, 'Trámites y legales', 'Licencia y permisos del predio', 'CONSIGNACION', 'Curaduría Urbana', '900100009', 'RC-4402'],
    [21, 640_000, 'Transporte', 'Transporte de personal a la obra', 'EFECTIVO', 'Transportes El Eje', '900100003', 'RC-322'],
    [17, 2_950_000, 'Materiales', 'Postes y cerramiento del lote de entrada', 'TRANSFERENCIA', 'Ferretería Los Andes', '900100001', 'FV-1190'],
    [12, 1_250_000, 'Servicios públicos', 'Energía del campamento', 'TRANSFERENCIA', 'Empresa de energía', '900100002', 'FV-9544'],
    [8, 880_000, 'Publicidad', 'Impresión de planos y volantes', 'EFECTIVO', 'Litografía La Esquina', '900100010', 'RC-77'],
    [4, 1_600_000, 'Otros', 'Mantenimiento de la caseta de ventas', 'EFECTIVO', 'Maestro de obra', '900100011', 'RC-12'],
  ];
  for (const [dias, valor, categoria, descripcion, medio, tercero, documento, factura] of egresos) {
    const pago = datosPago(medio);
    await ctx.finanzas.crear(
      {
        tipo: 'GASTO',
        fecha: hace(dias),
        valor: String(valor),
        descripcion,
        proyectoId: floresta.id,
        categoriaId: categoriaGasto(categoria),
        medioPago: medio,
        cuentaId: 'cuentaDestinoId' in pago ? pago.cuentaDestinoId : undefined,
        referencia: 'referencia' in pago ? pago.referencia : undefined,
        terceroNombre: tercero,
        terceroDocumento: documento,
        numeroDocumento: factura,
        motivoSinSoporte: 'Soporte pendiente de escanear (demostración)',
      },
      admin,
    );
  }
  for (const [dias, valor, descripcion] of [[30, 1_200_000, 'Arriendo de un lote para publicidad exterior'], [14, 850_000, 'Venta de material sobrante de la obra']] as const) {
    await ctx.finanzas.crear(
      { tipo: 'INGRESO', fecha: hace(dias), valor: String(valor), descripcion, proyectoId: floresta.id, categoriaId: categoriaIngreso('Otros servicios'), medioPago: 'EFECTIVO' },
      admin,
    );
  }
  log(`Finanzas de La Floresta: ${egresos.length} egresos y 2 ingresos`);

  // ---- Remodelación (CC-01) ----
  const remodelacion = await ctx.proyectos.crear({ nombre: 'Remodelación Casa Demo', tipo: 'REMODELACION', ubicacion: 'Armenia (demostración)', municipio: 'Armenia', areaTotal: '1' }, gerente);
  await ctx.finanzas.crear(
    { tipo: 'INGRESO', fecha: hace(35), valor: '12000000', descripcion: 'Anticipo de la remodelación de la cocina y los baños', proyectoId: remodelacion.id, categoriaId: categoriaIngreso('Anticipo de remodelación'), medioPago: 'EFECTIVO', terceroNombre: nombreInventado(3), terceroDocumento: documentoInventado(3), numeroDocumento: 'RC-2001' },
    admin,
  );
  for (const [dias, valor, categoria, descripcion] of [[28, 3_200_000, 'Materiales', 'Cerámica, sanitarios y grifería'], [20, 450_000, 'Transporte', 'Transporte de materiales'], [9, 800_000, 'Otros', 'Mano de obra de enchape']] as const) {
    await ctx.finanzas.crear(
      { tipo: 'GASTO', fecha: hace(dias), valor: String(valor), descripcion, proyectoId: remodelacion.id, categoriaId: categoriaGasto(categoria), medioPago: 'EFECTIVO', motivoSinSoporte: 'Soporte pendiente de escanear (demostración)' },
      admin,
    );
  }
  log('Proyecto de remodelación con su anticipo y sus egresos');

  // ---- Maquinaria (CC-02) ----
  const maquinaria = await ctx.proyectos.crear({ nombre: 'Maquinaria Demo', tipo: 'MAQUINARIA', ubicacion: 'Patio de maquinaria (demostración)', municipio: 'Armenia', areaTotal: '1' }, gerente);
  const tipos = new Map((await ctx.configuracion.listarTiposEquipo()).map((t) => [t.nombre, t.id]));
  const tipo = (nombre: string) => tipos.get(nombre) ?? (() => { throw new Error(`Falta el tipo de equipo ${nombre}`); })();
  const excavadora = await ctx.equipos.crear({ proyectoId: maquinaria.id, nombre: 'Excavadora 320D', tipoEquipoId: tipo('Excavadora'), marca: 'Marca A', modelo: '320D', anio: 2019, placaSerie: 'DEMO-EXC-01' }, admin);
  const retro = await ctx.equipos.crear({ proyectoId: maquinaria.id, nombre: 'Retroexcavadora 416', tipoEquipoId: tipo('Retroexcavadora'), marca: 'Marca B', modelo: '416', anio: 2017, placaSerie: 'DEMO-RET-01', estado: 'EN_MANTENIMIENTO' }, admin);
  const volqueta = await ctx.equipos.crear({ proyectoId: maquinaria.id, nombre: 'Volqueta 1', tipoEquipoId: tipo('Volqueta'), marca: 'Marca C', modelo: 'V-14', anio: 2020, placaSerie: 'DEMO-VOL-01' }, admin);
  const antigua = await ctx.equipos.crear({ proyectoId: maquinaria.id, nombre: 'Volqueta antigua', tipoEquipoId: tipo('Volqueta'), marca: 'Marca C', modelo: 'V-10', anio: 2005, placaSerie: 'DEMO-VOL-00' }, admin);
  await ctx.equipos.darDeBaja(antigua.id, { motivo: 'Vendida como chatarra tras un siniestro (demostración)' }, gerente);

  const alquileres: [string, number, number, number, number, string][] = [
    [excavadora.id, 4_500_000, 25, 11, 9, 'Constructora Los Cedros SAS|900123456'],
    [volqueta.id, 2_400_000, 20, 6, 5, `${nombreInventado(6)}|${documentoInventado(6)}`],
  ];
  for (const [equipoId, valor, desde, hasta, haceDias, cliente] of alquileres) {
    const [nombre, documento] = cliente.split('|');
    const pago = datosPago('TRANSFERENCIA');
    await ctx.finanzas.crear(
      {
        tipo: 'INGRESO',
        fecha: hace(haceDias),
        valor: String(valor),
        descripcion: 'Alquiler de equipo',
        proyectoId: maquinaria.id,
        categoriaId: categoriaIngreso('Otros servicios'),
        medioPago: 'TRANSFERENCIA',
        cuentaId: 'cuentaDestinoId' in pago ? pago.cuentaDestinoId : undefined,
        referencia: 'referencia' in pago ? pago.referencia : undefined,
        equipoId,
        terceroNombre: nombre,
        terceroDocumento: documento,
        periodoDesde: hace(desde),
        periodoHasta: hace(hasta),
        motivoSinSoporte: 'Pago por transferencia: soporte en el extracto bancario (demostración)',
      },
      admin,
    );
  }
  const gastosMaquinaria: [string | null, number, string, string][] = [
    [excavadora.id, 600_000, 'Combustible', 'Combustible de la excavadora'],
    [volqueta.id, 350_000, 'Combustible', 'Combustible de la volqueta'],
    [retro.id, 1_800_000, 'Mantenimiento de equipos', 'Mantenimiento mayor de la retroexcavadora'],
    [retro.id, 950_000, 'Repuestos', 'Repuestos hidráulicos de la retroexcavadora'],
    [excavadora.id, 1_200_000, 'Operario', 'Pago del operario de la excavadora'],
    [null, 700_000, 'Otros', 'Seguro de toda la flota'],
  ];
  for (const [indice, [equipoId, valor, categoria, descripcion]] of gastosMaquinaria.entries()) {
    await ctx.finanzas.crear(
      {
        tipo: 'GASTO',
        fecha: hace(18 - indice * 2),
        valor: String(valor),
        descripcion,
        proyectoId: maquinaria.id,
        categoriaId: categoriaGasto(categoria),
        medioPago: 'EFECTIVO',
        ...(equipoId ? { equipoId } : { flota: 'true' }),
        motivoSinSoporte: 'Soporte pendiente de escanear (demostración)',
      },
      admin,
    );
  }
  log('Proyecto de maquinaria con 4 equipos (uno en mantenimiento y uno dado de baja), alquileres y gastos por equipo');

  // ---- Nómina ----
  const trabajadores = [];
  const cargos = ['Maestro de obra', 'Oficial de construcción', 'Ayudante de obra', 'Ayudante de obra', 'Ayudante de obra', 'Celador'];
  for (const [i, cargo] of cargos.entries()) {
    trabajadores.push(
      await ctx.trabajadores.crear({ nombre: nombreInventado(100 + i), documento: documentoInventado(500 + i), cargo, salarioBase: i === 0 ? '1100000' : '780000', fechaIngreso: hace(200 + i * 10), telefono: telefonoInventado(500 + i) }, admin),
    );
  }
  for (const [i, trabajador] of trabajadores.slice(0, 4).entries()) {
    await ctx.nomina.crearPago({ trabajadorId: trabajador.id, periodoInicio: hace(14), periodoFin: hace(8), fechaPago: hace(7), medioPago: 'EFECTIVO', novedades: i === 1 ? [{ tipo: 'HORAS_EXTRA', valor: '85000', descripcion: 'Horas extra del fin de semana' }] : undefined }, admin);
    await ctx.nomina.crearPago({ trabajadorId: trabajador.id, periodoInicio: hace(7), periodoFin: hace(1), fechaPago: hoy(), medioPago: 'EFECTIVO', novedades: i === 2 ? [{ tipo: 'DESCUENTO', valor: '40000', descripcion: 'Descuento por anticipo' }] : undefined }, admin);
  }
  log(`${trabajadores.length} trabajadores y 8 pagos de nómina`);

  // ---- Cierres de caja (al final: un día cerrado no admite registros nuevos) ----
  const primero = await ctx.cierres.crear({ tipo: 'DIARIO', desde: hace(3), efectivoInicial: '500000' }, admin);
  await ctx.cierres.cerrar(primero.id, { efectivoContado: primero.resumen.efectivo.esperado }, admin);
  await ctx.cierres.aprobar(primero.id, { observacion: 'Conforme (demostración)' }, gerente);

  const segundo = await ctx.cierres.crear({ tipo: 'DIARIO' }, admin);
  const esperadoSegundo = Number(segundo.resumen.efectivo.esperado);
  await ctx.cierres.cerrar(segundo.id, { efectivoContado: String(esperadoSegundo + 5000), explicacionDiferencia: 'Sobraron 5.000 pesos: un cliente no recibió el cambio (demostración)' }, admin);
  await ctx.cierres.aprobar(segundo.id, { observacion: 'Diferencia explicada, aprobado (demostración)' }, gerente);

  const tercero = await ctx.cierres.crear({ tipo: 'DIARIO' }, admin);
  await ctx.cierres.cerrar(tercero.id, { efectivoContado: tercero.resumen.efectivo.esperado }, admin);
  log('3 cierres de caja: dos aprobados (uno con diferencia explicada) y uno cerrado pendiente de aprobación');
}
