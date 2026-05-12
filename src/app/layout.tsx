import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gourmet Madrid - Automatizaciones n8n",
  description: "Diseño de flujos para validación de cliente y roadmap técnico",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}