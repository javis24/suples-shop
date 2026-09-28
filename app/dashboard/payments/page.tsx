import type { Metadata } from "next";
import { PaymentReconciliationClient } from "@/components/payment-reconciliation-client";

export const metadata: Metadata = {
  title: "Conciliación de pagos | Panel de administración",
  robots: { index: false, follow: false },
};

export default function PaymentReconciliationPage() {
  return <PaymentReconciliationClient />;
}
