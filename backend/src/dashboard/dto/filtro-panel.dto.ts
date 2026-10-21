import { IsOptional, IsUUID } from 'class-validator';
import { FiltroPeriodoDto } from '../../finanzas/dto/filtro-periodo.dto.js';

// El panel general se puede mirar por rango de fechas y por proyecto (RF-REP-01).
export class FiltroPanelDto extends FiltroPeriodoDto {
  @IsOptional()
  @IsUUID()
  proyectoId?: string;
}
