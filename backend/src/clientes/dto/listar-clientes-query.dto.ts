import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListarClientesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  buscar?: string;
}
