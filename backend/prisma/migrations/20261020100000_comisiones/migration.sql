-- CreateEnum
CREATE TYPE "EstadoComision" AS ENUM ('PENDIENTE', 'PAGADA', 'ANULADA');

-- AlterEnum (el valor nuevo solo se usa desde la aplicación, no en esta migración)
ALTER TYPE "OrigenMovimiento" ADD VALUE 'COMISION';

-- CreateTable
CREATE TABLE "Comision" (
    "id" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "tipoVendedor" "TipoVendedor" NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "estado" "EstadoComision" NOT NULL DEFAULT 'PENDIENTE',
    "movimientoId" TEXT,
    "pagadaPorId" TEXT,
    "pagadaEn" TIMESTAMP(3),
    "anuladaPorId" TEXT,
    "anuladaEn" TIMESTAMP(3),
    "motivoAnulacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (una comisión por venta, y un egreso paga una sola comisión)
CREATE UNIQUE INDEX "Comision_ventaId_key" ON "Comision"("ventaId");

-- CreateIndex
CREATE UNIQUE INDEX "Comision_movimientoId_key" ON "Comision"("movimientoId");

-- CreateIndex
CREATE INDEX "Comision_vendedorId_idx" ON "Comision"("vendedorId");

-- CreateIndex
CREATE INDEX "Comision_estado_idx" ON "Comision"("estado");

-- AddForeignKey
ALTER TABLE "Comision" ADD CONSTRAINT "Comision_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comision" ADD CONSTRAINT "Comision_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comision" ADD CONSTRAINT "Comision_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "MovimientoFinanciero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comision" ADD CONSTRAINT "Comision_pagadaPorId_fkey" FOREIGN KEY ("pagadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comision" ADD CONSTRAINT "Comision_anuladaPorId_fkey" FOREIGN KEY ("anuladaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------
-- Reglas que el esquema de Prisma no expresa (agregadas a mano). Esta migración solo agrega: no cambia ni borra
-- nada de lo que ya existe.
-- ---------------------------------------------------------------------------------

-- Pesos enteros y mayores a cero.
ALTER TABLE "Comision" ADD CONSTRAINT "Comision_valor_entero_positivo" CHECK ("valor" > 0 AND "valor" = trunc("valor"));

-- Cada estado lleva exactamente los datos que le corresponden:
--  · PENDIENTE: sin pago ni anulación.
--  · PAGADA: con su egreso, quién y cuándo la pagó; sin anulación.
--  · ANULADA: con quién, cuándo y por qué la anuló; si antes estuvo pagada conserva los datos del pago completos.
ALTER TABLE "Comision" ADD CONSTRAINT "Comision_estado_coherente" CHECK (
  (
    "estado" = 'PENDIENTE'
    AND "movimientoId" IS NULL AND "pagadaPorId" IS NULL AND "pagadaEn" IS NULL
    AND "anuladaPorId" IS NULL AND "anuladaEn" IS NULL AND "motivoAnulacion" IS NULL
  )
  OR (
    "estado" = 'PAGADA'
    AND "movimientoId" IS NOT NULL AND "pagadaPorId" IS NOT NULL AND "pagadaEn" IS NOT NULL
    AND "anuladaPorId" IS NULL AND "anuladaEn" IS NULL AND "motivoAnulacion" IS NULL
  )
  OR (
    "estado" = 'ANULADA'
    AND "anuladaPorId" IS NOT NULL AND "anuladaEn" IS NOT NULL
    AND "motivoAnulacion" IS NOT NULL AND btrim("motivoAnulacion") <> ''
    AND (
      ("movimientoId" IS NULL AND "pagadaPorId" IS NULL AND "pagadaEn" IS NULL)
      OR ("movimientoId" IS NOT NULL AND "pagadaPorId" IS NOT NULL AND "pagadaEn" IS NOT NULL)
    )
  )
);

-- Una comisión no se borra ni cambia su venta, su vendedor o su valor; una anulada queda como está; una pagada no
-- vuelve a pendiente ni cambia su pago (se anula). Vale también con acceso directo a la base de datos.
CREATE FUNCTION "proteger_comision"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Una comisión no se puede borrar: se anula con su motivo';
  END IF;
  IF NEW."ventaId" IS DISTINCT FROM OLD."ventaId"
     OR NEW."vendedorId" IS DISTINCT FROM OLD."vendedorId"
     OR NEW."tipoVendedor" IS DISTINCT FROM OLD."tipoVendedor"
     OR NEW."valor" IS DISTINCT FROM OLD."valor" THEN
    RAISE EXCEPTION 'La venta, el vendedor y el valor de una comisión no se modifican';
  END IF;
  IF OLD."estado" = 'ANULADA' THEN
    RAISE EXCEPTION 'Una comisión anulada no se puede modificar';
  END IF;
  IF OLD."estado" = 'PAGADA' AND NEW."estado" = 'PENDIENTE' THEN
    RAISE EXCEPTION 'Una comisión pagada no vuelve a pendiente: se anula';
  END IF;
  IF OLD."estado" = 'PAGADA' AND NEW."estado" = 'PAGADA'
     AND (NEW."movimientoId" IS DISTINCT FROM OLD."movimientoId"
          OR NEW."pagadaPorId" IS DISTINCT FROM OLD."pagadaPorId"
          OR NEW."pagadaEn" IS DISTINCT FROM OLD."pagadaEn") THEN
    RAISE EXCEPTION 'El pago de una comisión no se modifica: se anula';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "Comision_protegida" BEFORE UPDATE OR DELETE ON "Comision"
  FOR EACH ROW EXECUTE FUNCTION "proteger_comision"();

-- El egreso de una comisión debe ser un egreso (gasto) creado por el sistema para pagar comisiones.
CREATE FUNCTION "validar_movimiento_de_comision"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  origen_del_movimiento TEXT;
  tipo_del_movimiento TEXT;
BEGIN
  IF NEW."movimientoId" IS NOT NULL THEN
    SELECT "origen"::text, "tipo"::text INTO origen_del_movimiento, tipo_del_movimiento
      FROM "MovimientoFinanciero" WHERE "id" = NEW."movimientoId";
    IF origen_del_movimiento IS DISTINCT FROM 'COMISION' OR tipo_del_movimiento IS DISTINCT FROM 'GASTO' THEN
      RAISE EXCEPTION 'El movimiento de una comisión debe ser un egreso de origen COMISION';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "Comision_movimiento_valido" BEFORE INSERT OR UPDATE ON "Comision"
  FOR EACH ROW EXECUTE FUNCTION "validar_movimiento_de_comision"();
