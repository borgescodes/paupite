import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
});

function HomePage() {
  const { profile, isAdmin } = useAuth();
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h1>Bolão da Copa</h1>
        <button onClick={signOut}>Sair</button>
      </header>
      <p>
        Olá, <strong>{profile?.display_name ?? profile?.email}</strong>{" "}
        ({profile?.role}) — status: {profile?.status}
      </p>
      <nav style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
        <Link to="/matches">Partidas</Link>
        <Link to="/ranking">Ranking</Link>
        <Link to="/profile">Meu perfil</Link>
        {isAdmin && <Link to="/admin">Admin</Link>}
      </nav>
    </div>
  );
}
