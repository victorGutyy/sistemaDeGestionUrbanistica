import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { diasDeLaEntidad, errorEnRecobro, valorEsperadoPara } from './recobros.js';

const dia = (mes: number, diaDelMes: number) => new Date(2026, mes - 1, diaDelMes);
const d = (valor: number) => new Prisma.Decimal(valor);

describe('errorEnRecobro: cada estado exige sus datos (RF-SST-09)', () => {
  it('pendiente: sin fechas', () => {
    expect(errorEnRecobro({ estado: 'PENDIENTE' })).toBeNull();
    expect(errorEnRecobro({ estado: 'PENDIENTE', fechaRadicacion: dia(4, 1) })).toMatch(/no tiene fechas/);
    expect(errorEnRecobro({ estado: 'PENDIENTE', fechaPago: dia(4, 1) })).toMatch(/no tiene fechas/);
  });

  it('radicada: exige la fecha de radicación y no admite fecha de pago', () => {
    expect(errorEnRecobro({ estado: 'RADICADA', fechaRadicacion: dia(4, 1) })).toBeNull();
    expect(errorEnRecobro({ estado: 'RADICADA', fechaRadicacion: dia(4, 1), valorReconocido: '210000' })).toBeNull();
    expect(errorEnRecobro({ estado: 'RADICADA' })).toMatch(/se radicó/);
    expect(errorEnRecobro({ estado: 'RADICADA', fechaRadicacion: dia(4, 1), fechaPago: dia(4, 20) })).toMatch(/márcalo como pagado/);
  });

  it('pagada: exige las dos fechas en orden y el valor reconocido', () => {
    expect(errorEnRecobro({ estado: 'PAGADA', fechaRadicacion: dia(4, 1), fechaPago: dia(4, 20), valorReconocido: '210000' })).toBeNull();
    expect(errorEnRecobro({ estado: 'PAGADA', fechaRadicacion: dia(4, 1), fechaPago: dia(4, 1), valorReconocido: '0' })).toBeNull(); // el mismo día y valor cero (la entidad no reconoció nada)
    expect(errorEnRecobro({ estado: 'PAGADA', fechaPago: dia(4, 20), valorReconocido: '1' })).toMatch(/se radicó/);
    expect(errorEnRecobro({ estado: 'PAGADA', fechaRadicacion: dia(4, 1), valorReconocido: '1' })).toMatch(/en que pagaron/);
    expect(errorEnRecobro({ estado: 'PAGADA', fechaRadicacion: dia(4, 10), fechaPago: dia(4, 9), valorReconocido: '1' })).toMatch(/anterior a la de radicación/);
    expect(errorEnRecobro({ estado: 'PAGADA', fechaRadicacion: dia(4, 1), fechaPago: dia(4, 20) })).toMatch(/valor que reconoció/);
  });

  it('rechazada: exige la radicación y el motivo, y no tiene pago', () => {
    expect(errorEnRecobro({ estado: 'RECHAZADA', fechaRadicacion: dia(4, 1), observaciones: 'Falta el certificado médico' })).toBeNull();
    expect(errorEnRecobro({ estado: 'RECHAZADA', observaciones: 'x' })).toMatch(/se radicó/);
    expect(errorEnRecobro({ estado: 'RECHAZADA', fechaRadicacion: dia(4, 1) })).toMatch(/motivo del rechazo/);
    expect(errorEnRecobro({ estado: 'RECHAZADA', fechaRadicacion: dia(4, 1), observaciones: '   ' })).toMatch(/motivo del rechazo/);
    expect(errorEnRecobro({ estado: 'RECHAZADA', fechaRadicacion: dia(4, 1), fechaPago: dia(4, 5), observaciones: 'x' })).toMatch(/no tiene fecha de pago/);
  });

  it('el valor reconocido no puede ser negativo, en ningún estado', () => {
    expect(errorEnRecobro({ estado: 'RADICADA', fechaRadicacion: dia(4, 1), valorReconocido: '-1' })).toMatch(/negativo/);
  });

  it('no se confunde con la hora del día al comparar las fechas', () => {
    const radicado = new Date(2026, 3, 10, 18, 0);
    const pagado = new Date(2026, 3, 10, 8, 0);
    expect(errorEnRecobro({ estado: 'PAGADA', fechaRadicacion: radicado, fechaPago: pagado, valorReconocido: '1' })).toBeNull();
  });
});

describe('lo que se espera cobrar a cada entidad', () => {
  const periodos = [
    { valorEps: d(200010), valorArl: d(0), valorAfp: d(0), diasEps: 3, diasArl: 0, diasAfp: 0 },
    { valorEps: d(100000), valorArl: d(400000), valorAfp: d(58364), diasEps: 2, diasArl: 4, diasAfp: 1 },
  ];

  it('suma lo de cada mes de la liquidación vigente', () => {
    expect(valorEsperadoPara('EPS', periodos).toString()).toBe('300010');
    expect(valorEsperadoPara('ARL', periodos).toString()).toBe('400000');
    expect(valorEsperadoPara('AFP', periodos).toString()).toBe('58364');
  });

  it('cuenta los días que le tocan a la entidad', () => {
    expect(diasDeLaEntidad('EPS', periodos)).toBe(5);
    expect(diasDeLaEntidad('ARL', periodos)).toBe(4);
    expect(diasDeLaEntidad('AFP', periodos)).toBe(1);
    expect(diasDeLaEntidad('AFP', [])).toBe(0);
  });
});
