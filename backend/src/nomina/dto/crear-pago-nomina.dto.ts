import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsUUID, Matches, ValidateNested } from 'class-validator';
import { MedioPago } from '../../generated/prisma/enums.js';
import { CrearNovedadDto } from './crear-novedad.dto.js';

export class CrearPagoNominaDto {
  @IsUUID()
  trabajadorId!: string;

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CrearNovedadDto)
  novedades?: CrearNovedadDto[];
}
