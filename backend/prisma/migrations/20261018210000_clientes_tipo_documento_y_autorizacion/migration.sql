-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('CC', 'CE', 'NIT', 'PASAPORTE', 'TI', 'OTRO');

-- AlterTable: solo se agregan columnas. Los clientes que ya existen quedan con tipo CC y sin autorización registrada.
ALTER TABLE "Cliente" ADD COLUMN     "autorizaDatos" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autorizacionRegistradaPorId" TEXT,
ADD COLUMN     "fechaAutorizacion" TIMESTAMP(3),
ADD COLUMN     "tipoDocumento" "TipoDocumento" NOT NULL DEFAULT 'CC';

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_autorizacionRegistradaPorId_fkey" FOREIGN KEY ("autorizacionRegistradaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------
-- Reglas que el esquema de Prisma no expresa (agregadas a mano).
-- ---------------------------------------------------------------------------------

-- Una autorización registrada siempre tiene fecha (RF-CLI-04).
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_autorizacion_con_fecha" CHECK ("autorizaDatos" = false OR "fechaAutorizacion" IS NOT NULL);
