"use client";

/* eslint-disable @next/next/no-img-element */

import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AdminSidebar, type AdminSidebarUser } from "@/components/admin-sidebar";

type ProductStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";

type Category = {
  id: number;
  name: string;
  slug: string;
  active: boolean;
};

type Brand = {
  id: number;
  name: string;
  slug: string;
  active: boolean;
};

type ProductImage = {
  id?: number;
  url: string;
  alt: string | null;
  sortOrder: number;
  primary: boolean;
};

type ProductVariant = {
  id?: number;
  sku: string;
  barcode: string | null;
  unit: string;
  cost: string | number;
  price: string | number;
  compareAtPrice: string | number | null;
  stock: number;
  lowStockAt: number;
  active: boolean;
};

type Product = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  categoryId: number;
  brandId: number | null;
  status: ProductStatus;
  featured: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  category: Category;
  brand: Brand | null;
  variants: ProductVariant[];
  images: ProductImage[];
  updatedAt: string;
};

type ProductDraft = {
  id?: number;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  brandId: string;
  status: ProductStatus;
  featured: boolean;
  seoTitle: string;
  seoDescription: string;
  variant: {
    id?: number;
    sku: string;
    barcode: string;
    unit: string;
    cost: string;
    price: string;
    compareAtPrice: string;
    stock: string;
    lowStockAt: string;
    active: boolean;
  };
  images: ProductImage[];
  originalImageUrls: string[];
};

type Pagination = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type ApiPayload<T> = {
  success: boolean;
  data: T;
  meta?: Pagination;
  error?: { code?: string; message?: string; details?: unknown };
};

type Notice = { type: "success" | "error" | "info"; message: string } | null;

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const STATUS_LABELS: Record<ProductStatus, string> = {
  ACTIVE: "Publicado",
  DRAFT: "Borrador",
  INACTIVE: "Oculto",
  ARCHIVED: "Archivado",
};

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json()) as ApiPayload<T>;

  if (!response.ok) {
    const error = new Error(payload.error?.message || "No se pudo completar la operación.");
    Object.assign(error, { code: payload.error?.code, details: payload.error?.details });
    throw error;
  }

  return payload;
}

function numberValue(value: string | number | null | undefined) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function productDraft(product: Product): ProductDraft {
  const variant = product.variants[0];
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description || "",
    categoryId: String(product.categoryId),
    brandId: product.brandId ? String(product.brandId) : "",
    status: product.status,
    featured: product.featured,
    seoTitle: product.seoTitle || "",
    seoDescription: product.seoDescription || "",
    variant: {
      id: variant?.id,
      sku: variant?.sku || "",
      barcode: variant?.barcode || "",
      unit: variant?.unit || "Pieza",
      cost: String(variant?.cost ?? 0),
      price: String(variant?.price ?? 0),
      compareAtPrice: variant?.compareAtPrice ? String(variant.compareAtPrice) : "",
      stock: String(variant?.stock ?? 0),
      lowStockAt: String(variant?.lowStockAt ?? 5),
      active: variant?.active ?? true,
    },
    images: product.images.map((image, index) => ({
      ...image,
      alt: image.alt || "",
      sortOrder: index,
    })),
    originalImageUrls: product.images.map((image) => image.url),
  };
}

function newProductDraft(categoryId = ""): ProductDraft {
  return {
    name: "",
    slug: "",
    description: "",
    categoryId,
    brandId: "",
    status: "ACTIVE",
    featured: false,
    seoTitle: "",
    seoDescription: "",
    variant: {
      sku: "",
      barcode: "",
      unit: "Pieza",
      cost: "0",
      price: "0",
      compareAtPrice: "",
      stock: "0",
      lowStockAt: "5",
      active: true,
    },
    images: [],
    originalImageUrls: [],
  };
}

