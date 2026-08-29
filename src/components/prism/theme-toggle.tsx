"use client";
/** Prism AI — Tema en tres opciones: Claro / Oscuro / Sistema.
 *
 * Antes era un interruptor binario con el oscuro forzado por defecto: quien
 * tiene el sistema en claro abría la app de noche igualmente. Ahora el valor
 * por defecto es «Sistema» y el icono refleja el tema REAL que se está viendo.
 */
import { useEffect, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type ThemeOption = "light" | "dark" | "system";

const OPTIONS: { value: ThemeOption; label: string; hint: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", hint: "Siempre en claro", icon: Sun },
  { value: "dark", label: "Oscuro", hint: "Siempre en oscuro", icon: Moon },
  { value: "system", label: "Sistema", hint: "Sigue a tu dispositivo", icon: Monitor },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  // El tema real solo se conoce en el cliente: hasta montar se pinta el icono
  // por CSS (hidden/dark:block) para no provocar un desajuste de hidratación.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = (theme as ThemeOption | undefined) ?? "system";
  const label =
    current === "system"
      ? `Tema: Sistema (${resolvedTheme === "dark" ? "oscuro" : "claro"})`
      : `Tema: ${current === "dark" ? "Oscuro" : "Claro"}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-8", className)}
          title={mounted ? label : "Cambiar tema"}
          aria-label={mounted ? label : "Cambiar tema"}
        >
          {mounted && current === "system" ? (
            <Monitor className="size-4" />
          ) : (
            <>
              <Sun className="hidden size-4 dark:block" />
              <Moon className="size-4 dark:hidden" />
            </>
          )}
          <span className="sr-only">Cambiar tema</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o.value}
            onClick={() => setTheme(o.value)}
            className="gap-2"
            aria-checked={mounted && current === o.value}
          >
            <o.icon className="size-3.5 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[13px] leading-tight">{o.label}</span>
              <span className="text-[10.5px] leading-tight text-muted-foreground">{o.hint}</span>
            </span>
            {mounted && current === o.value && (
              <Check className="size-3.5 shrink-0 text-emerald-500" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
