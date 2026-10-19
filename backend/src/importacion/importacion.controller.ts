import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ImportacionService } from './importacion.service.js';
import { TAMANO_MAXIMO_ARCHIVO } from './plantilla-definicion.js';

const CONTENT_TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// La carga de datos es de toda la empresa y solo la hace el gerente. El tipo real del archivo se verifica por su
// contenido al leerlo (no por el nombre ni por lo que declare el navegador).
@SoloAlcanceTotal()
@Controller('importacion')
export class ImportacionController {
  constructor(private readonly importacionService: ImportacionService) {}

  @Permiso(PERMISOS.IMPORTACION_GESTIONAR)
  @Get('plantilla')
  async plantilla(@Res() res: Response) {
    const buffer = await this.importacionService.plantilla();
    res.set({ 'Content-Type': CONTENT_TYPE_XLSX, 'Content-Disposition': 'attachment; filename="plantilla-importacion.xlsx"' });
    res.send(buffer);
  }

  // Modo de prueba: valida y muestra errores y diferencias, sin guardar nada.
  @Permiso(PERMISOS.IMPORTACION_GESTIONAR)
  @Post('validar')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: TAMANO_MAXIMO_ARCHIVO } }))
  validar(@UploadedFile() archivo?: Express.Multer.File) {
    return this.importacionService.validar(archivo);
  }

  // Confirmación: se envía el mismo archivo y la huella que devolvió la validación.
  @Permiso(PERMISOS.IMPORTACION_GESTIONAR)
  @Post('confirmar')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: TAMANO_MAXIMO_ARCHIVO } }))
  confirmar(@Body('huella') huella: string | undefined, @CurrentUsuario() usuario: UsuarioAutenticado, @UploadedFile() archivo?: Express.Multer.File) {
    return this.importacionService.confirmar(archivo, typeof huella === 'string' ? huella : undefined, usuario);
  }

  @Permiso(PERMISOS.IMPORTACION_GESTIONAR)
  @Get()
  listar() {
    return this.importacionService.listar();
  }

  @Permiso(PERMISOS.IMPORTACION_GESTIONAR)
  @Get(':id')
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.importacionService.buscarPorId(id);
  }

  @Permiso(PERMISOS.IMPORTACION_GESTIONAR)
  @Get(':id/conciliacion')
  async conciliacion(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { buffer, nombreArchivo } = await this.importacionService.conciliacionExcel(id);
    res.set({ 'Content-Type': CONTENT_TYPE_XLSX, 'Content-Disposition': `attachment; filename="${nombreArchivo}"` });
    res.send(buffer);
  }
}
