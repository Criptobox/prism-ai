"use client";
/** Prism AI — Conectar la cuenta de GitHub (OAuth, un clic).
 * El token clásico queda como opción avanzada; lo normal es «Conectar». */
import { useCallback, useEffect, useRef, useState } from "react";
import { Github, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accessCodeHeaders } from "@/lib/prism/chat-client";
import { GH_OAUTH_MSG } from "@/lib/prism/github-oauth";
import {
  GH_ACCOUNT_EVENT,
  GH_TOKEN_URL,
  ghGetAccount,
  ghGetToken,
  ghResolveAccount,
  ghSetAccount,
  type GhAccount,
} from "@/lib/prism/github-upload";
import { syncVaultNow, vaultWriteBlocked } from "@/lib/prism/vault";
import { cn } from "@/lib/utils";

export function useGithubAccount(): {
  account: GhAccount | null;
  token: string;
  busy: boolean;
  connect: () => void;
  disconnect: () => void;
  refresh: () => void;
} {
  const [account, setAccount] = useState<GhAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(() => {
    setAccount(ghGetAccount());
  }, []);

  useEffect(() => {
    refresh();
    const t = ghGetToken();
    const a = ghGetAccount();
    if (t && a && !a.login) {
      void ghResolveAccount(t, a.source)
        .then((full) => {
          ghSetAccount(full);
          setAccount(full);
        })
        .catch(() => {});
    }
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as {
        type?: string;
        token?: string;
        login?: string;
        name?: string;
        avatar?: string;
        error?: string;
      };
      if (!d || d.type !== GH_OAUTH_MSG) return;
      if (d.error) {
        toast.error("No se pudo conectar GitHub", { description: d.error });
        setBusy(false);
        return;
      }
      if (!d.token) return;
      if (vaultWriteBlocked()) {
        toast.warning("Bóveda bloqueada", {
          description:
            "Desbloquea el PIN en Ajustes → Datos para guardar el token de GitHub cifrado. La conexión no se guardó.",
          duration: 8000,
        });
        setBusy(false);
        return;
      }
      const next: GhAccount = {
        token: d.token,
        login: d.login || "",
        name: d.name || d.login || "",
        avatar: d.avatar || "",
        source: "oauth",
      };
      ghSetAccount(next);
      syncVaultNow();
      setAccount(next);
      setBusy(false);
      toast.success(next.login ? `Conectado como @${next.login}` : "GitHub conectado");
    };
    const onEv = () => refresh();
    window.addEventListener("message", onMsg);
    window.addEventListener(GH_ACCOUNT_EVENT, onEv);
    window.addEventListener("storage", onEv);
    return () => {
      window.removeEventListener("message", onMsg);
      window.removeEventListener(GH_ACCOUNT_EVENT, onEv);
      window.removeEventListener("storage", onEv);
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [refresh]);

  const disconnect = useCallback(() => {
    ghSetAccount(null);
    syncVaultNow();
    setAccount(null);
    toast.info("GitHub desconectado");
  }, []);

  const pollDevice = useCallback(async (deviceCode: string, interval: number) => {
    let wait = Math.max(5, interval) * 1000;
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, wait));
      const res = await fetch("/api/github/oauth/device", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...accessCodeHeaders() },
        body: JSON.stringify({ action: "poll", device_code: deviceCode }),
      });
      const j = (await res.json()) as {
        pending?: boolean;
        slow?: boolean;
        token?: string;
        login?: string;
        name?: string;
        avatar?: string;
        error?: string;
      };
      if (j.slow) wait += 2000;
      if (j.pending) continue;
      if (j.token) {
        if (vaultWriteBlocked()) {
          toast.warning("Bóveda bloqueada", {
            description:
              "Desbloquea el PIN en Ajustes → Datos para guardar el token de GitHub cifrado. La conexión no se guardó.",
            duration: 8000,
          });
          setBusy(false);
          return;
        }
        const next: GhAccount = {
          token: j.token,
          login: j.login || "",
          name: j.name || j.login || "",
          avatar: j.avatar || "",
          source: "oauth",
        };
        ghSetAccount(next);
        syncVaultNow();
        setAccount(next);
        toast.success(next.login ? `Conectado como @${next.login}` : "GitHub conectado");
        setBusy(false);
        return;
      }
      throw new Error(j.error || "Autorización cancelada");
    }
    throw new Error("Se acabó el tiempo. Vuelve a pulsar Conectar.");
  }, []);

  const connect = useCallback(() => {
    setBusy(true);
    const url = "/api/github/oauth/start";
    const w =
      window.open(url, "prism-github", "popup=yes,width=620,height=740") || window.open(url, "_blank");
    if (w) {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(() => {
        if (w.closed) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          setBusy(false);
        }
      }, 500);
      return;
    }
    void (async () => {
      try {
        const res = await fetch("/api/github/oauth/device", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...accessCodeHeaders() },
          body: JSON.stringify({ action: "start" }),
        });
        const j = (await res.json()) as {
          error?: string;
          usePopup?: boolean;
          device_code?: string;
          user_code?: string;
          verification_uri?: string;
          interval?: number;
        };
        if (res.status === 409 || j.usePopup) {
          toast.error("Permite ventanas emergentes para conectar GitHub");
          setBusy(false);
          return;
        }
        if (!res.ok || !j.device_code) throw new Error(j.error || "No se pudo iniciar la conexión");
        toast.message("Autoriza Prism en GitHub", {
          description: j.user_code ? `Código: ${j.user_code}` : "Confirma el acceso en la pestaña que se acaba de abrir.",
        });
        window.open(j.verification_uri || "https://github.com/login/device", "_blank");
        await pollDevice(j.device_code, j.interval ?? 5);
      } catch (e) {
        toast.error("No se pudo conectar GitHub", {
          description: e instanceof Error ? e.message : String(e),
        });
        setBusy(false);
      }
    })();
  }, [pollDevice]);

  return { account, token: account?.token ?? "", busy, connect, disconnect, refresh };
}

