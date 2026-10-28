import { describe, expect, it } from 'vitest';
import {
  asuntoAvisoActividad,
  asuntoAvisoCapacitacion,
  asuntoResumenEpp,
  describirDias,
  generarHtmlAvisoActividad,
  generarHtmlAvisoCapacitacion,
  generarHtmlResumenEpp,
} from './plantillas-sst.js';

const EMPRESA = { nombreComercial: 'Empresa de Prueba', colorPrimario: '#2563eb', telefonos: '3000000000', correo: 'contacto@ejemplo.test' };
const dia = (mes: number, diaDelMes: number) => new Date(2026, mes - 1, diaDelMes, 12);

describe('describirDias', () => {
  it('lo dice en español natural', () => {
    expect(describirDias(0)).toBe('hoy');
    expect(describirDias(1)).toBe('mañana');
    expect(describirDias(-1)).toBe('ayer');
    expect(describirDias(5)).toBe('en 5 días');
    expect(describirDias(-9)).toBe('hace 9 días');
  });
});

describe('correo de una actividad del plan', () => {
  const datos = { responsable: 'Ana Inventada', actividad: 'Inspecciones de obra', meta: '12 inspecciones al año', anio: 2026, fechaFin: dia(6, 20), empresa: EMPRESA };

  it('el aviso de "próxima" dice cuándo vence, la meta y a quién va', () => {
    const html = generarHtmlAvisoActividad({ ...datos, momento: 'PROXIMA', diasRestantes: 10 });
    expect(html).toContain('próxima a vencer');
    expect(html).toContain('Ana Inventada');
    expect(html).toContain('Inspecciones de obra');
    expect(html).toContain('vence en 10 días');
    expect(html).toContain('12 inspecciones al año');
    expect(html).toContain('Empresa de Prueba');
    expect(html).toContain('contacto@ejemplo.test');
  });

  it('el aviso de "vencida" dice hace cuánto venció', () => {
    const html = generarHtmlAvisoActividad({ ...datos, momento: 'VENCIDA', diasRestantes: -4 });
    expect(html).toContain('vencida');
    expect(html).toContain('venció hace 4 días');
  });

  it('escapa lo que viene de la base de datos: un nombre con HTML no altera el mensaje', () => {
    const html = generarHtmlAvisoActividad({ ...datos, momento: 'PROXIMA', diasRestantes: 3, responsable: '<script>alert(1)</script>', actividad: 'A & B "citada"', meta: "<b>meta</b>" });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>meta</b>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B &quot;citada&quot;');
  });

  it('un color de la empresa que no es #rrggbb no entra al estilo', () => {
    const html = generarHtmlAvisoActividad({ ...datos, momento: 'PROXIMA', diasRestantes: 3, empresa: { ...EMPRESA, colorPrimario: 'red; background:url(x)' } });
    expect(html).not.toContain('background:url');
    expect(html).toContain('#2563eb');
  });

  it('los asuntos distinguen próxima de vencida', () => {
    expect(asuntoAvisoActividad('PROXIMA', 'Auditoría')).toBe('Actividad del plan SST próxima a vencer: Auditoría');
    expect(asuntoAvisoActividad('VENCIDA', 'Auditoría')).toBe('Actividad del plan SST vencida: Auditoría');
  });
});

describe('correo de una capacitación', () => {
  const datos = { responsable: 'Beto Inventado', tema: 'Trabajo en alturas', fechaProgramada: dia(7, 15), dirigidoA: 'Personal de obra', empresa: EMPRESA };

  it('próxima: dice cuándo es y qué hacer después', () => {
    const html = generarHtmlAvisoCapacitacion({ ...datos, momento: 'PROXIMA', diasRestantes: 5 });
    expect(html).toContain('Capacitación próxima');
    expect(html).toContain('Trabajo en alturas');
    expect(html).toContain('Personal de obra');
    expect(html).toContain('vence en 5 días');
    expect(html).toContain('registra su ejecución y la asistencia');
  });

  it('vencida: pide registrarla o cambiar la fecha', () => {
    const html = generarHtmlAvisoCapacitacion({ ...datos, momento: 'VENCIDA', diasRestantes: -2 });
    expect(html).toContain('sin ejecutar');
    expect(html).toContain('venció hace 2 días');
    expect(html).toContain('cambia la fecha programada');
  });

  it('escapa el tema y el público', () => {
    const html = generarHtmlAvisoCapacitacion({ ...datos, momento: 'PROXIMA', diasRestantes: 5, tema: '<img src=x onerror=alert(1)>', dirigidoA: '<i>todos</i>' });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<i>');
  });

  it('los asuntos distinguen próxima de sin ejecutar', () => {
    expect(asuntoAvisoCapacitacion('PROXIMA', 'Alturas')).toBe('Capacitación SST próxima: Alturas');
    expect(asuntoAvisoCapacitacion('VENCIDA', 'Alturas')).toBe('Capacitación SST sin ejecutar: Alturas');
  });
});

describe('resumen de EPP por reponer', () => {
  const fila = (trabajador: string, elemento: string, dias: number) => ({ trabajador, documento: '000111', elemento, proximaReposicion: dia(6, 10 + dias), diasRestantes: dias });

  it('lista vencidos y por reponer en tablas separadas, con su cuenta', () => {
    const html = generarHtmlResumenEpp({ vencidos: [fila('Ana Inventada', 'Casco', -9)], porReponer: [fila('Beto Inventado', 'Guantes', 5), fila('Caro Inventada', 'Botas', 12)], empresa: EMPRESA });
    expect(html).toContain('Vencidos (1)');
    expect(html).toContain('Por reponer (2)');
    expect(html).toContain('Ana Inventada');
    expect(html).toContain('hace 9 días');
    expect(html).toContain('en 12 días');
  });

  it('omite la tabla que no tiene filas', () => {
    const html = generarHtmlResumenEpp({ vencidos: [], porReponer: [fila('Beto Inventado', 'Guantes', 5)], empresa: EMPRESA });
    expect(html).not.toContain('Vencidos');
    expect(html).toContain('Por reponer (1)');
  });

  it('escapa los nombres', () => {
    const html = generarHtmlResumenEpp({ vencidos: [fila('<script>x</script>', 'Casco & visera', -1)], porReponer: [], empresa: EMPRESA });
    expect(html).not.toContain('<script>');
    expect(html).toContain('Casco &amp; visera');
  });

  it('el asunto cuenta lo que hay', () => {
    expect(asuntoResumenEpp(1, 2)).toBe('Elementos de protección personal: 1 vencido y 2 por reponer');
    expect(asuntoResumenEpp(3, 0)).toBe('Elementos de protección personal: 3 vencidos');
    expect(asuntoResumenEpp(0, 4)).toBe('Elementos de protección personal: 4 por reponer');
  });
});
