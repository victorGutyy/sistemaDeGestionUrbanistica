import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { TipoEntidadSS } from '../../generated/prisma/enums.js';

// Valor en pesos como texto decimal (para no perder precisión): "1750905" o "1750905.50".
const PESOS = /^\d{1,12}(\.\d{1,2})?$/;
const MENSAJE_PESOS = 'debe ser un monto en pesos, sin signo, con máximo 2 decimales';

// Valores legales de un año (RF-CFG-13). Los porcentajes se envían como número (66,67 = 66,67 %).
export class CrearParametroLegalDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio!: number;

  @Matches(PESOS, { message: `smmlv ${MENSAJE_PESOS}` })
  smmlv!: string;

  @Matches(PESOS, { message: `auxilioTransporte ${MENSAJE_PESOS}` })
  auxilioTransporte!: string;

  // Omitido = 2 salarios mínimos.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(20)
  topeAuxilioSmmlv?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  porcentajeIncapacidadTramo1!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  porcentajeIncapacidadTramo2!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  porcentajeIncapacidadLaboral!: number;

  @IsInt()
  @Min(0)
  @Max(365)
  diasEmpleador!: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  diasTramo1Hasta!: number;

  @IsInt()
  @Min(2)
  @Max(1000)
  diasTramo2Hasta!: number;

  // Omitido = 30.
  @IsOptional()
  @IsInt()
  @Min(28)
  @Max(31)
  diasBaseMes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notas?: string;
}

// El año no se cambia (es la identidad del parámetro). Si cambia algún valor legal, la validación del asesor se pierde.
export class ActualizarParametroLegalDto {
  @IsOptional()
  @Matches(PESOS, { message: `smmlv ${MENSAJE_PESOS}` })
  smmlv?: string;

  @IsOptional()
  @Matches(PESOS, { message: `auxilioTransporte ${MENSAJE_PESOS}` })
  auxilioTransporte?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(20)
  topeAuxilioSmmlv?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  porcentajeIncapacidadTramo1?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  porcentajeIncapacidadTramo2?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  porcentajeIncapacidadLaboral?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  diasEmpleador?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  diasTramo1Hasta?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(1000)
  diasTramo2Hasta?: number;

  @IsOptional()
  @IsInt()
  @Min(28)
  @Max(31)
  diasBaseMes?: number;

  // Un texto vacío borra las notas.
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notas?: string;
}

// EPS, fondos de pensión y de cesantías, ARL y cajas (RF-CFG-14).
export class CrearEntidadSSDto {
  @IsEnum(TipoEntidadSS)
  tipo!: TipoEntidadSS;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre!: string;
}

// El tipo no se cambia: una afiliación ya registrada depende de él.
export class ActualizarEntidadSSDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}

// Las clases de riesgo son las cinco de la ley: solo se ajusta la tasa (porcentaje, máximo 3 decimales) o se desactiva.
export class ActualizarClaseRiesgoArlDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100)
  tasa?: number;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}
