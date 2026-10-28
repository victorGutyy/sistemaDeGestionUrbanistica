import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Chequeo de salud para el monitoreo y para Docker (RNF-DIS-01). Es público a propósito (quien vigila el servidor
// no tiene sesión), así que solo dice "ok" o "no": nunca devuelve datos, versiones ni mensajes de error de la base.
@Controller('salud')
export class SaludController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async comprobar(): Promise<{ estado: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ estado: 'sin-base-de-datos' });
    }
    return { estado: 'ok' };
  }
}
