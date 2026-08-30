"use client";
/** Prism AI — Llevarte tus claves y conversaciones a otro dispositivo.
 *
 * Sin cuenta y sin servidor: sale un texto cifrado que no significa nada sin la
 * frase que elijas. Lo pasas como quieras y lo pegas en el otro dispositivo.
 * Quien lo intercepte no tiene nada.
 */
import { useState } from "react";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, Copy, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePrism } from "@/lib/prism/store";
import { APP_VERSION } from "@/lib/prism/app-version";
import { ghGetToken, ghSetToken } from "@/lib/prism/github-upload";
import { consejoQr } from "@/lib/prism/qr";
import { PROVIDERS } from "@/lib/prism/providers";
import { BotonEscanear, EscanearQr, QrCodigo } from "./qr-view";
import {
  MIN_FRASE,
  mergeTransfer,
  packTransfer,
  proveedoresUtiles,
  resumirBundle,
  unpackTransfer,
  type TransferBundle,
} from "@/lib/prism/transfer";

export function TransferPanel() {
  const [modo, setModo] = useState<"enviar" | "recibir">("enviar");
  const [frase, setFrase] = useState("");
  const [codigo, setCodigo] = useState("");
  const [incluirChats, setIncluirChats] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [camara, setCamara] = useState(false);

  const generar = async () => {
    const st = usePrism.getState();
    setOcupado(true);
    try {
      const bundle: TransferBundle = {
        v: 1,
        at: Date.now(),
        app: APP_VERSION,
        // Solo los que has tocado: mandar las quince plantillas vacías del
        // catálogo no aporta nada y sacaba el código del tamaño de un QR.
        providers: proveedoresUtiles(
          st.providers,
          Object.fromEntries(PROVIDERS.map((p) => [p.id, { baseUrl: p.baseUrl, defaultModels: p.defaultModels }]))
        ),
        settings: st.settings,
        ...(incluirChats ? { sessions: st.sessions } : {}),
        ...(ghGetToken() ? { githubToken: ghGetToken() } : {}),
      };
      setCodigo(await packTransfer(bundle, frase));
      toast.success("Código listo", {
        description: "Cópialo y pégalo en el otro dispositivo con la misma frase.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el código");
    } finally {
      setOcupado(false);
    }
  };

  const aplicar = async () => {
    setOcupado(true);
    try {
      const bundle = await unpackTransfer(codigo, frase);
      const r = resumirBundle(bundle);
      const st = usePrism.getState();
      const fusion = mergeTransfer(
        { providers: st.providers, sessions: st.sessions, settings: st.settings },
        bundle
      );

      st.applyTransfer(fusion);
      if (bundle.githubToken && !ghGetToken()) ghSetToken(bundle.githubToken);

      toast.success("Datos importados", {
        description: `${r.proveedores} proveedor${r.proveedores === 1 ? "" : "es"} · ${r.conversaciones} conversacion${r.conversaciones === 1 ? "" : "es"}. Nada de lo que ya tenías aquí se ha borrado.`,
        duration: 9000,
      });
      setCodigo("");
      setFrase("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer el código");
    } finally {
      setOcupado(false);
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo);
      toast.success("Código copiado");
    } catch {
      toast.error("No se pudo copiar; selecciónalo a mano");
    }
  };

  const descargar = () => {
    const url = URL.createObjectURL(new Blob([codigo], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `prism-transferencia-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const fraseCorta = frase.trim().length < MIN_FRASE;

  return (
    <section
      aria-label="Pasar a otro dispositivo"
      className="rounded-xl border border-border/60 bg-card/40 p-4"
    >
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <ShieldCheck className="size-4 text-prism-cyan" /> Pasar a otro dispositivo
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Sin cuenta y sin servidor: sale un texto cifrado que no significa nada sin tu frase.
        Pásalo como quieras y pégalo en el otro dispositivo con la misma frase.
      </p>

      <div className="mt-3 flex gap-1">
        {(["enviar", "recibir"] as const).map((m) => (
          <Button
            key={m}
            size="sm"
            variant={modo === m ? "default" : "outline"}
            className="h-8 flex-1 gap-1.5 text-xs"
            onClick={() => {
              setModo(m);
              setCodigo("");
            }}
          >
            {m === "enviar" ? (
              <ArrowUpFromLine className="size-3.5" />
            ) : (
              <ArrowDownToLine className="size-3.5" />
            )}
            {m === "enviar" ? "Enviar desde aquí" : "Recibir aquí"}
          </Button>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        <Label className="text-xs" htmlFor="frase-transfer">
          Frase (la misma en los dos dispositivos)
        </Label>
        <Input
          id="frase-transfer"
          type="password"
          value={frase}
          onChange={(e) => setFrase(e.target.value)}
          placeholder={`Al menos ${MIN_FRASE} caracteres`}
          className="h-9 text-sm"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />

        {modo === "enviar" ? (
          <>
            <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
              <Switch checked={incluirChats} onCheckedChange={setIncluirChats} />
              Incluir también las conversaciones
            </label>
            <Button
              size="sm"
              className="h-9 w-full gap-1.5 text-xs"
              onClick={() => void generar()}
              disabled={ocupado || fraseCorta}
            >
              {ocupado ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Generar código
            </Button>
            {codigo && (
              <>
                <textarea
                  readOnly
                  value={codigo}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-24 w-full resize-none rounded-lg border border-border/60 bg-muted/30 p-2 font-mono text-[10px] leading-tight"
                  aria-label="Código de transferencia"
                />
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-8 flex-1 gap-1.5 text-xs" onClick={() => void copiar()}>
                    <Copy className="size-3.5" /> Copiar
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 flex-1 text-xs" onClick={descargar}>
                    Guardar archivo
                  </Button>
                </div>
                {/* El QR es para el caso normal —pasar las claves al otro
                    aparato sin teclear nada—, no para llevarse el historial:
                    ahí no cabe, y el aviso lo dice con la salida al lado. */}
                <QrCodigo texto={codigo} titulo="Código de traspaso en QR" />
                {consejoQr(codigo, incluirChats) && (
                  <p className="text-[10.5px] leading-snug text-muted-foreground">
                    {consejoQr(codigo, incluirChats)}
                  </p>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <textarea
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Pega aquí el código que empieza por PRISM1.…"
              className="h-24 w-full resize-none rounded-lg border border-border/60 bg-transparent p-2 font-mono text-[10px] leading-tight"
              aria-label="Código recibido"
            />
            {camara ? (
              <EscanearQr
                onCerrar={() => setCamara(false)}
                onLeido={(t) => {
                  setCamara(false);
                  setCodigo(t);
                  toast.success("QR leído", { description: "Pon la frase e importa." });
                }}
              />
            ) : (
              <div className="flex gap-1.5">
                <BotonEscanear onClick={() => setCamara(true)} />
              </div>
            )}
            <Button
              size="sm"
              className="h-9 w-full gap-1.5 text-xs"
              onClick={() => void aplicar()}
              disabled={ocupado || fraseCorta || !codigo.trim()}
            >
              {ocupado ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Importar
            </Button>
            <p className="text-[10.5px] leading-snug text-muted-foreground">
              Se añade a lo que ya tienes aquí: no se borra ninguna conversación, y una clave que
              ya funcione en este dispositivo no se sustituye.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
