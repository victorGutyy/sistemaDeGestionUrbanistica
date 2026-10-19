import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { EstadoEquipo } from '../../generated/prisma/enums.js';

export class CrearEquipoDto {
  // Debe ser un proyecto de tipo Maquinaria.
  @IsUUID()
  proyectoId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre!: string;

  @IsUUID()
  tipoEquipoId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  marca?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  modelo?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  anio?: number;

  // Placa o serie: no se repite entre equipos.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  placaSerie?: string;

  // Omitido = activo.
  @IsOptional()
  @IsEnum(EstadoEquipo)
  estado?: EstadoEquipo;
}

// Solo se cambia lo que se envía. En marca, modelo y placa o serie, un texto vacío borra el dato; en el año,
// null lo borra.
export class ActualizarEquipoDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsUUID()
  tipoEquipoId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  marca?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  modelo?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  anio?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  placaSerie?: string;

  @IsOptional()
  @IsEnum(EstadoEquipo)
  estado?: EstadoEquipo;
}

export class BajaEquipoDto {
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  motivo!: string;
}

export class ListarEquiposQueryDto {
  @IsOptional()
  @IsUUID()
  proyectoId?: string;

  // "true" = incluye los equipos dados de baja.
  @IsOptional()
  @IsString()
  incluirBajas?: string;
}

// Tipos de equipo (RF-MAQ-02): los administra el gerente en Configuración.
export class CrearTipoEquipoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  nombre!: string;
}

export class ActualizarTipoEquipoDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
