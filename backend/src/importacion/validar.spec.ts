import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoLote, EstadoProyecto, MedioPago, TipoProyecto } from '../generated/prisma/enums.js';
import type { Celda } from './celdas.js';
import type { FilaLeida, LibroLeido } from './leer-libro.js';
import type { ClaveHoja } from './plantilla-definicion.js';
import { validarImportacion, type ContextoValidacion } from './validar.js';

type Filas = Partial<Record<ClaveHoja, Record<string, Celda>[]>>;

// Arma un libro ya leído a partir de filas de ejemplo (la fila 1 es el encabezado: los datos empiezan en la 2).
function libro(filas: Filas, problemas: LibroLeido['problemas'] = []): LibroLeido {
  const claves: ClaveHoja[] = ['proyectos', 'lotes', 'clientes', 'ventas', 'cuotas', 'abonos'];
  const hojas = {} as LibroLeido['hojas'];
  for (const clave of claves) {
    const datos = filas[clave] ?? [];
    hojas[clave] = {
      clave,
      presente: datos.length > 0,
      filas: datos.map((celdas, indice): FilaLeida => ({ fila: indice + 2, celdas })),
    };
  }
  return { hojas, problemas };
}

const TODOS_LOS_MEDIOS = Object.values(MedioPago);

function contextoVacio(cambios: Partial<ContextoValidacion> = {}): ContextoValidacion {
  return {
    hoy: '2026-10-18',
    proyectos: [],
    clientes: [],
    vendedores: [],
    cuentas: [{ id: 'cuenta-1', alias: 'Bancolombia ahorros', activa: true }],
    mediosActivos: TODOS_LOS_MEDIOS,
    referencias: [],
    cierresBloqueantes: [],
    ...cambios,
  };
}

const PROYECTO = { nombre: 'La Floresta', areaTotal: 25000 };
const LOTE = { proyecto: 'La Floresta', manzana: 'A', numero: '1', area: 90, valorVenta: 45_000_000 };
const CLIENTE = { documento: '1000000001', nombre: 'Cliente de Prueba Uno' };
const ID_LOTE = { proyecto: 'La Floresta', manzana: 'A', numero: '1' };
const VENTA_FINANCIADA = {
  ...ID_LOTE,
  documentoCliente: '1000000001',
  fechaVenta: '10/05/2026',
  formaPago: 'Financiado',
  valorTotal: 45_000_000,
  cuotaInicial: 13_500_000,
  numeroCuotas: 3,
};
const ABONO_CUOTA_INICIAL = { ...ID_LOTE, fecha: '10/05/2026', valor: 13_500_000, medioPago: 'Efectivo' };

const base = (extra: Filas = {}): Filas => ({
  proyectos: [PROYECTO],
  lotes: [LOTE],
  clientes: [CLIENTE],
  ventas: [VENTA_FINANCIADA],
  abonos: [ABONO_CUOTA_INICIAL],
  ...extra,
});

const mensajes = (problemas: { mensaje: string }[]) => problemas.map((problema) => problema.mensaje);

