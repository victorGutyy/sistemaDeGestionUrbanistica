import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// Global para no tener que importar PrismaModule en cada módulo de dominio
// (Proyectos, Ventas, Pagos, etc.) que necesite hablar con la base de datos.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
