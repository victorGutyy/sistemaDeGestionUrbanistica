import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AprobarCierreDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacion?: string;
}

export class DevolverCierreDto {
  // Qué debe corregir el administrador antes de volver a cerrar.
  @IsString()
  @MinLength(5, { message: 'Explica qué hay que corregir (mínimo 5 caracteres)' })
  @MaxLength(500)
  observacion!: string;
}
