import { IsString, MaxLength, MinLength } from 'class-validator';

export class AnularMovimientoDto {
  @IsString()
  @MinLength(5, { message: 'Explica el motivo de la anulación (mínimo 5 caracteres)' })
  @MaxLength(500)
  motivo!: string;
}
