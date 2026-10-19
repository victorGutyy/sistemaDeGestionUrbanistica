import type { UsuarioAutenticado } from '../../src/auth/usuario-autenticado.js';
import type { Contexto } from './contexto.js';
import { hace, hoy, menor } from './fechas.js';
import { correoInventado, documentoInventado, generador, nombreInventado, telefonoInventado } from './nombres.js';

// Volumen realista para medir el rendimiento (RNF-REN-01..04): 10 proyectos, 1.000 lotes, 400 clientes, unas 800 ventas
// y cerca de 5.000 abonos, con egresos y nómina. Todo con los servicios reales y una "casualidad" con semilla fija:
// cada corrida produce los mismos datos.

export const META_VOLUMEN = { proyectos: 10, manzanasPorProyecto: 4, lotesPorManzana: 25, clientes: 400, ventas: 800, egresos: 600, trabajadores: 20, semanasDeNomina: 10 };

const aISO = (fecha: Date) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
const redondear = (valor: number, a: number) => Math.round(valor / a) * a;

function avance(texto: string, hecho: number, total: number, desde: number) {
  const segundos = Math.round((Date.now() - desde) / 1000);
  console.log(`  · ${texto}: ${hecho}/${total} (${segundos} s)`);
}

export async function cargarVolumen(ctx: Contexto, { gerente, admin }: { gerente: UsuarioAutenticado; admin: UsuarioAutenticado }): Promise<void> {
  const azar = generador(20261019);
  const entre = (a: number, b: number) => a + Math.floor(azar() * (b - a + 1));
  const inicio = Date.now();

  // ---- Cuentas de recaudo activas ----
  const cuentasBase = await ctx.prisma.cuentaBancaria.findMany({ orderBy: { banco: 'asc' } });
  const cuentas: string[] = [];
  for (const [i, cuenta] of cuentasBase.entries()) {
    await ctx.configuracion.actualizarCuenta(cuenta.id, { numero: `000-00000${i}-01`, alias: `${cuenta.banco} (volumen)`, activa: true }, gerente);
    cuentas.push(cuenta.id);
  }
  let secuencia = 0;
  const pago = () => {
    secuencia += 1;
    const tipo = secuencia % 3;
    return tipo === 0
      ? { medioPago: 'EFECTIVO' as const }
      : { medioPago: (tipo === 1 ? 'TRANSFERENCIA' : 'CONSIGNACION') as 'TRANSFERENCIA' | 'CONSIGNACION', cuentaDestinoId: cuentas[secuencia % cuentas.length], referencia: `VOL-${String(secuencia).padStart(6, '0')}` };
  };

  // ---- Proyectos, manzanas y lotes ----
  const lotes: Awaited<ReturnType<Contexto['lotes']['crear']>>[] = [];
  const proyectoIds: string[] = [];
  for (let p = 1; p <= META_VOLUMEN.proyectos; p++) {
    const proyecto = await ctx.proyectos.crear(
      { nombre: `Proyecto de volumen ${String(p).padStart(2, '0')}`, ubicacion: 'Quindío (datos de prueba)', municipio: 'Armenia', areaTotal: '15000', valorCompra: '900000000', fechaCompra: hace(900) },
      gerente,
    );
    proyectoIds.push(proyecto.id);
    for (const [m, letra] of 'ABCD'.slice(0, META_VOLUMEN.manzanasPorProyecto).split('').entries()) {
      const manzana = await ctx.proyectos.crearManzana(proyecto.id, { nombre: letra }, gerente);
      for (let n = 1; n <= META_VOLUMEN.lotesPorManzana; n++) {
        const area = 90 + ((p * 31 + m * 17 + n * 7) % 61);
        const valorPorM2 = 400_000 + ((p + m) % 4) * 30_000;
        lotes.push(
          await ctx.lotes.crear(
            { proyectoId: proyecto.id, manzanaId: manzana.id, numero: String(n), area: String(area), valorPorM2: String(valorPorM2), valorVenta: String(redondear(area * valorPorM2, 100_000)), linderos: 'Datos de prueba de volumen' },
            gerente,
          ),
        );
      }
    }
  }
  avance('Lotes creados', lotes.length, lotes.length, inicio);

  // ---- Clientes ----
  const clientes: Awaited<ReturnType<Contexto['clientes']['crear']>>[] = [];
  for (let i = 1; i <= META_VOLUMEN.clientes; i++) {
    clientes.push(
      await ctx.clientes.crear(
        { nombre: nombreInventado(i), documento: documentoInventado(i), tipoDocumento: 'CC', telefono: telefonoInventado(i), email: correoInventado(i), direccion: `Calle ${i % 80} # ${i % 40}-${i % 90}, Armenia`, autorizaDatos: true },
        admin,
      ),
    );
  }
  avance('Clientes creados', clientes.length, clientes.length, inicio);

  // ---- Ventas y abonos ----
  let abonos = 0;
  const ayer = hace(1);
  for (let v = 0; v < META_VOLUMEN.ventas; v++) {
    const lote = lotes[v];
    const cliente = clientes[v % clientes.length];
    const contado = azar() < 0.15;
    const diasAtras = entre(30, 540);
    const venta = await ctx.ventas.crear(
      {
        loteId: lote.id,
        clienteId: cliente.id,
        formaPago: contado ? 'CONTADO' : 'FINANCIADO',
        valorTotal: lote.valorVenta.toString(),
        ...(contado ? {} : { numeroCuotas: 12, cuotaInicialPorcentaje: '30' }),
        fechaVenta: hace(diasAtras),
        cuotaInicialRecibida: true,
        ...pago(),
      },
      admin,
    );
    abonos += 1;

    if (!contado) {
      // La mayoría paga todo lo que ya venció; algunos se atrasan (quedan en mora).
      const vencidas = venta.cuotas.filter((c) => c.numero > 0 && aISO(c.fechaVencimiento) <= ayer);
      const proporcion = azar() < 0.8 ? 1 : azar() * 0.7;
      for (const cuota of vencidas.slice(0, Math.floor(vencidas.length * proporcion))) {
        await ctx.abonos.crear({ ventaId: venta.id, fecha: menor(aISO(cuota.fechaVencimiento), ayer), valor: cuota.valor.toString(), ...pago() }, admin);
        abonos += 1;
      }
    }
    if ((v + 1) % 100 === 0) avance(`Ventas (${abonos} abonos con recibo)`, v + 1, META_VOLUMEN.ventas, inicio);
  }

  // ---- Egresos ----
  const categorias = (await ctx.configuracion.listarCategoriasGasto()).filter((c) => !c.esSistema && !c.soloMaquinaria);
  for (let i = 0; i < META_VOLUMEN.egresos; i++) {
    const p = pago();
    await ctx.finanzas.crear(
      {
        tipo: 'GASTO',
        fecha: hace(entre(1, 300)),
        valor: String(redondear(entre(80_000, 6_000_000), 1000)),
        descripcion: `Egreso de prueba ${i + 1}`,
        proyectoId: proyectoIds[i % proyectoIds.length],
        categoriaId: categorias[i % categorias.length].id,
        medioPago: p.medioPago,
        cuentaId: 'cuentaDestinoId' in p ? p.cuentaDestinoId : undefined,
        referencia: 'referencia' in p ? p.referencia : undefined,
        motivoSinSoporte: 'Dato de prueba de volumen',
      },
      admin,
    );
  }
  avance('Egresos', META_VOLUMEN.egresos, META_VOLUMEN.egresos, inicio);

  // ---- Nómina ----
  let pagosNomina = 0;
  for (let t = 0; t < META_VOLUMEN.trabajadores; t++) {
    const trabajador = await ctx.trabajadores.crear({ nombre: nombreInventado(300 + t), documento: documentoInventado(8000 + t), cargo: 'Ayudante de obra', salarioBase: '780000', fechaIngreso: hace(400), telefono: telefonoInventado(8000 + t) }, admin);
    for (let semana = 0; semana < META_VOLUMEN.semanasDeNomina; semana++) {
      await ctx.nomina.crearPago({ trabajadorId: trabajador.id, periodoInicio: hace(7 * (semana + 1)), periodoFin: hace(7 * semana + 1), fechaPago: hace(7 * semana), medioPago: 'EFECTIVO' }, admin);
      pagosNomina += 1;
    }
  }
  avance('Pagos de nómina', pagosNomina, pagosNomina, inicio);

  console.log(`  · Resumen: ${lotes.length} lotes, ${clientes.length} clientes, ${META_VOLUMEN.ventas} ventas, ${abonos} abonos, ${META_VOLUMEN.egresos} egresos, ${pagosNomina} pagos de nómina (hasta ${hoy()})`);
}
