"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type Category = { id: number; name: string; slug: string };
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
  category: Category;
  brand: { name: string } | null;
  variants: Variant[];
  images: { url: string; alt: string | null }[];
};

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

export function Storefront() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({ limit: "24" });
    if (selectedCategory) params.set("category", selectedCategory);
    if (appliedSearch) params.set("q", appliedSearch);

    try {
      const response = await fetch(`/api/products?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "No fue posible cargar productos.");
      setProducts(payload.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible cargar productos.");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, appliedSearch]);

  useEffect(() => {
    fetch("/api/categories?limit=100")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message);
        setCategories(payload.data);
      })
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    // La carga ocurre después de montar y cambia cuando se aplican los filtros.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProducts();
  }, [loadProducts]);

  const availableCount = useMemo(
    () => products.reduce((total, product) => total + product.variants.reduce((sum, item) => sum + item.stock, 0), 0),
    [products],
  );

  return (
    <main className="storefront">
      <div className="announcement">Envíos a todo México · Compra segura · Atención personalizada</div>
      <header className="store-header shell">
        <a className="brand-lockup" href="#inicio" aria-label="Suples Shop, inicio">
          <span className="brand-mark">S</span>
          <span><strong>SUPLES</strong><small>SHOP</small></span>
        </a>
        <form
          className="search-box"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedSearch(search.trim());
          }}
        >
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Buscar productos"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Busca proteína, creatina, vitaminas..."
            value={search}
          />
          <button type="submit">Buscar</button>
        </form>
        <nav className="header-actions" aria-label="Acciones">
          <Link href="/dashboard">Administrar</Link>
          <button type="button" aria-label={`${cartCount} artículos en el carrito`}>
            Bolsa <span>{cartCount}</span>
          </button>
        </nav>
      </header>

      <section className="hero" id="inicio">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">NUTRICIÓN QUE IMPULSA</span>
            <h1>Supera tu meta.<br /><em>Todos los días.</em></h1>
            <p>Encuentra suplementos confiables para rendimiento, recuperación y bienestar. Inventario actualizado desde tu operación.</p>
            <a className="primary-action" href="#catalogo">Explorar productos <span>→</span></a>
            <div className="hero-proof">
              <span><strong>+600</strong> productos</span>
              <span><strong>{availableCount}</strong> piezas disponibles</span>
              <span><strong>100%</strong> compra segura</span>
            </div>
          </div>
          <div className="hero-visual" aria-label="Suplementos deportivos destacados">
            <div className="pulse-ring ring-one" />
            <div className="pulse-ring ring-two" />
            <div className="product-canister canister-back"><span>RECOVERY</span><strong>BCAA</strong></div>
            <div className="product-canister canister-front"><span>PERFORMANCE</span><strong>WHEY<br />PROTEIN</strong><small>24 g PROTEÍNA</small></div>
            <div className="floating-chip chip-one">ENERGÍA</div>
            <div className="floating-chip chip-two">FUERZA</div>
          </div>
        </div>
      </section>

      <section className="category-strip" aria-label="Categorías">
        <div className="shell category-scroller">
          <button className={!selectedCategory ? "active" : ""} onClick={() => setSelectedCategory("")} type="button">Todos</button>
          {categories.map((category) => (
            <button
              className={selectedCategory === category.slug ? "active" : ""}
              key={category.id}
              onClick={() => setSelectedCategory(category.slug)}
              type="button"
            >
              {category.name}
            </button>
          ))}
        </div>
      </section>

      <section className="catalog shell" id="catalogo">
        <div className="section-heading">
          <div><span className="eyebrow dark">CATÁLOGO</span><h2>Elige tu siguiente nivel</h2></div>
          <p>{products.length} productos encontrados</p>
        </div>

        {message ? <div className="empty-state"><strong>La tienda aún no tiene datos.</strong><span>{message} Entra al panel para configurar MySQL e importar el Excel.</span><a href="/dashboard">Ir al dashboard</a></div> : null}
        {loading ? <div className="loading-grid">{Array.from({ length: 8 }, (_, index) => <div className="product-skeleton" key={index} />)}</div> : null}
        {!loading && !message && products.length === 0 ? <div className="empty-state"><strong>No encontramos productos.</strong><span>Prueba otra categoría o una búsqueda diferente.</span></div> : null}
        {!loading && products.length > 0 ? (
          <div className="product-grid">
            {products.map((product) => {
              const variant = product.variants[0];
              const stock = product.variants.reduce((sum, item) => sum + item.stock, 0);
              const image = product.images[0];
              return (
                <article className="product-card" key={product.id}>
                  <div className="product-media">
                    {image ? <Image alt={image.alt || product.name} fill sizes="(max-width: 480px) 100vw, (max-width: 760px) 50vw, (max-width: 1000px) 33vw, 25vw" src={image.url} unoptimized /> : <div className="product-placeholder"><span>{initials(product.name)}</span></div>}
                    <span className={stock > 0 ? "stock-badge" : "stock-badge sold-out"}>{stock > 0 ? `${stock} disponibles` : "Agotado"}</span>
                  </div>
                  <div className="product-body">
                    <span className="product-category">{product.category.name}</span>
                    <h3>{product.name}</h3>
                    <p>{product.brand?.name || variant?.presentation || variant?.flavor || "Suplemento deportivo"}</p>
                    <div className="product-bottom">
                      <div className="product-price">
                        <strong>{money.format(Number(variant?.price ?? 0))}</strong>
                        {variant?.compareAtPrice ? <del>{money.format(Number(variant.compareAtPrice))}</del> : null}
                      </div>
                      <button disabled={stock < 1} onClick={() => setCartCount((count) => count + 1)} type="button" aria-label={`Agregar ${product.name}`}>
                        +
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="benefits">
        <div className="shell benefits-grid">
          <div><span>01</span><strong>Inventario confiable</strong><p>Existencias sincronizadas desde el archivo operativo.</p></div>
          <div><span>02</span><strong>Atención experta</strong><p>Te ayudamos a elegir según tus objetivos.</p></div>
          <div><span>03</span><strong>Envíos nacionales</strong><p>Tu pedido, protegido y con seguimiento.</p></div>
        </div>
      </section>

      <footer className="store-footer">
        <div className="shell"><div className="brand-lockup light"><span className="brand-mark">S</span><span><strong>SUPLES</strong><small>SHOP</small></span></div><p>Suplementos deportivos para toda la familia deportista.</p><Link href="/dashboard">Panel administrativo</Link></div>
      </footer>
    </main>
  );
}
