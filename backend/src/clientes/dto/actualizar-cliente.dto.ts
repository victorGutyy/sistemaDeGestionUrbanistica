import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { TipoDocumento } from '../../generated/prisma/enums.js';

// Solo se cambia lo que se envía. En teléfono, correo y dirección, un texto vacío borra el dato.
// El número de documento no se edita: es la identidad del cliente.
export class ActualizarClienteDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  nombre?: string;

  @IsOptional()
  @IsEnum(TipoDocumento)
  tipoDocumento?: TipoDocumento;

  @IsOptional()
  @IsString()
  telefono?: string;

  @ValidateIf((dto: ActualizarClienteDto) => Boolean(dto.email))
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsBoolean()
  autorizaDatos?: boolean;
}
