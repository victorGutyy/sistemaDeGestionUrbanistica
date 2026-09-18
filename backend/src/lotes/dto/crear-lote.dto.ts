import { IsDecimal, IsString, IsUUID, MinLength } from 'class-validator';

export class CrearLoteDto {
  @IsUUID()
  proyectoId!: string;

  @IsString()
  @MinLength(1)
  numero!: string;

  @IsDecimal({ decimal_digits: '0,2' })
  area!: string;

  @IsDecimal({ decimal_digits: '0,2' })
  valorVenta!: string;
}
