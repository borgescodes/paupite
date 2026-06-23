import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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

  useEffect(() => {
    // Supabase processa o token do hash (#access_token...) automaticamente.
    // Aguarda o evento PASSWORD_RECOVERY ou já existir sessão.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password !== confirm) return setErr("Senhas não conferem");
    if (password.length < 8) return setErr("Mínimo 8 caracteres");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setErr(error.message);
    setMsg("Senha atualizada! Redirecionando...");
    setTimeout(() => navigate({ to: "/home" }), 1200);
  }

  return (
    <div style={{ maxWidth: 360, margin: "60px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>Redefinir senha</h1>
      {!ready && <p>Validando link...</p>}
      {ready && (
        <form onSubmit={onSubmit}>
          <input type="password" required placeholder="Nova senha" value={password}
            onChange={(e) => setPassword(e.target.value)} style={inp} />
          <input type="password" required placeholder="Confirmar senha" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} style={inp} />
          <button type="submit" style={btn}>Salvar</button>
        </form>
      )}
      {err && <p style={{ color: "crimson" }}>{err}</p>}
      {msg && <p style={{ color: "green" }}>{msg}</p>}
    </div>
  );
}

const inp: React.CSSProperties = { display: "block", width: "100%", padding: 8, marginBottom: 8 };
const btn: React.CSSProperties = { width: "100%", padding: 10 };
