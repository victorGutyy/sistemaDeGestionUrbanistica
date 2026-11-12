import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

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

  // true: solo calcula y muestra los cambios, sin guardar nada.
  @IsOptional()
  @IsBoolean()
  soloVistaPrevia?: boolean;
}
