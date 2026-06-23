import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { profile } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [nickname, setNickname] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [country, setCountry] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setNickname(profile.nickname ?? "");
      setAvatarUrl(profile.avatar_url ?? "");
      setCountry(profile.favorite_country_code ?? "");
    }
  }, [profile]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName,
        nickname,
        avatar_url: avatarUrl || null,
        favorite_country_code: country || null,
      })
      .eq("id", profile.id);
    setMsg(error ? error.message : "Salvo!");
  }

  if (!profile) return <p>carregando...</p>;

  return (
    <div style={{ maxWidth: 480, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <Link to="/home">← voltar</Link>
      <h1>Meu perfil</h1>
      <form onSubmit={save}>
        <label>Nome</label>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inp} />
        <label>Apelido</label>
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} style={inp} />
        <label>Avatar URL</label>
        <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} style={inp} />
        <label>País favorito (código, ex: BR)</label>
        <input value={country} onChange={(e) => setCountry(e.target.value)} style={inp} />
        <button type="submit" style={{ padding: 10 }}>Salvar</button>
      </form>
      <p style={{ color: "#666", fontSize: 12 }}>
        E-mail, role e status só podem ser alterados por um admin.
      </p>
      {msg && <p>{msg}</p>}
    </div>
  );
}

const inp: React.CSSProperties = { display: "block", width: "100%", padding: 8, marginBottom: 8 };
