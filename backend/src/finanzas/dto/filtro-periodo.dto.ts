import { IsOptional, Matches } from 'class-validator';

export class FiltroPeriodoDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'desde debe tener el formato YYYY-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hasta debe tener el formato YYYY-MM-DD' })
  hasta?: string;
}
