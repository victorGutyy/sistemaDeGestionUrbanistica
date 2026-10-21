import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { CanalNotificacion, EstadoNotificacion, TipoNotificacion } from '../../generated/prisma/enums.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Filtros del historial de avisos (RF-NOT-06).
export class ListarNotificacionesQueryDto {
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsOptional()
  @IsUUID()
  ventaId?: string;

  @IsOptional()
  @IsEnum(TipoNotificacion)
  tipo?: TipoNotificacion;

  @IsOptional()
  @IsEnum(CanalNotificacion)
  canal?: CanalNotificacion;

  @IsOptional()
  @IsEnum(EstadoNotificacion)
  estado?: EstadoNotificacion;

  @IsOptional()
  @Matches(FECHA, { message: 'desde debe tener el formato YYYY-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'hasta debe tener el formato YYYY-MM-DD' })
  hasta?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limite?: number;
}

// Pide el mensaje de WhatsApp de un aviso (RF-NOT-04): recibo (con su abono), recordatorio (con su cuota, o la
// próxima por vencer) o mora (todas las cuotas vencidas de la venta).
export class PrepararWhatsAppDto {
  @IsEnum(TipoNotificacion)
  tipo!: TipoNotificacion;

  @IsUUID()
  ventaId!: string;

  @IsOptional()
  @IsUUID()
  abonoId?: string;

  @IsOptional()
  @IsUUID()
  cuotaId?: string;
}
