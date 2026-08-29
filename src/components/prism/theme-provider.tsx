"use client";
/** Prism AI — Proveedor de tema */
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      /* Por defecto se sigue al sistema: el oscuro forzado dejaba la app a
         contramano de quien tiene el dispositivo en claro. */
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
