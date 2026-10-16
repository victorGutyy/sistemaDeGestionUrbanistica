-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "todosLosProyectos" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "UsuarioProyecto" (
    "usuarioId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsuarioProyecto_pkey" PRIMARY KEY ("usuarioId","proyectoId")
);

-- CreateIndex
CREATE INDEX "UsuarioProyecto_proyectoId_idx" ON "UsuarioProyecto"("proyectoId");

-- AddForeignKey
ALTER TABLE "UsuarioProyecto" ADD CONSTRAINT "UsuarioProyecto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioProyecto" ADD CONSTRAINT "UsuarioProyecto_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
