import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

// Cargos de nómina (CC-05, RF-PER-19): los administra el gerente en Configuración. El valor día es solo una SUGERENCIA para
// el trabajador; cada trabajador guarda el suyo. Pesos enteros.
const SOLO_PESOS = /^\d{1,12}$/;

export class CrearCargoNominaDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  nombre!: string;

  @Matches(SOLO_PESOS, { message: 'valorDia debe ser un valor en pesos enteros' })
  valorDia!: string;
}

export class ActualizarCargoNominaDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  nombre?: string;

  @IsOptional()
  @Matches(SOLO_PESOS, { message: 'valorDia debe ser un valor en pesos enteros' })
  valorDia?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
