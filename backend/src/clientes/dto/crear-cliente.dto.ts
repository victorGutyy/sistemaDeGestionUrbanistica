import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { TipoDocumento } from '../../generated/prisma/enums.js';

export class CrearClienteDto {
  @IsString()
  @MinLength(3)
  nombre!: string;

  @IsString()
  @MinLength(3)
  documento!: string;

  // Omitido = cédula de ciudadanía.
  @IsOptional()
  @IsEnum(TipoDocumento)
  tipoDocumento?: TipoDocumento;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  // El cliente autorizó el tratamiento de sus datos personales (se registra la fecha y quién lo anotó).
  @IsOptional()
  @IsBoolean()
  autorizaDatos?: boolean;
}
