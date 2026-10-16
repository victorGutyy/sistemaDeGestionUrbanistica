import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TipoVendedor } from '../../generated/prisma/enums.js';

export class CrearVendedorDto {
  @IsEnum(TipoVendedor)
  tipo!: TipoVendedor;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  nombre!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(30)
  documento!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;
}
