# Suples Shop

Tienda en línea de suplementos deportivos construida con Next.js 16, TypeScript, Prisma 7 y MySQL/MariaDB. Incluye catálogo público, panel administrativo, control de inventario, pedidos, clientes, cupones, banners y actualización masiva desde el reporte `EXISTENCIA.xlsx` de Microsip.

## Requisitos

- Node.js 20.9 o superior
- pnpm 10
- MySQL 8 o MariaDB (puedes administrarlo desde phpMyAdmin)

## Configuración inicial

1. Crea una base de datos desde phpMyAdmin o ejecuta:

   ```sql
   CREATE DATABASE suples_shop
     CHARACTER SET utf8mb4
     COLLATE utf8mb4_unicode_ci;
   ```

2. Instala las dependencias:

   ```bash
   pnpm install
   ```

3. Copia `.env.example` como `.env` y configura `DATABASE_URL`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` y `AUTH_SECRET`. No subas `.env` al repositorio. Usa el formato de URL `mysql://USUARIO:CONTRASENA@HOST:PUERTO/BASE_DE_DATOS` y una cadena larga, aleatoria y privada como `AUTH_SECRET`.

4. Verifica que las credenciales de `.env` tengan acceso a la base creada en el paso 1.

5. Crea las tablas y genera el cliente de Prisma:

   ```bash
   pnpm exec prisma migrate dev --name initial_schema
   pnpm exec prisma generate
   ```

6. Inicia la aplicación:

   ```bash
   pnpm dev
   ```

Abre `http://localhost:3000` para ver la tienda, `http://localhost:3000/dashboard` para configurar al primer administrador y `http://localhost:3000/dashboard/products` para gestionar el catálogo.

## Fotografías de productos

El administrador de productos permite subir hasta 12 imágenes, ordenarlas, elegir la portada y editar el texto alternativo para SEO. Las fotografías se guardan en Vercel Blob para que sean persistentes en producción.

1. En Vercel abre **Storage** y crea o conecta un almacén **Blob** al proyecto.
2. Vercel agregará `BLOB_READ_WRITE_TOKEN` a las variables del proyecto.
3. Para probar subidas desde tu computadora, copia ese valor a tu `.env` local y reinicia `pnpm dev`.

Cada imagen puede pesar hasta 4 MB y debe ser JPG, PNG, WEBP o AVIF. Aunque Blob todavía no esté configurado, el editor permite agregar imágenes mediante una URL pública.

## Importar ExportacionWeb.xlsx

El importador nuevo acepta únicamente la exportación web acordada:

- columna A: SKU o código del producto;
- columna B: nombre;
- columna I: categoría;
- columna K: existencia;
- columna M: precio público.

La primera importación crea categorías, productos y variantes. Las siguientes identifican cada artículo por el SKU estable y actualizan su precio sin duplicarlo. Si una fila no trae SKU, se utiliza el nombre normalizado como respaldo.

El servidor omite automáticamente BETHA, TRT y las categorías BETHA Hormonas, SARMS y Péptidos. Las descripciones, fotografías, SEO, categoría y demás contenido editado desde el administrador no son reemplazados por el Excel.

> El Excel vuelve a actualizar el precio de venta. Si configuraste una oferta manual mediante `Precio anterior`, revísala después de cada importación para confirmar que el descuento siga siendo válido.

## API principal

Todas las respuestas tienen la forma `{ data, meta? }`; los errores usan `{ error: { code, message, details? } }`.

| Recurso | Métodos y rutas |
| --- | --- |
| Salud | `GET /api/health` |
| Acceso | `POST /api/auth/bootstrap`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Usuarios | `GET/POST /api/auth/users`, `GET/PATCH/DELETE /api/auth/users/:id` |
| Productos | `GET/POST /api/products`, `GET/PATCH/DELETE /api/products/:id` |
| Imágenes | `POST/DELETE /api/uploads/products` |
| Precios | `GET /api/products/:id/price-history` |
| Categorías | `GET/POST /api/categories`, `GET/PATCH/DELETE /api/categories/:id` |
| Marcas | `GET/POST /api/brands`, `GET/PATCH/DELETE /api/brands/:id` |
| Inventario | `GET /api/inventory`, `POST /api/inventory/adjustments`, `GET /api/inventory/movements` |
| Importaciones | `POST /api/imports/products`, `GET /api/imports`, `GET /api/imports/:id` |
| Clientes | `GET/POST /api/customers`, `GET/PATCH/DELETE /api/customers/:id`, `GET/POST /api/customers/:id/addresses` |
| Pedidos | `GET/POST /api/orders`, `GET/PATCH /api/orders/:id` |
| Cupones | `GET/POST /api/coupons`, `GET/PATCH/DELETE /api/coupons/:id`, `POST /api/coupons/validate` |
| Banners | `GET/POST /api/banners`, `GET/PATCH/DELETE /api/banners/:id` |
| Ajustes | `GET/PATCH /api/settings` |
| Resumen | `GET /api/dashboard` |

Las operaciones administrativas requieren la cookie de sesión que se obtiene al iniciar sesión. La tienda pública solo expone productos, categorías, marcas y banners activos.

## Flujo recomendado para producción

1. Microsip genera diariamente `EXISTENCIA.xlsx`.
2. Una persona autorizada entra al dashboard y carga el archivo.
3. La API valida el formato y realiza la actualización dentro de una transacción.
4. Cada cambio queda trazable en `ImportBatch`, `ImportRow`, `InventoryMovement` y `PriceHistory`.
5. Revisa la importación antes de habilitar la actualización automática de precios.

Para automatizar Microsip después, conserva este importador como respaldo y agrega un proceso separado que obtenga los mismos campos desde la API o una exportación programada del cliente. No conectes la base de datos de Microsip directamente al navegador ni publiques sus credenciales.

## Comandos

```bash
pnpm dev          # desarrollo
pnpm build        # genera Prisma y compila producción
pnpm lint         # ESLint
pnpm typecheck    # TypeScript
pnpm db:studio    # interfaz de Prisma
pnpm db:migrate   # crear/aplicar migraciones de desarrollo
pnpm db:deploy    # aplicar migraciones en producción
```
