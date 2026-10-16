-- CreateEnum
CREATE TYPE "EstadoSeparacion" AS ENUM ('ACTIVA', 'CONVERTIDA', 'LIBERADA');

-- CreateTable
CREATE TABLE "Separacion" (
    "id" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "clienteId" TEXT,
    "nombreInteresado" TEXT,
    "telefonoInteresado" TEXT,
    "valor" DECIMAL(14,2),
    "fechaLimite" TIMESTAMP(3),
    "estado" "EstadoSeparacion" NOT NULL DEFAULT 'ACTIVA',
    "ventaId" TEXT,
    "registradaPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Separacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoVenta" (
    "id" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "ruta" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "descripcion" TEXT,
    "subidoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Desistimiento" (
    "id" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "valorDevolver" DECIMAL(14,2),
    "valorRetener" DECIMAL(14,2),
    "registradoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Desistimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Separacion_ventaId_key" ON "Separacion"("ventaId");

-- CreateIndex
CREATE INDEX "Separacion_loteId_estado_idx" ON "Separacion"("loteId", "estado");

-- CreateIndex
CREATE INDEX "DocumentoVenta_ventaId_idx" ON "DocumentoVenta"("ventaId");

-- CreateIndex
CREATE UNIQUE INDEX "Desistimiento_ventaId_key" ON "Desistimiento"("ventaId");

-- AddForeignKey
ALTER TABLE "Separacion" ADD CONSTRAINT "Separacion_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Separacion" ADD CONSTRAINT "Separacion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Separacion" ADD CONSTRAINT "Separacion_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Separacion" ADD CONSTRAINT "Separacion_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoVenta" ADD CONSTRAINT "DocumentoVenta_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoVenta" ADD CONSTRAINT "DocumentoVenta_subidoPorId_fkey" FOREIGN KEY ("subidoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Desistimiento" ADD CONSTRAINT "Desistimiento_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Desistimiento" ADD CONSTRAINT "Desistimiento_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que el esquema de Prisma no expresa (agregadas a mano).
-- Un lote tiene como máximo una separación activa a la vez.
CREATE UNIQUE INDEX "Separacion_lote_activa_key" ON "Separacion"("loteId") WHERE "estado" = 'ACTIVA';

-- Los valores de dinero del desistimiento no pueden ser negativos.
ALTER TABLE "Desistimiento"
    ADD CONSTRAINT "Desistimiento_valores_no_negativos" CHECK (
        ("valorDevolver" IS NULL OR "valorDevolver" >= 0) AND ("valorRetener" IS NULL OR "valorRetener" >= 0)
    );
ALTER TABLE "Separacion"
    ADD CONSTRAINT "Separacion_valor_no_negativo" CHECK ("valor" IS NULL OR "valor" >= 0);

-- El gerente recibe el permiso nuevo de registrar desistimientos (la app también lo sincroniza al arrancar).
UPDATE "RolUsuario"
SET "permisos" = array_append("permisos", 'ventas.desistir')
WHERE "clave" = 'GERENTE' AND NOT ('ventas.desistir' = ANY("permisos"));

