import { BadRequestException } from '@nestjs/common';
import { finDelPeriodo, formatearDiaDDMMAAAA, sumarDias, ultimoDiaDelMes } from '../../cierres-caja/periodo.js';
import { formatearCOP } from '../../common/formato.util.js';
import { Prisma } from '../../generated/prisma/client.js';
import { pesos, type FilaReporte, type SeccionReporte } from '../modelo.js';

export type Granularidad = 'DIA' | 'SEMANA' | 'QUINCENA' | 'MES';

export const ETIQUETA_GRANULARIDAD: Record<Granularidad, string> = {
  DIA: 'Día',
  SEMANA: 'Semana',
  QUINCENA: 'Quincena',
  MES: 'Mes',
};

// Una entrada o una salida de dinero en un día. "INGRESO_VENTA" es lo que pagan los clientes (abonos), "INGRESO_OTRO" los
// ingresos registrados a mano, "EGRESO" lo gastado (incluida la nómina de toda la empresa).
export interface PartidaDeCaja {
  // "aaaa-mm-dd"
  dia: string;
  tipo: 'INGRESO_VENTA' | 'INGRESO_OTRO' | 'EGRESO';
  valor: Prisma.Decimal;
}

// Tope de períodos de una tabla (un año por día, por ejemplo). Más allá, se pide un rango más corto o agrupar por algo más grande.
const MAXIMO_PERIODOS = 400;

const CERO = () => new Prisma.Decimal(0);

// Último día del período que empieza en "inicio". La semana y la quincena son las definiciones PROVISIONALES de periodo.ts
// (lunes a domingo; 1 al 15 y 16 al fin de mes), las mismas del cierre de caja.
function finDelBloque(granularidad: Granularidad, inicio: string): string {
  switch (granularidad) {
    case 'DIA':
      return inicio;
    case 'SEMANA':
      return finDelPeriodo('SEMANAL', inicio);
    case 'QUINCENA':
      return finDelPeriodo('QUINCENAL', inicio);
    case 'MES': {
      const [anio, mes] = inicio.split('-').map(Number);
      return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(ultimoDiaDelMes(anio, mes)).padStart(2, '0')}`;
    }
  }
}

export interface Bloque {
  desde: string;
  hasta: string;
}

// Los períodos entre "desde" y "hasta". El primero y el último se recortan al rango pedido.
export function bloquesDeFlujo(desde: string, hasta: string, granularidad: Granularidad): Bloque[] {
  const bloques: Bloque[] = [];
  let inicio = desde;
  while (inicio <= hasta) {
    const fin = finDelBloque(granularidad, inicio);
    bloques.push({ desde: inicio, hasta: fin < hasta ? fin : hasta });
    if (bloques.length > MAXIMO_PERIODOS) {
      throw new BadRequestException(`El rango tiene más de ${MAXIMO_PERIODOS} períodos al agrupar por ${ETIQUETA_GRANULARIDAD[granularidad].toLowerCase()}: acorta las fechas o agrupa por algo más grande`);
    }
    inicio = sumarDias(fin, 1);
  }
  return bloques;
}

const etiquetaDelBloque = (bloque: Bloque) =>
  bloque.desde === bloque.hasta ? formatearDiaDDMMAAAA(bloque.desde) : `${formatearDiaDDMMAAAA(bloque.desde)} – ${formatearDiaDDMMAAAA(bloque.hasta)}`;

// Flujo de caja (RF-REP-11): por cada período, lo que entró, lo que salió, el neto y el saldo acumulado. El saldo
// inicial es lo neto de todo lo registrado ANTES del rango, así el acumulado es la posición real según el sistema.
export function construirFlujoDeCaja(partidas: PartidaDeCaja[], rango: { desde: string; hasta: string; granularidad: Granularidad }): SeccionReporte[] {
  if (rango.desde > rango.hasta) {
    throw new BadRequestException('La fecha inicial no puede ser posterior a la final');
  }
  const bloques = bloquesDeFlujo(rango.desde, rango.hasta, rango.granularidad);

  let saldo = partidas
    .filter((partida) => partida.dia < rango.desde)
    .reduce((suma, partida) => (partida.tipo === 'EGRESO' ? suma.minus(partida.valor) : suma.plus(partida.valor)), CERO());
  const saldoInicial = saldo;

  let totalVentas = CERO();
  let totalOtros = CERO();
  let totalEgresos = CERO();
  const filas: FilaReporte[] = bloques.map((bloque) => {
    const delBloque = partidas.filter((partida) => partida.dia >= bloque.desde && partida.dia <= bloque.hasta);
    const suma = (tipo: PartidaDeCaja['tipo']) => delBloque.filter((p) => p.tipo === tipo).reduce((total, p) => total.plus(p.valor), CERO());
    const ventas = suma('INGRESO_VENTA');
    const otros = suma('INGRESO_OTRO');
    const egresos = suma('EGRESO');
    const neto = ventas.plus(otros).minus(egresos);
    saldo = saldo.plus(neto);
    totalVentas = totalVentas.plus(ventas);
    totalOtros = totalOtros.plus(otros);
    totalEgresos = totalEgresos.plus(egresos);
    return {
      periodo: etiquetaDelBloque(bloque),
      ventas: pesos(ventas),
      otros: pesos(otros),
      egresos: pesos(egresos),
      neto: pesos(neto),
      saldo: pesos(saldo),
    };
  });

  return [
    {
      titulo: `Flujo de caja por ${ETIQUETA_GRANULARIDAD[rango.granularidad].toLowerCase()}`,
      nota: `Saldo inicial al ${formatearDiaDDMMAAAA(rango.desde)} (todo lo registrado antes): ${formatearCOP(pesos(saldoInicial))}. Los ingresos por ventas son los abonos de clientes; los egresos incluyen la nómina.`,
      columnas: [
        { clave: 'periodo', encabezado: 'Período', tipo: 'texto', peso: 2.2 },
        { clave: 'ventas', encabezado: 'Ingresos por ventas', tipo: 'pesos', peso: 1.9 },
        { clave: 'otros', encabezado: 'Otros ingresos', tipo: 'pesos', peso: 1.6 },
        { clave: 'egresos', encabezado: 'Egresos', tipo: 'pesos', peso: 1.4 },
        { clave: 'neto', encabezado: 'Neto', tipo: 'pesos', peso: 1.4 },
        { clave: 'saldo', encabezado: 'Saldo acumulado', tipo: 'pesos', peso: 1.8 },
      ],
      filas,
      totales: {
        periodo: 'Total del rango',
        ventas: pesos(totalVentas),
        otros: pesos(totalOtros),
        egresos: pesos(totalEgresos),
        neto: pesos(totalVentas.plus(totalOtros).minus(totalEgresos)),
        saldo: pesos(saldo),
      },
    },
  ];
}
