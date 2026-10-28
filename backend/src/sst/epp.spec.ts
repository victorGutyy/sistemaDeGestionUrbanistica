import { describe, expect, it } from 'vitest';
import { calcularProximaReposicion, diasEntre, estadoDeReposicion, estadosDeReposicion, sumarDias, ultimasEntregas, type EntregaParaReposicion } from './epp.js';

const dia = (mes: number, diaDelMes: number, anio = 2026) => new Date(anio, mes - 1, diaDelMes);

describe('fechas de EPP', () => {
  it('suma días calendario, también al pasar de mes y de año', () => {
    expect(sumarDias(dia(1, 31), 1)).toEqual(dia(2, 1));
    expect(sumarDias(dia(12, 31), 1)).toEqual(dia(1, 1, 2027));
    expect(sumarDias(dia(3, 1), 30)).toEqual(dia(3, 31));
  });

  it('la próxima reposición es la fecha de entrega más la vida útil', () => {
    expect(calcularProximaReposicion(dia(3, 1), 30)).toEqual(dia(3, 31));
    expect(calcularProximaReposicion(dia(1, 1), 365)).toEqual(dia(1, 1, 2027));
    expect(calcularProximaReposicion(dia(2, 20), 7)).toEqual(dia(2, 27));
  });

  it('cuenta los días entre fechas ignorando la hora', () => {
    expect(diasEntre(dia(3, 1), dia(3, 11))).toBe(10);
    expect(diasEntre(dia(3, 11), dia(3, 1))).toBe(-10);
    expect(diasEntre(new Date(2026, 2, 1, 23, 59), new Date(2026, 2, 2, 0, 1))).toBe(1);
    expect(diasEntre(dia(3, 1), dia(3, 1))).toBe(0);
  });
});

describe('estadoDeReposicion (RF-SST-14)', () => {
  const hoy = dia(6, 10);

  it('vigente cuando falta más que la anticipación', () => {
    expect(estadoDeReposicion(dia(7, 10), hoy, 15)).toEqual({ estado: 'VIGENTE', diasRestantes: 30 });
    expect(estadoDeReposicion(dia(6, 26), hoy, 15)).toEqual({ estado: 'VIGENTE', diasRestantes: 16 });
  });

  it('por reponer cuando faltan exactamente la anticipación o menos', () => {
    expect(estadoDeReposicion(dia(6, 25), hoy, 15)).toEqual({ estado: 'POR_REPONER', diasRestantes: 15 });
    expect(estadoDeReposicion(dia(6, 12), hoy, 15)).toEqual({ estado: 'POR_REPONER', diasRestantes: 2 });
  });

  it('el mismo día de la reposición todavía es "por reponer", no vencido', () => {
    expect(estadoDeReposicion(dia(6, 10), hoy, 15)).toEqual({ estado: 'POR_REPONER', diasRestantes: 0 });
  });

  it('vencido desde el día siguiente', () => {
    expect(estadoDeReposicion(dia(6, 9), hoy, 15)).toEqual({ estado: 'VENCIDO', diasRestantes: -1 });
    expect(estadoDeReposicion(dia(1, 1), hoy, 15).estado).toBe('VENCIDO');
  });

  it('respeta la anticipación configurada (no es una constante)', () => {
    expect(estadoDeReposicion(dia(6, 20), hoy, 5).estado).toBe('VIGENTE');
    expect(estadoDeReposicion(dia(6, 20), hoy, 10).estado).toBe('POR_REPONER');
  });
});

describe('última entrega de cada trabajador y elemento', () => {
  let contador = 0;
  const entrega = (trabajadorId: string, elementoId: string, fecha: Date, extra: Partial<EntregaParaReposicion> = {}): EntregaParaReposicion & { id: number } => ({
    id: ++contador,
    trabajadorId,
    elementoId,
    fecha,
    proximaReposicion: sumarDias(fecha, 30),
    anulada: false,
    createdAt: new Date(2026, 0, 1, 8, 0, contador),
    ...extra,
  });

  it('se queda con la más reciente de cada pareja', () => {
    const vieja = entrega('t1', 'casco', dia(1, 1));
    const nueva = entrega('t1', 'casco', dia(5, 1));
    const otroElemento = entrega('t1', 'guantes', dia(2, 1));
    const otroTrabajador = entrega('t2', 'casco', dia(3, 1));
    const resultado = ultimasEntregas([vieja, nueva, otroElemento, otroTrabajador]);
    expect(resultado).toHaveLength(3);
    expect(resultado).toContain(nueva);
    expect(resultado).not.toContain(vieja);
  });

  it('ignora las anuladas: si se anula la última, vale la anterior', () => {
    const anterior = entrega('t1', 'casco', dia(1, 1));
    const anulada = entrega('t1', 'casco', dia(5, 1), { anulada: true });
    expect(ultimasEntregas([anterior, anulada])).toEqual([anterior]);
  });

  it('una pareja con todas sus entregas anuladas no aparece', () => {
    expect(ultimasEntregas([entrega('t1', 'casco', dia(5, 1), { anulada: true })])).toEqual([]);
  });

  it('con dos del mismo día gana la registrada después', () => {
    const primera = entrega('t1', 'casco', dia(5, 1));
    const segunda = entrega('t1', 'casco', dia(5, 1));
    expect(ultimasEntregas([segunda, primera])).toEqual([segunda]);
  });

  it('el orden de entrada no cambia el resultado', () => {
    const a = entrega('t1', 'casco', dia(1, 1));
    const b = entrega('t1', 'casco', dia(5, 1));
    expect(ultimasEntregas([a, b])).toEqual(ultimasEntregas([b, a]));
  });

  it('calcula el estado de cada una y ordena de la más urgente a la menos urgente', () => {
    const hoy = dia(6, 10);
    const vencida = entrega('t1', 'casco', dia(4, 1)); // reposición 1/mayo
    const porReponer = entrega('t2', 'casco', dia(5, 20)); // reposición 19/jun
    const vigente = entrega('t3', 'casco', dia(6, 9)); // reposición 9/jul
    const resultado = estadosDeReposicion([vigente, porReponer, vencida], hoy, 15);
    expect(resultado.map((r) => r.estado)).toEqual(['VENCIDO', 'POR_REPONER', 'VIGENTE']);
    expect(resultado.map((r) => r.trabajadorId)).toEqual(['t1', 't2', 't3']);
    expect(resultado[0].diasRestantes).toBeLessThan(0);
  });

  it('una reposición reciente "reinicia" el reloj: la entrega vieja vencida ya no genera alerta', () => {
    const hoy = dia(6, 10);
    const vieja = entrega('t1', 'casco', dia(1, 1));
    const reposicion = entrega('t1', 'casco', dia(6, 5));
    const resultado = estadosDeReposicion([vieja, reposicion], hoy, 15);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].estado).toBe('VIGENTE');
  });
});
