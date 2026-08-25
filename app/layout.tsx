import type { Metadata } from "next";
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
      <body>{children}</body>
    </html>
  );
}
