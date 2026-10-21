import { IsEnum, IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import { EstadoLote, MedioPago } from '../../generated/prisma/enums.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Los filtros de todos los reportes (cada reporte usa los que le corresponden; ver catalogo.ts).
export class ConsultaReporteDto {
  @IsOptional()
  @Matches(FECHA, { message: 'desde debe tener el formato YYYY-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'hasta debe tener el formato YYYY-MM-DD' })
  hasta?: string;

  @IsOptional()
  @IsUUID()
  proyectoId?: string;

  @IsOptional()
  @IsEnum(MedioPago)
  medioPago?: MedioPago;

  @IsOptional()
  @IsUUID()
  cuentaId?: string;

  @IsOptional()
  @IsUUID()
  usuarioId?: string;

  @IsOptional()
  @IsUUID()
  categoriaId?: string;

  @IsOptional()
  @IsEnum(EstadoLote)
  estadoLote?: EstadoLote;

  @IsOptional()
  @IsIn(['DIA', 'SEMANA', 'QUINCENA', 'MES'])
  granularidad?: 'DIA' | 'SEMANA' | 'QUINCENA' | 'MES';
}

export class ExportarReporteDto extends ConsultaReporteDto {
  @IsIn(['pdf', 'excel'])
  formato!: 'pdf' | 'excel';
}
