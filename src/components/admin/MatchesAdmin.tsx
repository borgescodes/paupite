import { useCallback, useEffect, useMemo, useState } from "react";
import { BiChevronDown, BiFilterAlt, BiGroup, BiPlus, BiSearch } from "react-icons/bi";
import { toast } from "sonner";

import { AdminMatchActionsSheet } from "@/components/admin/AdminMatchActionsSheet";
import { AdminMatchCard } from "@/components/admin/AdminMatchCard";
import { AdminMatchEditor, NativeSelect } from "@/components/admin/AdminMatchEditor";
import { AdminResultSheet } from "@/components/admin/AdminResultSheet";
import { matchStageLabel } from "@/components/admin/match-labels";
import type {
  AdminCompetition,
  AdminMatch,
  AdminMatchFormValue,
  AdminTeam,
} from "@/components/admin/match-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeFunction } from "@/lib/edge";
import type { QualificationMethod } from "@/lib/knockout";

export function MatchesAdmin() {
  const [teams, setTeams] = useState<AdminTeam[]>([]);
  const [competitions, setCompetitions] = useState<AdminCompetition[]>([]);
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<AdminMatch | null | "new">(null);
  const [resultMatch, setResultMatch] = useState<AdminMatch | null>(null);
  const [actionMatch, setActionMatch] = useState<AdminMatch | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [stage, setStage] = useState("all");
  const [date, setDate] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [newTeam, setNewTeam] = useState({
    id: "",
    name: "",
    short_name: "",
    country_code: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [teamResult, competitionResult, matchResult] = await Promise.all([
      supabase.from("teams").select("id,external_key,name,short_name,country_code").order("name"),
      supabase.from("competitions").select("id,name").order("created_at"),
      supabase
        .from("matches")
        .select(
          "id,kickoff_at,status,deleted_at,home_team_id,away_team_id,home_score,away_score,regulation_home_score,regulation_away_score,qualified_team_id,qualification_method,bracket_source_home,bracket_source_away,competition_id,stage,group_name,venue,city,home_team:teams!matches_home_team_id_fkey(name,short_name,country_code),away_team:teams!matches_away_team_id_fkey(name,short_name,country_code)",
        )
        .order("kickoff_at"),
    ]);
    setTeams((teamResult.data ?? []) as AdminTeam[]);
    setCompetitions((competitionResult.data ?? []) as AdminCompetition[]);
    setMatches((matchResult.data ?? []) as unknown as AdminMatch[]);
    setError(
      teamResult.error?.message ??
        competitionResult.error?.message ??
        matchResult.error?.message ??
        null,
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stages = useMemo(
    () => Array.from(new Set(matches.map((match) => match.stage).filter(Boolean))) as string[],
    [matches],
  );

  const filteredMatches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return matches.filter((match) => {
      const kickoff = new Date(match.kickoff_at);
      const operationalStatus = match.deleted_at
        ? "deleted"
        : match.status === "closed" || match.status === "scored"
          ? "closed"
          : match.status === "live"
            ? "live"
            : match.status === "finished"
              ? "finished"
              : match.status === "canceled"
                ? "canceled"
                : kickoff > new Date()
                  ? "future"
                  : "pending";
      const names =
        `${match.home_team?.name ?? ""} ${match.away_team?.name ?? ""}`.toLocaleLowerCase("pt-BR");
      return (
        (showDeleted || !match.deleted_at) &&
        (!query || names.includes(query)) &&
        (status === "all" || operationalStatus === status) &&
        (stage === "all" || match.stage === stage) &&
        (!date || match.kickoff_at.slice(0, 10) === date)
      );
    });
  }, [date, matches, search, showDeleted, stage, status]);

  async function run(operation: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(null);
    try {
      await operation();
      toast.success(success);
      await load();
      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Falha na operação.";
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveMatch(value: AdminMatchFormValue) {
    const current = editing === "new" ? null : editing;
    const hasHomeTeam = Boolean(value.home_team_id);
    const hasAwayTeam = Boolean(value.away_team_id);
    if (!current && (!hasHomeTeam || !hasAwayTeam)) {
      setError("Selecione as duas equipes para criar a partida.");
      return;
    }
    if (hasHomeTeam && hasAwayTeam && value.home_team_id === value.away_team_id) {
      setError("Selecione duas equipes diferentes.");
      return;
    }
    const saved = await run(
      () =>
        callEdgeFunction("admin-save-match", {
          action: current ? "update" : "create",
          ...(current ? { match_id: current.id } : {}),
          ...value,
          home_team_id: value.home_team_id || null,
          away_team_id: value.away_team_id || null,
          competition_id: value.competition_id || null,
          kickoff_at: new Date(value.kickoff_at).toISOString(),
        }),
      current ? "Partida atualizada." : "Partida criada.",
    );
    if (saved) setEditing(null);
  }

  async function saveResult(value: {
    home_score: number;
    away_score: number;
    status: string;
    qualified_team_id?: string | null;
    qualification_method?: QualificationMethod | null;
  }) {
    if (!resultMatch) return;
    const saved = await run(
      () =>
        callEdgeFunction("admin-save-match", {
          action: "result",
          match_id: resultMatch.id,
          ...value,
        }),
      "Resultado salvo.",
    );
    if (saved) setResultMatch(null);
  }

  async function closeMatch() {
    if (!resultMatch) return;
    const closed = await run(
      () =>
        callEdgeFunction("admin-save-match", {
          action: "close",
          match_id: resultMatch.id,
        }),
      "Partida fechada e pontuação recalculada.",
    );
    if (closed) setResultMatch(null);
  }

  async function correctMatchScore(value: { home_score: number; away_score: number }) {
    if (!actionMatch) return;
    await run(
      () =>
        callEdgeFunction("admin-save-match", {
          action: "correct_score",
          match_id: actionMatch.id,
          ...value,
        }),
      "Placar corrigido e pontuação atualizada quando aplicável.",
    );
  }

  async function recalculateMatch() {
    if (!actionMatch) return;
    await run(
      () =>
        callEdgeFunction("admin-save-match", {
          action: "recalculate",
          match_id: actionMatch.id,
        }),
      "Pontuação recalculada.",
    );
  }

  async function setMatchStatus(nextStatus: string) {
    if (!actionMatch) return;
    await run(
      () =>
        callEdgeFunction("admin-save-match", {
          action: "set_status",
          match_id: actionMatch.id,
          status: nextStatus,
        }),
      "Status da partida atualizado.",
    );
  }

  async function softDeleteMatch() {
    if (!actionMatch) return;
    const removed = await run(
      () =>
        callEdgeFunction("admin-save-match", {
          action: "soft_delete",
          match_id: actionMatch.id,
        }),
      "Partida removida logicamente.",
    );
    if (removed) setActionMatch(null);
  }

  async function saveTeam(event: React.FormEvent) {
    event.preventDefault();
    const saved = await run(
      async () => {
        const row = {
          name: newTeam.name.trim(),
          short_name: newTeam.short_name.trim() || null,
          country_code: newTeam.country_code.trim().toUpperCase() || null,
          flag_url: newTeam.country_code
            ? `/flags/${newTeam.country_code.trim().toLowerCase()}.svg`
            : null,
        };
        const query = newTeam.id
          ? supabase.from("teams").update(row).eq("id", newTeam.id)
          : supabase.from("teams").insert(row);
        const { error: saveError } = await query;
        if (saveError) throw saveError;
      },
      newTeam.id ? "Seleção atualizada." : "Seleção adicionada.",
    );
    if (saved) setNewTeam({ id: "", name: "", short_name: "", country_code: "" });
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow text-brand">Agenda oficial</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Administrar jogos</h2>
          <p className="text-sm text-muted-foreground">
            Edite dados operacionais e lance resultados em fluxos separados.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <BiPlus className="size-5" />
          Nova partida
        </Button>
      </section>

      <Card className="glass-card">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <BiSearch className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Buscar por seleção"
              className="pl-10"
              placeholder="Buscar seleção"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <NativeSelect id="filter-status" value={status} onChange={setStatus}>
            <option value="all">Todos os status</option>
            <option value="future">Aberto para palpite</option>
            <option value="live">Em andamento</option>
            <option value="finished">Encerrado</option>
            <option value="pending">Agendado</option>
            <option value="closed">Pontuação calculada</option>
            <option value="canceled">Canceladas</option>
            <option value="deleted">Removidas</option>
          </NativeSelect>
          <NativeSelect id="filter-stage" value={stage} onChange={setStage}>
            <option value="all">Todas as fases</option>
            {stages.map((item) => (
              <option key={item} value={item}>
                {matchStageLabel(item)}
              </option>
            ))}
          </NativeSelect>
          <div className="relative">
            <BiFilterAlt className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Filtrar por data"
              type="date"
              className="pl-10"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-border/70 px-3 text-sm font-bold text-muted-foreground">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(event) => setShowDeleted(event.target.checked)}
            />
            Ver removidas
          </label>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-2xl border border-destructive/20 bg-destructive/8 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-64 rounded-3xl" />
          ))}
        </div>
      ) : filteredMatches.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {filteredMatches.map((match) => (
            <AdminMatchCard
              key={match.id}
              match={match}
              onEdit={() => setEditing(match)}
              onResult={() => setResultMatch(match)}
              onActions={() => setActionMatch(match)}
            />
          ))}
        </div>
      ) : (
        <Card className="glass-card border-dashed">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma partida encontrada com estes filtros.
          </CardContent>
        </Card>
      )}

      <details className="group glass-card rounded-3xl">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
          <div className="grid size-10 place-items-center rounded-2xl bg-brand/12 text-brand">
            <BiGroup className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold">Seleções e bandeiras</p>
            <p className="text-xs text-muted-foreground">
              Cadastre ou ajuste uma seleção usada nos confrontos.
            </p>
          </div>
          <BiChevronDown className="size-5 transition-transform group-open:rotate-180" />
        </summary>
        <form
          className="grid gap-3 border-t border-border/70 p-4 sm:grid-cols-2"
          onSubmit={saveTeam}
        >
          <div className="sm:col-span-2">
            <Label htmlFor="team-existing">Seleção existente</Label>
            <NativeSelect
              id="team-existing"
              value={newTeam.id}
              onChange={(value) => {
                const selected = teams.find((team) => team.id === value);
                setNewTeam(
                  selected
                    ? {
                        id: selected.id,
                        name: selected.name,
                        short_name: selected.short_name ?? "",
                        country_code: selected.country_code ?? "",
                      }
                    : { id: "", name: "", short_name: "", country_code: "" },
                );
              }}
            >
              <option value="">Criar nova seleção</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Field id="team-name" label="Nome">
            <Input
              id="team-name"
              required
              value={newTeam.name}
              onChange={(event) =>
                setNewTeam((current) => ({ ...current, name: event.target.value }))
              }
            />
          </Field>
          <Field id="team-short-name" label="Sigla">
            <Input
              id="team-short-name"
              maxLength={5}
              value={newTeam.short_name}
              onChange={(event) =>
                setNewTeam((current) => ({ ...current, short_name: event.target.value }))
              }
            />
          </Field>
          <Field id="team-country" label="Código da bandeira">
            <Input
              id="team-country"
              maxLength={6}
              placeholder="Ex.: br"
              value={newTeam.country_code}
              onChange={(event) =>
                setNewTeam((current) => ({ ...current, country_code: event.target.value }))
              }
            />
          </Field>
          <Button disabled={busy} className="self-end">
            {newTeam.id ? "Salvar seleção" : "Adicionar seleção"}
          </Button>
        </form>
      </details>

      <AdminMatchEditor
        open={Boolean(editing)}
        match={editing === "new" ? null : editing}
        teams={teams}
        competitions={competitions}
        busy={busy}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={(value) => void saveMatch(value)}
      />
      <AdminResultSheet
        open={Boolean(resultMatch)}
        match={resultMatch}
        busy={busy}
        onOpenChange={(open) => !open && setResultMatch(null)}
        onSave={(value) => void saveResult(value)}
        onCloseMatch={() => void closeMatch()}
      />
      <AdminMatchActionsSheet
        open={Boolean(actionMatch)}
        match={actionMatch}
        busy={busy}
        onOpenChange={(open) => !open && setActionMatch(null)}
        onCorrectScore={(value) => void correctMatchScore(value)}
        onRecalculate={() => void recalculateMatch()}
        onSetStatus={(value) => void setMatchStatus(value)}
        onSoftDelete={() => void softDeleteMatch()}
      />
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
