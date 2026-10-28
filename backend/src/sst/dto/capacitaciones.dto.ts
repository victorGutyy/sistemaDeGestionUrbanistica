import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EjecutorCapacitacion, EstadoActividadSst, ModalidadCapacitacion } from '../../generated/prisma/enums.js';

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Capacitación del plan de capacitación (RF-SST-18).
export class CrearCapacitacionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  tema!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  objetivo!: string;

  // Población objetivo: áreas o cargos.
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  dirigidoA!: string;

  @IsEnum(ModalidadCapacitacion)
  modalidad!: ModalidadCapacitacion;

  // Intensidad horaria.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.25)
  @Max(500)
  horas!: number;

  @Matches(FORMATO_FECHA, { message: 'fechaProgramada debe tener el formato YYYY-MM-DD' })
  fechaProgramada!: string;

  // Obligatoria cuando la capacitación está ejecutada.
  @IsOptional()
  @Matches(FORMATO_FECHA, { message: 'fechaEjecucion debe tener el formato YYYY-MM-DD' })
  fechaEjecucion?: string;

  // Quien dicta o coordina, y su correo para los recordatorios.
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  responsable!: string;

  @IsEmail()
  @MaxLength(120)
  correoResponsable!: string;

  @IsEnum(EjecutorCapacitacion)
  ejecutor!: EjecutorCapacitacion;

  @IsInt()
  @Min(0)
  @Max(1000)
  asistentesProgramados!: number;

  // Omitido = programada.
  @IsOptional()
  @IsEnum(EstadoActividadSst)
  estado?: EstadoActividadSst;

  // Evaluación de eficacia de 1 a 5.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(5)
  evaluacionEficacia?: number;
}

export class ActualizarCapacitacionDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  tema?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  objetivo?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  dirigidoA?: string;

  @IsOptional()
  @IsEnum(ModalidadCapacitacion)
  modalidad?: ModalidadCapacitacion;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.25)
  @Max(500)
  horas?: number;

  @IsOptional()
  @Matches(FORMATO_FECHA, { message: 'fechaProgramada debe tener el formato YYYY-MM-DD' })
  fechaProgramada?: string;

  @IsOptional()
  @Matches(FORMATO_FECHA, { message: 'fechaEjecucion debe tener el formato YYYY-MM-DD' })
  fechaEjecucion?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  responsable?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  correoResponsable?: string;

  @IsOptional()
  @IsEnum(EjecutorCapacitacion)
  ejecutor?: EjecutorCapacitacion;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  asistentesProgramados?: number;

  @IsOptional()
  @IsEnum(EstadoActividadSst)
  estado?: EstadoActividadSst;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(5)
  evaluacionEficacia?: number;
}

export class ListarCapacitacionesQueryDto {
  // Sin indicar, el año en curso.
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'anio debe ser un año de cuatro cifras' })
  anio?: string;

  @IsOptional()
  @IsEnum(EstadoActividadSst)
  estado?: EstadoActividadSst;
}

export class AsistenteDto {
  @IsUUID()
  trabajadorId!: string;

  @IsOptional()
  @IsBoolean()
  firmo?: boolean;

  // Nota de la evaluación, de 0 a 5.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(5)
  calificacion?: number;
}

// Registra varios asistentes de una vez. Los que ya estaban registrados se omiten (no se duplican).
export class RegistrarAsistentesDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Elige al menos un asistente' })
  @ArrayMaxSize(300, { message: 'Son demasiados asistentes de una vez' })
  @ValidateNested({ each: true })
  @Type(() => AsistenteDto)
  asistentes!: AsistenteDto[];
}

// Solo se cambia lo que se envía. La calificación se borra con null.
export class ActualizarAsistenciaDto {
  @IsOptional()
  @IsBoolean()
  firmo?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(5)
  calificacion?: number | null;
}

export class AnularAsistenciaDto {
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  motivo!: string;
}
