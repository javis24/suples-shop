import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable();

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: optionalText(140),
  description: optionalText(5000),
  active: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const brandSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: optionalText(140),
  logoUrl: optionalText(500),
  active: z.boolean().optional(),
});

export const imageSchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .max(500)
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
      message: "La imagen debe usar una dirección http o https",
    }),
  alt: optionalText(255),
  sortOrder: z.coerce.number().int().min(0).optional(),
  primary: z.boolean().optional(),
});

export const variantSchema = z.object({
  sku: z.string().trim().min(2).max(100),
  barcode: optionalText(100),
  microsipName: optionalText(255),
  flavor: optionalText(120),
  presentation: optionalText(120),
  unit: z.string().trim().min(1).max(40).optional(),
  cost: z.coerce.number().min(0),
  price: z.coerce.number().min(0),
  compareAtPrice: z.coerce.number().min(0).optional().nullable(),
  stock: z.coerce.number().int().min(0).optional(),
  lowStockAt: z.coerce.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export const productSchema = z.object({
  name: z.string().trim().min(2).max(255),
  slug: optionalText(280),
  description: optionalText(20000),
  categoryId: z.coerce.number().int().positive(),
  brandId: z.coerce.number().int().positive().optional().nullable(),
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  featured: z.boolean().optional(),
  seoTitle: optionalText(180),
  seoDescription: optionalText(320),
  variants: z.array(variantSchema).min(1),
  images: z.array(imageSchema).optional(),
});

export const productUpdateSchema = productSchema.partial().extend({
  variants: z
    .array(variantSchema.extend({ id: z.coerce.number().int().positive().optional() }))
    .optional(),
  images: z
    .array(imageSchema.extend({ id: z.coerce.number().int().positive().optional() }))
    .optional(),
});

export const customerSchema = z.object({
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(190).optional().nullable(),
  phone: optionalText(30),
  active: z.boolean().optional(),
});

export const couponSchema = z.object({
  code: z.string().trim().min(2).max(60).transform((value) => value.toUpperCase()),
  description: optionalText(255),
  type: z.enum(["PERCENTAGE", "FIXED"]),
  value: z.coerce.number().positive(),
  minimumAmount: z.coerce.number().min(0).optional().nullable(),
  maximumDiscount: z.coerce.number().min(0).optional().nullable(),
  usageLimit: z.coerce.number().int().positive().optional().nullable(),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
  active: z.boolean().optional(),
});

export const bannerSchema = z.object({
  title: z.string().trim().min(2).max(180),
  subtitle: optionalText(255),
  imageUrl: z.string().trim().url().max(500),
  linkUrl: z.string().trim().max(500).optional().nullable(),
  position: z.string().trim().min(2).max(80).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
  active: z.boolean().optional(),
});

export const orderSchema = z.object({
  customerId: z.coerce.number().int().positive().optional().nullable(),
  customerName: z.string().trim().min(3).max(220),
  customerEmail: z.string().trim().email().max(190).optional().nullable(),
  customerPhone: optionalText(30),
  couponCode: optionalText(60),
  shipping: z.coerce.number().min(0).optional(),
  shippingAddress: z.record(z.string(), z.unknown()),
  notes: optionalText(5000),
  items: z
    .array(
      z.object({
        variantId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().int().positive().max(100),
      }),
    )
    .min(1),
});