describe('validarImportacion · caso completo', () => {
  it('una carga correcta no tiene errores y arma el plan con la cuota inicial y las cuotas', () => {
    const resultado = validarImportacion(libro(base()), contextoVacio());
    expect(resultado.errores).toEqual([]);

    expect(resultado.plan.proyectos).toHaveLength(1);
    expect(resultado.plan.manzanas).toEqual([{ proyecto: 'La Floresta', proyectoId: undefined, nombre: 'A' }]);
    expect(resultado.plan.lotes).toHaveLength(1);
    expect(resultado.plan.clientes).toHaveLength(1);

    const venta = resultado.plan.ventas[0];
    expect(venta.cuotas.map((cuota) => [cuota.numero, cuota.fechaVencimiento, cuota.valor.toString()])).toEqual([
      [0, '2026-05-10', '13500000'],
      [1, '2026-06-10', '10500000'],
      [2, '2026-07-10', '10500000'],
      [3, '2026-08-10', '10500000'],
    ]);
    expect(venta.abonos).toHaveLength(1);
    expect(resultado.resumen).toMatchObject({ ventas: 1, cuotas: 4, abonos: 1, recibosHistoricos: 1, valorVentas: '45000000', totalAbonado: '13500000', totalSaldo: '31500000' });
  });

  it('el plan generado cuadra: las cuotas suman el valor total y la última absorbe el residuo', () => {
    const resultado = validarImportacion(
      libro(base({ ventas: [{ ...VENTA_FINANCIADA, valorTotal: 10_000_000, cuotaInicial: 1_000_001, numeroCuotas: 7 }], abonos: [] })),
      contextoVacio(),
    );
    expect(resultado.errores).toEqual([]);
    const suma = resultado.plan.ventas[0].cuotas.reduce((total, cuota) => total.plus(cuota.valor), new Prisma.Decimal(0));
    expect(suma.toString()).toBe('10000000');
  });

  it('el reporte de conciliación compara el saldo del sistema con el del Excel', () => {
    const abonos = [ABONO_CUOTA_INICIAL, { ...ID_LOTE, fecha: '10/06/2026', valor: 10_500_000, medioPago: 'Efectivo' }];
    const coincide = validarImportacion(libro(base({ ventas: [{ ...VENTA_FINANCIADA, saldoSegunExcel: 21_000_000 }], abonos })), contextoVacio());
    expect(coincide.errores).toEqual([]);
    expect(coincide.conciliacion[0]).toMatchObject({ abonado: '24000000', saldo: '21000000', saldoSegunExcel: '21000000', diferencia: '0', estado: 'COINCIDE', cuotasPagadas: 2, cuotasTotales: 4 });

    const difiere = validarImportacion(libro(base({ ventas: [{ ...VENTA_FINANCIADA, saldoSegunExcel: 20_000_000 }], abonos })), contextoVacio());
    expect(difiere.errores).toEqual([]);
    expect(difiere.conciliacion[0]).toMatchObject({ diferencia: '1000000', estado: 'DIFERENCIA' });
    expect(difiere.resumen.conDiferencia).toBe(1);
    expect(mensajes(difiere.avisos).join(' ')).toMatch(/no coincide con el del Excel/);

    const sinDato = validarImportacion(libro(base({ abonos })), contextoVacio());
    expect(sinDato.conciliacion[0]).toMatchObject({ saldoSegunExcel: null, diferencia: null, estado: 'SIN_DATO' });
  });
});

describe('validarImportacion · aplicación de los abonos', () => {
  it('los abonos se aplican por fecha aunque estén desordenados en la hoja', () => {
    const abonos = [
      { ...ID_LOTE, fecha: '10/06/2026', valor: 10_500_000, medioPago: 'Efectivo' },
      { ...ID_LOTE, fecha: '10/05/2026', valor: 13_500_000, medioPago: 'Efectivo' },
    ];
    const resultado = validarImportacion(libro(base({ abonos })), contextoVacio());
    expect(resultado.errores).toEqual([]);
    expect(resultado.plan.ventas[0].abonos.map((abono) => abono.fecha)).toEqual(['2026-05-10', '2026-06-10']);
    expect(resultado.conciliacion[0].cuotasPagadas).toBe(2);
  });

  it('un abono parcial deja la cuota sin pagar y el saldo cuadra', () => {
    const resultado = validarImportacion(libro(base({ abonos: [{ ...ABONO_CUOTA_INICIAL, valor: 5_000_000 }] })), contextoVacio());
    expect(resultado.errores).toEqual([]);
    expect(resultado.conciliacion[0]).toMatchObject({ abonado: '5000000', saldo: '40000000', cuotasPagadas: 0 });
  });

  it('un abono que supera el saldo pendiente es un error', () => {
    const resultado = validarImportacion(libro(base({ abonos: [{ ...ABONO_CUOTA_INICIAL, valor: 46_000_000 }] })), contextoVacio());
    expect(mensajes(resultado.errores).join(' ')).toMatch(/supera el saldo pendiente/);
    expect(resultado.errores[0]).toMatchObject({ hoja: 'Abonos', fila: 2 });
  });

  it('la venta de contado tiene una sola cuota por el valor total', () => {
    const contado = { ...ID_LOTE, documentoCliente: '1000000001', fechaVenta: '10/05/2026', formaPago: 'Contado', valorTotal: 45_000_000 };
    const resultado = validarImportacion(libro(base({ ventas: [contado], abonos: [{ ...ABONO_CUOTA_INICIAL, valor: 45_000_000 }] })), contextoVacio());
    expect(resultado.errores).toEqual([]);
    expect(resultado.plan.ventas[0].cuotas.map((cuota) => [cuota.numero, cuota.valor.toString()])).toEqual([[0, '45000000']]);
    expect(resultado.conciliacion[0]).toMatchObject({ saldo: '0', cuotasPagadas: 1 });
  });

  it('contado con una cuota inicial distinta al valor total es un error', () => {
    const contado = { ...ID_LOTE, documentoCliente: '1000000001', fechaVenta: '10/05/2026', formaPago: 'Contado', valorTotal: 45_000_000, cuotaInicial: 10_000_000 };
    const resultado = validarImportacion(libro(base({ ventas: [contado], abonos: [] })), contextoVacio());
    expect(mensajes(resultado.errores).join(' ')).toMatch(/de contado la cuota inicial es el valor total/);
  });
});

