import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { generarPdfEstadoCuenta, type EmpresaPdfEstadoCuenta } from './generar-pdf-estado-cuenta.js';
import { construirEstadoCuentaCliente, type ClienteCrudo, type VentaCruda } from './estado-cuenta-cliente.js';

const D = (valor: number | string) => new Prisma.Decimal(valor);
const HOY = new Date(2026, 9, 18); // 18/10/2026
const dia = (mes: number, diaDelMes: number) => new Date(2026, mes - 1, diaDelMes);
const OPCIONES = { hoy: HOY, mora: { tasaMoraMensual: D(2), diasGracia: 0 }, diasAlertaAmarilla: 5 };

type CuotaCruda = VentaCruda['cuotas'][number];
const cuota = (numero: number, vence: Date, valor: number, pagado = 0): CuotaCruda => ({
  numero,
  fechaVencimiento: vence,
  valor: D(valor),
  estado: pagado >= valor ? 'PAGADA' : pagado > 0 ? 'PARCIAL' : 'PENDIENTE',
  aplicaciones: pagado > 0 ? [{ valor: D(pagado) }] : [],
});
const abono = (id: string, fecha: Date, valor: number, estado: 'ACTIVO' | 'ANULADO' = 'ACTIVO'): VentaCruda['abonos'][number] => ({
  id,
  fecha,
  valor: D(valor),
  medioPago: 'EFECTIVO',
  estado,
  recibo: { numeroTexto: `RC-${id}` },
  cuentaDestino: null,
});

function venta(id: string, numeroLote: string, extra: Partial<VentaCruda> = {}): VentaCruda {
  return {
    id,
    estado: 'ACTIVA',
    formaPago: 'FINANCIADO',
    fechaVenta: dia(5, 10),
    valorTotal: D(4_000_000),
    cuotaInicial: D(1_000_000),
    lote: { id: `lote-${id}`, numero: numeroLote, proyecto: { nombre: 'Proyecto de Prueba' }, manzana: { nombre: 'A' } },
    cuotas: [],
    abonos: [],
    ...extra,
  };
}

function cliente(ventas: VentaCruda[]): ClienteCrudo {
  return {
    id: 'cliente-1',
    nombre: 'Cliente de Prueba Uno',
    documento: '1000000001',
    tipoDocumento: 'CC',
    telefono: '3000000001',
    email: 'cliente1@ejemplo.test',
    direccion: 'Calle 1 # 2-3',
    autorizaDatos: true,
    fechaAutorizacion: dia(5, 1),
    autorizacionRegistradaPor: { nombre: 'Gerente de Prueba' },
    ventas,
  };
}

// Venta A: cuota inicial pagada, cuota 1 vencida hace 30 días con un abono parcial, cuota 2 por vencer.
const VENTA_EN_MORA = venta('a', '1', {
  cuotas: [cuota(0, dia(5, 10), 1_000_000, 1_000_000), cuota(1, dia(9, 18), 1_500_000, 500_000), cuota(2, dia(12, 18), 1_500_000)],
  abonos: [abono('1', dia(5, 10), 1_000_000), abono('2', dia(9, 25), 500_000), abono('3', dia(9, 26), 200_000, 'ANULADO')],
});
// Venta B: al día.
const VENTA_AL_DIA = venta('b', '2', {
  valorTotal: D(2_000_000),
  cuotaInicial: D(2_000_000),
  formaPago: 'CONTADO',
  cuotas: [cuota(0, dia(6, 1), 2_000_000, 2_000_000)],
  abonos: [abono('4', dia(6, 1), 2_000_000)],
});

