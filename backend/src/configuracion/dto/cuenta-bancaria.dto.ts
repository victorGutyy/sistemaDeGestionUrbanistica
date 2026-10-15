import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TipoCuenta } from '../../generated/prisma/enums.js';

export class CrearCuentaBancariaDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  banco!: string;

  @IsEnum(TipoCuenta)
  tipo!: TipoCuenta;

  @IsString()
  @MinLength(3)
  @MaxLength(40)
  numero!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  alias!: string;
}

export class ActualizarCuentaBancariaDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  banco?: string;

  @IsOptional()
  @IsEnum(TipoCuenta)
  tipo?: TipoCuenta;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  numero?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  alias?: string;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}
