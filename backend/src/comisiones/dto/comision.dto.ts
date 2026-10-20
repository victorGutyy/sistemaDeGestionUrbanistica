import { IsEnum, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { EstadoComision, MedioPago } from '../../generated/prisma/enums.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Filtros del listado y del reporte de comisiones (RF-REP-08): por vendedor, estado, proyecto y fechas.
export class ListarComisionesQueryDto {
  @IsOptional()
  @IsUUID()
  vendedorId?: string;

  @IsOptional()
  @IsEnum(EstadoComision)
  estado?: EstadoComision;

  @IsOptional()
  @IsUUID()
  proyectoId?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'desde debe tener el formato YYYY-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'hasta debe tener el formato YYYY-MM-DD' })
  hasta?: string;

  // A qué fecha se refiere el rango: la de la venta (por defecto) o la del pago de la comisión.
  @IsOptional()
  @IsIn(['venta', 'pago'])
  fechaPor?: 'venta' | 'pago';
}

// Se envía como formulario con archivo (el soporte es opcional), así que todo llega como texto.
export class PagarComisionDto {
  // Fecha en que se pagó, formato YYYY-MM-DD.
  @Matches(FECHA, { message: 'fecha debe tener el formato YYYY-MM-DD' })
  fecha!: string;

  @IsEnum(MedioPago)
  medioPago!: MedioPago;

  // De dónde salió el dinero: obligatoria cuando el medio no es efectivo.
  @IsOptional()
  @IsUUID()
  cuentaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  referencia?: string;

  // El pago es un egreso: lleva soporte adjunto o el motivo de por qué no lo hay (RF-EGR-02).
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivoSinSoporte?: string;
}

export class AnularComisionDto {
  @IsString()
  @MinLength(5, { message: 'Explica el motivo de la anulación (mínimo 5 caracteres)' })
  @MaxLength(500)
  motivo!: string;
}
