import { IsDecimal, IsEnum, IsOptional, IsString, IsUUID, Matches, MinLength } from 'class-validator';
import { TipoMovimiento } from '../../generated/prisma/enums.js';

export class CrearMovimientoDto {
  @IsEnum(TipoMovimiento)
  tipo!: TipoMovimiento;

  // Fecha calendario en formato YYYY-MM-DD.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe tener el formato YYYY-MM-DD' })
  fecha!: string;

  @IsDecimal({ decimal_digits: '0,2' })
  valor!: string;

  @IsString()
  @MinLength(3)
  concepto!: string;

  @IsOptional()
  @IsUUID()
  proyectoId?: string;
}
