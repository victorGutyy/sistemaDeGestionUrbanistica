import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CrearClienteDto {
  @IsString()
  @MinLength(3)
  nombre!: string;

  @IsString()
  @MinLength(3)
  documento!: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  direccion?: string;
}