export function GitHubConnect({
  compact,
  onChange,
}: {
  compact?: boolean;
  onChange?: (account: GhAccount | null) => void;
}) {
  const { account, busy, connect, disconnect } = useGithubAccount();
  const [pat, setPat] = useState("");
  const [savingPat, setSavingPat] = useState(false);

  useEffect(() => {
    onChange?.(account);
  }, [account, onChange]);

  const savePat = async () => {
    const t = pat.trim();
    if (!t) return;
    if (vaultWriteBlocked()) {
      toast.warning("Bóveda bloqueada", {
        description:
          "Desbloquea el PIN en Ajustes → Datos para guardar el token de GitHub cifrado. El token no se guardó.",
        duration: 8000,
      });
      return;
    }
    setSavingPat(true);
    try {
      const full = await ghResolveAccount(t, "pat");
      ghSetAccount(full);
      syncVaultNow();
      setPat("");
      toast.success(`Conectado como @${full.login}`);
    } catch (e) {
      toast.error("Token no válido", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSavingPat(false);
    }
  };

  if (account?.login) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", compact ? "" : "rounded-xl border border-border/60 bg-card/40 px-3 py-2")}>
        {account.avatar ? (
          <img src={account.avatar} alt="" className="size-6 rounded-full" width={24} height={24} />
        ) : (
          <Github className="size-4" />
        )}
        <span className="text-xs font-medium">@{account.login}</span>
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
          listo para subir a main
        </span>
        <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 text-[11px]" onClick={disconnect}>
          <LogOut className="size-3" /> Salir
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", !compact && "rounded-xl border border-border/60 bg-card/40 px-3 py-3")}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={connect}
          disabled={busy}
          className="h-8 gap-1.5 prism-gradient-bg border-0 text-white hover:opacity-90"
          aria-label="Conectar con GitHub"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Github className="size-3.5" />}
          {busy ? "Conectando…" : "Conectar GitHub"}
        </Button>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Un clic. Luego subes los cambios directo a main.
        </p>
      </div>
      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer select-none hover:text-foreground">Usar un token personal</summary>
        <div className="mt-2 flex gap-2">
          <Input
            type="password"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void savePat()}
            placeholder="ghp_… o github_pat_…"
            className="h-8 font-mono text-xs"
            aria-label="Token personal de GitHub"
          />
          <Button type="button" variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => void savePat()} disabled={!pat.trim() || savingPat}>
            {savingPat ? <Loader2 className="size-3 animate-spin" /> : "Guardar"}
          </Button>
          <a href={GH_TOKEN_URL} target="_blank" rel="noreferrer" className="inline-flex items-center text-prism-violet underline underline-offset-2">
            Crear
          </a>
        </div>
      </details>
    </div>
  );
}