describe('validarImportacion · plan de cuotas', () => {
  const cuotas = (...valores: number[]) => valores.map((valor, indice) => ({ ...ID_LOTE, cuota: indice + 1, fechaVencimiento: `10/0${indice + 6}/2026`, valor }));

  it('usa el plan de la hoja Cuotas cuando la venta lo trae', () => {
    const resultado = validarImportacion(libro(base({ cuotas: cuotas(20_000_000, 11_500_000), ventas: [{ ...VENTA_FINANCIADA, numeroCuotas: null }] })), contextoVacio());
    expect(resultado.errores).toEqual([]);
    expect(resultado.plan.ventas[0].numeroCuotas).toBe(2);
    expect(resultado.plan.ventas[0].cuotas.map((cuota) => cuota.valor.toString())).toEqual(['13500000', '20000000', '11500000']);
  });

  it('las cuotas deben sumar el saldo financiado', () => {
    const resultado = validarImportacion(libro(base({ cuotas: cuotas(20_000_000, 10_000_000) })), contextoVacio());
    expect(mensajes(resultado.errores).join(' ')).toMatch(/suman \$30\.000\.000 pero el saldo financiado .* es \$31\.500\.000/);
  });

  it('las cuotas deben ser 1, 2, 3… sin saltos', () => {
    const conSalto = [
      { ...ID_LOTE, cuota: 1, fechaVencimiento: '10/06/2026', valor: 15_000_000 },
      { ...ID_LOTE, cuota: 3, fechaVencimiento: '10/07/2026', valor: 16_500_000 },
    ];
    const resultado = validarImportacion(libro(base({ cuotas: conSalto })), contextoVacio());
    expect(mensajes(resultado.errores).join(' ')).toMatch(/sin saltos/);
  });

  it('el número de cuotas de la venta debe coincidir con la hoja Cuotas', () => {
    const resultado = validarImportacion(libro(base({ cuotas: cuotas(15_750_000, 15_750_000) })), contextoVacio());
    expect(mensajes(resultado.errores).join(' ')).toMatch(/Dice 3 cuotas pero la hoja Cuotas trae 2/);
  });

  it('una venta financiada sin cuota inicial indicada, o con cuota inicial igual al total, es un error', () => {
    const sinCuotaInicial = { ...VENTA_FINANCIADA, cuotaInicial: null };
    expect(mensajes(validarImportacion(libro(base({ ventas: [sinCuotaInicial], abonos: [] })), contextoVacio()).errores).join(' ')).toMatch(/indica la cuota inicial \(0 si no hubo\)/);
    const todo = { ...VENTA_FINANCIADA, cuotaInicial: 45_000_000 };
    expect(mensajes(validarImportacion(libro(base({ ventas: [todo], abonos: [] })), contextoVacio()).errores).join(' ')).toMatch(/registra la venta como de contado/);
  });

  it('con cuota inicial 0 no se crea la cuota 0', () => {
    const resultado = validarImportacion(libro(base({ ventas: [{ ...VENTA_FINANCIADA, cuotaInicial: 0 }], abonos: [] })), contextoVacio());
    expect(resultado.errores).toEqual([]);
    expect(resultado.plan.ventas[0].cuotas.map((cuota) => cuota.numero)).toEqual([1, 2, 3]);
  });
});

