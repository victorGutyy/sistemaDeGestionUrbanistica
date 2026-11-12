-- CreateTable
CREATE TABLE "AcuerdoPago" (
    "id" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL,
    "hastaPrevista" TIMESTAMP(3),
    "finalizadoEn" TIMESTAMP(3),
    "motivoFin" TEXT,
    "creadoPorId" TEXT NOT NULL,
    "finalizadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcuerdoPago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcuerdoPago_ventaId_idx" ON "AcuerdoPago"("ventaId");

-- AddForeignKey
ALTER TABLE "AcuerdoPago" ADD CONSTRAINT "AcuerdoPago_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcuerdoPago" ADD CONSTRAINT "AcuerdoPago_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcuerdoPago" ADD CONSTRAINT "AcuerdoPago_finalizadoPorId_fkey" FOREIGN KEY ("finalizadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
