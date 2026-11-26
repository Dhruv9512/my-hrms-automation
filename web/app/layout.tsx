import "./globals.css";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata = { title: "Auto Checkout", description: "Checks you out of Amilek HRMS on time and posts your daily update to Slack" };
export const viewport = { themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#141415" }, { media: "(prefers-color-scheme: light)", color: "#fafafa" }] };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
