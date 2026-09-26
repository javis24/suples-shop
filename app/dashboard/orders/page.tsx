import type { Metadata } from "next";
import { OrderAdminClient } from "@/components/order-admin-client";

export const metadata: Metadata = {
  title: "Pedidos | Panel de administración",
  robots: { index: false, follow: false },
};

export default function OrdersAdminPage() {
  return <OrderAdminClient />;
}
