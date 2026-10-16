-- CreateEnum
CREATE TYPE "EstadoMovimiento" AS ENUM ('ACTIVO', 'ANULADO');

-- CreateEnum
CREATE TYPE "OrigenMovimiento" AS ENUM ('MANUAL', 'DEVOLUCION_DESISTIMIENTO');

-- AlterTable
ALTER TABLE "MovimientoFinanciero" RENAME COLUMN "concepto" TO "descripcion";

ALTER TABLE "MovimientoFinanciero"
ADD COLUMN     "anuladoEn" TIMESTAMP(3),
ADD COLUMN     "anuladoPorId" TEXT,
ADD COLUMN     "categoriaGastoId" TEXT,
ADD COLUMN     "categoriaIngresoId" TEXT,
ADD COLUMN     "cuentaId" TEXT,
ADD COLUMN     "estado" "EstadoMovimiento" NOT NULL DEFAULT 'ACTIVO',
ADD COLUMN     "medioPago" "MedioPago" NOT NULL DEFAULT 'EFECTIVO',
ADD COLUMN     "motivoAnulacion" TEXT,
ADD COLUMN     "motivoSinSoporte" TEXT,
ADD COLUMN     "numeroDocumento" TEXT,
ADD COLUMN     "origen" "OrigenMovimiento" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "referencia" TEXT,
ADD COLUMN     "registradoPorId" TEXT,
ADD COLUMN     "soporteRuta" TEXT,
ADD COLUMN     "terceroDocumento" TEXT,
ADD COLUMN     "terceroNombre" TEXT,
ADD COLUMN     "ventaId" TEXT;

-- AlterTable
ALTER TABLE "PagoNomina" ADD COLUMN     "cuentaId" TEXT,
ADD COLUMN     "medioPago" "MedioPago" NOT NULL DEFAULT 'EFECTIVO';

-- CreateTable
CREATE TABLE "CategoriaIngreso" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "esSistema" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoriaIngreso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaIngreso_nombre_key" ON "CategoriaIngreso"("nombre");

-- CreateIndex
CREATE INDEX "MovimientoFinanciero_proyectoId_fecha_idx" ON "MovimientoFinanciero"("proyectoId", "fecha");

-- CreateIndex
CREATE INDEX "MovimientoFinanciero_fecha_idx" ON "MovimientoFinanciero"("fecha");

-- CreateIndex
CREATE INDEX "MovimientoFinanciero_estado_idx" ON "MovimientoFinanciero"("estado");

