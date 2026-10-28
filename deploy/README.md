# Despliegue

Archivos para publicar el sistema en el servidor de producción. La guía completa, paso a paso y con la explicación de cada decisión, está en [`docs/despliegue.md`](../docs/despliegue.md).

| Carpeta | Contenido | Quién lo usa |
|---|---|---|
| `servidor/` | Guiones para proteger el servidor recién creado (usuario sin root, acceso solo con llave, cortafuegos, bloqueo de intentos, actualizaciones automáticas), verificar su estado e instalar Docker | La persona responsable del despliegue, por SSH |
| `pruebas/https/` | Página de prueba con HTTPS (Caddy) para comprobar DNS, puertos y certificado antes de montar el sistema. Es desechable | La persona responsable del despliegue, en el servidor |

Reglas:

- Aquí nunca van contraseñas, llaves privadas ni archivos `.env` con valores reales. Solo plantillas (`*.example`).
- Los guiones `.sh` deben tener finales de línea de Linux (LF). `.gitattributes` lo garantiza al guardarlos desde Windows.
- Cada guion se puede repetir sin dañar nada y explica en pantalla qué hace.
