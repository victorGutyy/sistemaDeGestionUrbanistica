import { ArrayMaxSize, IsArray, IsInt, IsOptional, Matches, Min } from 'class-validator';

const SOLO_PESOS = /^\d{1,12}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Lo que hace falta para mostrar cómo quedaría el plan de una venta financiada antes de guardarla (CC-08).
export class VistaPreviaPlanDto {
  @Matches(SOLO_PESOS, { message: 'valorTotal debe ser un valor en pesos enteros' })
  valorTotal!: string;

  @Matches(SOLO_PESOS, { message: 'cuotaInicial debe ser un valor en pesos enteros' })
  cuotaInicial!: string;

  @IsInt()
  @Min(1)
  numeroCuotas!: number;

  @IsOptional()
  @Matches(FECHA, { message: 'fechaVenta debe tener el formato YYYY-MM-DD' })
  fechaVenta?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'fechaLimiteCuotaInicial debe tener el formato YYYY-MM-DD' })
  fechaLimiteCuotaInicial?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'fechaPrimeraCuota debe tener el formato YYYY-MM-DD' })
  fechaPrimeraCuota?: string;

  // Una fecha por cada cuota, si el contrato las fija una por una.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(240)
  @Matches(FECHA, { each: true, message: 'Cada fecha de fechasCuotas debe tener el formato YYYY-MM-DD' })
  fechasCuotas?: string[];
}
