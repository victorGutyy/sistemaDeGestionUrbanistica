import { IsDecimal, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { SexoTrabajador, TipoContrato, TipoDocumento } from '../../generated/prisma/enums.js';

export const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
export const FORMATO_PESOS = /^\d{1,12}$/;

export class CrearTrabajadorDto {
  // Nombre completo. Si se omite, se arma con nombres y apellidos (RF-PER-17).
  @IsOptional()
  @IsString()
  @MinLength(3)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nombres?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  apellidos?: string;

  @IsString()
  @MinLength(3)
  documento!: string;

  // Omitido = cédula de ciudadanía.
  @IsOptional()
  @IsEnum(TipoDocumento)
  tipoDocumento?: TipoDocumento;

  @IsOptional()
  @Matches(FORMATO_FECHA, { message: 'fechaNacimiento debe tener el formato YYYY-MM-DD' })
  fechaNacimiento?: string;

  @IsOptional()
  @IsEnum(SexoTrabajador)
  sexo?: SexoTrabajador;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  area?: string;

  @IsString()
  @MinLength(2)
  cargo!: string;

  // Omitido = obra o labor (el contrato habitual de la empresa).
  @IsOptional()
  @IsEnum(TipoContrato)
  tipoContrato?: TipoContrato;

  @IsDecimal({ decimal_digits: '0,2' })
  salarioBase!: string;

  // Fecha calendario en formato YYYY-MM-DD.
  @Matches(FORMATO_FECHA, { message: 'fechaIngreso debe tener el formato YYYY-MM-DD' })
  fechaIngreso!: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  celular?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  // CC-05: pago por día. El cargo del catálogo solo sugiere el valor día; si se omite el valor y hay cargo, se usa el sugerido.
  @IsOptional()
  @IsUUID()
  cargoNominaId?: string;

  // Valor del día de trabajo en pesos enteros.
  @IsOptional()
  @Matches(FORMATO_PESOS, { message: 'valorDia debe ser un valor en pesos enteros' })
  valorDia?: string;

  // Datos para pagarle. Texto libre porque cada banco los nombra distinto.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  banco?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  tipoCuenta?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  numeroCuenta?: string;
}

