import { MaxLength, MinLength } from 'class-validator';

export class RestablecerPasswordDto {
  @MinLength(8)
  @MaxLength(72) // bcrypt solo considera los primeros 72 bytes
  password!: string;
}
