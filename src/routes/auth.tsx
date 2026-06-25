import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessageCircle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getSupportWhatsAppUrl } from "@/lib/support";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/home" });
    });
  }, [navigate]);

  async function onSignIn(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setErr(error.message);
    navigate({ to: "/home" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 grid size-12 place-items-center rounded-2xl bg-brand text-brand-foreground">
            <ShieldCheck className="size-6" />
          </div>
          <CardTitle className="text-2xl">Pau Pite</CardTitle>
          <CardDescription>Bolão privado da Copa 2026</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={onSignIn} className="space-y-3">
            <Input
              type="email"
              required
              autoComplete="email"
              placeholder="E-mail"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              type="password"
              required
              autoComplete="current-password"
              placeholder="Senha"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          {err && (
            <p role="alert" className="text-center text-sm text-destructive">
              {err}
            </p>
          )}

          <div className="space-y-2 border-t pt-4 text-center">
            <p className="text-sm text-muted-foreground">
              Esqueceu a senha ou ainda não possui acesso?
            </p>
            <Button asChild variant="outline" className="w-full">
              <a href={getSupportWhatsAppUrl()} target="_blank" rel="noreferrer">
                <MessageCircle className="size-4" />
                Falar com o administrador
              </a>
            </Button>
            <p className="text-xs text-muted-foreground">
              O cadastro é fechado e nenhuma recuperação é enviada por e-mail.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
