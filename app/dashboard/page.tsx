import type { Metadata } from "next";
import { DashboardClient } from "@/components/dashboard-client";

export const metadata: Metadata = {
  title: "Panel de administración",
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return <DashboardClient />;
}
