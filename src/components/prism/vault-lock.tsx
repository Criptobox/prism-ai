"use client";
/** Prism AI — Diálogo de desbloqueo de la bóveda de claves (PIN) */
import { useEffect, useRef, useState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { unlockVault } from "@/lib/prism/vault";

export function VaultLockDialog({ open }: { open: boolean }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPin("");
      setError(false);
      setTimeout(() => ref.current?.focus(), 80);
    }
  }, [open]);

  const submit = async () => {
    if (!pin.trim() || busy) return;
    setBusy(true);
    const ok = await unlockVault(pin.trim());
    setBusy(false);
    if (!ok) {
      setError(true);
      setPin("");
      ref.current?.focus();
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <LockKeyhole className="size-4 text-prism-violet" /> Claves bloqueadas
          </DialogTitle>
          <DialogDescription className="text-xs">
            Escribe tu PIN para descifrar las claves de esta sesión de navegador.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            ref={ref}
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            placeholder="PIN"
            className={error ? "border-destructive" : ""}
          />
          {error && (
            <p className="text-xs text-destructive">PIN incorrecto. Inténtalo de nuevo.</p>
          )}
          <Button size="sm" className="h-9 w-full text-xs" onClick={() => void submit()} disabled={busy}>
            {busy ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <LockKeyhole className="mr-1 size-3.5" />}
            Desbloquear
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Si lo olvidaste, cierra sesión desde otro dispositivo no es posible: puedes quitar el
            PIN desde Ajustes → Datos con este mismo navegador desbloqueado, o borrar los datos del
            sitio (perderás las claves guardadas).
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
