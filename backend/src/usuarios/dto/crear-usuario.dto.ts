import { IsEmail, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CrearUsuarioDto {
  @MinLength(3)
  @MaxLength(120)
  nombre!: string;

  @IsEmail()
  email!: string;

  @MinLength(8)
  @MaxLength(72) // bcrypt solo considera los primeros 72 bytes
  password!: string;

  @IsUUID()
  rolId!: string;
}
