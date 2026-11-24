import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Auto Checkout", description: "Amilek HRMS auto checkout & daily updates" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
