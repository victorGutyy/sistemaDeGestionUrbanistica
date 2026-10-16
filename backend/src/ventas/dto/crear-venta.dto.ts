import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDecimal,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CrearClienteDto } from '../../clientes/dto/crear-cliente.dto.js';
import { FormaPago, MedioPago } from '../../generated/prisma/enums.js';
import { CrearVendedorDto } from './crear-vendedor.dto.js';

const SOLO_PESOS = /^\d{1,12}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

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

  // Vendedor (asesor o referido): uno que ya existe o uno nuevo; ambos son opcionales.
  @IsOptional()
  @IsUUID()
  vendedorId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CrearVendedorDto)
  vendedorNuevo?: CrearVendedorDto;

  @IsEnum(FormaPago)
  formaPago!: FormaPago;

  // Todo valor de venta es en pesos enteros (sin centavos).
  @Matches(SOLO_PESOS, { message: 'valorTotal debe ser un valor en pesos enteros' })
  valorTotal!: string;

  // Cuota inicial en valor o en porcentaje (no ambos). Si no se envía ninguna, se usa el
  // porcentaje configurado. En una venta de contado se ignora: la cuota inicial es el valor total.
  @IsOptional()
  @Matches(SOLO_PESOS, { message: 'cuotaInicial debe ser un valor en pesos enteros' })
  cuotaInicial?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  cuotaInicialPorcentaje?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  numeroCuotas?: number;

  // Fecha calendario en formato YYYY-MM-DD (la que da un <input type="date">).
  // Si no se envía, se usa la fecha actual.
  @IsOptional()
  @Matches(FECHA, { message: 'fechaVenta debe tener el formato YYYY-MM-DD' })
  fechaVenta?: string;

  // Hasta cuándo se espera la cuota inicial; por defecto, el día de la venta.
  @IsOptional()
  @Matches(FECHA, { message: 'fechaLimiteCuotaInicial debe tener el formato YYYY-MM-DD' })
  fechaLimiteCuotaInicial?: string;

  // Si la cuota inicial se recibió completa al momento de vender, se registra su abono de una vez.
  // Las ventas con excepción registran el pago después de ser aprobadas.
  @IsOptional()
  @IsBoolean()
  cuotaInicialRecibida?: boolean;

  @IsOptional()
  @IsEnum(MedioPago)
  medioPago?: MedioPago;

  // Cuenta donde entró la cuota inicial (obligatoria si el medio de pago no es efectivo).
  @IsOptional()
  @IsUUID()
  cuentaDestinoId?: string;

  // Referencia de la transacción bancaria (no se puede repetir en la misma cuenta).
  @IsOptional()
  @IsString()
  @MaxLength(80)
  referencia?: string;

  // Obligatorio cuando la venta es una excepción (cuota inicial baja o plazo largo).
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivoExcepcion?: string;
}

export class RechazarVentaDto {
  @IsString()
  @Matches(/\S{3}/, { message: 'Escribe el motivo del rechazo' })
  @MaxLength(500)
  motivo!: string;
}
