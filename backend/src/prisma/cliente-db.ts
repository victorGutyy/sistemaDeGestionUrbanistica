import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from './prisma.service.js';

// Un cliente de base de datos: el normal o el de una transacción que ya está abierta. Los servicios que se usan también desde
// la carga de datos desde Excel reciben uno de los dos, para que todo corra dentro de la misma transacción.
export type ClienteDb = Prisma.TransactionClient | PrismaService;
