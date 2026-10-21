import { IsEmail, MaxLength } from 'class-validator';

// A quién se le manda el correo de prueba.
export class EnviarPruebaDto {
  @IsEmail({}, { message: 'Escribe un correo válido' })
  @MaxLength(254)
  destino!: string;
}
