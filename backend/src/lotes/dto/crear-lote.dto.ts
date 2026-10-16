import { IsBoolean, IsDecimal, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CrearLoteDto {
  @IsUUID()
  proyectoId!: string;

  // Manzana a la que pertenece; omitida en proyectos sin manzanas.
  @IsOptional()
  @IsUUID()
  manzanaId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  numero!: string;

  @IsDecimal({ decimal_digits: '0,2' })
  area!: string;

  // Medidas y linderos en texto libre.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  linderos?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  valorPorM2?: string;

  @IsDecimal({ decimal_digits: '0,2' })
  valorVenta!: string;

  // Confirma crear el lote aunque supere el área disponible del proyecto.
  @IsOptional()
  @IsBoolean()
  confirmarExcesoArea?: boolean;
}
