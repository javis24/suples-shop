import type { Metadata } from "next";
import { CartProvider } from "@/components/cart-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Suples Shop | Suplementos deportivos",
    template: "%s | Suples Shop",
  },
  description:
    "Suplementos deportivos, proteínas, creatinas, vitaminas y nutrición para todos tus objetivos.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
