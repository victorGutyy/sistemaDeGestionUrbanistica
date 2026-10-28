import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
// Valor en pesos como texto decimal (para no perder precisión): "500000" o "500000.50".
const PESOS = /^\d{1,12}(\.\d{1,2})?$/;

// Registrar un ausentismo (RF-SST-01 a 03). La liquidación la calcula el servidor: no se envía.
export class RegistrarAusentismoDto {
  @IsUUID()
  trabajadorId!: string;

  @IsUUID()
  tipoId!: string;

  @Matches(FORMATO_FECHA, { message: 'fechaInicio debe tener el formato YYYY-MM-DD' })
  fechaInicio!: string;

  @Matches(FORMATO_FECHA, { message: 'fechaFin debe tener el formato YYYY-MM-DD' })
  fechaFin!: string;

  // Número de la incapacidad o del certificado.
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  numeroDocumento?: string;

  // Prórroga de otra incapacidad: la que continúa (si está en el sistema) o, si venía de fuera, cuántos días llevaba.
  @IsOptional()
  @IsBoolean()
  esProrroga?: boolean;

  @IsOptional()
  @IsUUID()
  prorrogaDeId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  diasPrevios?: number;

  // Código CIE-10 del catálogo. Obligatorio en las incapacidades. Es un dato de salud: solo lo lee quien tiene permiso.
  @IsOptional()
  @IsUUID()
  diagnosticoId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}

// Un ausentismo registrado no cambia de trabajador, tipo ni fechas: se anula y se registra de nuevo. Solo se completan o
// corrigen estos datos. Un texto vacío en el número o en las observaciones los borra.
export class ActualizarAusentismoDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  numeroDocumento?: string;

  @IsOptional()
  @ValidateIf((_objeto, valor) => valor !== null)
  @IsUUID()
  diagnosticoId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}

export class AnularAusentismoDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  motivo!: string;
}

export class ListarAusentismosQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio?: number;

  // Mes (1 a 12): trae los ausentismos que tienen días en ese mes (del año indicado, o del año en curso si no se indica).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  mes?: number;

  @IsOptional()
  @IsUUID()
  trabajadorId?: string;

  @IsOptional()
  @IsUUID()
  tipoId?: string;

  // Sin indicar, solo los vigentes.
  @IsOptional()
  @IsEnum({ VIGENTES: 'VIGENTES', ANULADOS: 'ANULADOS', TODOS: 'TODOS' })
  estado?: 'VIGENTES' | 'ANULADOS' | 'TODOS';
}

// La parte de un mes de una liquidación, con los días de cada pagador y su valor, para la corrección manual (RF-SST-08).
export class PeriodoCorregidoDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  mes!: number;

  @IsInt()
  @Min(0)
  diasEmpleador!: number;

  @IsInt()
  @Min(0)
  diasEps!: number;

  @IsInt()
  @Min(0)
  diasArl!: number;

  @IsInt()
  @Min(0)
  diasAfp!: number;

  @IsInt()
  @Min(0)
  diasLaborados!: number;

  @IsInt()
  @Min(0)
  diasDescuento!: number;

  @Matches(PESOS, { message: 'valorEmpleador debe ser un monto en pesos, sin signo, con máximo 2 decimales' })
  valorEmpleador!: string;

  @Matches(PESOS, { message: 'valorEps debe ser un monto en pesos, sin signo, con máximo 2 decimales' })
  valorEps!: string;

  @Matches(PESOS, { message: 'valorArl debe ser un monto en pesos, sin signo, con máximo 2 decimales' })
  valorArl!: string;

  @Matches(PESOS, { message: 'valorAfp debe ser un monto en pesos, sin signo, con máximo 2 decimales' })
  valorAfp!: string;

  @Matches(PESOS, { message: 'valorDescuento debe ser un monto en pesos, sin signo, con máximo 2 decimales' })
  valorDescuento!: string;
}

export class CorregirLiquidacionDto {
  // Por qué se corrige (por ejemplo, lo que la EPS reconoció). Es obligatorio.
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  motivo!: string;

  // Todos los meses de la liquidación, con sus valores y días finales.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(120)
  @ValidateNested({ each: true })
  @Type(() => PeriodoCorregidoDto)
  periodos!: PeriodoCorregidoDto[];
}
