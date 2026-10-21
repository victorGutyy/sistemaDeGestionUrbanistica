-- CreateEnum
CREATE TYPE "EstadoVerificacion" AS ENUM ('NO_REQUIERE', 'POR_VERIFICAR', 'VERIFICADO');

-- AlterTable
ALTER TABLE "Abono" ADD COLUMN     "notaVerificacion" TEXT,
ADD COLUMN     "verificacion" "EstadoVerificacion" NOT NULL DEFAULT 'NO_REQUIERE',
ADD COLUMN     "verificadoEn" TIMESTAMP(3),
ADD COLUMN     "verificadoPorId" TEXT;

-- AlterTable
ALTER TABLE "ConfiguracionEmpresa" ADD COLUMN     "diasAlertaVerificacion" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "MedioPagoConfig" ADD COLUMN     "requiereVerificacion" BOOLEAN NOT NULL DEFAULT true;

-- AddForeignKey
ALTER TABLE "Abono" ADD CONSTRAINT "Abono_verificadoPorId_fkey" FOREIGN KEY ("verificadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------
-- Reglas que el esquema de Prisma no expresa (agregadas a mano). Esta migración solo agrega columnas y ajusta
-- datos nuevos: no borra nada de lo que ya existe.
-- ---------------------------------------------------------------------------------

-- Abonos que ya existen: el efectivo no se verifica en el banco ("no requiere", el valor por defecto); los demás
-- se dan por verificados, con una nota que explica que son anteriores a este control (sin usuario que los verificara).
-- Se hace ANTES de reemplazar el trigger de abajo, que solo permite pasar de "por verificar" a "verificado".
UPDATE "Abono"
SET "verificacion" = 'VERIFICADO', "verificadoEn" = "createdAt", "notaVerificacion" = 'Anterior al control de verificación'
WHERE "medioPago" <> 'EFECTIVO';

-- El efectivo no se verifica contra el extracto (se cuadra en el cierre de caja). Los demás medios sí, por defecto.
UPDATE "MedioPagoConfig" SET "requiereVerificacion" = false WHERE "medio" = 'EFECTIVO';

-- Cada estado lleva los datos que le corresponden: verificado trae su fecha (el usuario puede faltar en abonos
-- anteriores a este control); los demás estados no traen datos de verificación.
ALTER TABLE "Abono" ADD CONSTRAINT "Abono_verificacion_coherente" CHECK (
  ("verificacion" = 'VERIFICADO' AND "verificadoEn" IS NOT NULL)
  OR ("verificacion" <> 'VERIFICADO' AND "verificadoPorId" IS NULL AND "verificadoEn" IS NULL AND "notaVerificacion" IS NULL)
);

ALTER TABLE "ConfiguracionEmpresa" ADD CONSTRAINT "ConfiguracionEmpresa_dias_alerta_verificacion" CHECK ("diasAlertaVerificacion" >= 0);

-- Para listar y contar rápido lo que está por verificar.
CREATE INDEX "Abono_por_verificar_idx" ON "Abono"("fecha") WHERE "verificacion" = 'POR_VERIFICAR' AND "estado" = 'ACTIVO';

-- El trigger de abonos sigue prohibiendo editar o borrar, y ahora admite UN solo cambio más: pasar de "por verificar"
-- a "verificado" (con quién y cuándo). Un verificado no vuelve atrás, un "no requiere" no pasa a otro estado y un
-- abono anulado no se verifica. Vale también con acceso directo a la base de datos.
CREATE OR REPLACE FUNCTION "proteger_abono"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un abono no se puede borrar: se anula indicando el motivo';
  END IF;
  IF NEW."ventaId" IS DISTINCT FROM OLD."ventaId"
     OR NEW."fecha" IS DISTINCT FROM OLD."fecha"
     OR NEW."valor" IS DISTINCT FROM OLD."valor"
     OR NEW."medioPago" IS DISTINCT FROM OLD."medioPago"
     OR NEW."cuentaDestinoId" IS DISTINCT FROM OLD."cuentaDestinoId"
     OR NEW."referencia" IS DISTINCT FROM OLD."referencia"
     OR NEW."comprobanteUrl" IS DISTINCT FROM OLD."comprobanteUrl"
     OR NEW."registradoPorId" IS DISTINCT FROM OLD."registradoPorId" THEN
    RAISE EXCEPTION 'Un abono no se puede editar: si hay un error, se anula y se registra uno nuevo';
  END IF;
  IF OLD."estado" = 'ANULADO' AND (
       NEW."estado" IS DISTINCT FROM OLD."estado"
       OR NEW."anuladoPorId" IS DISTINCT FROM OLD."anuladoPorId"
       OR NEW."anuladoEn" IS DISTINCT FROM OLD."anuladoEn"
       OR NEW."motivoAnulacion" IS DISTINCT FROM OLD."motivoAnulacion"
       OR NEW."verificacion" IS DISTINCT FROM OLD."verificacion"
       OR NEW."verificadoPorId" IS DISTINCT FROM OLD."verificadoPorId"
       OR NEW."verificadoEn" IS DISTINCT FROM OLD."verificadoEn"
       OR NEW."notaVerificacion" IS DISTINCT FROM OLD."notaVerificacion") THEN
    RAISE EXCEPTION 'Un abono anulado no se puede modificar';
  END IF;
  IF NEW."verificacion" IS DISTINCT FROM OLD."verificacion" THEN
    IF NOT (OLD."verificacion" = 'POR_VERIFICAR' AND NEW."verificacion" = 'VERIFICADO') THEN
      RAISE EXCEPTION 'La verificación de un abono solo pasa de "por verificar" a "verificado"';
    END IF;
  ELSIF NEW."verificadoPorId" IS DISTINCT FROM OLD."verificadoPorId"
     OR NEW."verificadoEn" IS DISTINCT FROM OLD."verificadoEn"
     OR NEW."notaVerificacion" IS DISTINCT FROM OLD."notaVerificacion" THEN
    RAISE EXCEPTION 'Los datos de la verificación de un abono no se modifican';
  END IF;
  RETURN NEW;
END
$$;
