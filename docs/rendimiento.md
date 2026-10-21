# Rendimiento (RNF-REN-01 a RNF-REN-04)

Medición del 19/10/2026 con el volumen que pide el documento de requerimientos: **10 proyectos, 1.000 lotes y más de 5.000 abonos** (en concreto: 400 clientes, 800 ventas, 5.439 abonos con recibo, 600 egresos, 200 pagos de nómina y 14.751 registros de auditoría; la base pesa 40 MB).

## Cómo se repite

```bash
cd backend
npm run demo:volumen              # carga la base sistema_urbanismo_volumen (unos 4 minutos)
npm run demo:api -- volumen       # en otra terminal: API en el puerto 3002
npm run demo:medir                # imprime la medición y guarda backend/.demo/volumen/medicion.json
```

Los datos salen siempre iguales (semilla fija) y se cargan con los servicios reales, no con inserciones directas. La carga termina con una verificación de coherencia (abonos aplicados por completo, cuotas sin sobrepago, recibos sin saltos, pesos enteros) que aquí pasó completa.

## Condiciones de la prueba

- Equipo de desarrollo: portátil con Intel Core i5-1135G7 (8 hilos) y 16 GB de RAM. **El servidor, PostgreSQL (Docker) y el cliente de medición corren en la misma máquina**, así que no hay latencia de red. En la nube los tiempos de consulta serán parecidos y se sumará la latencia del usuario.
- API compilada (`dist-scripts`), una sola instancia de Node, sin caché.
- Cada consulta se mide 7 veces después de una de calentamiento, descargando la respuesta completa; se evalúa el **percentil 95** (p95), que es más exigente que el promedio.

## Resultados

### RNF-REN-01 · Pantallas de consulta en menos de 2 segundos — cumple

| Consulta | Mediana | p95 | Tamaño |
|---|---:|---:|---:|
| Proyectos | 15 ms | 17 ms | 4 KB |
| Lotes (los 1.000) | 99 ms | 123 ms | 936 KB |
| Clientes (los 400) | 17 ms | 19 ms | 137 KB |
| Clientes, búsqueda | 15 ms | 23 ms | 18 KB |
| Ventas (las 800) | 164 ms | 170 ms | 1.606 KB |
| Cartera por cliente | 289 ms | 556 ms | 268 KB |
| Cartera por proyecto | 274 ms | 295 ms | 2 KB |
| Tablero | 344 ms | 372 ms | 3 KB |
| Finanzas: movimientos | 85 ms | 106 ms | 685 KB |
| Finanzas: consolidado | 132 ms | 154 ms | 2 KB |
| Nómina: pagos | 16 ms | 35 ms | 147 KB |
| Recibos | 32 ms | 35 ms | 96 KB |
| Cierres de caja | 15 ms | 16 ms | < 1 KB |

Comprobado también en el navegador: la pantalla **Ventas** (800 filas) tiene sus datos a los 0,7 s y **Cartera** a los 1,1 s desde que se abre.

### RNF-REN-02 · Estado de cuenta en menos de 1 minuto — cumple

Buscar un cliente por su nombre, abrir su ficha y descargar el estado de cuenta en PDF: **88 ms** en total (el PDF, 46 ms). Con una persona de por medio, el tiempo lo ponen los clics, no el sistema.

### RNF-REN-03 · Reportes PDF o Excel en menos de 10 segundos — cumple

| Reporte | Mediana | Máximo | Tamaño |
|---|---:|---:|---:|
| Tablero en PDF | 386 ms | 404 ms | 2 KB |
| Tablero en Excel | 364 ms | 368 ms | 7 KB |
| Exportación completa a Excel (gerente) | 2.985 ms | 3.222 ms | 4,9 MB |
| Reporte de recaudo en PDF (5.000 filas de detalle) | 1.608 ms | 1.737 ms | 615 KB |
| Reporte de recaudo en Excel | 712 ms | 748 ms | 260 KB |
| Cartera por edades en PDF | 342 ms | 372 ms | 58 KB |
| Cartera por edades en Excel | 280 ms | 310 ms | 33 KB |
| Egresos por categoría, inventario de lotes y flujo de caja (PDF o Excel) | de 51 a 81 ms | menos de 115 ms | menos de 25 KB |

El PDF del estado de cuenta de un cliente (RNF-REN-02) tardó 46 ms. La exportación completa es la más pesada porque saca todas las tablas; con 5.000 abonos tarda 3 s.

### RNF-REN-04 · 10 usuarios simultáneos sin degradarse — cumple

| Prueba | Peticiones | Errores | Mediana | p95 | Máximo |
|---|---:|---:|---:|---:|---:|
| 10 usuarios **con pausas** de 1 a 3 s (personas reales) | 300 | 0 | 170 ms | 452 ms | 733 ms |
| 10 usuarios **sin pausas** (esfuerzo) | 300 | 0 | 686 ms | 1.660 ms | 2.118 ms |
| 30 usuarios **sin pausas** (esfuerzo) | 900 | 0 | 2.294 ms | 4.949 ms | 6.751 ms |

Cada usuario recorre una mezcla de pantallas (proyectos, clientes, ventas, cartera, tablero, finanzas). Una petición aislada tarda 108 ms de mediana.

- Con 10 personas usando el sistema como lo hace una persona (leyendo entre acción y acción), **el p95 es 452 ms**.
- La prueba "sin pausas" es mucho más dura que el uso real: cada usuario dispara la siguiente petición apenas recibe la anterior. Aun así, con 10 el p95 queda por debajo de 2 s. Con 30 en esa modalidad sí hay degradación (p95 de 5 s) pero **ningún error**.

## Observaciones para la Etapa 2

1. **Listados completos.** Ventas (1,6 MB), Lotes (0,9 MB) y Finanzas (0,7 MB) devuelven todos los registros. Con el volumen pedido cumplen, pero conviene **paginar y filtrar en el servidor** antes de pasar de unas 2.000 ventas, sobre todo para el celular de gama media con datos móviles.
2. **Cartera y tablero** son los cálculos más caros (unos 300 ms) porque recorren todas las cuotas; si el volumen crece 5 veces, conviene una consulta agregada en la base en lugar de calcular en la aplicación.
3. La API corre en un solo proceso. Si la carga real supera la medida (más de 10 personas activas a la vez), basta con levantar más instancias detrás del balanceador del proveedor en la nube.
4. Estas cifras se repiten en el servidor de producción cuando esté montado (HTTPS, almacenamiento S3 y base administrada) para confirmar el RNF-REN-01 con la latencia real.
