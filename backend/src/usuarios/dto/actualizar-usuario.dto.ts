import { IsEmail, IsOptional, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ActualizarUsuarioDto {
  @IsOptional()
  @MinLength(3)
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUUID()
  rolId?: string;
}