describe('validarImportacion · lo que ya existe en el sistema', () => {
  const proyectoExistente = (lotes: ContextoValidacion['proyectos'][number]['lotes'] = []): ContextoValidacion['proyectos'] => [
    {
      id: 'proy-1',
      nombre: 'La Floresta',
      tipo: TipoProyecto.LOTES,
      estado: EstadoProyecto.ACTIVO,
      areaTotal: new Prisma.Decimal(25000),
      manzanas: [{ id: 'manz-a', nombre: 'A' }],
      lotes,
    },
  ];
  const loteExistente = (cambios: Partial<ContextoValidacion['proyectos'][number]['lotes'][number]> = {}) => ({
    id: 'lote-1',
    numero: '1',
    manzanaId: 'manz-a',
    area: new Prisma.Decimal(90),
    valorVenta: new Prisma.Decimal(45_000_000),
    estado: EstadoLote.DISPONIBLE,
    conVentaVigente: false,
    ...cambios,
  });

  it('un proyecto, lote y cliente existentes se reutilizan sin duplicarlos', () => {
    const resultado = validarImportacion(
      libro(base()),
      contextoVacio({ proyectos: proyectoExistente([loteExistente()]), clientes: [{ documento: '1000000001', nombre: 'Cliente de Prueba Uno' }] }),
    );
    expect(resultado.errores).toEqual([]);
    expect(resultado.plan.proyectos).toHaveLength(0);
    expect(resultado.plan.manzanas).toHaveLength(0);
    expect(resultado.plan.lotes).toHaveLength(0);
    expect(resultado.plan.clientes).toHaveLength(0);
    expect(resultado.resumen).toMatchObject({ proyectos: { nuevos: 0, existentes: 1 }, lotes: { nuevos: 0, existentes: 1 }, clientes: { nuevos: 0, existentes: 1 } });
    expect(resultado.plan.ventas[0].loteId).toBe('lote-1');
  });

  it('avisa (sin modificar) cuando los datos del archivo difieren de los del sistema', () => {
    const resultado = validarImportacion(
      libro(base({ lotes: [{ ...LOTE, area: 120 }], clientes: [{ ...CLIENTE, nombre: 'Otro Nombre Distinto' }] })),
      contextoVacio({ proyectos: proyectoExistente([loteExistente()]), clientes: [{ documento: '1000000001', nombre: 'Cliente de Prueba Uno' }] }),
    );
    expect(resultado.errores).toEqual([]);
    const textos = mensajes(resultado.avisos).join(' | ');
    expect(textos).toMatch(/El lote ya existe con área 90 m²/);
    expect(textos).toMatch(/El cliente ya existe como "Cliente de Prueba Uno"/);
  });

  it('no se vende un lote que no está disponible ni uno que ya tiene una venta en curso', () => {
    const vendido = validarImportacion(libro(base()), contextoVacio({ proyectos: proyectoExistente([loteExistente({ estado: EstadoLote.VENDIDO })]) }));
    expect(mensajes(vendido.errores).join(' ')).toMatch(/solo se importan ventas de lotes disponibles/);
    const enCurso = validarImportacion(libro(base()), contextoVacio({ proyectos: proyectoExistente([loteExistente({ conVentaVigente: true })]) }));
    expect(mensajes(enCurso.errores).join(' ')).toMatch(/ya tiene una venta en curso/);
  });

  it('un proyecto finalizado no admite lotes nuevos', () => {
    const finalizado = proyectoExistente();
    finalizado[0].estado = EstadoProyecto.FINALIZADO;
    const resultado = validarImportacion(libro({ lotes: [LOTE] }), contextoVacio({ proyectos: finalizado }));
    expect(mensajes(resultado.errores).join(' ')).toMatch(/ya está finalizado/);
  });

  it('con dos proyectos del mismo nombre en el sistema no se sabe a cuál se refiere', () => {
    const doble = [...proyectoExistente(), ...proyectoExistente()];
    const resultado = validarImportacion(libro({ lotes: [LOTE] }), contextoVacio({ proyectos: doble }));
    expect(mensajes(resultado.errores).join(' ')).toMatch(/más de un proyecto/);
  });

  it('los números de abono con referencia repetida en el sistema se rechazan', () => {
    const abono = { ...ABONO_CUOTA_INICIAL, medioPago: 'Consignación', cuenta: 'Bancolombia ahorros', referencia: 'ABC123' };
    const resultado = validarImportacion(libro(base({ abonos: [abono] })), contextoVacio({ referencias: [{ cuentaId: 'cuenta-1', referencia: 'abc123' }] }));
    expect(mensajes(resultado.errores).join(' ')).toMatch(/Esa referencia ya está registrada en esa cuenta en el sistema/);
  });
});

