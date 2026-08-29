import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/prism/theme-provider";

// Fuente local (paquete «geist»): el build ya no depende de Google Fonts.
// Antes `next/font/google` descargaba las fuentes en tiempo de compilación y
// el build fallaba entero si la máquina no alcanzaba fonts.googleapis.com
// (redes corporativas, sandboxes, CI con firewall).
const geistSans = GeistSans;
const geistMono = GeistMono;

const APP_NAME = "Prism AI";
const APP_DESCRIPTION =
  "Tu hub premium de IA: chat con GPT, Claude, Gemini, DeepSeek y más usando tus propias APIs. Sin cuentas, sin límites, sin restricciones.";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: `${APP_NAME} — Chat sin límites con tus modelos de IA`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  keywords: ["IA", "chat", "AiHubMix", "OpenAI", "Claude", "Gemini", "DeepSeek", "PWA", "asistente"],
  authors: [{ name: "Prism AI" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_NAME,
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/prism-icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: APP_NAME,
    description: APP_DESCRIPTION,
    type: "website",
    siteName: APP_NAME,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07070C" },
    { media: "(prefers-color-scheme: light)", color: "#F7F7FB" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider>
          {children}
          <Toaster position="top-center" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
