import { Type } from 'class-transformer';
import {
  IsDecimal,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { FormaPago } from '../../../generated/prisma/enums.js';
import { CrearClienteDto } from '../../clientes/dto/crear-cliente.dto.js';

export class CrearVentaDto {
  @IsUUID()
  loteId!: string;

  // Se debe enviar exactamente uno de los dos: un cliente que ya existe,
  // o los datos para crear uno nuevo (se valida en VentasService, porque
  // class-validator no expresa bien una regla "uno u otro, no ambos").
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CrearClienteDto)
  clienteNuevo?: CrearClienteDto;

  @IsEnum(FormaPago)
  formaPago!: FormaPago;

  @IsDecimal({ decimal_digits: '0,2' })
  valorTotal!: string;

  @IsDecimal({ decimal_digits: '0,2' })
  cuotaInicial!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  numeroCuotas?: number;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  tasaInteres?: string;

  // Fecha calendario en formato YYYY-MM-DD (la que da un <input type="date">).
  // Si no se envía, se usa la fecha actual.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fechaVenta debe tener el formato YYYY-MM-DD' })
  fechaVenta?: string;
}
