-- Paso 2.2a: roles como tabla con permisos, y seguridad de ingreso.
-- La columna "Usuario"."rol" (enum) se reemplaza por "rolId" SIN perder a ningun
-- usuario: primero se crean los roles, luego se copia el rol de cada usuario
-- (PROPIETARIO pasa a ser GERENTE) y solo al final se elimina la columna vieja.

-- CreateTable
CREATE TABLE "RolUsuario" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "permisos" TEXT[],
    "esSistema" BOOLEAN NOT NULL DEFAULT false,
    "limitablePorProyecto" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolUsuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RolUsuario_clave_key" ON "RolUsuario"("clave");

-- Roles del sistema (la app vuelve a sincronizar sus permisos desde el codigo al arrancar).
INSERT INTO "RolUsuario" ("id", "clave", "nombre", "descripcion", "permisos", "esSistema", "limitablePorProyecto", "updatedAt") VALUES
(gen_random_uuid()::text, 'GERENTE', 'Gerente', 'Control total: configuración, usuarios, aprobaciones y auditoría.',
 ARRAY['proyectos.ver','proyectos.gestionar','proyectos.cambiar_estado','clientes.ver','clientes.crear','ventas.ver','ventas.crear','abonos.ver','abonos.registrar','cartera.ver','finanzas.ver','finanzas.registrar','nomina.ver','nomina.gestionar','dashboard.ver','recordatorios.ejecutar','configuracion.ver','configuracion.editar','usuarios.gestionar'],
 true, false, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'ADMINISTRADOR', 'Administrador', 'Operación diaria: ventas, abonos, egresos y personal. Ve todos los proyectos.',
 ARRAY['proyectos.ver','proyectos.gestionar','clientes.ver','clientes.crear','ventas.ver','ventas.crear','abonos.ver','abonos.registrar','cartera.ver','finanzas.ver','finanzas.registrar','nomina.ver','nomina.gestionar','dashboard.ver','recordatorios.ejecutar','configuracion.ver'],
 true, false, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'CONSULTA', 'Consulta', 'Solo lectura de los datos de proyectos. No ve nómina ni configuración.',
 ARRAY['proyectos.ver','clientes.ver','ventas.ver','abonos.ver','cartera.ver','finanzas.ver','dashboard.ver'],
 true, true, CURRENT_TIMESTAMP);

-- AlterTable: columnas nuevas de Usuario (rolId nace opcional para poder copiar los datos).
ALTER TABLE "Usuario"
    ADD COLUMN "rolId" TEXT,
    ADD COLUMN "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "bloqueadoHasta" TIMESTAMP(3),
    ADD COLUMN "ultimoIngreso" TIMESTAMP(3),
    ADD COLUMN "sesionesValidasDesde" TIMESTAMP(3);

-- Copia el rol actual de cada usuario (PROPIETARIO -> GERENTE).
UPDATE "Usuario" u SET "rolId" = r."id"
FROM "RolUsuario" r
WHERE r."clave" = CASE u."rol"::text WHEN 'PROPIETARIO' THEN 'GERENTE' ELSE u."rol"::text END;

-- Seguridad: si algun usuario quedara sin rol, la migracion falla aqui (y se revierte) en vez de dejar datos a medias.
ALTER TABLE "Usuario" ALTER COLUMN "rolId" SET NOT NULL;

-- Ya copiado: se elimina la columna vieja y su enum.
ALTER TABLE "Usuario" DROP COLUMN "rol";
DROP TYPE "Rol";

-- CreateIndex
CREATE INDEX "Usuario_rolId_idx" ON "Usuario"("rolId");

-- AddForeignKey (un rol con usuarios no se puede borrar)
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "RolUsuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Parametros de seguridad de sesion (editables por el gerente en Configuracion).
ALTER TABLE "ConfiguracionEmpresa"
    ADD COLUMN "intentosMaximosLogin" INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN "minutosBloqueoLogin" INTEGER NOT NULL DEFAULT 15,
    ADD COLUMN "minutosInactividad" INTEGER NOT NULL DEFAULT 30,
    ADD CONSTRAINT "ConfiguracionEmpresa_seguridad_valida" CHECK (
        "intentosMaximosLogin" >= 1
        AND "minutosBloqueoLogin" >= 1
        AND "minutosInactividad" >= 1
    );
