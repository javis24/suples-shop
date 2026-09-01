"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useMemo, useState } from "react";

type ProductDetail = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  featured: boolean;
  category: { name: string; slug: string };
  brand: { name: string } | null;
  variants: Array<{
    id: number;
    sku: string;
    barcode: string | null;
    flavor: string | null;
    presentation: string | null;
    unit: string;
    price: number;
    compareAtPrice: number | null;
    stock: number;
  }>;
  images: Array<{
    id: number;
    url: string;
    alt: string | null;
    primary: boolean;
  }>;
};

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export function ProductDetailClient({ product }: { product: ProductDetail }) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [added, setAdded] = useState(false);
  const variant = product.variants[selectedVariant] || product.variants[0];
  const image = product.images[selectedImage] || product.images[0];
  const hasOffer =
    Number(variant?.compareAtPrice ?? 0) > Number(variant?.price ?? 0);
  const discount = hasOffer
    ? Math.round(
        (1 - Number(variant.price) / Number(variant.compareAtPrice)) * 100,
      )
    : 0;

  const variantLabel = useMemo(
    () =>
      (item: ProductDetail["variants"][number]) =>
        [item.flavor, item.presentation].filter(Boolean).join(" · ") || item.sku,
    [],
  );

  return (
    <main className="product-detail-page">
      <div className="shop-announcement">
        <span>Productos originales</span>
        <span>Envíos a todo México</span>
        <span>Atención personalizada</span>
      </div>

      <header className="product-detail-header">
        <div className="shop-container">
          <Link className="shop-logo" href="/" aria-label="Suples Shop, inicio">
            <span className="shop-logo-symbol">S</span>
            <span><strong>SUPLES</strong><small>SHOP</small></span>
          </Link>
          <Link className="product-back-link" href="/">← Volver al catálogo</Link>
        </div>
      </header>

      <div className="product-detail-category-bar">
        <div className="shop-container">
          <Link href="/">Inicio</Link><span>/</span>
          <Link href="/">{product.category.name}</Link><span>/</span>
          <strong>{product.name}</strong>
        </div>
      </div>

      <section className="shop-container product-detail-layout">
        <div className="product-detail-gallery">
          <div className="product-detail-main-image">
            {image ? <img alt={image.alt || product.name} src={image.url} /> : <div className="product-detail-placeholder"><strong>{product.name.slice(0, 2).toUpperCase()}</strong><span>SUPLES SHOP</span></div>}
            {hasOffer ? <span className="product-detail-offer-badge">-{discount}%</span> : product.featured ? <span className="product-detail-featured-badge">DESTACADO</span> : null}
          </div>
          {product.images.length > 1 ? <div className="product-detail-thumbnails" aria-label="Galería de imágenes">{product.images.map((item, index) => <button aria-label={`Ver imagen ${index + 1}`} className={selectedImage === index ? "active" : ""} key={item.id} onClick={() => setSelectedImage(index)} type="button"><img alt={item.alt || `${product.name}, imagen ${index + 1}`} src={item.url} /></button>)}</div> : null}
        </div>

        <article className="product-detail-info">
          <span className="product-detail-category">{product.category.name}</span>
          <h1>{product.name}</h1>
          <div className="product-detail-meta"><span>SKU: {variant?.sku}</span>{product.brand ? <span>Marca: {product.brand.name}</span> : null}</div>

          <div className="product-detail-price"><strong>{money.format(Number(variant?.price ?? 0))}</strong>{hasOffer ? <><del>{money.format(Number(variant.compareAtPrice))}</del><span>Ahorras {discount}%</span></> : null}</div>
          <div className={variant?.stock > 0 ? "product-detail-stock" : "product-detail-stock empty"}><span />{variant?.stock > 0 ? `${variant.stock} ${variant.unit.toLowerCase()} disponibles` : "Producto agotado"}</div>

          {product.variants.length > 1 ? <div className="product-detail-variants"><strong>Elige una presentación</strong><div>{product.variants.map((item, index) => <button className={selectedVariant === index ? "active" : ""} disabled={item.stock < 1} key={item.id} onClick={() => setSelectedVariant(index)} type="button">{variantLabel(item)}</button>)}</div></div> : null}

          <button className="product-detail-add" disabled={!variant || variant.stock < 1} onClick={() => { setAdded(true); window.setTimeout(() => setAdded(false), 2200); }} type="button">{added ? "✓ Producto agregado" : variant?.stock > 0 ? "Agregar al carrito" : "Sin existencia"}</button>

          <ul className="product-detail-benefits"><li><strong>Producto original</strong><span>Catálogo administrado por Suples Shop</span></li><li><strong>Precio actualizado</strong><span>Sincronizado mediante el Excel de la tienda</span></li><li><strong>Atención personalizada</strong><span>Te ayudamos a elegir la opción adecuada</span></li></ul>
        </article>
      </section>

      <section className="shop-container product-detail-description">
        <div><span>INFORMACIÓN DEL PRODUCTO</span><h2>Descripción</h2></div>
        <p>{product.description || "Próximamente agregaremos la descripción completa, beneficios y modo de uso de este producto."}</p>
      </section>

      <footer className="shop-footer"><div className="shop-container"><div className="shop-logo footer"><span className="shop-logo-symbol">S</span><span><strong>SUPLES</strong><small>SHOP</small></span></div><p>Suplementos deportivos para toda la familia deportista.</p><Link href="/dashboard/products">Administrar productos</Link></div></footer>
    </main>
  );
}
