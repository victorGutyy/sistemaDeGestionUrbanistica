import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ActualizarEmpresaDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  razonSocial!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombreComercial!: string;

  // NIT con puntos y guion opcionales, p. ej. 901125081 o 901.125.081-3.
  @Matches(/^[0-9][0-9.-]{4,19}$/, { message: 'nit debe tener entre 5 y 20 caracteres: números, puntos y guion' })
  nit!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  telefonos?: string;

  @IsOptional()
  @IsEmail()
  correo?: string;

  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'colorPrimario debe ser un color hexadecimal, p. ej. #2563eb' })
  colorPrimario!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  textoLegalRecibo?: string;

  // Prefijo de los recibos de caja, p. ej. "RC-" → RC-000001.
  @IsOptional()
  @Matches(/^[A-Z0-9-]{1,10}$/, { message: 'prefijoRecibo admite de 1 a 10 caracteres: mayúsculas, números y guion' })
  prefijoRecibo?: string;
}
