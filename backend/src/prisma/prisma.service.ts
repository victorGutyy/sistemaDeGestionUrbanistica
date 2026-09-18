import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

// Desde Prisma 7, PrismaClient ya no se conecta solo con la URL del
// datasource: hay que pasarle explícitamente un "driver adapter". Usamos
// process.env directamente (en vez de inyectar ConfigService) porque
// ConfigModule.forRoot() ya cargó el .env para cuando esta clase se
// instancia, y `super(...)` debe llamarse antes de poder usar `this`.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
