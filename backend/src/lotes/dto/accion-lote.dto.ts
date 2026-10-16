import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

// Separar un lote (RF-VEN-01): quién lo aparta, cuánto dejó y hasta cuándo se le guarda. Todo es opcional,
// salvo que si hay valor debe saberse de quién es (un cliente ya registrado o su nombre).
export class SepararLoteDto {
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  nombreInteresado?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefonoInteresado?: string;

  // Valor que dejó el interesado, en pesos enteros. Es informativo: el dinero se recibe como abono a la cuota inicial.
  @IsOptional()
  @Matches(/^\d{1,12}$/, { message: 'valor debe ser un valor en pesos enteros' })
  valor?: string;

  // Fecha límite para formalizar la venta, formato YYYY-MM-DD.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fechaLimite debe tener el formato YYYY-MM-DD' })
  fechaLimite?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}

// Liberar la separación: el motivo es opcional.
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
