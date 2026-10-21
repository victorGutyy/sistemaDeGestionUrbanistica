import { IsIn } from 'class-validator';
import { FiltroPanelDto } from './filtro-panel.dto.js';

export class ExportarDashboardDto extends FiltroPanelDto {
  @IsIn(['pdf', 'excel'])
  formato!: 'pdf' | 'excel';
}
