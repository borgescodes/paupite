import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
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
    setMsg(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setErr(error.message);
    navigate({ to: "/home" });
  }

  async function onForgot(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return setErr(error.message);
    setMsg("Se o e-mail existir, enviamos um link de redefinição.");
  }

  return (
    <div style={{ maxWidth: 360, margin: "60px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>Bolão da Copa</h1>
      <h2>{mode === "signin" ? "Login" : "Esqueci minha senha"}</h2>

      {mode === "signin" ? (
        <form onSubmit={onSignIn}>
          <input type="email" required placeholder="E-mail" value={email}
            onChange={(e) => setEmail(e.target.value)} style={inp} />
          <input type="password" required placeholder="Senha" value={password}
            onChange={(e) => setPassword(e.target.value)} style={inp} />
          <button type="submit" disabled={loading} style={btn}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
          <button type="button" onClick={() => setMode("forgot")} style={linkBtn}>
            Esqueci minha senha
          </button>
        </form>
      ) : (
        <form onSubmit={onForgot}>
          <input type="email" required placeholder="E-mail" value={email}
            onChange={(e) => setEmail(e.target.value)} style={inp} />
          <button type="submit" disabled={loading} style={btn}>
            {loading ? "Enviando..." : "Enviar link"}
          </button>
          <button type="button" onClick={() => setMode("signin")} style={linkBtn}>
            Voltar ao login
          </button>
        </form>
      )}

      {err && <p style={{ color: "crimson" }}>{err}</p>}
      {msg && <p style={{ color: "green" }}>{msg}</p>}
      <p style={{ fontSize: 12, color: "#666", marginTop: 24 }}>
        Cadastro fechado. Solicite acesso a um admin.
      </p>
      <Link to="/">← voltar</Link>
    </div>
  );
}

const inp: React.CSSProperties = { display: "block", width: "100%", padding: 8, marginBottom: 8 };
const btn: React.CSSProperties = { width: "100%", padding: 10, marginBottom: 8 };
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: "#06c", cursor: "pointer", padding: 0 };
