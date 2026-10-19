import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CrearCategoriaGastoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  nombre!: string;

  // RF-MAQ-06: una categoría propia de la maquinaria solo se ofrece en proyectos de maquinaria. Solo se define al crearla.
  @IsOptional()
  @IsBoolean()
  soloMaquinaria?: boolean;
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
