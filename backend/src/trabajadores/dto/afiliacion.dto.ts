import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { TipoEntidadSS } from '../../generated/prisma/enums.js';
import { FORMATO_FECHA } from './crear-trabajador.dto.js';

export class RegistrarAfiliacionDto {
  @IsEnum(TipoEntidadSS)
  tipo!: TipoEntidadSS;

  @IsUUID()
  entidadId!: string;

  // Obligatoria en la ARL y prohibida en las demás.
  @IsOptional()
  @IsUUID()
  claseRiesgoId?: string;

  @Matches(FORMATO_FECHA, { message: 'fechaInicio debe tener el formato YYYY-MM-DD' })
  fechaInicio!: string;
}

export class CerrarAfiliacionDto {
  @Matches(FORMATO_FECHA, { message: 'fechaFin debe tener el formato YYYY-MM-DD' })
  fechaFin!: string;
}
