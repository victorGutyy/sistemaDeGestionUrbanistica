import { IsDecimal, IsEnum, IsOptional, IsString } from 'class-validator';
import { TipoNovedad } from '../../generated/prisma/enums.js';

export class CrearNovedadDto {
  @IsEnum(TipoNovedad)
  tipo!: TipoNovedad;

  @IsDecimal({ decimal_digits: '0,2' })
  valor!: string;

  @IsOptional()
  @IsString()
  descripcion?: string;
}
