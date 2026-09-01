import type { Metadata } from "next";

import { ProductAdminClient } from "@/components/product-admin-client";

export const metadata: Metadata = {
  title: "Productos | Panel de administración",
  robots: { index: false, follow: false },
};

export default function ProductsAdminPage() {
  return <ProductAdminClient />;
}
