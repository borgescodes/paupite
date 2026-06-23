import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeFunction } from "@/lib/edge";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: prof } = await supabase.from("profiles").select("role,status").eq("id", data.user.id).maybeSingle();
    if (!prof || prof.status !== "active" || !isAdminRole(prof.role)) throw redirect({ to: "/home" });
  },
  component: AdminPage,
});

type Role = "superadmin" | "admin" | "player";
type Status = "invited" | "active" | "disabled";
interface ProfRow { id: string; email: string; display_name: string | null; nickname: string | null; role: Role; status: Status; must_change_password: boolean }
interface TeamRow { id: string; name: string }
interface MatchRow {
  id: string; kickoff_at: string; status: string;
  home_team_id: string | null; away_team_id: string | null;
  home_score: number; away_score: number; stage: string | null;
}

function AdminPage() {
  const { profile } = useAuth();

  return (
    <div style={{ maxWidth: 960, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <Link to="/home">← voltar</Link>
      <h1>Admin</h1>
      <CreateUser currentRole={profile?.role} />
      <hr style={{ margin: "24px 0" }} />
      <Users currentRole={profile?.role} currentUserId={profile?.id} />
      <hr style={{ margin: "24px 0" }} />
      <Teams />
      <hr style={{ margin: "24px 0" }} />
      <Matches />
    </div>
  );
}

function CreateUser({ currentRole }: { currentRole?: Role }) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [nickname, setNickname] = useState("");
  const [role, setRole] = useState<"player" | "admin">("player");
  const [out, setOut] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setOut(null); setErr(null);
    try {
      const r = await callEdgeFunction<{ action_link: string }>("admin-create-user", {
        email,
        display_name: displayName,
        nickname,
        role,
        redirect_to: `${window.location.origin}/reset-password?mode=first-access`,
      });
      setOut(`Usuário criado. Link de primeiro acesso:\n${r.action_link}`);
      setEmail(""); setDisplayName(""); setNickname("");
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <section>
      <h2>Criar usuário</h2>
      <form onSubmit={submit} style={{ display: "grid", gap: 6, maxWidth: 400 }}>
        <input placeholder="E-mail" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="Nome" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <input placeholder="Apelido" required value={nickname} onChange={(e) => setNickname(e.target.value)} />
        <select value={role} onChange={(e) => setRole(e.target.value as "player" | "admin")}>
          <option value="player">player</option>
          {currentRole === "superadmin" && <option value="admin">admin</option>}
        </select>
        <button type="submit">Criar</button>
      </form>
      {out && <pre style={{ background: "#eef", padding: 8, whiteSpace: "pre-wrap" }}>{out}</pre>}
      {err && <p style={{ color: "crimson" }}>{err}</p>}
    </section>
  );
}

function Users({ currentRole, currentUserId }: { currentRole?: Role; currentUserId?: string }) {
  const [rows, setRows] = useState<ProfRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [tempPasswords, setTempPasswords] = useState<Record<string, string>>({});
  const [tempPasswordMsg, setTempPasswordMsg] = useState<string | null>(null);

  const load = async () => {
    const baseSelect = "id,email,display_name,nickname,role,status";
    let query = supabase
      .from("profiles")
      .select(`${baseSelect},must_change_password`)
      .order("created_at");
    if (currentRole === "admin") query = query.eq("role", "player");

    const { data, error } = await query;
    if (!error) {
      setErr(null);
      setRows((data ?? []) as ProfRow[]);
      return;
    }

    // Compatibilidade temporária: evita quebrar /admin caso a migration
    // de must_change_password ainda não tenha sido aplicada no banco remoto.
    let fallbackQuery = supabase.from("profiles").select(baseSelect).order("created_at");
    if (currentRole === "admin") fallbackQuery = fallbackQuery.eq("role", "player");
    const { data: fallbackData, error: fallbackError } = await fallbackQuery;
    setErr(fallbackError?.message ?? null);
    setRows(((fallbackData ?? []) as Omit<ProfRow, "must_change_password">[]).map((row) => ({
      ...row,
      must_change_password: false,
    })));
  };

  useEffect(() => { if (currentRole) void load(); }, [currentRole]);

  async function update(id: string, patch: Partial<ProfRow>) {
    setErr(null);
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) setErr(error.message);
    void load();
  }

  async function sendReset(email: string) {
    try {
      setErr(null); setResetLink(null); setTempPasswordMsg(null);
      const r = await callEdgeFunction<{ action_link: string }>("admin-reset-user-password", {
        email,
        redirect_to: `${window.location.origin}/reset-password?mode=reset`,
      });
      setResetLink(r.action_link);
      void load();
    } catch (e) { setErr((e as Error).message); }
  }

  async function setTemporaryPassword(userId: string) {
    try {
      setErr(null); setResetLink(null); setTempPasswordMsg(null);
      const temporaryPassword = tempPasswords[userId] ?? "";
      await callEdgeFunction("admin-set-temp-password", {
        user_id: userId,
        temporary_password: temporaryPassword,
      });
      setTempPasswords((prev) => ({ ...prev, [userId]: "" }));
      setTempPasswordMsg("Senha temporária definida. O usuário será obrigado a trocar a senha no próximo acesso.");
      void load();
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <section>
      <h2>Usuários</h2>
      {err && <p style={{ color: "crimson" }}>{err}</p>}
      {resetLink && <pre style={{ background: "#eef", padding: 8, whiteSpace: "pre-wrap" }}>Link de reset:\n{resetLink}</pre>}
      {tempPasswordMsg && <p style={{ color: "green" }}>{tempPasswordMsg}</p>}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th>E-mail</th><th>Nome</th><th>Role</th><th>Status</th><th>Senha</th><th>Ações</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const manageable = canManageProfile(currentRole, r, currentUserId);
            const canReset = canResetPassword(currentRole, r, currentUserId);
            return (
              <tr key={r.id} style={{ borderTop: "1px solid #ddd" }}>
                <td>{r.email}</td>
                <td>{r.display_name}</td>
                <td>
                  <select value={r.role} disabled={!manageable || currentRole !== "superadmin"}
                    onChange={(e) => update(r.id, { role: e.target.value as Role })}>
                    <option value="player">player</option>
                    <option value="admin">admin</option>
                    {r.role === "superadmin" && <option value="superadmin">superadmin</option>}
                  </select>
                </td>
                <td>
                  <select value={r.status} disabled={!manageable} onChange={(e) => update(r.id, { status: e.target.value as Status })}>
                    <option value="invited">invited</option>
                    <option value="active">active</option>
                    <option value="disabled">disabled</option>
                  </select>
                  {r.must_change_password && <div style={{ fontSize: 12, color: "#b45309" }}>troca obrigatória</div>}
                </td>
                <td>
                  <input
                    type="password"
                    placeholder="Senha temporária"
                    value={tempPasswords[r.id] ?? ""}
                    disabled={!canReset}
                    onChange={(e) => setTempPasswords((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    style={{ width: 150 }}
                  />
                  <button disabled={!canReset || (tempPasswords[r.id] ?? "").length < 8} onClick={() => setTemporaryPassword(r.id)}>
                    Definir
                  </button>
                </td>
                <td><button disabled={!canReset} onClick={() => sendReset(r.email)}>Gerar link reset</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function isAdminRole(role?: string) {
  return role === "superadmin" || role === "admin";
}

function canManageProfile(currentRole: Role | undefined, target: ProfRow, currentUserId?: string) {
  if (!currentRole || target.id === currentUserId || target.role === "superadmin") return false;
  if (currentRole === "superadmin") return target.role === "admin" || target.role === "player";
  if (currentRole === "admin") return target.role === "player";
  return false;
}

function canResetPassword(currentRole: Role | undefined, target: ProfRow, currentUserId?: string) {
  if (!currentRole || target.id === currentUserId || target.role === "superadmin") return false;
  if (currentRole === "superadmin") return target.role === "admin" || target.role === "player";
  if (currentRole === "admin") return target.role === "player";
  return false;
}

function Teams() {
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [code, setCode] = useState("");
  const load = () => supabase.from("teams").select("id,name").order("name").then(({ data }) => setRows((data ?? []) as TeamRow[]));
  useEffect(() => { void load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("teams").insert({ name, short_name: shortName || null, country_code: code || null });
    setName(""); setShortName(""); setCode(""); void load();
  }

  return (
    <section>
      <h2>Times</h2>
      <form onSubmit={create} style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input placeholder="Nome" required value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Sigla" value={shortName} onChange={(e) => setShortName(e.target.value)} />
        <input placeholder="País (BR)" value={code} onChange={(e) => setCode(e.target.value)} />
        <button type="submit">Adicionar</button>
      </form>
      <ul>{rows.map((t) => <li key={t.id}>{t.name}</li>)}</ul>
    </section>
  );
}

function Matches() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [home, setHome] = useState(""); const [away, setAway] = useState("");
  const [kickoff, setKickoff] = useState(""); const [stage, setStage] = useState("");

  const load = async () => {
    const { data: t } = await supabase.from("teams").select("id,name").order("name");
    setTeams((t ?? []) as TeamRow[]);
    const { data: m } = await supabase.from("matches").select("*").order("kickoff_at");
    setRows((m ?? []) as MatchRow[]);
  };
  useEffect(() => { void load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("matches").insert({
      home_team_id: home, away_team_id: away,
      kickoff_at: new Date(kickoff).toISOString(),
      stage: stage || null,
    });
    setHome(""); setAway(""); setKickoff(""); setStage(""); void load();
  }
  async function setScore(id: string, h: number, a: number) {
    await supabase.from("matches").update({ home_score: h, away_score: a, manual_override: true }).eq("id", id);
    void load();
  }
  async function setStatus(id: string, status: string) {
    await supabase.from("matches").update({ status }).eq("id", id);
    void load();
  }
  async function closeMatch(id: string) {
    try {
      const r = await callEdgeFunction<{ updated: number }>("recalculate-match-points", { match_id: id });
      alert(`Fechada. Palpites recalculados: ${r.updated}`);
      void load();
    } catch (e) { alert((e as Error).message); }
  }

  return (
    <section>
      <h2>Partidas</h2>
      <form onSubmit={create} style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 12 }}>
        <select required value={home} onChange={(e) => setHome(e.target.value)}>
          <option value="">Mandante</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select required value={away} onChange={(e) => setAway(e.target.value)}>
          <option value="">Visitante</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input type="datetime-local" required value={kickoff} onChange={(e) => setKickoff(e.target.value)} />
        <input placeholder="Fase (grupos/oitavas...)" value={stage} onChange={(e) => setStage(e.target.value)} />
        <button type="submit">Criar</button>
      </form>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th>Quando</th><th>Status</th><th>Placar</th><th>Ações</th></tr></thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} style={{ borderTop: "1px solid #ddd" }}>
              <td>{new Date(m.kickoff_at).toLocaleString()}</td>
              <td>
                <select value={m.status} onChange={(e) => setStatus(m.id, e.target.value)}>
                  <option value="scheduled">scheduled</option>
                  <option value="live">live</option>
                  <option value="finished">finished</option>
                  <option value="closed">closed</option>
                </select>
              </td>
              <td>
                <input type="number" min={0} value={m.home_score} style={{ width: 50 }}
                  onChange={(e) => setScore(m.id, Number(e.target.value), m.away_score)} />
                {" - "}
                <input type="number" min={0} value={m.away_score} style={{ width: 50 }}
                  onChange={(e) => setScore(m.id, m.home_score, Number(e.target.value))} />
              </td>
              <td><button onClick={() => closeMatch(m.id)}>Fechar + recalcular</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
