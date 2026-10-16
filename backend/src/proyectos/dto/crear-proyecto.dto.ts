import { IsDecimal, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { TipoProyecto } from '../../generated/prisma/enums.js';

export class CrearProyectoDto {
  @IsString()
  @MinLength(3)
  nombre!: string;

  // Omitido = venta de lotes. Remodelación y maquinaria no tienen manzanas ni lotes.
  @IsOptional()
  @IsEnum(TipoProyecto)
  tipo?: TipoProyecto;

  @IsOptional()
  @IsString()
  ubicacion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  municipio?: string;

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
