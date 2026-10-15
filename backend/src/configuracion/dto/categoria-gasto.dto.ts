import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CrearCategoriaGastoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  nombre!: string;
}

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
