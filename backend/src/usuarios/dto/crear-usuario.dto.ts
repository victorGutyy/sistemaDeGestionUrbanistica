import { IsEmail, IsEnum, MinLength } from 'class-validator';
import { Rol } from '../../generated/prisma/enums.js';

export class CrearUsuarioDto {
  @MinLength(3)
  nombre!: string;

  @IsEmail()
  email!: string;

  @MinLength(8)
  password!: string;

  @IsEnum(Rol)
  rol!: Rol;
}
