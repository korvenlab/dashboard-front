import { useState } from "react";
import { Link2, Copy, Loader2 } from "lucide-react";
import { mintTwoAvendasOrgAccessLink } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function TwoAvendasBillingUnlockCard() {
  const [organizationId, setOrganizationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unlockUrl, setUnlockUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  async function onGenerate() {
    const id = organizationId.trim();
    setError("");
    setUnlockUrl("");
    setExpiresAt(null);
    if (!UUID_RE.test(id)) {
      setError("Informe um UUID válido da organização (Supabase → organizations.id).");
      return;
    }
    setBusy(true);
    try {
      const out = (await mintTwoAvendasOrgAccessLink({
        data: { organizationId: id },
      })) as { unlock_url: string; expires_at: string | null; organization_id: string };
      setUnlockUrl(out.unlock_url);
      setExpiresAt(out.expires_at);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onCopy() {
    if (!unlockUrl) return;
    try {
      await navigator.clipboard.writeText(unlockUrl);
    } catch {
      setError("Não foi possível copiar para a área de transferência.");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 font-mono text-sm shadow-sm">
      <div className="flex items-center gap-2 text-foreground">
        <Link2 className="h-4 w-4 shrink-0" aria-hidden />
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em]">Liberação sem pagamento</h2>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Gera o mesmo tipo de link assinado usado no fluxo Korven: o cliente abre a URL e o 2AVendas ativa o acesso da
        organização (sem Stripe). Requer segredo configurado no servidor do dashboard (
        <code className="rounded bg-muted px-1">TWO_AVENDAS_BILLING_ADMIN_SECRET</code>).
      </p>
      <div className="mt-4 space-y-2">
        <Label htmlFor="org-id-unlock" className="text-[10px] uppercase tracking-wider text-muted-foreground">
          organization_id
        </Label>
        <Input
          id="org-id-unlock"
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          value={organizationId}
          onChange={(e) => setOrganizationId(e.target.value)}
          className="font-mono text-xs"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => void onGenerate()} className="gap-2">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Gerar link
        </Button>
        {unlockUrl ? (
          <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => void onCopy()}>
            <Copy className="h-3.5 w-3.5" aria-hidden />
            Copiar
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-3 rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
      {expiresAt ? (
        <p className="mt-2 text-[10px] text-muted-foreground">Expira (UTC): {expiresAt}</p>
      ) : null}
      {unlockUrl ? (
        <div className="mt-3 break-all rounded border border-border bg-muted/40 p-2 text-[10px] leading-snug text-foreground">
          {unlockUrl}
        </div>
      ) : null}
    </div>
  );
}
