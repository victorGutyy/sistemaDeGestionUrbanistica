// La zona horaria y dotenv deben ser los primeros imports: app.module.js
// (y todo lo que importa transitivamente) lee variables de entorno y crea
// fechas en el nivel superior del archivo, antes de que Nest arranque.
import './common/zona-horaria.js';
import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Detrás del servidor web (Caddy) hay exactamente un intermediario: así Express toma la IP real de quien consulta
  // de la cabecera que Caddy agrega, y no la IP interna de Caddy. Sin esto, todos los registros y límites verían la misma IP.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  // Que Docker pueda detener la API de forma ordenada: termina lo que está haciendo y cierra la conexión a la base.
  app.enableShutdownHooks();
  app.enableCors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
