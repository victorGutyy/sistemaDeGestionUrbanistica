import { IsDecimal, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CrearProyectoDto {
  @IsString()
  @MinLength(3)
  nombre!: string;

  @IsOptional()
  @IsString()
  ubicacion?: string;

  @IsDecimal({ decimal_digits: '0,2' })
  areaTotal!: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  valorCompra?: string;

  // Fecha calendario en formato YYYY-MM-DD.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fechaCompra debe tener el formato YYYY-MM-DD' })
  fechaCompra?: string;
}
