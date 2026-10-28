import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CicloPhva, EstadoActividadSst } from '../../generated/prisma/enums.js';

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
// Valor en pesos como texto decimal (para no perder precisión): "500000" o "500000.50".
const PESOS = /^\d{1,12}(\.\d{1,2})?$/;

// Actividad del plan de trabajo anual (RF-SST-15). Las dos fechas deben caer dentro del año del plan.
export class CrearActividadPlanDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio!: number;

  @IsEnum(CicloPhva)
  ciclo!: CicloPhva;

  // Estándar o componente de la Resolución 0312 al que aporta la actividad.
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  estandar!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  actividad!: string;

  // Resultado esperado, medible.
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  meta!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  responsable!: string;

  // A este correo llegan los recordatorios de la actividad.
  @IsEmail()
  @MaxLength(120)
  correoResponsable!: string;

  @Matches(FORMATO_FECHA, { message: 'fechaInicio debe tener el formato YYYY-MM-DD' })
  fechaInicio!: string;

  @Matches(FORMATO_FECHA, { message: 'fechaFin debe tener el formato YYYY-MM-DD' })
  fechaFin!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  recursos?: string;

  @IsOptional()
  @Matches(PESOS, { message: 'presupuesto debe ser un monto en pesos, sin signo, con máximo 2 decimales' })
  presupuesto?: string;

  // Omitido = programada.
  @IsOptional()
  @IsEnum(EstadoActividadSst)
  estado?: EstadoActividadSst;

  // De 0 a 100. Una actividad ejecutada queda siempre en 100.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  porcentajeAvance?: number;
}

// Solo se cambia lo que se envía. En recursos y presupuesto, un texto vacío borra el dato. El año no se cambia: se copia el
// plan al año que se necesite.
export class ActualizarActividadPlanDto {
  @IsOptional()
  @IsEnum(CicloPhva)
  ciclo?: CicloPhva;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  estandar?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  actividad?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  meta?: string;

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
  @Matches(FORMATO_FECHA, { message: 'fechaInicio debe tener el formato YYYY-MM-DD' })
  fechaInicio?: string;

  @IsOptional()
  @Matches(FORMATO_FECHA, { message: 'fechaFin debe tener el formato YYYY-MM-DD' })
  fechaFin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  recursos?: string;

  @IsOptional()
  @Matches(/^(\d{1,12}(\.\d{1,2})?)?$/, { message: 'presupuesto debe ser un monto en pesos, sin signo, con máximo 2 decimales (vacío lo borra)' })
  presupuesto?: string;

  @IsOptional()
  @IsEnum(EstadoActividadSst)
  estado?: EstadoActividadSst;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  porcentajeAvance?: number;
}

export class ListarPlanQueryDto {
  // Sin indicar, el año en curso.
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'anio debe ser un año de cuatro cifras' })
  anio?: string;

  @IsOptional()
  @IsEnum(EstadoActividadSst)
  estado?: EstadoActividadSst;
}

// Copia el plan de un año como borrador del siguiente (RF-SST-17).
export class CopiarPlanDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  anioOrigen!: number;

  @IsInt()
  @Min(2000)
  @Max(2100)
  anioDestino!: number;
}
