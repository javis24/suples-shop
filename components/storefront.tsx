"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCart } from "@/components/cart-provider";

type Category = {
  id: number;
  name: string;
  slug: string;
  _count?: { products: number };
};

type Variant = {
  id: number;
  sku: string;
  unit: string;
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

type SortOption = "featured" | "price-asc" | "price-desc" | "name";

const PAGE_SIZE = 30;

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

function displayVariant(product: Product) {
  return (
    product.variants.find((variant) => variant.stock > 0) ??
    product.variants[0]
  );
}

function productPrice(product: Product) {
  return Number(displayVariant(product)?.price ?? 0);
}

export function Storefront() {
  const router = useRouter();
  const { addItem, itemCount, openCart } = useCart();

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("featured");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const [hasMore, setHasMore] = useState(false);

  const activeRequest = useRef<AbortController | null>(null);

  const loadProducts = useCallback(
    async (requestedPage = 1) => {
      activeRequest.current?.abort();

      const controller = new AbortController();
      activeRequest.current = controller;

      const firstPage = requestedPage === 1;
      setMoreError("");

      if (firstPage) {
        setLoading(true);
        setLoadingMore(false);
        setMessage("");
        setProducts([]);
        setTotalProducts(0);
        setHasMore(false);
      } else {
        setLoadingMore(true);
      }

      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        page: String(requestedPage),
      });

      if (selectedCategory) params.set("category", selectedCategory);
      if (appliedSearch) params.set("q", appliedSearch);

      try {
        const response = await fetch(`/api/products?${params.toString()}`, {
          signal: controller.signal,
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(
            payload.error?.message || "No fue posible cargar los productos.",
          );
        }

        if (controller.signal.aborted) return;

        const nextProducts = payload.data as Product[];
        const total = payload.meta?.total ?? nextProducts.length;

        setProducts((previous) => {
          if (firstPage) return nextProducts;

          const ids = new Set(previous.map((product) => product.id));

          return [
            ...previous,
            ...nextProducts.filter((product) => !ids.has(product.id)),
          ];
        });

        setTotalProducts(total);
        setPage(requestedPage);
        setHasMore(
          nextProducts.length > 0 && requestedPage * PAGE_SIZE < total,
        );
      } catch (error) {
        if (controller.signal.aborted) return;

        const errorMessage =
          error instanceof Error
            ? error.message
            : "No fue posible cargar los productos.";

        if (firstPage) {
          setMessage(errorMessage);
          setProducts([]);
          setTotalProducts(0);
        } else {
          setMoreError(errorMessage);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [appliedSearch, selectedCategory],
  );

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/categories", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error?.message);
        }

        if (!controller.signal.aborted) {
          setCategories(payload.data);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setCategories([]);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    // La consulta cambia al aplicar una búsqueda o categoría.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProducts();

    return () => activeRequest.current?.abort();
  }, [loadProducts]);

  const selectedCategoryName = useMemo(
    () =>
      categories.find((category) => category.slug === selectedCategory)?.name,
    [categories, selectedCategory],
  );

  const visibleProducts = useMemo(() => {
    return [...products].sort((first, second) => {
      if (sort === "price-asc") {
        return productPrice(first) - productPrice(second);
      }

      if (sort === "price-desc") {
        return productPrice(second) - productPrice(first);
      }

      if (sort === "name") {
        return first.name.localeCompare(second.name, "es");
      }

      return Number(second.featured) - Number(first.featured);
    });
  }, [products, sort]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedSearch(search.trim());
  }

  function clearFilters() {
    setSearch("");
    setAppliedSearch("");
    setSelectedCategory("");
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
              className="shop-logo-image shop-logo-image-light"
              src="/suples-shop-logo-light.jpeg"
              alt="Suples Shop"
              fill
              sizes="170px"
              priority
            />
          </Link>

          <form className="shop-search" onSubmit={submitSearch} role="search">
            <input
              id="shop-primary-search"
              aria-label="Buscar productos"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar producto, marca o sabor…"
              value={search}
            />

            {search ? (
              <button
                className="shop-search-clear"
                onClick={() => {
                  setSearch("");
                  setAppliedSearch("");
                }}
                type="button"
                aria-label="Limpiar búsqueda"
              >
                ×
              </button>
            ) : null}

            <button className="shop-search-submit" type="submit">
              <span aria-hidden="true">⌕</span> Buscar
            </button>
          </form>

          <nav
            className="shop-header-actions"
            aria-label="Acciones de la tienda"
          >
            <Link href="/dashboard">
              <span className="shop-action-icon" aria-hidden="true">♙</span>
              <span>
                <small>Mi cuenta</small>
                <strong>Administrar</strong>
              </span>
            </Link>

            <button
              onClick={openCart}
              type="button"
              aria-label={`${itemCount} productos en el carrito`}
            >
              <span className="shop-action-icon" aria-hidden="true">▱</span>
              <span className="shop-cart-copy">
                <small>Mi carrito</small>
                <strong>{itemCount} productos</strong>
              </span>
              <span className="shop-mobile-cart-count" aria-hidden="true">
                {itemCount}
              </span>
            </button>
          </nav>
        </div>
      </header>

      <div className="shop-category-bar">
        <div className="shop-container">
          <strong>Suplementos deportivos</strong>
          <span>Proteínas</span>
          <span>Creatinas</span>
          <span>Vitaminas</span>
          <span>Pre-entrenos</span>
        </div>
      </div>

      <section className="shop-container shop-main">
        <aside className="shop-sidebar">
          <div className="shop-side-search">
            <form onSubmit={submitSearch}>
              <input
                aria-label="Buscar en el catálogo"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar productos..."
                value={search}
              />
              <button type="submit">Buscar</button>
            </form>
          </div>

          <div className="shop-side-block">
            <div className="shop-side-title">
              <h2>Categorías</h2>
              <span aria-hidden="true">−</span>
            </div>

            <button
              className={
                !selectedCategory ? "shop-category active" : "shop-category"
              }
              onClick={() => chooseCategory("")}
              type="button"
            >
              <span className="shop-checkbox" />
              <strong>Todos los productos</strong>
              <small>
                {!selectedCategory && !appliedSearch ? totalProducts : ""}
              </small>
            </button>

            <div className="shop-category-list">
              {categories.map((category) => (
                <button
                  className={
                    selectedCategory === category.slug
                      ? "shop-category active"
                      : "shop-category"
                  }
                  key={category.id}
                  onClick={() => chooseCategory(category.slug)}
                  type="button"
                >
                  <span className="shop-checkbox" />
                  <span>{category.name}</span>
                  <small>{category._count?.products ?? ""}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="shop-side-help">
            <span>¿No sabes cuál elegir?</span>
            <strong>Encuentra tu suplemento más rápido</strong>
            <p>Busca por objetivo, ingrediente, marca, sabor o presentación.</p>
            <button
              onClick={() =>
                document.getElementById("shop-primary-search")?.focus()
              }
              type="button"
            >
              Usar el buscador
            </button>
          </div>
        </aside>

        <div className="shop-catalog">
          <div className="shop-catalog-intro">
            <div>
              <span className="shop-breadcrumb">
                Inicio / {selectedCategoryName || "Productos"}
              </span>
              <h1>
                {selectedCategoryName ||
                  (appliedSearch
                    ? `Resultados para “${appliedSearch}”`
                    : "Productos destacados")}
              </h1>
              <p>
                {appliedSearch || selectedCategory
                  ? "Encuentra los productos que coinciden con tu búsqueda."
                  : "Explora suplementos y encuentra el tuyo."}
              </p>
            </div>

            <div className="shop-trust">
              <strong>Compra segura</strong>
              <span>Stock actualizado desde el panel</span>
            </div>
          </div>

          <div className="shop-catalog-controls">
            <details className="shop-mobile-categories">
              <summary>
                Categorías <span aria-hidden="true">＋</span>
              </summary>
              <div>
                <button
                  className={!selectedCategory ? "active" : ""}
                  onClick={() => chooseCategory("")}
                  type="button"
                >
                  Todos
                </button>
                {categories.map((category) => (
                  <button
                    className={
                      selectedCategory === category.slug ? "active" : ""
                    }
                    key={category.id}
                    onClick={() => chooseCategory(category.slug)}
                    type="button"
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </details>

            <div className="shop-toolbar">
              <p role="status" aria-live="polite">
                {loading
                  ? "Cargando productos..."
                  : `Mostrando ${visibleProducts.length} de ${totalProducts} productos`}
              </p>
              <div>
                <label htmlFor="sort-products">Ordenar:</label>
                <select
                  id="sort-products"
                  onChange={(event) =>
                    setSort(event.target.value as SortOption)
                  }
                  value={sort}
                >
                  <option value="featured">Destacados</option>
                  <option value="name">Nombre A–Z</option>
                  <option value="price-asc">Precio menor</option>
                  <option value="price-desc">Precio mayor</option>
                </select>
              </div>
            </div>
          </div>

          {selectedCategory || appliedSearch ? (
            <div className="shop-active-filters">
              <span>Filtros activos:</span>
              {selectedCategoryName ? (
                <button
                  onClick={() => setSelectedCategory("")}
                  type="button"
                >
                  {selectedCategoryName} ×
                </button>
              ) : null}
              {appliedSearch ? (
                <button
                  onClick={() => {
                    setAppliedSearch("");
                    setSearch("");
                  }}
                  type="button"
                >
                  “{appliedSearch}” ×
                </button>
              ) : null}
              <button
                className="clear-all"
                onClick={clearFilters}
                type="button"
              >
                Limpiar todo
              </button>
            </div>
          ) : null}

          {message ? (
            <div className="shop-empty" role="alert">
              <strong>No fue posible mostrar los productos.</strong>
              <span>{message}</span>
              <button onClick={() => void loadProducts()} type="button">
                Reintentar
              </button>
            </div>
          ) : null}

          {loading ? (
            <div
              className="shop-products-grid shop-loading-grid"
              aria-hidden="true"
            >
              {Array.from({ length: 10 }, (_, index) => (
                <div className="shop-product-skeleton" key={index} />
              ))}
            </div>
          ) : null}

          {!loading && !message && visibleProducts.length === 0 ? (
            <div className="shop-empty">
              <strong>No encontramos productos.</strong>
              <span>Cambia la búsqueda o selecciona otra categoría.</span>
              <button onClick={clearFilters} type="button">
                Ver todos los productos
              </button>
            </div>
          ) : null}

          {!loading && visibleProducts.length > 0 ? (
            <div className="shop-products-grid">
              {visibleProducts.map((product, index) => {
                const variant = displayVariant(product);
                const stock = productStock(product);
                const image = product.images[0];
                const hasDiscount =
                  Number(variant?.compareAtPrice ?? 0) >
                  Number(variant?.price ?? 0);
                const extraVariants = product.variants.length - 1;
                const hasOptions = product.variants.length > 1;

                return (
                  <article className="shop-product-card" key={product.id}>
                    <Link
                      className="shop-product-media"
                      href={`/productos/${product.slug}`}
                    >
                      <span
                        className={
                          hasDiscount
                            ? "shop-product-label sale"
                            : product.featured
                              ? "shop-product-label featured"
                              : "shop-product-label"
                        }
                      >
                        {hasDiscount
                          ? "OFERTA"
                          : product.featured
                            ? "DESTACADO"
                            : index < 10
                              ? "TOP"
                              : "NUEVO"}
                      </span>

                      {image ? (
                        <Image
                          alt={image.alt || product.name}
                          fill
                          sizes="(max-width: 340px) 100vw, (max-width: 620px) 50vw, (max-width: 1100px) 33vw, (max-width: 1380px) 25vw, 20vw"
                          src={image.url}
                          unoptimized
                        />
                      ) : (
                        <div className="shop-product-placeholder">
                          <span>{initials(product.name)}</span>
                          <small>SUPLES SHOP</small>
                        </div>
                      )}
                    </Link>

                    <div className="shop-product-content">
                      <span className="shop-product-category">
                        {product.category.name}
                      </span>
                      <h2>
                        <Link
                          href={`/productos/${product.slug}`}
                          title={product.name}
                        >
                          {product.name}
                        </Link>
                      </h2>
                      <p className="shop-product-variant">
                        {product.brand?.name ||
                          variant?.presentation ||
                          variant?.flavor ||
                          "Suplemento deportivo"}
                        {extraVariants > 0
                          ? ` · +${extraVariants} opciones`
                          : ""}
                      </p>

                      <div className="shop-product-price">
                        <strong>
                          {money.format(Number(variant?.price ?? 0))}
                        </strong>
                        {hasDiscount ? (
                          <del>
                            {money.format(
                              Number(variant?.compareAtPrice ?? 0),
                            )}
                          </del>
                        ) : null}
                      </div>

                      <div
                        className={
                          stock > 0 ? "shop-stock" : "shop-stock sold-out"
                        }
                      >
                        {stock > 0 ? "DISPONIBLE" : "PRODUCTO AGOTADO"}
                      </div>

                      <ul>
                        <li>Producto original</li>
                        <li>Existencia actualizada</li>
                        {hasOptions ? (
                          <li>Opciones de sabor o presentación</li>
                        ) : null}
                      </ul>
                    </div>

                    <button
                      className="shop-add-cart"
                      disabled={!variant || stock < 1}
                      onClick={() => {
                        if (!variant) return;

                        if (hasOptions) {
                          router.push(`/productos/${product.slug}`);
                          return;
                        }

                        addItem({
                          productId: product.id,
                          variantId: variant.id,
                          slug: product.slug,
                          productName: product.name,
                          sku: variant.sku,
                          variantName:
                            [variant.presentation, variant.flavor]
                              .filter(Boolean)
                              .join(" · ") || null,
                          unit: variant.unit,
                          price: Number(variant.price),
                          stock: variant.stock,
                          imageUrl: image?.url ?? null,
                        });
                      }}
                      type="button"
                    >
                      {stock < 1
                        ? "Sin existencia"
                        : hasOptions
                          ? "Elegir sabor"
                          : "Agregar al carrito"}
                    </button>
                  </article>
                );
              })}
            </div>
          ) : null}

          {!loading && !message && hasMore ? (
            <div className="shop-load-more">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadProducts(page + 1)}
              >
                {loadingMore ? "Cargando…" : "Cargar más productos"}
              </button>
              <p>El orden se aplica a los productos cargados.</p>
              {moreError ? (
                <p className="shop-load-error" role="alert">
                  {moreError} Vuelve a intentarlo con el botón.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <footer className="shop-footer">
        <div className="shop-container">
          <Link
            className="shop-logo shop-logo-footer"
            href="/"
            aria-label="Suples Shop, inicio"
          >
            <Image
              className="shop-logo-image shop-logo-image-dark"
              src="/suples-shop-logo-dark.jpeg"
              alt="Suples Shop"
              fill
              sizes="150px"
            />
          </Link>
          <p>Suplementos deportivos para toda la familia deportista.</p>
          <Link href="/dashboard">Panel administrativo</Link>
        </div>
      </footer>
    </main>
  );
}