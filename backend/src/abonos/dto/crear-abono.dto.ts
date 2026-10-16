import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { MedioPago } from '../../generated/prisma/enums.js';

export class CrearAbonoDto {
  @IsUUID()
  ventaId!: string;

  // Fecha calendario en formato YYYY-MM-DD.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe tener el formato YYYY-MM-DD' })
  fecha!: string;

  // Pesos enteros: el dinero de este sistema no maneja centavos.
  @Matches(/^[1-9]\d{0,13}$/, { message: 'valor debe ser un número entero de pesos mayor a cero' })
  valor!: string;

  @IsEnum(MedioPago)
  medioPago!: MedioPago;

  // Cuenta donde entró el dinero: obligatoria cuando el pago no es en efectivo.
  @IsOptional()
  @IsUUID()
  cuentaDestinoId?: string;

  // Referencia de la transacción o consignación; no se puede repetir en la misma cuenta.
  @IsOptional()
  @IsString()
  @MaxLength(80)
  referencia?: string;
}
