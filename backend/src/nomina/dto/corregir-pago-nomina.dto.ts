import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDecimal, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { MedioPago } from '../../generated/prisma/enums.js';
import { CrearNovedadDto } from './crear-novedad.dto.js';
import { MAXIMO_NOVEDADES_POR_PAGO } from './liquidar-quincena.dto.js';

const SOLO_PESOS = /^\d{1,12}$/;

// Corregir un pago ya liquidado por obra (CC-09, RF-PER-26). Lo que no se envía no cambia. No se cambia el trabajador, la obra
// ni el período: si estaban mal, el pago se anula y se liquida de nuevo.
export class CorregirPagoNominaDto {
  // Obligatorio: queda en la auditoría y explica después por qué se corrigió el pago.
  @IsString()
  @MinLength(10, { message: 'Explica la corrección con al menos 10 caracteres' })
  @MaxLength(500)
  motivo!: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,1' }, { message: 'dias debe ser un número con a lo sumo un decimal (por ejemplo 7 o 7.5)' })
  dias?: string;

  @IsOptional()
  @Matches(SOLO_PESOS, { message: 'valorDia debe ser un valor en pesos enteros' })
  valorDia?: string;

  // "0" quita las horas extra.
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,1' }, { message: 'horasExtra debe ser un número con a lo sumo un decimal' })
  horasExtra?: string;

  @IsOptional()
  @Matches(SOLO_PESOS, { message: 'valorHoraExtra debe ser un valor en pesos enteros' })
  valorHoraExtra?: string;

  // Si se envía, REEMPLAZA las novedades del pago (anticipos, descuentos, incapacidades); [] las quita todas.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAXIMO_NOVEDADES_POR_PAGO)
  @ValidateNested({ each: true })
  @Type(() => CrearNovedadDto)
  novedades?: CrearNovedadDto[];

  // "" borra las observaciones.
  @IsOptional()
  @IsString()
  @MaxLength(300)
  observaciones?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fechaPago debe tener el formato YYYY-MM-DD' })
  fechaPago?: string;

  @IsOptional()
  @IsEnum(MedioPago)
  medioPago?: MedioPago;

  @IsOptional()
  @IsUUID()
  cuentaId?: string;
}
