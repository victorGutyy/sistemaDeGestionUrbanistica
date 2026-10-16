-- AlterEnum (CANCELADA pasa a llamarse DESISTIDA; las ventas que la tuvieran la conservan)
ALTER TYPE "EstadoVenta" RENAME VALUE 'CANCELADA' TO 'DESISTIDA';
ALTER TYPE "EstadoVenta" ADD VALUE 'PENDIENTE_APROBACION';
ALTER TYPE "EstadoVenta" ADD VALUE 'RECHAZADA';

-- AlterTable
ALTER TABLE "Venta" ADD COLUMN     "esExcepcion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fechaCuotaInicial" TIMESTAMP(3),
ADD COLUMN     "motivoExcepcion" TEXT,
ADD COLUMN     "motivoRechazo" TEXT,
ADD COLUMN     "registradaPorId" TEXT,
ADD COLUMN     "resueltaEn" TIMESTAMP(3),
ADD COLUMN     "resueltaPorId" TEXT,
ADD COLUMN     "separoElLote" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vendedorId" TEXT;

-- CreateTable
CREATE TABLE "Vendedor" (
    "id" TEXT NOT NULL,
    "tipo" "TipoVendedor" NOT NULL,
    "nombre" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "telefono" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendedor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vendedor_documento_key" ON "Vendedor"("documento");

-- CreateIndex
CREATE INDEX "Venta_loteId_idx" ON "Venta"("loteId");

-- CreateIndex
CREATE INDEX "Venta_estado_idx" ON "Venta"("estado");

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_resueltaPorId_fkey" FOREIGN KEY ("resueltaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------
-- La cuota inicial pasa a ser la cuota número 0 del plan, pagada con abonos como las demás.
-- Las ventas que ya existían la tenían "pagada desde el día uno" sin abono; para que su estado
-- de cuenta y el consolidado de caja sigan dando lo mismo, se les crea su cuota 0 pagada y un
-- abono por el mismo valor, fechado el día de la venta. El medio de pago de esos abonos
-- históricos no se conoce: se marca EFECTIVO (dato de arranque; en el paso de recibos pasan a
-- ser recibos históricos).
-- ---------------------------------------------------------------------------------
INSERT INTO "Cuota" ("id", "ventaId", "numero", "fechaVencimiento", "valor", "estado", "updatedAt")
SELECT gen_random_uuid()::text, v."id", 0, v."fechaVenta", v."cuotaInicial", 'PAGADA', CURRENT_TIMESTAMP
FROM "Venta" v
WHERE v."cuotaInicial" > 0
  AND NOT EXISTS (SELECT 1 FROM "Cuota" c WHERE c."ventaId" = v."id" AND c."numero" = 0);

INSERT INTO "Abono" ("id", "ventaId", "cuotaId", "fecha", "valor", "medioPago", "updatedAt")
SELECT gen_random_uuid()::text, c."ventaId", c."id", v."fechaVenta", v."cuotaInicial", 'EFECTIVO', CURRENT_TIMESTAMP
FROM "Cuota" c
JOIN "Venta" v ON v."id" = c."ventaId"
WHERE c."numero" = 0
  AND NOT EXISTS (SELECT 1 FROM "Abono" a WHERE a."cuotaId" = c."id");

