import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AbonosModule } from './abonos/abonos.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { RolesGuard } from './auth/roles.guard.js';
import { CarteraModule } from './cartera/cartera.module.js';
import { ClientesModule } from './clientes/clientes.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { FinanzasModule } from './finanzas/finanzas.module.js';
import { LotesModule } from './lotes/lotes.module.js';
import { NominaModule } from './nomina/nomina.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProyectosModule } from './proyectos/proyectos.module.js';
import { RecordatoriosModule } from './recordatorios/recordatorios.module.js';
import { TrabajadoresModule } from './trabajadores/trabajadores.module.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';
import { VentasModule } from './ventas/ventas.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsuariosModule,
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
    RecordatoriosModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Orden importa: JwtAuthGuard llena request.user antes de que
    // RolesGuard decida si el rol tiene permiso.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
