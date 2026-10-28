import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { DocumentosSstService } from './documentos-sst.service.js';
import { ActualizarActividadPlanDto, CopiarPlanDto, CrearActividadPlanDto, ListarPlanQueryDto } from './dto/plan.dto.js';
import { PlanTrabajoService } from './plan-trabajo.service.js';

const TAMANO_MAXIMO_DOCUMENTO = 10 * 1024 * 1024;

// Plan de trabajo anual. Ver: sst.ver. Crear, editar y copiar: sst.gestionar. Son datos de la empresa, no de un proyecto: no
// es para usuarios con alcance restringido. Las rutas fijas ("copiar") van antes que ":id".
@SoloAlcanceTotal()
@Controller('sst/plan')
export class PlanTrabajoController {
  constructor(
    private readonly planService: PlanTrabajoService,
    private readonly documentosService: DocumentosSstService,
  ) {}

  @Permiso(PERMISOS.SST_VER)
  @Get()
  listar(@Query() filtro: ListarPlanQueryDto) {
    return this.planService.listar(filtro);
  }

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Post()
  crear(@Body() dto: CrearActividadPlanDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.planService.crear(dto, usuario);
  }

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Post('copiar')
  copiar(@Body() dto: CopiarPlanDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.planService.copiarAnio(dto, usuario);
  }

  @Permiso(PERMISOS.SST_VER)
  @Get(':id')
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.planService.buscar(id);
  }

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Patch(':id')
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarActividadPlanDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.planService.actualizar(id, dto, usuario);
  }

  // ---------- Evidencias de una actividad (RF-SST-21) ----------

  @Permiso(PERMISOS.SST_VER)
  @Get(':id/documentos')
  listarDocumentos(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentosService.listar({ tipo: 'actividadPlan', id });
  }

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Post(':id/documentos')
  @UseInterceptors(FileInterceptor('documento', { limits: { fileSize: TAMANO_MAXIMO_DOCUMENTO } }))
  subirDocumento(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @Body('descripcion') descripcion: string | undefined,
    @CurrentUsuario() usuario: UsuarioAutenticado,
  ) {
    return this.documentosService.subir({ tipo: 'actividadPlan', id }, archivo, typeof descripcion === 'string' ? descripcion : undefined, usuario);
  }

  @Permiso(PERMISOS.SST_VER)
  @Get(':id/documentos/:documentoId')
  async descargarDocumento(@Param('id', ParseUUIDPipe) id: string, @Param('documentoId', ParseUUIDPipe) documentoId: string, @Res() res: Response) {
    const { buffer, contentType, nombre } = await this.documentosService.leer({ tipo: 'actividadPlan', id }, documentoId);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(buffer);
  }
}
