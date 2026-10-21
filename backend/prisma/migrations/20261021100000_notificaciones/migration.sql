-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('RECIBO', 'RECORDATORIO', 'MORA');

-- CreateEnum
CREATE TYPE "CanalNotificacion" AS ENUM ('CORREO', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "EstadoNotificacion" AS ENUM ('ENVIADA', 'FALLIDA', 'OMITIDA', 'ENLACE_ABIERTO');

-- AlterTable
ALTER TABLE "ConfiguracionEmpresa" ADD COLUMN     "diasEntreAvisosMora" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "enviarReciboPorCorreo" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" "TipoNotificacion" NOT NULL,
    "canal" "CanalNotificacion" NOT NULL,
    "estado" "EstadoNotificacion" NOT NULL,
    "clienteId" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "cuotaId" TEXT,
    "abonoId" TEXT,
    "destinatario" TEXT,
    "asunto" TEXT,
    "detalle" TEXT,
    "usuarioId" TEXT,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notificacion_createdAt_idx" ON "Notificacion"("createdAt");

-- CreateIndex
CREATE INDEX "Notificacion_clienteId_createdAt_idx" ON "Notificacion"("clienteId", "createdAt");

-- CreateIndex
CREATE INDEX "Notificacion_ventaId_tipo_canal_estado_createdAt_idx" ON "Notificacion"("ventaId", "tipo", "canal", "estado", "createdAt");

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_cuotaId_fkey" FOREIGN KEY ("cuotaId") REFERENCES "Cuota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_abonoId_fkey" FOREIGN KEY ("abonoId") REFERENCES "Abono"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------
-- Reglas que el esquema de Prisma no expresa (agregadas a mano). Esta migración solo agrega: no cambia ni borra
-- nada de lo que ya existe.
-- ---------------------------------------------------------------------------------

-- Cada tipo lleva lo que le corresponde: el recibo, su abono; el recordatorio, su cuota.
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_tipo_coherente" CHECK (
  ("tipo" <> 'RECIBO' OR "abonoId" IS NOT NULL)
  AND ("tipo" <> 'RECORDATORIO' OR "cuotaId" IS NOT NULL)
);

-- WhatsApp no se envía desde el sistema: solo se abre el enlace con el mensaje listo.
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_canal_estado_coherente" CHECK (
  ("canal" = 'WHATSAPP' AND "estado" = 'ENLACE_ABIERTO')
  OR ("canal" = 'CORREO' AND "estado" <> 'ENLACE_ABIERTO')
);

-- RF-NOT-05: una cuota no recibe dos recordatorios por correo enviados. Vale también con acceso directo a la base
-- y bajo concurrencia (dos procesos a la vez): el segundo falla en vez de repetir el aviso.
CREATE UNIQUE INDEX "Notificacion_recordatorio_enviado_unico" ON "Notificacion"("cuotaId")
  WHERE "tipo" = 'RECORDATORIO' AND "canal" = 'CORREO' AND "estado" = 'ENVIADA';

-- Parámetros nuevos de la configuración: al menos un día entre avisos de mora.
ALTER TABLE "ConfiguracionEmpresa" ADD CONSTRAINT "ConfiguracionEmpresa_dias_entre_avisos_mora" CHECK ("diasEntreAvisosMora" >= 1);

-- El historial de avisos solo se inserta: no se edita ni se borra (reusa la función de los recibos).
CREATE TRIGGER "Notificacion_inmutable" BEFORE UPDATE OR DELETE ON "Notificacion"
  FOR EACH ROW EXECUTE FUNCTION "proteger_solo_insercion"();
