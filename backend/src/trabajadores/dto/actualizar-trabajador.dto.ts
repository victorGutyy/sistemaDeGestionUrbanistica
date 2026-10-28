import { IsBoolean, IsDecimal, IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { SexoTrabajador, TipoContrato, TipoDocumento } from '../../generated/prisma/enums.js';
import { FORMATO_FECHA } from './crear-trabajador.dto.js';

// Solo se cambia lo que se envía. En nombres, apellidos, área, teléfono, celular y correo, un texto vacío borra el dato.
// El número de documento no se edita: es la identidad del trabajador.
export class ActualizarTrabajadorDto {
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

  @IsOptional()
  @IsString()
  @MinLength(2)
  cargo?: string;

  @IsOptional()
  @IsEnum(TipoContrato)
  tipoContrato?: TipoContrato;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  salarioBase?: string;

  @IsOptional()
  @Matches(FORMATO_FECHA, { message: 'fechaIngreso debe tener el formato YYYY-MM-DD' })
  fechaIngreso?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  celular?: string;

  @ValidateIf((dto: ActualizarTrabajadorDto) => Boolean(dto.email))
  @IsEmail()
  email?: string;
}

export class RetirarTrabajadorDto {
  @Matches(FORMATO_FECHA, { message: 'fechaRetiro debe tener el formato YYYY-MM-DD' })
  fechaRetiro!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(300)
  motivo!: string;
}

// Autorización de tratamiento de datos de salud (Ley 1581 de 2012, RNF-LEG-03).
export class AutorizacionSaludDto {
  @IsBoolean()
  autoriza!: boolean;
}
