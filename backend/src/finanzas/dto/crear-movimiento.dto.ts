import { IsEnum, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { MedioPago, TipoMovimiento } from '../../generated/prisma/enums.js';

// Se envía como formulario con archivo (el soporte es opcional), así que todo llega como texto.
export class CrearMovimientoDto {
  @IsEnum(TipoMovimiento)
  tipo!: TipoMovimiento;

  // Fecha calendario en formato YYYY-MM-DD.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe tener el formato YYYY-MM-DD' })
  fecha!: string;

  // Pesos enteros: el dinero de este sistema no maneja centavos.
  @Matches(/^[1-9]\d{0,13}$/, { message: 'valor debe ser un número entero de pesos mayor a cero' })
  valor!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  descripcion!: string;

  // Sin proyecto = gasto o ingreso general de la empresa.
  @IsOptional()
  @IsUUID()
  proyectoId?: string;

  // De gasto si es un egreso, de ingreso si es un ingreso.
  @IsUUID()
  categoriaId!: string;

  @IsEnum(MedioPago)
  medioPago!: MedioPago;

  // Obligatoria cuando el medio no es efectivo.
  @IsOptional()
  @IsUUID()
  cuentaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  referencia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  terceroNombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  terceroDocumento?: string;

  // Número de la factura o del recibo del proveedor o cliente.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  numeroDocumento?: string;

  // Si el egreso no tiene soporte adjunto, se explica por qué (RF-EGR-02).
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivoSinSoporte?: string;

  // Solo proyectos de maquinaria (RF-MAQ-03 y 04). Llegan como texto porque el formulario lleva archivo.
  @IsOptional()
  @IsUUID()
  equipoId?: string;

  // "true" = gasto (o ingreso) general de la flota.
  @IsOptional()
  @IsIn(['true', 'false'])
  flota?: string;

  // Período alquilado (ingresos por alquiler), "YYYY-MM-DD".
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'periodoDesde debe tener el formato YYYY-MM-DD' })
  periodoDesde?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'periodoHasta debe tener el formato YYYY-MM-DD' })
  periodoHasta?: string;
}
