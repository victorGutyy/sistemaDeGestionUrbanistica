import { IsEmail, Matches, MaxLength, MinLength } from 'class-validator';
import { FORMATO_TOKEN } from '../recuperacion-token.js';

// Pide el enlace de recuperación (RF-USR-06).
export class SolicitarRecuperacionDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

// Cambia la contraseña con el token que llegó por correo.
export class RestablecerConTokenDto {
  @Matches(FORMATO_TOKEN, { message: 'El enlace no es válido' })
  token!: string;

  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(72, { message: 'La contraseña no puede pasar de 72 caracteres' }) // bcrypt solo considera los primeros 72 bytes
  password!: string;
}
