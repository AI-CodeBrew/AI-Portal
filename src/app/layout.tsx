import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const landingDisplay = Fraunces({
  variable: "--font-landing-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Arabia AI — WhatsApp + Shopify Commerce Portal",
  description:
    "AI sales agent for WhatsApp, Shopify order confirmation, tracking, inbox handoff, and Meta ad links — powered by Arabia AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${landingDisplay.variable} min-h-screen bg-slate-50 text-slate-900 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
