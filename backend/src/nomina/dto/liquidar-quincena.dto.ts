import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDecimal, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';
import { MedioPago } from '../../generated/prisma/enums.js';
import { CrearNovedadDto } from './crear-novedad.dto.js';

// Cuántos trabajadores caben en una sola liquidación (una obra y una quincena). Es un tope de digitación.
export const MAXIMO_PAGOS_POR_LIQUIDACION = 100;
export const MAXIMO_NOVEDADES_POR_PAGO = 10;

const SOLO_PESOS = /^\d{1,12}$/;

// Un trabajador dentro de la liquidación de una obra: sus días, sus horas extra y sus novedades.
export class PagoQuincenaDto {
  @IsUUID()
  trabajadorId!: string;

  // Días trabajados en esta obra durante el período; enteros o con medio día ("7" o "7.5").
  @IsDecimal({ decimal_digits: '0,1' }, { message: 'dias debe ser un número con a lo sumo un decimal (por ejemplo 7 o 7.5)' })
  dias!: string;

  // Si no se envía, se usa el valor día vigente del trabajador. Pesos enteros.
  @IsOptional()
  @Matches(SOLO_PESOS, { message: 'valorDia debe ser un valor en pesos enteros' })
  valorDia?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,1' }, { message: 'horasExtra debe ser un número con a lo sumo un decimal' })
  horasExtra?: string;

  // Valor de UNA hora extra, digitado. Pesos enteros.
  @IsOptional()
  @Matches(SOLO_PESOS, { message: 'valorHoraExtra debe ser un valor en pesos enteros' })
  valorHoraExtra?: string;

  // Descuentos, anticipos e incapacidades (restan). Las horas extra se envían en horasExtra y valorHoraExtra.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAXIMO_NOVEDADES_POR_PAGO)
  @ValidateNested({ each: true })
  @Type(() => CrearNovedadDto)
  novedades?: CrearNovedadDto[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observaciones?: string;
}

// Una liquidación: los pagos de una obra (proyecto) durante una quincena, todos con la misma fecha y forma de pago.
// Cada trabajador recibe UN pago por obra; si trabajó en dos obras, se envían dos liquidaciones.
export class LiquidarQuincenaDto {
  @IsUUID()
  proyectoId!: string;

  // Fechas calendario en formato YYYY-MM-DD.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'periodoInicio debe tener el formato YYYY-MM-DD' })
  periodoInicio!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'periodoFin debe tener el formato YYYY-MM-DD' })
  periodoFin!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fechaPago debe tener el formato YYYY-MM-DD' })
  fechaPago!: string;

  // Con qué se pagó y, si no fue en efectivo, de qué cuenta salió el dinero.
  @IsEnum(MedioPago)
  medioPago!: MedioPago;

  @IsOptional()
  @IsUUID()
  cuentaId?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Agrega al menos un trabajador a la liquidación' })
  @ArrayMaxSize(MAXIMO_PAGOS_POR_LIQUIDACION)
  @ValidateNested({ each: true })
  @Type(() => PagoQuincenaDto)
  pagos!: PagoQuincenaDto[];
}
