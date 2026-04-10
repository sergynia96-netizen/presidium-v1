import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { ErrorBoundary } from "@/components/error-boundary";

export const metadata: Metadata = {
  title: "PRESIDIUM — Private Messenger with AI",
  description: "Next-generation private messenger with end-to-end encryption, local AI, and P2P capabilities. Speed of Telegram, privacy of Signal, power of AI.",
  keywords: ["PRESIDIUM", "messenger", "private", "E2EE", "AI", "P2P", "encrypted"],
  authors: [{ name: "PRESIDIUM Team" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "PRESIDIUM",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#10b981",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <Providers>
          <ServiceWorkerRegister />
          <ErrorBoundary name="RootApp">
            {children}
            <Toaster />
          </ErrorBoundary>
        </Providers>
      </body>
    </html>
  );
}
