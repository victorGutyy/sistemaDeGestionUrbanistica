import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsOptional, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CrearUsuarioDto {
  @MinLength(3)
  @MaxLength(120)
  nombre!: string;

  @IsEmail()
  email!: string;

  @MinLength(8)
  @MaxLength(72) // bcrypt solo considera los primeros 72 bytes
  password!: string;

  @IsUUID()
  rolId!: string;

  // Alcance por proyecto: omitido = sin cambios (al crear, ve todos). false exige proyectoIds
  // y solo se acepta en roles marcados como limitables por proyecto.
  @IsOptional()
  @IsBoolean()
  todosLosProyectos?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  proyectoIds?: string[];
}
