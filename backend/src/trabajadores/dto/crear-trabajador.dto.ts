import { IsDecimal, IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CrearTrabajadorDto {
  @IsString()
  @MinLength(3)
  nombre!: string;

  @IsString()
  @MinLength(3)
  documento!: string;

  @IsString()
  @MinLength(2)
  cargo!: string;

  @IsDecimal({ decimal_digits: '0,2' })
  salarioBase!: string;

  // Fecha calendario en formato YYYY-MM-DD.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fechaIngreso debe tener el formato YYYY-MM-DD' })
  fechaIngreso!: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
