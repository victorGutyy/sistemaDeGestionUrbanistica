import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// La fecha de una cuota concreta, cuando el contrato las fija una por una.
export class FechaDeCuotaDto {
  @IsInt()
  @Min(1)
  numero!: number;

  @Matches(FECHA, { message: 'fecha debe tener el formato YYYY-MM-DD' })
  fecha!: string;
}

// Reprogramar las fechas del plan de una venta ya registrada (CC-08). Solo fechas: los valores y lo pagado no cambian.
export class AjustarPlanDto {
  // Obligatorio: queda en la auditoría y explica después por qué se movieron las fechas.
  @IsString()
  @MinLength(10, { message: 'Explica el ajuste con al menos 10 caracteres' })
  @MaxLength(500)
  motivo!: string;

  // Nueva fecha límite de la cuota inicial (si todavía no está pagada).
  @IsOptional()
  @Matches(FECHA, { message: 'fechaCuotaInicial debe tener el formato YYYY-MM-DD' })
  fechaCuotaInicial?: string;

  // Fecha de la primera cuota pendiente; las siguientes caen el mismo día de cada mes.
  @IsOptional()
  @Matches(FECHA, { message: 'fechaPrimeraCuotaPendiente debe tener el formato YYYY-MM-DD' })
  fechaPrimeraCuotaPendiente?: string;

  // Fecha de cada cuota que se quiere mover (solo cuotas sin pagar). No se combina con fechaPrimeraCuotaPendiente.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(240)
  @ValidateNested({ each: true })
  @Type(() => FechaDeCuotaDto)
  fechasCuotas?: FechaDeCuotaDto[];

  // true: solo calcula y muestra los cambios, sin guardar nada.
  @IsOptional()
  @IsBoolean()
  soloVistaPrevia?: boolean;
}
