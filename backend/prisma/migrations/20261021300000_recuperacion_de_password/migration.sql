-- AlterTable
ALTER TABLE "ConfiguracionEmpresa" ADD COLUMN     "minutosVigenciaRecuperacion" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "recuperacionesPorHora" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "RecuperacionPassword" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venceEn" TIMESTAMP(3) NOT NULL,
    "usadoEn" TIMESTAMP(3),

    CONSTRAINT "RecuperacionPassword_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecuperacionPassword_tokenHash_key" ON "RecuperacionPassword"("tokenHash");

-- CreateIndex
CREATE INDEX "RecuperacionPassword_usuarioId_createdAt_idx" ON "RecuperacionPassword"("usuarioId", "createdAt");

-- AddForeignKey
ALTER TABLE "RecuperacionPassword" ADD CONSTRAINT "RecuperacionPassword_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------
-- Reglas que el esquema de Prisma no expresa (agregadas a mano). Esta migración solo agrega: no cambia ni borra
-- nada de lo que ya existe.
-- ---------------------------------------------------------------------------------

-- El enlace vence después de crearse; la huella es un SHA-256 en hexadecimal (64 caracteres).
ALTER TABLE "RecuperacionPassword" ADD CONSTRAINT "RecuperacionPassword_vence_despues" CHECK ("venceEn" > "createdAt");
ALTER TABLE "RecuperacionPassword" ADD CONSTRAINT "RecuperacionPassword_huella_sha256" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');

-- Parámetros nuevos: al menos un minuto de vigencia y una solicitud por hora.
ALTER TABLE "ConfiguracionEmpresa" ADD CONSTRAINT "ConfiguracionEmpresa_vigencia_recuperacion" CHECK ("minutosVigenciaRecuperacion" >= 1);
ALTER TABLE "ConfiguracionEmpresa" ADD CONSTRAINT "ConfiguracionEmpresa_recuperaciones_por_hora" CHECK ("recuperacionesPorHora" >= 1);

-- Un enlace no se borra ni se edita: lo único que cambia es marcarlo como usado, una vez (de vacío a una fecha).
-- Vale también con acceso directo a la base de datos: un enlace usado no vuelve a servir.
CREATE FUNCTION "proteger_recuperacion_password"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un enlace de recuperación no se puede borrar';
  END IF;
  IF NEW."usuarioId" IS DISTINCT FROM OLD."usuarioId"
     OR NEW."tokenHash" IS DISTINCT FROM OLD."tokenHash"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."venceEn" IS DISTINCT FROM OLD."venceEn" THEN
    RAISE EXCEPTION 'Un enlace de recuperación no se puede editar';
  END IF;
  IF OLD."usadoEn" IS NOT NULL THEN
    RAISE EXCEPTION 'Un enlace de recuperación ya usado no se puede modificar';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "RecuperacionPassword_protegida" BEFORE UPDATE OR DELETE ON "RecuperacionPassword"
  FOR EACH ROW EXECUTE FUNCTION "proteger_recuperacion_password"();
