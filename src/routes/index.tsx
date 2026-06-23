import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/home" });
      else navigate({ to: "/auth" });
    });
  }, [navigate]);

  return (
    <div style={{ maxWidth: 360, margin: "60px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>Bolão da Copa</h1>
      <p>Carregando...</p>
      <Link to="/auth">Ir para o login</Link>
    </div>
  );
}
