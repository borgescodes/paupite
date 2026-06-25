import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeFunction } from "@/lib/edge";
import { getSupportWhatsAppUrl } from "@/lib/support";

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
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 grid size-12 place-items-center rounded-2xl bg-brand text-brand-foreground">
            <KeyRound className="size-6" />
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
        <CardContent className="space-y-4">
          {requiresPasswordChange ? (
            <form onSubmit={onSubmit} className="space-y-3">
              <Input
                type="password"
                required
                autoComplete="new-password"
                placeholder="Nova senha"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <Input
                type="password"
                required
                autoComplete="new-password"
                placeholder="Confirmar senha"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
              <Button type="submit" disabled={saving} className="w-full">
                {saving ? "Salvando..." : "Salvar senha"}
              </Button>
            </form>
          ) : (
            <>
              <Button asChild className="w-full">
                <a href={getSupportWhatsAppUrl()} target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" />
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
