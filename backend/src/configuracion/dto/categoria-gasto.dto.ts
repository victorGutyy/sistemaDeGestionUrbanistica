import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CrearCategoriaGastoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  nombre!: string;
}

// Las categorías de ingreso (RF-CFG-11) se administran igual que las de gasto.
export class CrearCategoriaIngresoDto extends CrearCategoriaGastoDto {}

export class ActualizarCategoriaGastoDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}
export class ActualizarCategoriaIngresoDto extends ActualizarCategoriaGastoDto {}
