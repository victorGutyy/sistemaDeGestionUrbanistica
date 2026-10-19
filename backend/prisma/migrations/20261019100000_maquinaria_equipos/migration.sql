-- CreateEnum
CREATE TYPE "EstadoEquipo" AS ENUM ('ACTIVO', 'EN_MANTENIMIENTO', 'FUERA_DE_SERVICIO');

-- AlterTable: solo se agregan columnas con valores por defecto; lo que ya existe no cambia.
ALTER TABLE "CategoriaGasto" ADD COLUMN     "soloMaquinaria" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MovimientoFinanciero" ADD COLUMN     "equipoId" TEXT,
ADD COLUMN     "flota" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "periodoDesde" DATE,
ADD COLUMN     "periodoHasta" DATE;

-- CreateTable
CREATE TABLE "TipoEquipo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipoEquipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipo" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipoEquipoId" TEXT NOT NULL,
    "marca" TEXT,
    "modelo" TEXT,
    "anio" INTEGER,
    "placaSerie" TEXT,
    "estado" "EstadoEquipo" NOT NULL DEFAULT 'ACTIVO',
    "bajaEn" TIMESTAMP(3),
    "bajaMotivo" TEXT,
    "bajaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TipoEquipo_nombre_key" ON "TipoEquipo"("nombre");

-- CreateIndex
CREATE INDEX "Equipo_proyectoId_idx" ON "Equipo"("proyectoId");

-- CreateIndex
CREATE INDEX "Equipo_tipoEquipoId_idx" ON "Equipo"("tipoEquipoId");

-- CreateIndex
CREATE INDEX "MovimientoFinanciero_equipoId_idx" ON "MovimientoFinanciero"("equipoId");

-- AddForeignKey (un equipo con movimientos nunca se puede borrar)
ALTER TABLE "MovimientoFinanciero" ADD CONSTRAINT "MovimientoFinanciero_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "Equipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipo" ADD CONSTRAINT "Equipo_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipo" ADD CONSTRAINT "Equipo_tipoEquipoId_fkey" FOREIGN KEY ("tipoEquipoId") REFERENCES "TipoEquipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipo" ADD CONSTRAINT "Equipo_bajaPorId_fkey" FOREIGN KEY ("bajaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------
-- Reglas que el esquema de Prisma no expresa (agregadas a mano).
-- ---------------------------------------------------------------------------------

-- La placa o serie no se repite entre equipos (sin importar mayúsculas), solo cuando se escribe.
CREATE UNIQUE INDEX "Equipo_placaSerie_unica" ON "Equipo" (lower("placaSerie")) WHERE "placaSerie" IS NOT NULL;

ALTER TABLE "Equipo" ADD CONSTRAINT "Equipo_nombre_no_vacio" CHECK (btrim("nombre") <> '');
ALTER TABLE "Equipo" ADD CONSTRAINT "Equipo_anio_valido" CHECK ("anio" IS NULL OR ("anio" BETWEEN 1900 AND 2100));
-- Una baja siempre lleva fecha y motivo; un equipo activo no tiene ninguno de los dos.
ALTER TABLE "Equipo" ADD CONSTRAINT "Equipo_baja_con_motivo" CHECK (
  ("bajaEn" IS NULL AND "bajaMotivo" IS NULL)
  OR ("bajaEn" IS NOT NULL AND "bajaMotivo" IS NOT NULL AND btrim("bajaMotivo") <> '')
);
ALTER TABLE "TipoEquipo" ADD CONSTRAINT "TipoEquipo_nombre_no_vacio" CHECK (btrim("nombre") <> '');

-- RF-MAQ-07: un equipo (y un tipo de equipo) no se borra, ni con acceso directo a la base de datos.
CREATE FUNCTION "proteger_equipo"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Un equipo o un tipo de equipo no se puede borrar: el equipo se da de baja y el tipo se desactiva';
END
$$;

CREATE TRIGGER "Equipo_sin_borrado" BEFORE DELETE ON "Equipo"
  FOR EACH ROW EXECUTE FUNCTION "proteger_equipo"();
CREATE TRIGGER "TipoEquipo_sin_borrado" BEFORE DELETE ON "TipoEquipo"
  FOR EACH ROW EXECUTE FUNCTION "proteger_equipo"();

-- Reglas de un movimiento de maquinaria (RF-MAQ-03 y 04): un movimiento es de un equipo o de la flota, no de los dos;
-- ambos exigen proyecto; el período alquilado va completo y en orden.
ALTER TABLE "MovimientoFinanciero" ADD CONSTRAINT "Movimiento_equipo_o_flota" CHECK (NOT ("flota" AND "equipoId" IS NOT NULL));
ALTER TABLE "MovimientoFinanciero" ADD CONSTRAINT "Movimiento_equipo_con_proyecto" CHECK (("equipoId" IS NULL AND NOT "flota") OR "proyectoId" IS NOT NULL);
ALTER TABLE "MovimientoFinanciero" ADD CONSTRAINT "Movimiento_periodo_completo" CHECK (
  ("periodoDesde" IS NULL AND "periodoHasta" IS NULL)
  OR ("periodoDesde" IS NOT NULL AND "periodoHasta" IS NOT NULL AND "periodoHasta" >= "periodoDesde")
);

-- El equipo de un movimiento debe ser del mismo proyecto que el movimiento.
CREATE FUNCTION "validar_equipo_de_movimiento"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  proyecto_del_equipo TEXT;
BEGIN
  IF NEW."equipoId" IS NOT NULL THEN
    SELECT "proyectoId" INTO proyecto_del_equipo FROM "Equipo" WHERE "id" = NEW."equipoId";
    IF proyecto_del_equipo IS DISTINCT FROM NEW."proyectoId" THEN
      RAISE EXCEPTION 'El equipo del movimiento debe pertenecer al mismo proyecto del movimiento';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "MovimientoFinanciero_equipo_del_proyecto" BEFORE INSERT ON "MovimientoFinanciero"
  FOR EACH ROW EXECUTE FUNCTION "validar_equipo_de_movimiento"();

-- La inmutabilidad de los movimientos ahora cubre también las columnas de maquinaria (misma función, con las
-- columnas nuevas). Un movimiento no se edita ni se borra: solo se anula.
CREATE OR REPLACE FUNCTION "proteger_movimiento"() RETURNS trigger LANGUAGE plpgsql AS $$
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
     OR NEW."equipoId" IS DISTINCT FROM OLD."equipoId"
     OR NEW."flota" IS DISTINCT FROM OLD."flota"
     OR NEW."periodoDesde" IS DISTINCT FROM OLD."periodoDesde"
     OR NEW."periodoHasta" IS DISTINCT FROM OLD."periodoHasta"
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

-- Permisos nuevos: gestionar equipos (gerente) y dar de baja o reactivar (gerente). El administrador recibe
-- equipos.gestionar al sincronizar los roles del sistema al arrancar la aplicación.
UPDATE "RolUsuario"
SET "permisos" = array_cat("permisos", ARRAY['equipos.gestionar', 'equipos.baja']::TEXT[])
WHERE "clave" = 'GERENTE' AND NOT ('equipos.gestionar' = ANY("permisos"));