function managedBlob(url: string) {
  try {
    return new URL(url).hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export function ProductAdminClient() {
  const router = useRouter();
  const [user, setUser] = useState<AdminSidebarUser | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 1,
    limit: 12,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<ProductStatus | "">("ACTIVE");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [editor, setEditor] = useState<ProductDraft | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [removedBlobUrls, setRemovedBlobUrls] = useState<string[]>([]);

  const loadProducts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        all: "true",
        page: String(page),
        limit: "12",
      });
      if (appliedSearch) params.set("q", appliedSearch);
      if (category) params.set("category", category);
      if (status) params.set("status", status);

      const result = await request<Product[]>(`/api/products?${params}`);
      setProducts(result.data);
      if (result.meta) setPagination(result.meta);
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "No se pudieron cargar los productos.",
      });
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, category, page, status, user]);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [session, categoryResult, brandResult] = await Promise.all([
          request<AdminSidebarUser>("/api/auth/me"),
          request<Category[]>("/api/categories?all=true"),
          request<Brand[]>("/api/brands?all=true"),
        ]);
        setUser(session.data);
        setCategories(categoryResult.data);
        setBrands(brandResult.data);
      } catch {
        router.replace("/dashboard");
      }
    }

    void bootstrap();
  }, [router]);

  useEffect(() => {
    // La consulta se repite únicamente cuando cambian los filtros o la página.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProducts();
  }, [loadProducts]);

  const offerDiscount = useMemo(() => {
    if (!editor?.variant.compareAtPrice) return 0;
    const price = numberValue(editor.variant.price);
    const regular = numberValue(editor.variant.compareAtPrice);
    return regular > price && regular > 0 ? Math.round((1 - price / regular) * 100) : 0;
  }, [editor?.variant.compareAtPrice, editor?.variant.price]);

  function openCreate() {
    if (!categories.length) {
      setNotice({ type: "error", message: "Primero necesitas tener al menos una categoría." });
      return;
    }
    setUploadedUrls([]);
    setRemovedBlobUrls([]);
    setImageUrl("");
    setEditor(newProductDraft(String(categories[0].id)));
  }

  function openEdit(product: Product) {
    setUploadedUrls([]);
    setRemovedBlobUrls([]);
    setImageUrl("");
    setEditor(productDraft(product));
  }

  async function deleteBlob(url: string) {
    if (!managedBlob(url)) return;
    await request<{ deleted: boolean }>("/api/uploads/products", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  }

  async function closeEditor() {
    setEditor(null);
    const unusedUploads = [...uploadedUrls];
    setUploadedUrls([]);
    setRemovedBlobUrls([]);
    await Promise.allSettled(unusedUploads.map(deleteBlob));
  }

  function updateDraft<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) {
    setEditor((current) => (current ? { ...current, [key]: value } : current));
  }

  function updateVariant<K extends keyof ProductDraft["variant"]>(
    key: K,
    value: ProductDraft["variant"][K],
  ) {
    setEditor((current) =>
      current ? { ...current, variant: { ...current.variant, [key]: value } } : current,
    );
  }

  async function uploadImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!editor || !files.length) return;
    if (editor.images.length + files.length > 12) {
      setNotice({ type: "error", message: "Puedes guardar como máximo 12 imágenes por producto." });
      return;
    }

    setUploading(true);
    setNotice({ type: "info", message: "Subiendo imágenes…" });
    try {
      for (const file of files) {
        if (file.size > 4 * 1024 * 1024) {
          throw new Error(`${file.name} supera el límite de 4 MB.`);
        }
        const formData = new FormData();
        formData.append("file", file);
        const result = await request<{ url: string }>("/api/uploads/products", {
          method: "POST",
          body: formData,
        });
        const url = result.data.url;
        setUploadedUrls((current) => [...current, url]);
        setEditor((current) => {
          if (!current) return current;
          const nextImage: ProductImage = {
            url,
            alt: current.name,
            sortOrder: current.images.length,
            primary: current.images.length === 0,
          };
          return { ...current, images: [...current.images, nextImage] };
        });
      }
      setNotice({ type: "success", message: "Las imágenes se subieron correctamente." });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "No se pudieron subir las imágenes.",
      });
    } finally {
      setUploading(false);
    }
  }

  function addImageUrl() {
    if (!editor || !imageUrl.trim()) return;
    try {
      const parsedUrl = new URL(imageUrl.trim());
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error("La imagen debe usar una dirección http o https.");
      }
      const url = parsedUrl.toString();
      if (editor.images.length >= 12) throw new Error("Máximo 12 imágenes por producto.");
      updateDraft("images", [
        ...editor.images,
        {
          url,
          alt: editor.name,
          sortOrder: editor.images.length,
          primary: editor.images.length === 0,
        },
      ]);
      setImageUrl("");
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "La URL de la imagen no es válida.",
      });
    }
  }

  function setPrimaryImage(index: number) {
    if (!editor) return;
    updateDraft(
      "images",
      editor.images.map((image, imageIndex) => ({
        ...image,
        primary: imageIndex === index,
      })),
    );
  }

  function updateImageAlt(index: number, alt: string) {
    if (!editor) return;
    updateDraft(
      "images",
      editor.images.map((image, imageIndex) =>
        imageIndex === index ? { ...image, alt } : image,
      ),
    );
  }

  function moveImage(index: number, direction: -1 | 1) {
    if (!editor) return;
    const target = index + direction;
    if (target < 0 || target >= editor.images.length) return;
    const images = [...editor.images];
    [images[index], images[target]] = [images[target], images[index]];
    updateDraft(
      "images",
      images.map((image, imageIndex) => ({ ...image, sortOrder: imageIndex })),
    );
  }

  function removeImage(index: number) {
    if (!editor) return;
    const removed = editor.images[index];
    let images = editor.images.filter((_, imageIndex) => imageIndex !== index);
    if (removed.primary && images.length) {
      images = images.map((image, imageIndex) => ({ ...image, primary: imageIndex === 0 }));
    }
    images = images.map((image, imageIndex) => ({ ...image, sortOrder: imageIndex }));
    updateDraft("images", images);
    if (managedBlob(removed.url)) {
      setRemovedBlobUrls((current) => [...new Set([...current, removed.url])]);
    }
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;

    const price = numberValue(editor.variant.price);
    const compareAtPrice = editor.variant.compareAtPrice
      ? numberValue(editor.variant.compareAtPrice)
      : null;

    if (!editor.name.trim() || editor.name.trim().length < 2) {
      setNotice({ type: "error", message: "Escribe un nombre válido para el producto." });
      return;
    }
    if (!editor.variant.sku.trim() || editor.variant.sku.trim().length < 2) {
      setNotice({ type: "error", message: "El SKU debe tener al menos dos caracteres." });
      return;
    }
    if (compareAtPrice !== null && compareAtPrice <= price) {
      setNotice({
        type: "error",
        message: "Para mostrar una oferta, el precio anterior debe ser mayor al precio de venta.",
      });
      return;
    }

    const images = editor.images.map((image, index) => ({
      url: image.url,
      alt: image.alt?.trim() || editor.name.trim(),
      sortOrder: index,
      primary: editor.images.some((item) => item.primary) ? image.primary : index === 0,
    }));

    const body = {
      name: editor.name.trim(),
      slug: editor.slug.trim() || null,
      description: editor.description.trim() || null,
      categoryId: Number(editor.categoryId),
      brandId: editor.brandId ? Number(editor.brandId) : null,
      status: editor.status,
      featured: editor.featured,
      seoTitle: editor.seoTitle.trim() || null,
      seoDescription: editor.seoDescription.trim() || null,
      variants: [
        {
          id: editor.variant.id,
          sku: editor.variant.sku.trim(),
          barcode: editor.variant.barcode.trim() || null,
          unit: editor.variant.unit.trim() || "Pieza",
          cost: numberValue(editor.variant.cost),
          price,
          compareAtPrice,
          stock: Math.max(0, Math.trunc(numberValue(editor.variant.stock))),
          lowStockAt: Math.max(0, Math.trunc(numberValue(editor.variant.lowStockAt))),
          active: editor.variant.active,
        },
      ],
      images,
    };

    setSaving(true);
    setNotice({ type: "info", message: "Guardando producto…" });
    try {
      await request<Product>(editor.id ? `/api/products/${editor.id}` : "/api/products", {
        method: editor.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      await Promise.allSettled(removedBlobUrls.map(deleteBlob));
      setEditor(null);
      setUploadedUrls([]);
      setRemovedBlobUrls([]);
      setNotice({
        type: "success",
        message: editor.id ? "Producto actualizado correctamente." : "Producto creado correctamente.",
      });
      await loadProducts();
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "No se pudo guardar el producto.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function archiveProduct(product: Product) {
    if (!window.confirm(`¿Archivar “${product.name}”? Se ocultará de la tienda, pero conservará sus pedidos.`)) {
      return;
    }
    try {
      await request<{ archived: boolean }>(`/api/products/${product.id}`, { method: "DELETE" });
      setNotice({ type: "success", message: "El producto se archivó sin borrar su historial." });
      await loadProducts();
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "No se pudo archivar el producto.",
      });
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setAppliedSearch(search.trim());
  }

  const pageNumbers = useMemo(() => {
    const start = Math.max(1, Math.min(page - 2, pagination.totalPages - 4));
    const end = Math.min(pagination.totalPages, start + 4);
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
  }, [page, pagination.totalPages]);

  if (!user) {
    return (
      <main className="access-screen">
        <div className="access-card">
          <div className="dashboard-loader" />
          <p>Preparando el catálogo…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-shell product-admin-shell">
      <AdminSidebar active="products" user={user} />

      <section className="admin-content product-admin-content">
        <header className="admin-topbar product-admin-topbar">
          <div>
            <span className="eyebrow dark">CATÁLOGO</span>
            <h1>Productos</h1>
            <p>Administra precios, ofertas, contenido, SEO y fotografías.</p>
          </div>
          <div className="topbar-actions">
            <Link href="/" target="_blank">Ver tienda ↗</Link>
            <button className="product-new-button" onClick={openCreate} type="button">＋ Nuevo producto</button>
          </div>
        </header>

        {notice ? (
          <div className={`product-notice ${notice.type}`}>
            <span>{notice.message}</span>
            <button aria-label="Cerrar aviso" onClick={() => setNotice(null)} type="button">×</button>
          </div>
        ) : null}

        <section className="product-toolbar-panel">
          <form className="product-admin-search" onSubmit={submitSearch}>
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Buscar productos"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, SKU o código de barras…"
              value={search}
            />
            {search ? <button aria-label="Limpiar búsqueda" className="product-search-clear" onClick={() => { setSearch(""); setAppliedSearch(""); setPage(1); }} type="button">×</button> : null}
            <button className="product-search-submit" type="submit">Buscar</button>
          </form>

          <div className="product-admin-filters">
            <label>
              <span>Categoría</span>
              <select onChange={(event) => { setCategory(event.target.value); setPage(1); }} value={category}>
                <option value="">Todas</option>
                {categories.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
              </select>
            </label>
            <label>
              <span>Estado</span>
              <select onChange={(event) => { setStatus(event.target.value as ProductStatus | ""); setPage(1); }} value={status}>
                <option value="">Todos</option>
                <option value="ACTIVE">Publicados</option>
                <option value="DRAFT">Borradores</option>
                <option value="INACTIVE">Ocultos</option>
                <option value="ARCHIVED">Archivados</option>
              </select>
            </label>
          </div>
        </section>

        <section className="product-list-panel">
          <div className="product-list-heading">
            <div><strong>{pagination.total.toLocaleString("es-MX")} productos</strong><span>Página {pagination.page} de {pagination.totalPages}</span></div>
            <span>El Excel actualizará precios por SKU sin duplicar registros.</span>
          </div>

          <div className="product-admin-table-wrap">
            <div className="product-admin-table product-admin-table-head">
              <span>Producto</span><span>SKU</span><span>Precio</span><span>Existencia</span><span>Estado</span><span>Acciones</span>
            </div>

            {loading ? (
              <div className="product-admin-loading">Cargando productos…</div>
            ) : products.length ? products.map((product) => {
              const variant = product.variants[0];
              const image = product.images[0];
              const price = numberValue(variant?.price);
              const compareAtPrice = numberValue(variant?.compareAtPrice);
              const hasOffer = compareAtPrice > price;
              return (
                <article className="product-admin-table product-admin-row" key={product.id}>
                  <div className="product-admin-identity">
                    <div className="product-admin-thumb">{image ? <img alt={image.alt || product.name} src={image.url} /> : <span>{product.name.slice(0, 2).toUpperCase()}</span>}</div>
                    <span><strong>{product.name}</strong><small>{product.category.name}{product.featured ? " · Destacado" : ""}</small></span>
                  </div>
                  <span className="product-admin-sku">{variant?.sku || "Sin SKU"}</span>
                  <div className="product-admin-price"><strong>{money.format(price)}</strong>{hasOffer ? <><del>{money.format(compareAtPrice)}</del><small>OFERTA</small></> : null}</div>
                  <span className={numberValue(variant?.stock) > 0 ? "product-stock-pill" : "product-stock-pill empty"}>{numberValue(variant?.stock)} pzas.</span>
                  <span className={`product-status-badge ${product.status.toLowerCase()}`}>{STATUS_LABELS[product.status]}</span>
                  <div className="product-row-actions"><button onClick={() => openEdit(product)} type="button">Editar</button>{product.status !== "ARCHIVED" ? <button className="danger" onClick={() => void archiveProduct(product)} type="button">Archivar</button> : null}</div>
                </article>
              );
            }) : (
              <div className="product-admin-empty"><strong>No encontramos productos.</strong><span>Cambia los filtros o importa el nuevo Excel.</span></div>
            )}
          </div>

          <nav aria-label="Paginación de productos" className="product-pagination">
            <button disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">← Anterior</button>
            <div>{pageNumbers.map((number) => <button className={number === page ? "active" : ""} key={number} onClick={() => setPage(number)} type="button">{number}</button>)}</div>
            <button disabled={page >= pagination.totalPages || loading} onClick={() => setPage((value) => Math.min(pagination.totalPages, value + 1))} type="button">Siguiente →</button>
          </nav>
        </section>
      </section>

      {editor ? (
        <div className="product-editor-backdrop" role="presentation">
          <section aria-labelledby="product-editor-title" aria-modal="true" className="product-editor" role="dialog">
            <header className="product-editor-header">
              <div><span className="eyebrow dark">{editor.id ? `PRODUCTO #${editor.id}` : "NUEVO PRODUCTO"}</span><h2 id="product-editor-title">{editor.id ? "Editar producto" : "Crear producto"}</h2></div>
              <button aria-label="Cerrar editor" disabled={saving} onClick={() => void closeEditor()} type="button">×</button>
            </header>

            <form onSubmit={saveProduct}>
              <div className="product-editor-body">
                <div className="product-editor-main">
                  <section className="product-form-section">
                    <div className="product-form-heading"><span>1</span><div><h3>Información principal</h3><p>Así se presentará el producto dentro de la tienda.</p></div></div>
                    <div className="product-form-grid">
                      <label className="wide"><span>Nombre del producto *</span><input maxLength={255} onChange={(event) => updateDraft("name", event.target.value)} required value={editor.name} /></label>
                      <label><span>Categoría *</span><select onChange={(event) => updateDraft("categoryId", event.target.value)} required value={editor.categoryId}>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                      <label><span>Marca</span><select onChange={(event) => updateDraft("brandId", event.target.value)} value={editor.brandId}><option value="">Sin marca</option>{brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                      <label className="wide"><span>Descripción</span><textarea maxLength={20000} onChange={(event) => updateDraft("description", event.target.value)} placeholder="Beneficios, ingredientes, modo de uso y recomendaciones…" rows={7} value={editor.description} /><small>{editor.description.length.toLocaleString("es-MX")} / 20,000</small></label>
                    </div>
                  </section>

                  <section className="product-form-section">
                    <div className="product-form-heading"><span>2</span><div><h3>Precio, oferta e inventario</h3><p>El precio del Excel puede actualizar nuevamente el precio de venta.</p></div></div>
                    <div className="product-form-grid commercial-grid">
                      <label><span>SKU *</span><input maxLength={100} onChange={(event) => updateVariant("sku", event.target.value)} required value={editor.variant.sku} /></label>
                      <label><span>Código de barras</span><input maxLength={100} onChange={(event) => updateVariant("barcode", event.target.value)} value={editor.variant.barcode} /></label>
                      <label><span>Precio de venta *</span><div className="money-input"><span>$</span><input min="0" onChange={(event) => updateVariant("price", event.target.value)} required step="0.01" type="number" value={editor.variant.price} /></div></label>
                      <label><span>Precio anterior</span><div className="money-input"><span>$</span><input min="0" onChange={(event) => updateVariant("compareAtPrice", event.target.value)} placeholder="Vacío = sin oferta" step="0.01" type="number" value={editor.variant.compareAtPrice} /></div>{offerDiscount > 0 ? <small className="offer-preview">Oferta de {offerDiscount}%</small> : <small>Debe ser mayor al precio de venta.</small>}</label>
                      <label><span>Existencia</span><input min="0" onChange={(event) => updateVariant("stock", event.target.value)} step="1" type="number" value={editor.variant.stock} /></label>
                      <label><span>Aviso de stock bajo</span><input min="0" onChange={(event) => updateVariant("lowStockAt", event.target.value)} step="1" type="number" value={editor.variant.lowStockAt} /></label>
                      <label><span>Unidad</span><input maxLength={40} onChange={(event) => updateVariant("unit", event.target.value)} value={editor.variant.unit} /></label>
                      <label><span>Costo interno</span><div className="money-input"><span>$</span><input min="0" onChange={(event) => updateVariant("cost", event.target.value)} step="0.01" type="number" value={editor.variant.cost} /></div></label>
                    </div>
                  </section>

                  <section className="product-form-section">
                    <div className="product-form-heading"><span>3</span><div><h3>Fotografías y galería</h3><p>La portada se muestra primero en el catálogo. Máximo 12 imágenes.</p></div></div>
                    <div className="product-image-upload-row">
                      <label className="product-image-upload"><input accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploading || editor.images.length >= 12} multiple onChange={uploadImages} type="file" /><span>⇧</span><strong>{uploading ? "Subiendo…" : "Subir fotografías"}</strong><small>JPG, PNG, WEBP o AVIF · 4 MB cada una</small></label>
                      <div className="product-image-url"><label htmlFor="product-image-url">O agregar desde una URL</label><div><input id="product-image-url" onChange={(event) => setImageUrl(event.target.value)} placeholder="https://…" type="url" value={imageUrl} /><button onClick={addImageUrl} type="button">Agregar</button></div></div>
                    </div>

                    {editor.images.length ? <div className="product-gallery-editor">{editor.images.map((image, index) => <article className={image.primary ? "primary" : ""} key={`${image.url}-${index}`}><div className="product-gallery-image"><img alt={image.alt || editor.name} src={image.url} />{image.primary ? <span>PORTADA</span> : null}</div><label><span>Texto alternativo (SEO)</span><input maxLength={255} onChange={(event) => updateImageAlt(index, event.target.value)} value={image.alt || ""} /></label><div className="product-gallery-actions"><button disabled={index === 0} onClick={() => moveImage(index, -1)} title="Mover a la izquierda" type="button">←</button><button disabled={index === editor.images.length - 1} onClick={() => moveImage(index, 1)} title="Mover a la derecha" type="button">→</button><button disabled={image.primary} onClick={() => setPrimaryImage(index)} type="button">Portada</button><button className="danger" onClick={() => removeImage(index)} type="button">Quitar</button></div></article>)}</div> : <div className="product-gallery-empty">Todavía no agregas fotografías. El catálogo mostrará un marcador temporal.</div>}
                  </section>

                  <section className="product-form-section">
                    <div className="product-form-heading"><span>4</span><div><h3>SEO para buscadores</h3><p>Controla cómo podría mostrarse el producto en Google.</p></div></div>
                    <div className="product-form-grid">
                      <label className="wide"><span>Dirección URL</span><div className="slug-input"><span>/productos/</span><input maxLength={280} onChange={(event) => updateDraft("slug", event.target.value)} placeholder="se-genera-con-el-nombre" value={editor.slug} /></div></label>
                      <label className="wide"><span>Título SEO</span><input maxLength={180} onChange={(event) => updateDraft("seoTitle", event.target.value)} placeholder={editor.name || "Título que aparecerá en Google"} value={editor.seoTitle} /><small>{editor.seoTitle.length} / 180</small></label>
                      <label className="wide"><span>Descripción SEO</span><textarea maxLength={320} onChange={(event) => updateDraft("seoDescription", event.target.value)} placeholder="Resumen atractivo del producto…" rows={3} value={editor.seoDescription} /><small>{editor.seoDescription.length} / 320</small></label>
                    </div>
                    <div className="seo-preview"><small>suples-shop.net › productos › {editor.slug || "producto"}</small><strong>{editor.seoTitle || editor.name || "Nombre del producto"}</strong><p>{editor.seoDescription || editor.description.slice(0, 160) || "Agrega una descripción para mejorar la vista previa del resultado."}</p></div>
                  </section>
                </div>

                <aside className="product-editor-side">
                  <section><h3>Publicación</h3><label><span>Estado</span><select onChange={(event) => updateDraft("status", event.target.value as ProductStatus)} value={editor.status}><option value="ACTIVE">Publicado</option><option value="DRAFT">Borrador</option><option value="INACTIVE">Oculto</option><option value="ARCHIVED">Archivado</option></select></label><label className="editor-check"><input checked={editor.featured} onChange={(event) => updateDraft("featured", event.target.checked)} type="checkbox" /><span><strong>Producto destacado</strong><small>Aparecerá primero en el catálogo.</small></span></label><label className="editor-check"><input checked={editor.variant.active} onChange={(event) => updateVariant("active", event.target.checked)} type="checkbox" /><span><strong>Variante disponible</strong><small>Permite mostrar esta presentación.</small></span></label></section>
                  <section className="product-editor-preview"><h3>Vista rápida</h3><div className="editor-preview-image">{editor.images.find((image) => image.primary) || editor.images[0] ? <img alt={editor.name} src={(editor.images.find((image) => image.primary) || editor.images[0]).url} /> : <span>{editor.name.slice(0, 2).toUpperCase() || "SS"}</span>}</div><small>{categories.find((item) => String(item.id) === editor.categoryId)?.name || "Categoría"}</small><strong>{editor.name || "Nombre del producto"}</strong><div><b>{money.format(numberValue(editor.variant.price))}</b>{offerDiscount ? <del>{money.format(numberValue(editor.variant.compareAtPrice))}</del> : null}</div>{offerDiscount ? <em>OFERTA {offerDiscount}%</em> : null}</section>
                  <div className="product-editor-tip"><strong>Importación diaria</strong><p>El Excel identifica por SKU y actualiza el precio. La descripción, SEO e imágenes se conservan; revisa las ofertas después de cada importación.</p></div>
                </aside>
              </div>

              <footer className="product-editor-footer"><button disabled={saving} onClick={() => void closeEditor()} type="button">Cancelar</button><button className="save" disabled={saving || uploading} type="submit">{saving ? "Guardando…" : editor.id ? "Guardar cambios" : "Crear producto"}</button></footer>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
