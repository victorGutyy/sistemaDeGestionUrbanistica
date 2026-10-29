import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Los estados que acepta algún reporte: los de un registro (ausentismo) y los de una actividad o capacitación. Cada reporte
// valida el que le corresponde.
const ESTADOS_ACEPTADOS = ['VIGENTES', 'ANULADOS', 'TODOS', 'PROGRAMADA', 'EN_EJECUCION', 'EJECUTADA', 'REPROGRAMADA', 'CANCELADA'];

// Los filtros de todos los reportes de SST (cada reporte usa los que le corresponden; ver catalogo.ts).
export class ConsultaReporteSstDto {
  // Sin indicar, el año en curso.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  mes?: number;

  @IsOptional()
  @Matches(FECHA, { message: 'desde debe tener el formato YYYY-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'hasta debe tener el formato YYYY-MM-DD' })
  hasta?: string;

  @IsOptional()
  @IsUUID()
  trabajadorId?: string;

  @IsOptional()
  @IsUUID()
  tipoId?: string;

  @IsOptional()
  @IsIn(ESTADOS_ACEPTADOS, { message: 'estado no es válido' })
  estado?: string;
}

export class ExportarReporteSstDto extends ConsultaReporteSstDto {
  @IsIn(['pdf', 'excel'], { message: 'formato debe ser pdf o excel' })
  formato!: 'pdf' | 'excel';
}
