import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MotivoEntregaEpp } from '../../generated/prisma/enums.js';

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Catálogo de EPP (RF-SST-12). La vida útil se cuenta en días y se copia a cada entrega: cambiarla después no altera las
// entregas ya hechas.
export class CrearElementoEppDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre!: string;

  @IsInt()
  @Min(1)
  @Max(3650)
  vidaUtilDias!: number;
}

export class ActualizarElementoEppDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  vidaUtilDias?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class ListarElementosEppQueryDto {
  // "true" = incluye los elementos desactivados.
  @IsOptional()
  @IsString()
  incluirInactivos?: string;
}

// Entrega de un elemento a un trabajador (RF-SST-13). La fecha no puede ser futura.
export class RegistrarEntregaEppDto {
  @IsUUID()
  trabajadorId!: string;

  @IsUUID()
  elementoId!: string;

  @Matches(FORMATO_FECHA, { message: 'fecha debe tener el formato YYYY-MM-DD' })
  fecha!: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  cantidad!: number;

  // Talla, marca o referencia.
  @IsOptional()
  @IsString()
  @MaxLength(30)
  tallaReferencia?: string;

  @IsEnum(MotivoEntregaEpp)
  motivo!: MotivoEntregaEpp;

  // Quién entregó. Si se omite, es quien registra.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  entregadoPor?: string;

  @IsOptional()
  @IsBoolean()
  firmoRecibido?: boolean;
}

export class AnularEntregaEppDto {
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  motivo!: string;
}

export class ListarEntregasEppQueryDto {
  @IsOptional()
  @IsUUID()
  trabajadorId?: string;

  @IsOptional()
  @IsUUID()
  elementoId?: string;

  @IsOptional()
  @Matches(FORMATO_FECHA, { message: 'desde debe tener el formato YYYY-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(FORMATO_FECHA, { message: 'hasta debe tener el formato YYYY-MM-DD' })
  hasta?: string;

  // "true" = incluye las anuladas.
  @IsOptional()
  @IsString()
  incluirAnuladas?: string;
}

export class ListarReposicionesQueryDto {
  // Sin indicar, solo las que requieren atención (por reponer y vencidas); "VIGENTE" o "TODOS" amplían la lista.
  @IsOptional()
  @IsString()
  @Matches(/^(VIGENTE|POR_REPONER|VENCIDO|TODOS)$/, { message: 'estado debe ser VIGENTE, POR_REPONER, VENCIDO o TODOS' })
  estado?: string;

  @IsOptional()
  @IsUUID()
  trabajadorId?: string;
}
