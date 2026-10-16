import { IsEnum, IsOptional } from 'class-validator';
import { TipoCierre } from '../../generated/prisma/enums.js';

export class ProximoCierreQueryDto {
  @IsOptional()
  @IsEnum(TipoCierre)
  tipo?: TipoCierre;
}
