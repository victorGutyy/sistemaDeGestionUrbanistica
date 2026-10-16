import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CerrarCierreDto {
  // Lo que el administrador contó en la caja, en pesos enteros (puede ser cero).
  @Matches(/^\d{1,14}$/, { message: 'efectivoContado debe ser un valor en pesos enteros' })
  efectivoContado!: string;

  // Obligatoria cuando lo contado no coincide con lo esperado.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  explicacionDiferencia?: string;
}
