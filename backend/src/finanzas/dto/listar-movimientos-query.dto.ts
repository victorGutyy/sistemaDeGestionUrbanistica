import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { EstadoMovimiento, TipoMovimiento } from '../../generated/prisma/enums.js';
import { FiltroPeriodoDto } from './filtro-periodo.dto.js';

export class ListarMovimientosQueryDto extends FiltroPeriodoDto {
  @IsOptional()
  @IsUUID()
  proyectoId?: string;

  @IsOptional()
  @IsEnum(TipoMovimiento)
  tipo?: TipoMovimiento;

  @IsOptional()
  @IsEnum(EstadoMovimiento)
  estado?: EstadoMovimiento;
}
