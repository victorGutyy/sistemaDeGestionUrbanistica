import { IsBoolean, IsDecimal, IsOptional, IsString, MaxLength } from 'class-validator';

// Edición de la ficha del lote. Cambiar el precio o el área deja registro en el historial
// y solo se permite mientras el lote no esté vendido ni escriturado.
export class ActualizarLoteDto {
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  area?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  linderos?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  valorPorM2?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  valorVenta?: string;

  // Por qué cambia el precio (opcional).
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;

  @IsOptional()
  @IsBoolean()
  confirmarExcesoArea?: boolean;
}
