-- CreateEnum
CREATE TYPE "MedioPago" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA');

-- AlterEnum
ALTER TYPE "EstadoCuota" ADD VALUE 'PARCIAL';

-- CreateTable
CREATE TABLE "Abono" (
    "id" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "cuotaId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "medioPago" "MedioPago" NOT NULL,
    "comprobanteUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Abono_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Abono" ADD CONSTRAINT "Abono_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abono" ADD CONSTRAINT "Abono_cuotaId_fkey" FOREIGN KEY ("cuotaId") REFERENCES "Cuota"("id") ON DELETE SET NULL ON UPDATE CASCADE;
