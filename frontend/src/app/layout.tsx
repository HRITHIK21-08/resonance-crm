import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/layout/AppShell";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Resonance — AI-Native Mini CRM",
  description: "Intelligent customer relationship management powered by AI. Reach your shoppers smarter.",
  icons: {
    icon: '/favicon.ico',
  },
};

import { BrandProvider } from "@/context/BrandContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} dark antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background text-foreground font-sans">
        <Providers>
          <BrandProvider>
            <AppShell>
              {children}
            </AppShell>
          </BrandProvider>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'hsl(240, 5.9%, 9%)',
                border: '1px solid hsl(240, 4.8%, 15%)',
                color: 'hsl(240, 5%, 96%)',
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
