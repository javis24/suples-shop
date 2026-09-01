# Administrador de productos

## Qué incluye

- listado con 12 productos por página;
- búsqueda por nombre, SKU y código de barras;
- filtros por categoría y estado;
- creación, lectura, actualización y archivado seguro;
- descripción, marca, categoría, publicación y producto destacado;
- precio, precio anterior para oferta, costo y existencia;
- título SEO, descripción SEO y slug;
- galería de hasta 12 fotografías, portada, orden y texto alternativo;
- ficha pública `/productos/[slug]` con SEO y galería;
- subida persistente de fotografías con Vercel Blob.

No se agregaron columnas ni tablas: el esquema actual ya contiene todos los campos.

## Instalación

Después de copiar los archivos, ejecuta:

```powershell
pnpm install
pnpm exec prisma generate
pnpm typecheck
pnpm lint
pnpm build
pnpm dev
```

Abre:

```text
http://localhost:3000/dashboard/products
```

## Configurar las fotografías

1. Abre tu proyecto en Vercel.
2. Entra a **Storage**.
3. Crea o conecta un almacén **Blob**.
4. Confirma que Vercel agregó `BLOB_READ_WRITE_TOKEN`.
5. Si trabajarás localmente, copia esa variable a `.env` y reinicia `pnpm dev`.

Sin Blob configurado todavía puedes agregar imágenes mediante una URL pública.

## Comportamiento del Excel

- Los productos se enlazan por SKU para evitar duplicados.
- Un SKU nuevo crea un producto.
- Un SKU existente actualiza el precio.
- Las descripciones, imágenes y SEO no se reemplazan.
- Si configuraste una oferta manual, revisa el descuento después de importar porque el Excel actualiza el precio de venta.

## Eliminación segura

El botón **Archivar** no borra físicamente el producto. Cambia su estado a `ARCHIVED` y desactiva sus variantes, conservando los pedidos relacionados.
