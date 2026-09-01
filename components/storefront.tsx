"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Category = {
  id: number;
  name: string;
  slug: string;
  _count?: { products: number };
};

type Variant = {
  id: number;
  price: string | number;
  compareAtPrice: string | number | null;
  stock: number;
  flavor: string | null;
  presentation: string | null;
};

type Product = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  featured: boolean;
  category: Category;
  brand: { name: string } | null;
  variants: Variant[];
  images: { url: string; alt: string | null }[];
};

type QuickFilter = "all" | "available" | "offers";
type SortOption = "featured" | "price-asc" | "price-desc" | "name";

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
}

function productStock(product: Product) {
  return product.variants.reduce((total, variant) => total + variant.stock, 0);
}

function productPrice(product: Product) {
  return Number(product.variants[0]?.price ?? 0);
}

export function Storefront() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [sort, setSort] = useState<SortOption>("featured");
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({ limit: "30" });
    if (selectedCategory) params.set("category", selectedCategory);
    if (appliedSearch) params.set("q", appliedSearch);

    try {
      const response = await fetch(`/api/products?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message || "No fue posible cargar los productos.");
      }
      setProducts(payload.data);
      setTotalProducts(payload.meta?.total ?? payload.data.length);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible cargar los productos.");
      setProducts([]);
      setTotalProducts(0);
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, selectedCategory]);

  useEffect(() => {
    fetch("/api/categories")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message);
        setCategories(payload.data);
      })
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    // La consulta cambia únicamente cuando se aplica una búsqueda o categoría.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProducts();
  }, [loadProducts]);

  const selectedCategoryName = useMemo(
    () => categories.find((category) => category.slug === selectedCategory)?.name,
    [categories, selectedCategory],
  );

  const visibleProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      if (quickFilter === "available") return productStock(product) > 0;
      if (quickFilter === "offers") {
        return product.variants.some((variant) => Number(variant.compareAtPrice ?? 0) > Number(variant.price));
      }
      return true;
    });

    return [...filtered].sort((first, second) => {
      if (sort === "price-asc") return productPrice(first) - productPrice(second);
      if (sort === "price-desc") return productPrice(second) - productPrice(first);
      if (sort === "name") return first.name.localeCompare(second.name, "es");
      return Number(second.featured) - Number(first.featured);
    });
  }, [products, quickFilter, sort]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedSearch(search.trim());
  }

  function clearFilters() {
    setSearch("");
    setAppliedSearch("");
    setSelectedCategory("");
    setQuickFilter("all");
    setSort("featured");
  }

  function chooseCategory(slug: string) {
    setSelectedCategory(slug);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="shop-page">
      <div className="shop-announcement">
        <span>Productos originales</span>
        <span>Envíos a todo México</span>
        <span>Atención personalizada</span>
      </div>

      <header className="shop-header">
        <div className="shop-container shop-header-row">
        <Link
  className="shop-logo shop-logo-header"
  href="/"
  aria-label="Suples Shop, inicio"
>
  <Image
    className="shop-logo-image"
    src="/logo_uno.png"
    alt="Suples Shop"
    fill
    sizes="170px"
    priority
  />
</Link>

          <form className="shop-search" onSubmit={submitSearch}>
            <input
              id="shop-primary-search"
              aria-label="Buscar productos"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar proteína, creatina, vitaminas, marca o sabor..."
              value={search}
            />
            {search ? (
              <button className="shop-search-clear" onClick={() => { setSearch(""); setAppliedSearch(""); }} type="button" aria-label="Limpiar búsqueda">×</button>
            ) : null}
            <button className="shop-search-submit" type="submit"><span aria-hidden="true">⌕</span> Buscar</button>
          </form>

          <nav className="shop-header-actions" aria-label="Acciones de la tienda">
            <Link href="/dashboard"><span className="shop-action-icon">♙</span><span><small>Mi cuenta</small><strong>Administrar</strong></span></Link>
            <button type="button" aria-label={`${cartCount} productos en el carrito`}><span className="shop-action-icon">▱</span><span><small>Mi carrito</small><strong>{cartCount} productos</strong></span></button>
          </nav>
        </div>
      </header>

      <div className="shop-category-bar">
        <div className="shop-container"><strong>Suplementos deportivos</strong><span>Proteínas</span><span>Creatinas</span><span>Vitaminas</span><span>Pre-entrenos</span></div>
      </div>

      <section className="shop-container shop-main">
        <aside className="shop-sidebar">
          <div className="shop-side-search"><form onSubmit={submitSearch}><input aria-label="Buscar en el catálogo" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar productos..." value={search} /><button type="submit">Buscar</button></form></div>

          <div className="shop-side-block">
            <div className="shop-side-title"><h2>Categorías</h2><span>−</span></div>
            <button className={!selectedCategory ? "shop-category active" : "shop-category"} onClick={() => chooseCategory("")} type="button">
              <span className="shop-checkbox" /><strong>Todos los productos</strong><small>{!selectedCategory && !appliedSearch ? totalProducts : ""}</small>
            </button>
            <div className="shop-category-list">
              {categories.map((category) => (
                <button className={selectedCategory === category.slug ? "shop-category active" : "shop-category"} key={category.id} onClick={() => chooseCategory(category.slug)} type="button">
                  <span className="shop-checkbox" /><span>{category.name}</span><small>{category._count?.products ?? ""}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="shop-side-help"><span>¿No sabes cuál elegir?</span><strong>Encuentra tu suplemento más rápido</strong><p>Busca por objetivo, ingrediente, marca, sabor o presentación.</p><button onClick={() => document.getElementById("shop-primary-search")?.focus()} type="button">Usar el buscador</button></div>
        </aside>

        <div className="shop-catalog">
          <div className="shop-catalog-intro">
            <div><span className="shop-breadcrumb">Inicio / {selectedCategoryName || "Productos"}</span><h1>{selectedCategoryName || (appliedSearch ? `Resultados para “${appliedSearch}”` : "Productos destacados")}</h1><p>{appliedSearch || selectedCategory ? "Encuentra los productos que coinciden con tus filtros." : "Una selección inicial de hasta 30 productos disponibles en la tienda."}</p></div>
            <div className="shop-trust"><strong>Compra segura</strong><span>Stock actualizado desde el panel</span></div>
          </div>

          <details className="shop-mobile-categories">
            <summary>Filtrar por categoría <span>＋</span></summary>
            <div><button className={!selectedCategory ? "active" : ""} onClick={() => chooseCategory("")} type="button">Todos</button>{categories.map((category) => <button className={selectedCategory === category.slug ? "active" : ""} key={category.id} onClick={() => chooseCategory(category.slug)} type="button">{category.name}</button>)}</div>
          </details>

          <div className="shop-fast-filters">
            <strong>Filtros rápidos:</strong>
            <button className={quickFilter === "all" ? "active" : ""} onClick={() => setQuickFilter("all")} type="button"><span>★</span> Todos</button>
            <button className={quickFilter === "available" ? "active" : ""} onClick={() => setQuickFilter("available")} type="button"><span>✓</span> Disponibles</button>
            <button className={quickFilter === "offers" ? "active" : ""} onClick={() => setQuickFilter("offers")} type="button"><span>%</span> Ofertas</button>
          </div>

          <div className="shop-toolbar">
            <p>{loading ? "Cargando productos..." : `Mostrando ${visibleProducts.length} de ${totalProducts} resultados`}</p>
            <div><span>Vista</span><span className="shop-grid-icon" aria-hidden="true">▦</span><label htmlFor="sort-products">Ordenar:</label><select id="sort-products" onChange={(event) => setSort(event.target.value as SortOption)} value={sort}><option value="featured">Destacados</option><option value="name">Nombre A–Z</option><option value="price-asc">Precio menor</option><option value="price-desc">Precio mayor</option></select></div>
          </div>

          {(selectedCategory || appliedSearch || quickFilter !== "all") ? (
            <div className="shop-active-filters"><span>Filtros activos:</span>{selectedCategoryName ? <button onClick={() => setSelectedCategory("")} type="button">{selectedCategoryName} ×</button> : null}{appliedSearch ? <button onClick={() => { setAppliedSearch(""); setSearch(""); }} type="button">“{appliedSearch}” ×</button> : null}{quickFilter !== "all" ? <button onClick={() => setQuickFilter("all")} type="button">{quickFilter === "available" ? "Disponibles" : "Ofertas"} ×</button> : null}<button className="clear-all" onClick={clearFilters} type="button">Limpiar todo</button></div>
          ) : null}

          {message ? <div className="shop-empty"><strong>La tienda todavía no puede mostrar productos.</strong><span>{message}</span><Link href="/dashboard">Ir al panel administrativo</Link></div> : null}
          {loading ? <div className="shop-products-grid shop-loading-grid">{Array.from({ length: 10 }, (_, index) => <div className="shop-product-skeleton" key={index} />)}</div> : null}
          {!loading && !message && visibleProducts.length === 0 ? <div className="shop-empty"><strong>No encontramos productos.</strong><span>Cambia la búsqueda o selecciona otra categoría.</span><button onClick={clearFilters} type="button">Ver todos los productos</button></div> : null}

          {!loading && visibleProducts.length ? (
            <div className="shop-products-grid">
              {visibleProducts.map((product, index) => {
                const variant = product.variants[0];
                const stock = productStock(product);
                const image = product.images[0];
                const hasDiscount = Number(variant?.compareAtPrice ?? 0) > Number(variant?.price ?? 0);
                const extraVariants = product.variants.length - 1;

                return (
                  <article className="shop-product-card" key={product.id}>
                    <Link className="shop-product-media" href={`/productos/${product.slug}`}>
                      <span className={hasDiscount ? "shop-product-label sale" : product.featured ? "shop-product-label featured" : "shop-product-label"}>{hasDiscount ? "OFERTA" : product.featured ? "DESTACADO" : index < 10 ? "TOP" : "NUEVO"}</span>
                      {image ? <Image alt={image.alt || product.name} fill sizes="(max-width: 620px) 50vw, (max-width: 980px) 33vw, (max-width: 1260px) 25vw, 20vw" src={image.url} unoptimized /> : <div className="shop-product-placeholder"><span>{initials(product.name)}</span><small>SUPLES SHOP</small></div>}
                    </Link>
                    <div className="shop-product-content">
                      <span className="shop-product-category">{product.category.name}</span>
                      <h2><Link href={`/productos/${product.slug}`}>{product.name}</Link></h2>
                      <p className="shop-product-variant">{product.brand?.name || variant?.presentation || variant?.flavor || "Suplemento deportivo"}{extraVariants > 0 ? ` · +${extraVariants} opciones` : ""}</p>
                      <div className="shop-product-price"><strong>{money.format(Number(variant?.price ?? 0))}</strong>{hasDiscount ? <del>{money.format(Number(variant.compareAtPrice))}</del> : null}</div>
                      <div className={stock > 0 ? "shop-stock" : "shop-stock sold-out"}>
                        {stock > 0 ? "DISPONIBLE" : "PRODUCTO AGOTADO"}
                      </div>
                      <ul><li>Producto original</li><li>Existencia actualizada</li>{product.variants.length > 1 ? <li>Opciones de sabor o presentación</li> : null}</ul>
                    </div>
                    <button className="shop-add-cart" disabled={stock < 1} onClick={() => setCartCount((count) => count + 1)} type="button">{stock > 0 ? "Agregar al carrito" : "Sin existencia"}</button>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>

      <footer className="shop-footer"><div className="shop-container"><Link
  className="shop-logo shop-logo-footer"
  href="/"
  aria-label="Suples Shop, inicio"
>
  <Image
    className="shop-logo-image"
    src="/logo_uno.png"
    alt="Suples Shop"
    fill
    sizes="150px"
  />
</Link><p>Suplementos deportivos para toda la familia deportista.</p><Link href="/dashboard">Panel administrativo</Link></div></footer>
    </main>
  );
}