-- AddForeignKey
ALTER TABLE "MovimientoFinanciero" ADD CONSTRAINT "MovimientoFinanciero_categoriaGastoId_fkey" FOREIGN KEY ("categoriaGastoId") REFERENCES "CategoriaGasto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoFinanciero" ADD CONSTRAINT "MovimientoFinanciero_categoriaIngresoId_fkey" FOREIGN KEY ("categoriaIngresoId") REFERENCES "CategoriaIngreso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoFinanciero" ADD CONSTRAINT "MovimientoFinanciero_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoFinanciero" ADD CONSTRAINT "MovimientoFinanciero_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoFinanciero" ADD CONSTRAINT "MovimientoFinanciero_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoFinanciero" ADD CONSTRAINT "MovimientoFinanciero_anuladoPorId_fkey" FOREIGN KEY ("anuladoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoNomina" ADD CONSTRAINT "PagoNomina_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------
-- Datos existentes: ya no hay valor por defecto del medio de pago (cada movimiento nuevo lo declara).
-- Los movimientos anteriores quedan como "Otros" y los egresos, con el motivo "registro anterior".
-- ---------------------------------------------------------------------------------
ALTER TABLE "MovimientoFinanciero" ALTER COLUMN "medioPago" DROP DEFAULT;
ALTER TABLE "PagoNomina" ALTER COLUMN "medioPago" DROP DEFAULT;

INSERT INTO "CategoriaIngreso" ("id", "nombre", "esSistema", "updatedAt") VALUES
  (gen_random_uuid()::text, 'Anticipo de remodelación', false, now()),
  (gen_random_uuid()::text, 'Otros servicios', false, now()),
  (gen_random_uuid()::text, 'Otros', false, now());

-- Categorías de gasto que usa el sistema o que necesita el relleno (si ya existían, solo se marcan).
INSERT INTO "CategoriaGasto" ("id", "nombre", "esSistema", "updatedAt") VALUES
  (gen_random_uuid()::text, 'Devolución por desistimiento', true, now()),
  (gen_random_uuid()::text, 'Otros', false, now())
ON CONFLICT ("nombre") DO NOTHING;
UPDATE "CategoriaGasto" SET "esSistema" = true, "activa" = true WHERE "nombre" = 'Devolución por desistimiento';

UPDATE "MovimientoFinanciero"
SET "categoriaGastoId" = (SELECT "id" FROM "CategoriaGasto" WHERE "nombre" = 'Otros'),
    "motivoSinSoporte" = 'Registro anterior al control de soportes'
WHERE "tipo" = 'GASTO';

UPDATE "MovimientoFinanciero"
SET "categoriaIngresoId" = (SELECT "id" FROM "CategoriaIngreso" WHERE "nombre" = 'Otros')
WHERE "tipo" = 'INGRESO';

-- ---------------------------------------------------------------------------------
-- Reglas que el esquema de Prisma no expresa (agregadas a mano).
-- ---------------------------------------------------------------------------------
ALTER TABLE "MovimientoFinanciero" ADD CONSTRAINT "MovimientoFinanciero_valor_positivo" CHECK ("valor" > 0);

-- Un egreso lleva categoría de gasto y un ingreso, categoría de ingreso; nunca las dos.
ALTER TABLE "MovimientoFinanciero" ADD CONSTRAINT "MovimientoFinanciero_categoria_segun_tipo" CHECK (
  ("tipo" = 'GASTO' AND "categoriaGastoId" IS NOT NULL AND "categoriaIngresoId" IS NULL)
  OR ("tipo" = 'INGRESO' AND "categoriaIngresoId" IS NOT NULL AND "categoriaGastoId" IS NULL)
);

-- El efectivo no tiene cuenta; cualquier otro medio la exige.
ALTER TABLE "MovimientoFinanciero" ADD CONSTRAINT "MovimientoFinanciero_cuenta_segun_medio" CHECK (
  ("medioPago" = 'EFECTIVO') = ("cuentaId" IS NULL)
);
ALTER TABLE "PagoNomina" ADD CONSTRAINT "PagoNomina_cuenta_segun_medio" CHECK (
  ("medioPago" = 'EFECTIVO') = ("cuentaId" IS NULL)
);

-- Todo egreso tiene soporte adjunto o el motivo de por qué no lo tiene (RF-EGR-02).
ALTER TABLE "MovimientoFinanciero" ADD CONSTRAINT "MovimientoFinanciero_egreso_con_soporte_o_motivo" CHECK (
  "tipo" <> 'GASTO' OR "soporteRuta" IS NOT NULL OR ("motivoSinSoporte" IS NOT NULL AND btrim("motivoSinSoporte") <> '')
);

-- La devolución de un desistimiento es un egreso ligado a su venta.
ALTER TABLE "MovimientoFinanciero" ADD CONSTRAINT "MovimientoFinanciero_devolucion_con_venta" CHECK (
  ("origen" = 'DEVOLUCION_DESISTIMIENTO') = ("ventaId" IS NOT NULL) AND ("origen" <> 'DEVOLUCION_DESISTIMIENTO' OR "tipo" = 'GASTO')
);

-- Un movimiento anulado siempre tiene quién, cuándo y por qué; uno vigente no tiene datos de anulación.
ALTER TABLE "MovimientoFinanciero" ADD CONSTRAINT "MovimientoFinanciero_anulacion_completa" CHECK (
  ("estado" = 'ANULADO') = ("anuladoEn" IS NOT NULL AND "motivoAnulacion" IS NOT NULL AND "anuladoPorId" IS NOT NULL)
);

-- ---------------------------------------------------------------------------------
-- Inmutabilidad en la base de datos: un movimiento no se borra ni se edita; solo se anula.
-- ---------------------------------------------------------------------------------
CREATE FUNCTION "proteger_movimiento"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un movimiento financiero no se puede borrar: se anula indicando el motivo';
  END IF;
  IF NEW."tipo" IS DISTINCT FROM OLD."tipo"
     OR NEW."fecha" IS DISTINCT FROM OLD."fecha"
     OR NEW."valor" IS DISTINCT FROM OLD."valor"
     OR NEW."descripcion" IS DISTINCT FROM OLD."descripcion"
     OR NEW."proyectoId" IS DISTINCT FROM OLD."proyectoId"
     OR NEW."categoriaGastoId" IS DISTINCT FROM OLD."categoriaGastoId"
     OR NEW."categoriaIngresoId" IS DISTINCT FROM OLD."categoriaIngresoId"
     OR NEW."medioPago" IS DISTINCT FROM OLD."medioPago"
     OR NEW."cuentaId" IS DISTINCT FROM OLD."cuentaId"
     OR NEW."referencia" IS DISTINCT FROM OLD."referencia"
     OR NEW."terceroNombre" IS DISTINCT FROM OLD."terceroNombre"
     OR NEW."terceroDocumento" IS DISTINCT FROM OLD."terceroDocumento"
     OR NEW."numeroDocumento" IS DISTINCT FROM OLD."numeroDocumento"
     OR NEW."soporteRuta" IS DISTINCT FROM OLD."soporteRuta"
     OR NEW."motivoSinSoporte" IS DISTINCT FROM OLD."motivoSinSoporte"
     OR NEW."origen" IS DISTINCT FROM OLD."origen"
     OR NEW."ventaId" IS DISTINCT FROM OLD."ventaId"
     OR NEW."registradoPorId" IS DISTINCT FROM OLD."registradoPorId" THEN
    RAISE EXCEPTION 'Un movimiento financiero no se puede editar: si hay un error, se anula y se registra uno nuevo';
  END IF;
  IF OLD."estado" = 'ANULADO' AND (
       NEW."estado" IS DISTINCT FROM OLD."estado"
       OR NEW."anuladoPorId" IS DISTINCT FROM OLD."anuladoPorId"
       OR NEW."anuladoEn" IS DISTINCT FROM OLD."anuladoEn"
       OR NEW."motivoAnulacion" IS DISTINCT FROM OLD."motivoAnulacion") THEN
    RAISE EXCEPTION 'Un movimiento anulado no se puede modificar';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "MovimientoFinanciero_protegido" BEFORE UPDATE OR DELETE ON "MovimientoFinanciero"
  FOR EACH ROW EXECUTE FUNCTION "proteger_movimiento"();

-- El gerente recibe el permiso nuevo de anular movimientos (la app también lo sincroniza al arrancar).
UPDATE "RolUsuario"
SET "permisos" = array_append("permisos", 'finanzas.anular')
WHERE "clave" = 'GERENTE' AND NOT ('finanzas.anular' = ANY("permisos"));

