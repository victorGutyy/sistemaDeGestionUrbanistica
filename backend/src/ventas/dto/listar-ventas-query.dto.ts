import { IsEnum, IsOptional } from 'class-validator';
import { EstadoVenta } from '../../generated/prisma/enums.js';

export class ListarVentasQueryDto {
  @IsOptional()
  @IsEnum(EstadoVenta)
  estado?: EstadoVenta;
}
