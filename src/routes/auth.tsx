import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BiEnvelope,
  BiHide,
  BiLockAlt,
  BiLogoWhatsapp,
  BiMoon,
  BiShieldQuarter,
  BiShow,
  BiSun,
} from "react-icons/bi";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useThemeMode } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";
import { getAdminWhatsAppUrl } from "@/lib/whatsapp";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { theme, toggleTheme } = useThemeMode();

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
    <div className="app-backdrop relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <button
        type="button"
        aria-label={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}
        className="tap-feedback absolute top-4 right-4 z-10 grid size-10 place-items-center rounded-2xl border border-border bg-surface shadow-md backdrop-blur"
        onClick={toggleTheme}
      >
        {theme === "light" ? <BiMoon className="size-5" /> : <BiSun className="size-5" />}
      </button>
      <div className="pointer-events-none absolute -top-24 -left-20 size-72 animate-blob-drift rounded-full bg-brand/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 -bottom-24 size-72 animate-blob-drift rounded-full bg-success/15 blur-3xl [animation-delay:-8s]" />

      <Card className="glass-card screen-enter relative w-full max-w-md overflow-hidden rounded-3xl border-border/80 shadow-2xl">
        <div className="h-1.5 bg-gradient-to-r from-brand via-success to-warning" />
        <CardHeader className="space-y-3 px-6 pt-7 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand text-brand-foreground shadow-lg shadow-brand/25">
            <BiShieldQuarter className="size-7" />
          </div>
          <div>
            <p className="eyebrow text-brand">Acesso privado</p>
            <CardTitle className="mt-1 text-3xl font-extrabold tracking-tight">Pau Pite</CardTitle>
          </div>
          <CardDescription className="mx-auto max-w-xs leading-relaxed">
            Bolão privado da Copa 2026. O acesso é criado exclusivamente pela administração.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 px-6 pb-7">
          <form onSubmit={onSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <BiEnvelope className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  className="field-control pl-10"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="voce@exemplo.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <BiLockAlt className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  className="field-control px-10"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="Sua senha"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="tap-feedback absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <BiHide className="size-5" /> : <BiShow className="size-5" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={loading} className="h-11 w-full rounded-2xl">
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          {err && (
            <p role="alert" className="text-center text-sm text-destructive">
              {err}
            </p>
          )}

          <div className="space-y-3 border-t border-border/70 pt-5 text-center">
            <p className="text-sm text-muted-foreground">
              Esqueceu a senha ou ainda não possui acesso?
            </p>
            <Button asChild variant="outline" className="h-11 w-full rounded-2xl">
              <a href={getAdminWhatsAppUrl()} target="_blank" rel="noreferrer">
                <BiLogoWhatsapp className="size-5 text-success" />
                Falar com o administrador
              </a>
            </Button>
            <p className="text-xs text-muted-foreground">
              Não há cadastro público nem recuperação de senha por e-mail.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
