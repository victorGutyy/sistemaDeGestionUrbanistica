import { IsEnum, IsOptional, Matches } from 'class-validator';
import { TipoCierre } from '../../generated/prisma/enums.js';

export class CrearCierreDto {
  @IsEnum(TipoCierre)
  tipo!: TipoCierre;

  // Solo en el PRIMER cierre de la empresa: desde qué día empieza. Los siguientes empiezan solos el día
  // después del anterior, para que no queden huecos.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'desde debe tener el formato YYYY-MM-DD' })
  desde?: string;

  // Solo en el primer cierre: el efectivo que hay en la caja ese día. Los siguientes toman el efectivo contado
  // del cierre aprobado anterior.
  @IsOptional()
  @Matches(/^\d{1,14}$/, { message: 'efectivoInicial debe ser un valor en pesos enteros' })
  efectivoInicial?: string;
}
