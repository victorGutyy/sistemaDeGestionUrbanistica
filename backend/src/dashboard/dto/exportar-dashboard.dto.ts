import { IsIn } from 'class-validator';
import { FiltroPeriodoDto } from '../../finanzas/dto/filtro-periodo.dto.js';

export class ExportarDashboardDto extends FiltroPeriodoDto {
  @IsIn(['pdf', 'excel'])
  formato!: 'pdf' | 'excel';
}
