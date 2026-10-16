import { BadRequestException } from '@nestjs/common';
import { MedioPago } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';

// Reglas del pago que comparten el registro de abonos y la venta (cuando la cuota inicial se recibe al vender):
// - El efectivo no tiene cuenta destino.
// - Cualquier otro medio exige la cuenta donde entró el dinero, y debe estar activa.
// Devuelve el id de la cuenta que se debe guardar (o null).
export async function validarCuentaDestino(
  prisma: Pick<PrismaService, 'cuentaBancaria'>,
  medioPago: MedioPago,
  cuentaDestinoId: string | undefined | null,
  // Para los egresos: 'de donde salió el dinero'.
  donde = 'donde entró el dinero',
): Promise<string | null> {
  if (medioPago === MedioPago.EFECTIVO) {
    return null;
  }
  if (!cuentaDestinoId) {
    throw new BadRequestException(`Indica la cuenta ${donde} (obligatoria cuando el pago no es en efectivo)`);
  }
  const cuenta = await prisma.cuentaBancaria.findUnique({ where: { id: cuentaDestinoId } });
  if (!cuenta) {
    throw new BadRequestException('La cuenta destino no existe');
  }
  if (!cuenta.activa) {
    throw new BadRequestException(`La cuenta "${cuenta.alias}" está desactivada: elige otra`);
  }
  return cuenta.id;
}

// Una fecha de abono no puede ser futura (se registra lo que ya se recibió).
export function exigirFechaNoFutura(fecha: Date): void {
  const finDeHoy = new Date();
  finDeHoy.setHours(23, 59, 59, 999);
  if (fecha.getTime() > finDeHoy.getTime()) {
    throw new BadRequestException('La fecha del abono no puede ser futura');
  }
}
