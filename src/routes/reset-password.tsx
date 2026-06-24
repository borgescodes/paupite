import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeFunction } from "@/lib/edge";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

type PasswordMode = "first-access" | "reset";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<PasswordMode>("reset");

  useEffect(() => {
    const urlMode =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("mode")
        : null;
    if (urlMode === "first-access") setMode("first-access");

    const detect = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setReady(true);
      const { data: prof } = await supabase
        .from("profiles")
        .select("must_change_password,status")
        .eq("id", data.user.id)
        .maybeSingle();
      if (prof && (prof.must_change_password || prof.status === "invited")) {
        setMode("first-access");
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
        void detect();
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true);
        void detect();
      }
    });

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

  return (
    <div style={{ maxWidth: 360, margin: "60px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>{mode === "first-access" ? "Definir senha" : "Redefinir senha"}</h1>
      <p style={{ color: "#555" }}>
        {mode === "first-access"
          ? "Crie sua senha de primeiro acesso para liberar sua conta."
          : "Informe sua nova senha para continuar."}
      </p>
      {!ready && <p>Validando link...</p>}
      {ready && (
        <form onSubmit={onSubmit}>
          <input
            type="password"
            required
            autoComplete="new-password"
            placeholder="Nova senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inp}
          />
          <input
            type="password"
            required
            autoComplete="new-password"
            placeholder="Confirmar senha"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={inp}
          />
          <button type="submit" disabled={saving} style={btn}>
            {saving ? "Salvando..." : "Salvar senha"}
          </button>
        </form>
      )}
      {err && <p style={{ color: "crimson" }}>{err}</p>}
      {msg && <p style={{ color: "green" }}>{msg}</p>}
    </div>
  );
}

const inp: React.CSSProperties = { display: "block", width: "100%", padding: 8, marginBottom: 8 };
const btn: React.CSSProperties = { width: "100%", padding: 10 };
