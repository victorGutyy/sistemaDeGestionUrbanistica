import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ReglaAusentismo } from '../../generated/prisma/enums.js';

// Clave estable de un tipo: mayúsculas, números y guion bajo (ENFERMEDAD_GENERAL).
export const FORMATO_CODIGO_TIPO = /^[A-Z][A-Z0-9_]*$/;
// Código CIE-10: una letra, dos dígitos y, opcional, punto y uno o dos caracteres (J06.9).
export const FORMATO_CIE10 = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,2})?$/;

// Tipos de ausentismo (RF-CFG-14). La regla de liquidación se elige al crear y no cambia; el porcentaje solo aplica a las
// reglas que lo usan (la EPS, el empleador o el descuento).
export class CrearTipoAusentismoDto {
  @IsString()
  @MaxLength(60)
  @Matches(FORMATO_CODIGO_TIPO, { message: 'codigo debe ir en mayúsculas, con números o guion bajo (por ejemplo, LICENCIA_ESTUDIO)' })
  codigo!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(80)
  nombre!: string;

  @IsEnum(ReglaAusentismo)
  regla!: ReglaAusentismo;

  // Obligatorio en PAGA_EPS, PAGA_EMPLEADOR y DESCUENTO; prohibido en las demás.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  porcentaje?: number;

  @IsOptional()
  @IsBoolean()
  requiereDiagnostico?: boolean;

  // Solo en las reglas de origen laboral.
  @IsOptional()
  @IsBoolean()
  diaEventoComoLaborado?: boolean;
}

export class ActualizarTipoAusentismoDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  nombre?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  porcentaje?: number;

  @IsOptional()
  @IsBoolean()
  requiereDiagnostico?: boolean;

  @IsOptional()
  @IsBoolean()
  diaEventoComoLaborado?: boolean;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  orden?: number;
}

export class ListarTiposAusentismoQueryDto {
  // "true" = incluye los tipos desactivados.
  @IsOptional()
  @IsString()
  incluirInactivos?: string;
}

// Diagnósticos CIE-10 (RF-CFG-14).
export class CrearDiagnosticoCie10Dto {
  // Se guarda en mayúsculas.
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(FORMATO_CIE10, { message: 'codigo debe tener la forma del CIE-10: una letra, dos dígitos y, si lleva, punto y uno o dos caracteres (J06.9)' })
  codigo!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  descripcion!: string;
}

export class ActualizarDiagnosticoCie10Dto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  descripcion?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class ListarDiagnosticosCie10QueryDto {
  // Texto a buscar en el código o en la descripción.
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  // "true" = incluye los desactivados.
  @IsOptional()
  @IsString()
  incluirInactivos?: string;

  // Máximo de filas: por defecto 50 y como mucho 200. El catálogo puede llegar a miles de códigos.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(200)
  limite?: number;
}
