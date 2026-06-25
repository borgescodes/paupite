import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BiKey, BiLogoWhatsapp, BiMoon, BiSun } from "react-icons/bi";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useThemeMode } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeFunction } from "@/lib/edge";
import { getAdminWhatsAppUrl } from "@/lib/whatsapp";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);
  const { theme, toggleTheme } = useThemeMode();

  useEffect(() => {
    const detect = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setReady(true);
        setRequiresPasswordChange(false);
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("must_change_password,status")
        .eq("id", data.user.id)
        .maybeSingle();
      setRequiresPasswordChange(Boolean(prof?.must_change_password || prof?.status === "invited"));
      setReady(true);
    };

    const { data: sub } = supabase.auth.onAuthStateChange(() => void detect());

    void detect();

    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    if (password !== confirm) return setErr("Senhas não conferem.");
    if (password.length < 8) return setErr("A senha precisa ter pelo menos 8 caracteres.");

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setSaving(false);
      return setErr(error.message);
    }

    try {
      await callEdgeFunction("complete-password-change", {});
    } catch (e) {
      setSaving(false);
      return setErr((e as Error).message);
    }

    setSaving(false);
    setMsg("Senha atualizada. Redirecionando...");
    setTimeout(() => navigate({ to: "/home" }), 800);
  }

  if (!ready) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Validando acesso...</p>;
  }

  return (
    <div className="app-backdrop relative flex min-h-screen items-center justify-center px-4 py-10">
      <button
        type="button"
        aria-label={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}
        className="tap-feedback absolute top-4 right-4 grid size-10 place-items-center rounded-2xl border border-border bg-surface shadow-md backdrop-blur"
        onClick={toggleTheme}
      >
        {theme === "light" ? <BiMoon className="size-5" /> : <BiSun className="size-5" />}
      </button>
      <Card className="glass-card screen-enter w-full max-w-md rounded-3xl">
        <CardHeader className="space-y-3 px-6 pt-7 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand text-brand-foreground shadow-lg shadow-brand/20">
            <BiKey className="size-7" />
          </div>
          <CardTitle>
            {requiresPasswordChange ? "Crie sua senha pessoal" : "Ajuda para acessar"}
          </CardTitle>
          <CardDescription>
            {requiresPasswordChange
              ? "Sua senha atual é temporária. Defina uma nova senha para continuar."
              : "A recuperação de acesso é feita diretamente pelo administrador."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-6 pb-7">
          {requiresPasswordChange ? (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">Nova senha</Label>
                <Input
                  id="new-password"
                  className="field-control"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="Mínimo de 8 caracteres"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirmar senha</Label>
                <Input
                  id="confirm-password"
                  className="field-control"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="Repita a nova senha"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </div>
              <Button type="submit" disabled={saving} className="h-11 w-full rounded-2xl">
                {saving ? "Salvando..." : "Salvar senha"}
              </Button>
            </form>
          ) : (
            <>
              <div className="rounded-2xl border border-border/70 bg-muted/55 p-4 text-sm text-muted-foreground">
                O Pau Pite não envia links de recuperação por e-mail. Peça ao administrador uma nova
                senha temporária.
              </div>
              <Button asChild className="h-11 w-full rounded-2xl">
                <a href={getAdminWhatsAppUrl()} target="_blank" rel="noreferrer">
                  <BiLogoWhatsapp className="size-5" />
                  Pedir ajuda no WhatsApp
                </a>
              </Button>
              <Button asChild variant="ghost" className="w-full">
                <Link to="/auth">Voltar ao login</Link>
              </Button>
            </>
          )}
          {err && <p className="text-center text-sm text-destructive">{err}</p>}
          {msg && <p className="text-center text-sm text-success">{msg}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
