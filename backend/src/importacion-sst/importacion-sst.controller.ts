import { Body, Controller, Get, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ImportacionSstService } from './importacion-sst.service.js';
import { TAMANO_MAXIMO_ARCHIVO_SST } from './plantilla-sst-definicion.js';

const CONTENT_TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// La carga de datos de seguridad y salud en el trabajo desde Excel (RF-SST-23) es de toda la empresa y solo la hace el gerente
// (importacion.gestionar), como la carga de ventas. El tipo real del archivo se verifica por su contenido al leerlo (no por el
// nombre ni por lo que declare el navegador). Se registra antes que las rutas con ":id" del importador de ventas.
@SoloAlcanceTotal()
@Controller('importacion/sst')
export class ImportacionSstController {
  constructor(private readonly importacionSst: ImportacionSstService) {}

  @Permiso(PERMISOS.IMPORTACION_GESTIONAR)
  @Get('plantilla')
  async plantilla(@Res() res: Response) {
    const buffer = await this.importacionSst.plantilla();
    res.set({ 'Content-Type': CONTENT_TYPE_XLSX, 'Content-Disposition': 'attachment; filename="plantilla-carga-sst.xlsx"' });
    res.send(buffer);
  }

  // Modo de prueba: valida y muestra errores y avisos, sin guardar nada.
  @Permiso(PERMISOS.IMPORTACION_GESTIONAR)
  @Post('validar')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: TAMANO_MAXIMO_ARCHIVO_SST } }))
  validar(@CurrentUsuario() usuario: UsuarioAutenticado, @UploadedFile() archivo?: Express.Multer.File) {
    return this.importacionSst.validar(archivo, usuario);
  }

  // Confirmación: se envía el mismo archivo y la huella que devolvió la validación.
  @Permiso(PERMISOS.IMPORTACION_GESTIONAR)
  @Post('confirmar')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: TAMANO_MAXIMO_ARCHIVO_SST } }))
  confirmar(@Body('huella') huella: string | undefined, @CurrentUsuario() usuario: UsuarioAutenticado, @UploadedFile() archivo?: Express.Multer.File) {
    return this.importacionSst.confirmar(archivo, typeof huella === 'string' ? huella : undefined, usuario);
  }

  @Permiso(PERMISOS.IMPORTACION_GESTIONAR)
  @Get()
  listar() {
    return this.importacionSst.listar();
  }
}