describe('construirEstadoCuentaCliente', () => {
  it('arma el resumen con total vendido, pagado, saldo, vencido, mora y semáforo (los abonos anulados no cuentan)', () => {
    const estado = construirEstadoCuentaCliente(cliente([VENTA_EN_MORA, VENTA_AL_DIA]), OPCIONES);
    expect(estado.resumen.ventasVigentes).toBe(2);
    expect(estado.resumen.totalVendido.toString()).toBe('6000000');
    expect(estado.resumen.totalPagado.toString()).toBe('3500000');
    expect(estado.resumen.saldo.toString()).toBe('2500000');
    expect(estado.resumen.semaforo).toBe('ROJO');
    expect(estado.resumen.cuotasVencidas).toBe(1);
    expect(estado.resumen.saldoVencido.toString()).toBe('1000000');
    // Saldo vencido de $1.000.000 durante 30 días a 2 % mensual.
    expect(estado.resumen.interesMora.toString()).toBe('20000');
    expect(estado.resumen.saldoPorVencer.toString()).toBe('1500000');
    expect(estado.moraConfigurada).toBe(true);
  });

  it('cada venta trae su saldo, su cartera y sus cuotas con lo pagado, el saldo y los días de atraso', () => {
    const [enMora, alDia] = construirEstadoCuentaCliente(cliente([VENTA_EN_MORA, VENTA_AL_DIA]), OPCIONES).ventas;
    expect(enMora).toMatchObject({ vigente: true, lote: { numero: '1', proyecto: 'Proyecto de Prueba', manzana: 'A' } });
    expect(enMora.pagado.toString()).toBe('1500000');
    expect(enMora.saldo?.toString()).toBe('2500000');
    expect(enMora.cartera).toMatchObject({ semaforo: 'ROJO', cuotasVencidas: 1, cuotasPendientes: 2 });
    expect(enMora.cartera?.proximaCuota?.numero).toBe(1);

    const cuota1 = enMora.cuotas[1];
    expect(cuota1).toMatchObject({ numero: 1, vencida: true, diasAtraso: 30, estado: 'PARCIAL' });
    expect(cuota1.pagado.toString()).toBe('500000');
    expect(cuota1.saldo.toString()).toBe('1000000');
    expect(cuota1.interesMora.toString()).toBe('20000');

    expect(alDia.cartera).toMatchObject({ semaforo: 'VERDE', cuotasVencidas: 0, cuotasPendientes: 0, proximaCuota: null });
    expect(alDia.saldo?.toString()).toBe('0');
  });

  it('los abonos se listan por fecha y los anulados quedan visibles pero no suman', () => {
    const [enMora] = construirEstadoCuentaCliente(cliente([VENTA_EN_MORA]), OPCIONES).ventas;
    expect(enMora.abonos.map((a) => [a.recibo?.numeroTexto, a.estado])).toEqual([
      ['RC-1', 'ACTIVO'],
      ['RC-2', 'ACTIVO'],
      ['RC-3', 'ANULADO'],
    ]);
    expect(enMora.pagado.toString()).toBe('1500000');
  });

  it('una venta desistida se lista pero no cuenta en los totales ni tiene saldo', () => {
    const desistida = venta('c', '3', { estado: 'DESISTIDA', cuotas: [cuota(1, dia(9, 1), 1_000_000)], abonos: [abono('5', dia(5, 11), 300_000)] });
    const estado = construirEstadoCuentaCliente(cliente([VENTA_AL_DIA, desistida]), OPCIONES);
    expect(estado.ventas).toHaveLength(2);
    expect(estado.ventas[1]).toMatchObject({ vigente: false, saldo: null, cartera: null });
    expect(estado.resumen.ventasVigentes).toBe(1);
    expect(estado.resumen.totalVendido.toString()).toBe('2000000');
    expect(estado.resumen.saldoVencido.toString()).toBe('0');
    expect(estado.resumen.semaforo).toBe('VERDE');
  });

  it('sin tasa de mora definida el interés es cero y lo dice, aunque haya cuotas vencidas', () => {
    const estado = construirEstadoCuentaCliente(cliente([VENTA_EN_MORA]), { ...OPCIONES, mora: { tasaMoraMensual: null, diasGracia: 0 } });
    expect(estado.moraConfigurada).toBe(false);
    expect(estado.resumen.semaforo).toBe('ROJO');
    expect(estado.resumen.interesMora.toString()).toBe('0');
  });

  it('un cliente sin ventas tiene el resumen en cero y semáforo verde', () => {
    const estado = construirEstadoCuentaCliente(cliente([]), OPCIONES);
    expect(estado.ventas).toEqual([]);
    expect(estado.resumen).toMatchObject({ ventasVigentes: 0, semaforo: 'VERDE' });
    expect(estado.resumen.saldo.toString()).toBe('0');
  });
});

describe('generarPdfEstadoCuenta (RF-REP-03)', () => {
  const EMPRESA: EmpresaPdfEstadoCuenta = {
    nombreComercial: 'Empresa de prueba',
    razonSocial: 'Empresa de prueba SAS',
    nit: '900000000',
    direccion: 'Calle 1 # 2-3',
    telefonos: null,
    correo: 'contacto@ejemplo.test',
    colorPrimario: '#2563eb',
  };
  const paginas = (pdf: Buffer) => Number(/\/Count (\d+)/.exec(pdf.toString('latin1'))?.[1]);

  it('genera un PDF válido de una hoja para un cliente con pocas ventas', async () => {
    const pdf = await generarPdfEstadoCuenta(construirEstadoCuentaCliente(cliente([VENTA_EN_MORA, VENTA_AL_DIA]), OPCIONES), { empresa: EMPRESA });
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
    expect(paginas(pdf)).toBe(1);
  });

  it('un cliente con muchas ventas sigue en varias hojas, y uno sin ventas también se genera', async () => {
    const muchas = Array.from({ length: 12 }, (_, indice) => venta(`v${indice}`, String(indice + 10), { cuotas: VENTA_EN_MORA.cuotas, abonos: VENTA_EN_MORA.abonos }));
    const largo = await generarPdfEstadoCuenta(construirEstadoCuentaCliente(cliente(muchas), OPCIONES), { empresa: EMPRESA });
    expect(paginas(largo)).toBeGreaterThan(1);
    const vacio = await generarPdfEstadoCuenta(construirEstadoCuentaCliente(cliente([]), OPCIONES), { empresa: EMPRESA });
    expect(vacio.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
