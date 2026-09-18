import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AbonosModule } from './abonos/abonos.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CarteraModule } from './cartera/cartera.module.js';
import { ClientesModule } from './clientes/clientes.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { FinanzasModule } from './finanzas/finanzas.module.js';
import { LotesModule } from './lotes/lotes.module.js';
import { NominaModule } from './nomina/nomina.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProyectosModule } from './proyectos/proyectos.module.js';
import { TrabajadoresModule } from './trabajadores/trabajadores.module.js';
import { VentasModule } from './ventas/ventas.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    ProyectosModule,
    LotesModule,
    ClientesModule,
    VentasModule,
    AbonosModule,
    CarteraModule,
    FinanzasModule,
    TrabajadoresModule,
    NominaModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
