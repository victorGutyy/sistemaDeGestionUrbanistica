import { IsDecimal, IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { MedioPago } from '../../generated/prisma/enums.js';

export class CrearAbonoDto {
  @IsUUID()
  ventaId!: string;

  @IsOptional()
  @IsUUID()
  cuotaId?: string;

  // Fecha calendario en formato YYYY-MM-DD.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe tener el formato YYYY-MM-DD' })
  fecha!: string;

  @IsDecimal({ decimal_digits: '0,2' })
  valor!: string;

  @IsEnum(MedioPago)
  medioPago!: MedioPago;
}
