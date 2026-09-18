import { IsOptional, IsUUID } from 'class-validator';
import { FiltroPeriodoDto } from './filtro-periodo.dto.js';

export class ListarMovimientosQueryDto extends FiltroPeriodoDto {
  @IsOptional()
  @IsUUID()
  proyectoId?: string;
}
