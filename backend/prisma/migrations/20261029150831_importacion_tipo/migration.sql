-- CreateEnum
CREATE TYPE "TipoImportacion" AS ENUM ('VENTAS', 'SST');

-- AlterTable
ALTER TABLE "Importacion" ADD COLUMN     "tipo" "TipoImportacion" NOT NULL DEFAULT 'VENTAS';