describe('validarImportacion · referencias entre hojas y datos inválidos', () => {
  it('un lote, cliente o proyecto que no existe en ninguna parte es un error ubicado por hoja y fila', () => {
    const resultado = validarImportacion(
      libro({
        proyectos: [PROYECTO],
        lotes: [LOTE, { ...LOTE, proyecto: 'Proyecto Fantasma', numero: '2' }],
        clientes: [CLIENTE],
        ventas: [{ ...VENTA_FINANCIADA, documentoCliente: '9999999' }, { ...VENTA_FINANCIADA, numero: '77' }],
      }),
      contextoVacio(),
    );
    const textos = resultado.errores.map((error) => `${error.hoja}:${error.fila}:${error.mensaje}`).join('\n');
    expect(textos).toMatch(/Lotes:3:.*Proyecto Fantasma/);
    expect(textos).toMatch(/Ventas:2:.*No existe el cliente con documento 9999999/);
    expect(textos).toMatch(/Ventas:3:.*No existe el lote 77/);
  });

  it('sugiere la manzana cuando el lote existe en otra', () => {
    const resultado = validarImportacion(libro(base({ ventas: [{ ...VENTA_FINANCIADA, manzana: 'B' }] })), contextoVacio());
    expect(mensajes(resultado.errores).join(' ')).toMatch(/¿Será el de la manzana A\?/);
  });

  it('el tipo de documento del cliente se lee de la hoja; vacío es CC y uno desconocido es un error', () => {
    const conTipo = validarImportacion(libro({ clientes: [{ ...CLIENTE, tipoDocumento: 'nit' }, { documento: '2000000002', nombre: 'Cliente de Prueba Dos' }] }), contextoVacio());
    expect(conTipo.errores).toEqual([]);
    expect(conTipo.plan.clientes.map((cliente) => [cliente.documento, cliente.tipoDocumento])).toEqual([['1000000001', 'NIT'], ['2000000002', 'CC']]);
    const invalido = validarImportacion(libro({ clientes: [{ ...CLIENTE, tipoDocumento: 'Licencia' }] }), contextoVacio());
    expect(mensajes(invalido.errores).join(' ')).toMatch(/Debe ser una de estas opciones: CC, CE, NIT/);
  });

  it('un lote o cliente repetido en la misma hoja es un error', () => {
    const resultado = validarImportacion(libro({ proyectos: [PROYECTO, PROYECTO], lotes: [LOTE, LOTE], clientes: [CLIENTE, CLIENTE] }), contextoVacio());
    const textos = mensajes(resultado.errores).join(' | ');
    expect(textos).toMatch(/proyecto "La Floresta" aparece repetido/);
    expect(textos).toMatch(/lote 1 aparece repetido/);
    expect(textos).toMatch(/documento 1000000001 aparece repetido/);
  });

  it('dos ventas del mismo lote en el archivo es un error', () => {
    const resultado = validarImportacion(libro(base({ ventas: [VENTA_FINANCIADA, VENTA_FINANCIADA], abonos: [] })), contextoVacio());
    expect(mensajes(resultado.errores).join(' ')).toMatch(/ya tiene otra venta en esta hoja \(fila 2\)/);
  });

  it('las fechas futuras, los valores en cero y los textos inválidos se rechazan', () => {
    const resultado = validarImportacion(
      libro({
        proyectos: [{ nombre: 'AB', areaTotal: 0 }],
        clientes: [{ documento: '12', nombre: 'Cl', email: 'no-es-correo' }],
        lotes: [{ ...LOTE, valorVenta: 0 }],
      }),
      contextoVacio(),
    );
    const textos = mensajes(resultado.errores).join(' | ');
    expect(textos).toMatch(/al menos 3 letras/);
    expect(textos).toMatch(/área debe ser mayor a cero/);
    expect(textos).toMatch(/documento debe tener al menos 3/);
    expect(textos).toMatch(/correo no es válido/);
    expect(textos).toMatch(/precio debe ser mayor a cero/);

    const futuro = validarImportacion(
      libro(base({ ventas: [{ ...VENTA_FINANCIADA, fechaVenta: '10/05/2027' }], abonos: [{ ...ABONO_CUOTA_INICIAL, fecha: '11/05/2027' }] })),
      contextoVacio(),
    );
    expect(mensajes(futuro.errores).join(' | ')).toMatch(/venta no puede ser futura/);
  });

  it('el área de los lotes que supera la del proyecto es solo un aviso', () => {
    const resultado = validarImportacion(libro({ proyectos: [{ nombre: 'La Floresta', areaTotal: 50 }], lotes: [LOTE] }), contextoVacio());
    expect(resultado.errores).toEqual([]);
    expect(mensajes(resultado.avisos).join(' ')).toMatch(/suman 90 m², más que su área total/);
  });

  it('un archivo sin filas y los problemas de lectura se informan como errores', () => {
    expect(mensajes(validarImportacion(libro({}), contextoVacio()).errores).join(' ')).toMatch(/no trae filas para importar/);
    const conProblema = validarImportacion(libro(base(), [{ hoja: 'Lotes', fila: 1, columna: 'Área (m²)', mensaje: 'Falta la columna "Área (m²)"' }]), contextoVacio());
    expect(conProblema.errores[0]).toMatchObject({ hoja: 'Lotes', fila: 1 });
  });

  it('el vendedor lleva sus tres datos juntos y se crea una sola vez', () => {
    const incompleto = validarImportacion(libro(base({ ventas: [{ ...VENTA_FINANCIADA, vendedorTipo: 'Referido' }], abonos: [] })), contextoVacio());
    const textos = mensajes(incompleto.errores).join(' | ');
    expect(textos).toMatch(/falta su documento/);
    expect(textos).toMatch(/falta su nombre/);

    const completo = validarImportacion(
      libro(base({ ventas: [{ ...VENTA_FINANCIADA, vendedorTipo: 'Asesor inmobiliario', vendedorDocumento: '2000000001', vendedorNombre: 'Asesor de Prueba' }], abonos: [] })),
      contextoVacio(),
    );
    expect(completo.errores).toEqual([]);
    expect(completo.plan.vendedores).toEqual([{ documento: '2000000001', nombre: 'Asesor de Prueba', tipo: 'ASESOR_INMOBILIARIO' }]);
    const yaExiste = validarImportacion(
      libro(base({ ventas: [{ ...VENTA_FINANCIADA, vendedorTipo: 'Asesor inmobiliario', vendedorDocumento: '2000000001', vendedorNombre: 'Asesor de Prueba' }], abonos: [] })),
      contextoVacio({ vendedores: [{ documento: '2000000001' }] }),
    );
    expect(yaExiste.plan.vendedores).toHaveLength(0);
  });
});

