import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

// Separar o liberar la separación: el motivo es opcional.
export class AccionLoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}

// Volver a poner a la venta un lote desistido: el motivo es obligatorio (queda en el historial).
export class ReponerLoteDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  motivo!: string;
}

export class EscriturarLoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  numero!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  notaria?: string;

  // Fecha de la escritura, formato YYYY-MM-DD.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe tener el formato YYYY-MM-DD' })
  fecha!: string;
}
