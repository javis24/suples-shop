import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { ProductDetailClient } from "@/components/product-detail-client";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{ slug: string }>;
};

const getProduct = cache(async (slug: string) => {
  return prisma.product.findFirst({
    where: {
      slug,
      status: "ACTIVE",
      variants: { some: { active: true } },
    },
    include: {
      category: true,
      brand: true,
      variants: {
        where: { active: true },
        orderBy: { id: "asc" },
      },
      images: {
        orderBy: [{ primary: "desc" }, { sortOrder: "asc" }],
      },
    },
  });
});

function plainDescription(value: string | null) {
  return value?.replace(/\s+/g, " ").trim().slice(0, 300) || null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  if (!product) return { title: "Producto no encontrado" };

  const description =
    product.seoDescription ||
    plainDescription(product.description) ||
    `${product.name} disponible en Suples Shop.`;
  const primaryImage = product.images[0];

  return {
    title: product.seoTitle || product.name,
    description,
    alternates: { canonical: `/productos/${product.slug}` },
    openGraph: {
      type: "website",
      title: product.seoTitle || product.name,
      description,
      images: primaryImage
        ? [{ url: primaryImage.url, alt: primaryImage.alt || product.name }]
        : undefined,
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const product = await getProduct((await params).slug);
  if (!product) notFound();

  return (
    <ProductDetailClient
      product={{
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        featured: product.featured,
        category: {
          name: product.category.name,
          slug: product.category.slug,
        },
        brand: product.brand ? { name: product.brand.name } : null,
        variants: product.variants.map((variant) => ({
          id: variant.id,
          sku: variant.sku,
          barcode: variant.barcode,
          flavor: variant.flavor,
          presentation: variant.presentation,
          unit: variant.unit,
          price: Number(variant.price),
          compareAtPrice:
            variant.compareAtPrice === null
              ? null
              : Number(variant.compareAtPrice),
          stock: variant.stock,
        })),
        images: product.images.map((image) => ({
          id: image.id,
          url: image.url,
          alt: image.alt,
          primary: image.primary,
        })),
      }}
    />
  );
}