describe('validarImportacion · pagos', () => {
  const consignacion = { ...ABONO_CUOTA_INICIAL, medioPago: 'Consignación', cuenta: 'Bancolombia ahorros', referencia: 'REF-1' };

  it('un pago en efectivo no necesita cuenta; uno por consignación sí', () => {
    expect(validarImportacion(libro(base()), contextoVacio()).errores).toEqual([]);
    const sinCuenta = validarImportacion(libro(base({ abonos: [{ ...consignacion, cuenta: null }] })), contextoVacio());
    expect(mensajes(sinCuenta.errores).join(' ')).toMatch(/Indica la cuenta donde entró el dinero/);
    const conCuenta = validarImportacion(libro(base({ abonos: [consignacion] })), contextoVacio());
    expect(conCuenta.errores).toEqual([]);
    expect(conCuenta.plan.ventas[0].abonos[0]).toMatchObject({ cuentaId: 'cuenta-1', referencia: 'REF-1' });
  });

  it('la cuenta debe existir, estar activa y no ser ambigua', () => {
    const inexistente = validarImportacion(libro(base({ abonos: [{ ...consignacion, cuenta: 'Cuenta Inventada' }] })), contextoVacio());
    expect(mensajes(inexistente.errores).join(' ')).toMatch(/No existe una cuenta con el alias/);
    const inactiva = validarImportacion(libro(base({ abonos: [consignacion] })), contextoVacio({ cuentas: [{ id: 'c', alias: 'Bancolombia ahorros', activa: false }] }));
    expect(mensajes(inactiva.errores).join(' ')).toMatch(/está desactivada/);
    const ambigua = validarImportacion(
      libro(base({ abonos: [consignacion] })),
      contextoVacio({ cuentas: [{ id: 'c1', alias: 'Bancolombia ahorros', activa: true }, { id: 'c2', alias: 'bancolombia AHORROS', activa: true }] }),
    );
    expect(mensajes(ambigua.errores).join(' ')).toMatch(/más de una cuenta/);
  });

  it('la referencia no se repite en la misma cuenta dentro del archivo', () => {
    const resultado = validarImportacion(
      libro(base({ abonos: [consignacion, { ...consignacion, fecha: '10/06/2026', valor: 10_500_000 }] })),
      contextoVacio(),
    );
    expect(mensajes(resultado.errores).join(' ')).toMatch(/ya aparece en esa cuenta en la fila 2/);
  });

  it('un medio de pago deshabilitado se rechaza', () => {
    const resultado = validarImportacion(libro(base({ abonos: [{ ...ABONO_CUOTA_INICIAL, medioPago: 'Nequi', cuenta: 'Bancolombia ahorros' }] })), contextoVacio({ mediosActivos: [MedioPago.EFECTIVO] }));
    expect(mensajes(resultado.errores).join(' ')).toMatch(/medio de pago "Nequi" no está habilitado/);
  });

  it('un pago dentro de un cierre de caja cerrado se rechaza', () => {
    const resultado = validarImportacion(libro(base()), contextoVacio({ cierresBloqueantes: [{ numeroTexto: 'CC-000001', desde: '2026-05-01', hasta: '2026-05-31' }] }));
    expect(mensajes(resultado.errores).join(' ')).toMatch(/pertenece al cierre de caja CC-000001/);
  });

  it('un pago de un lote sin venta en el archivo es un error; uno anterior a la venta solo un aviso', () => {
    const sinVenta = validarImportacion(libro({ proyectos: [PROYECTO], lotes: [LOTE], abonos: [ABONO_CUOTA_INICIAL] }), contextoVacio());
    expect(mensajes(sinVenta.errores).join(' ')).toMatch(/no tiene una venta válida en la hoja Ventas/);
    const anterior = validarImportacion(libro(base({ abonos: [{ ...ABONO_CUOTA_INICIAL, fecha: '01/05/2026' }] })), contextoVacio());
    expect(anterior.errores).toEqual([]);
    expect(mensajes(anterior.avisos).join(' ')).toMatch(/anterior a la fecha de la venta/);
  });
});
