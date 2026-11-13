import { formatearCOP } from '../common/formato.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoCuota } from '../generated/prisma/enums.js';

// Cambiar el valor de las cuotas que faltan por pagar en una venta ya registrada (CC-08). Funciones puras, sin base de datos.
//
// Reglas:
//  - El total del plan NO cambia: las cuotas (la inicial, las pagadas y las que faltan) siguen sumando lo mismo que antes. Solo
//    se reparte de otra forma entre las que faltan.
//  - Una cuota pagada no se toca; una con pagos parciales no puede quedar por debajo de lo ya pagado.
//  - Todo en pesos enteros y mayores a cero.

export interface CuotaConValor {
  id: string;
  numero: number;
  estado: EstadoCuota;
  valor: Prisma.Decimal;
  /** Lo aplicado a la cuota por abonos vigentes. */
  pagado: Prisma.Decimal;
}

export interface CambioDeValor {
  cuotaId: string;
  numero: number;
  antes: Prisma.Decimal;
  despues: Prisma.Decimal;
  /** El estado en que queda la cuota con su nuevo valor (por ejemplo, PAGADA si el nuevo valor es justo lo ya pagado). */
  estadoDespues: EstadoCuota;
}

export class ValoresInvalidos extends Error {}

const CERO = new Prisma.Decimal(0);

// El estado de una cuota según lo pagado y su valor.
export function estadoSegunPagado(valor: Prisma.Decimal, pagado: Prisma.Decimal): EstadoCuota {
  if (pagado.greaterThanOrEqualTo(valor)) return EstadoCuota.PAGADA;
  return pagado.greaterThan(CERO) ? EstadoCuota.PARCIAL : EstadoCuota.PENDIENTE;
}

const sumar = (valores: Prisma.Decimal[]) => valores.reduce((total, v) => total.plus(v), CERO);
const nombre = (numero: number) => (numero === 0 ? 'la cuota inicial' : `la cuota ${numero}`);

export function calcularCambiosDeValor(cuotas: CuotaConValor[], pedidos: { numero: number; valor: Prisma.Decimal }[]): CambioDeValor[] {
  if (pedidos.length === 0) throw new ValoresInvalidos('Indica el nuevo valor de las cuotas que se cambian');

  const nuevos = new Map<number, Prisma.Decimal>();
  for (const { numero, valor } of pedidos) {
    if (nuevos.has(numero)) throw new ValoresInvalidos(`El valor de ${nombre(numero)} viene repetido`);
    const cuota = cuotas.find((c) => c.numero === numero);
    if (!cuota) throw new ValoresInvalidos(`No existe ${nombre(numero)}`);
    if (cuota.estado === EstadoCuota.PAGADA) throw new ValoresInvalidos(`${nombre(numero)} ya está pagada: no se le cambia el valor`);
    if (!valor.isFinite() || valor.decimalPlaces() !== 0 || valor.lessThanOrEqualTo(CERO)) {
      throw new ValoresInvalidos(`El valor de ${nombre(numero)} debe ser un número entero de pesos mayor a cero`);
    }
    if (valor.lessThan(cuota.pagado)) {
      throw new ValoresInvalidos(`${nombre(numero)} ya tiene ${formatearCOP(cuota.pagado)} pagados: su valor no puede ser menor`);
    }
    nuevos.set(numero, valor);
  }

  // El total del plan tiene que seguir igual: lo que se baja en una cuota se sube en otra.
  const totalAntes = sumar(cuotas.map((c) => c.valor));
  const totalDespues = sumar(cuotas.map((c) => nuevos.get(c.numero) ?? c.valor));
  if (!totalAntes.equals(totalDespues)) {
    const diferencia = totalDespues.minus(totalAntes);
    throw new ValoresInvalidos(
      `Las cuotas deben seguir sumando ${formatearCOP(totalAntes)} y sumarían ${formatearCOP(totalDespues)}: ${diferencia.isNegative() ? 'faltan' : 'sobran'} ${formatearCOP(diferencia.abs())} por distribuir`,
    );
  }

  const cambios: CambioDeValor[] = [];
  for (const [numero, despues] of nuevos) {
    const cuota = cuotas.find((c) => c.numero === numero)!;
    if (!cuota.valor.equals(despues)) {
      cambios.push({ cuotaId: cuota.id, numero, antes: cuota.valor, despues, estadoDespues: estadoSegunPagado(despues, cuota.pagado) });
    }
  }
  return cambios.sort((a, b) => a.numero - b.numero);
}
