import { useEffect, useState } from "react";
import {
  BiBullseye,
  BiCheckCircle,
  BiFlag,
  BiHeart,
  BiListUl,
  BiSolidStar,
  BiSolidTrophy,
  BiTrendingUp,
} from "react-icons/bi";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { RetrospectiveData } from "@/lib/retrospective";
import { saveFeedback } from "@/lib/retrospective";
import { cn } from "@/lib/utils";

interface RetrospectiveModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  data: RetrospectiveData;
}

export function RetrospectiveModal({ open, onClose, userId, data }: RetrospectiveModalProps) {
  const [tournamentSuggestion, setTournamentSuggestion] = useState(
    data.feedback?.tournament_suggestion ?? "",
  );
  const [improvementSuggestion, setImprovementSuggestion] = useState(
    data.feedback?.improvement_suggestion ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(Boolean(data.feedback));

  useEffect(() => {
    setTournamentSuggestion(data.feedback?.tournament_suggestion ?? "");
    setImprovementSuggestion(data.feedback?.improvement_suggestion ?? "");
    setSaved(Boolean(data.feedback));
  }, [data.feedback]);

  const competitionLabel =
    data.competition.season && !data.competition.name.includes(data.competition.season)
      ? `${data.competition.name} • ${data.competition.season}`
      : data.competition.name;

  async function submitFeedback() {
    setSaving(true);
    try {
      await saveFeedback(userId, data.competition.id, {
        tournament_suggestion: tournamentSuggestion,
        improvement_suggestion: improvementSuggestion,
      });
      setSaved(true);
      toast.success("Obrigado! Sua resposta foi salva.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-lg gap-0 overflow-y-auto rounded-3xl p-0 sm:w-full"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Retrospectiva da {competitionLabel}</DialogTitle>
          <DialogDescription>
            Resumo pessoal do seu desempenho no torneio encerrado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-5">
          {/* Card 1 — Fim de Copa */}
          <HeroCard>
            <p className="eyebrow text-brand">Fim de temporada</p>
            <h2 className="mt-1 text-3xl font-black tracking-tight">A Copa acabou.</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              O {competitionLabel} chegou ao fim. Aqui está a sua retrospectiva.
            </p>
          </HeroCard>

          {/* Card 2 — Campeão */}
          <BigCard tone="warning">
            <BiSolidTrophy className="size-8 text-warning" />
            <p className="eyebrow mt-2 text-warning">Campeão da Copa</p>
            <p className="mt-1 text-3xl font-black">
              {data.championName ?? "Campeão ainda não definido"}
            </p>
            {!data.championName && (
              <p className="mt-1 text-xs text-muted-foreground">
                A partida final ainda não foi encerrada oficialmente.
              </p>
            )}
          </BigCard>

          {/* Card 3 — Sua jornada */}
          <BigCard tone="brand">
            <BiFlag className="size-8 text-brand" />
            <p className="eyebrow mt-2 text-brand">Sua jornada</p>
            <p className="mt-1 text-4xl font-black tabular-nums">{data.totalPoints} pts</p>
            <p className="text-sm font-bold text-muted-foreground">
              {data.finalPosition != null
                ? `Posição final: ${data.finalPosition}º`
                : "Sem posição registrada"}
            </p>
          </BigCard>

          {/* Card 4 — Estatísticas */}
          <div className="grid grid-cols-2 gap-3">
            <StatBox
              icon={<BiListUl className="size-5" />}
              label="Palpites"
              value={data.betsCount}
            />
            <StatBox
              icon={<BiBullseye className="size-5" />}
              label="Placar exato"
              value={data.exactScores}
            />
            <StatBox
              icon={<BiCheckCircle className="size-5" />}
              label="Resultados"
              value={data.outcomeHits}
            />
            <StatBox
              icon={<BiSolidStar className="size-5" />}
              label="Melhor jogo"
              value={data.bestMatch?.points ?? 0}
              suffix="pts"
            />
          </div>

          {/* Card 5 — Melhor partida */}
          {data.bestMatch && (
            <BigCard tone="success">
              <p className="eyebrow text-success">Sua melhor partida</p>
              <p className="mt-1 text-xl font-extrabold">
                {data.bestMatch.homeName} {data.bestMatch.homeScore} × {data.bestMatch.awayScore}{" "}
                {data.bestMatch.awayName}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Seu palpite: {data.bestMatch.guessHome} × {data.bestMatch.guessAway} —{" "}
                <strong className="text-foreground">{data.bestMatch.points} pts</strong>
              </p>
            </BigCard>
          )}

          {/* Card 6 — Evolução no ranking */}
          <BigCard>
            <BiTrendingUp className="size-7 text-brand" />
            <p className="eyebrow mt-2 text-brand">Sua trajetória</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <EvolutionBox label="Início" value={data.evolution.initial} />
              <EvolutionBox label="Melhor" value={data.evolution.best} highlight />
              <EvolutionBox label="Final" value={data.evolution.final} />
            </div>
          </BigCard>

          {/* Card 7 — Formulário */}
          <BigCard>
            <p className="eyebrow text-brand">Ajude o próximo PauPite</p>
            <h3 className="mt-1 text-lg font-extrabold">Sua opinião</h3>

            <label className="mt-3 block text-sm font-bold">
              Qual torneio você gostaria de ver no próximo PauPite?
              <Textarea
                className="mt-1 min-h-[80px]"
                value={tournamentSuggestion}
                maxLength={500}
                placeholder="Ex.: Copa América, Libertadores, Champions..."
                onChange={(event) => {
                  setTournamentSuggestion(event.target.value);
                  setSaved(false);
                }}
              />
            </label>

            <label className="mt-3 block text-sm font-bold">
              Sugestões de melhorias
              <Textarea
                className="mt-1 min-h-[100px]"
                value={improvementSuggestion}
                maxLength={1000}
                placeholder="O que poderia ficar melhor no app?"
                onChange={(event) => {
                  setImprovementSuggestion(event.target.value);
                  setSaved(false);
                }}
              />
            </label>

            <Button
              className="mt-4 h-11 w-full rounded-2xl"
              disabled={saving}
              onClick={() => void submitFeedback()}
            >
              {saving ? "Salvando..." : saved ? "Atualizar resposta" : "Enviar resposta"}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Você pode editar sua resposta a qualquer momento.
            </p>
          </BigCard>

          {/* Card 8 — Open source */}
          <BigCard tone="brand">
            <BiHeart className="size-7 text-brand" />
            <p className="eyebrow mt-2 text-brand">Projeto aberto</p>
            <p className="mt-1 text-sm">
              O PauPite será disponibilizado como <strong>open source</strong>. Código de livre
              acesso para estudo, colaboração e evolução.
            </p>
          </BigCard>

          {/* CTA final */}
          <div className="pt-2">
            <Button
              className="h-14 w-full rounded-2xl bg-brand text-lg font-extrabold text-brand-foreground hover:bg-brand/90"
              onClick={onClose}
            >
              Até o próximo torneio 👋
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HeroCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass-card overflow-hidden rounded-3xl bg-gradient-to-br from-brand/12 via-transparent to-warning/12 p-5">
      {children}
    </div>
  );
}

function BigCard({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "brand" | "warning" | "success";
}) {
  return (
    <div
      className={cn(
        "glass-card rounded-3xl p-5",
        tone === "brand" && "border-brand/25",
        tone === "warning" && "border-warning/30",
        tone === "success" && "border-success/25",
      )}
    >
      {children}
    </div>
  );
}

function StatBox({
  icon,
  label,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="grid size-9 place-items-center rounded-xl bg-brand/12 text-brand">
        {icon}
      </div>
      <p className="mt-2 text-2xl font-black tabular-nums">
        {value}
        {suffix ? <span className="ml-1 text-xs font-bold">{suffix}</span> : null}
      </p>
      <p className="text-[11px] font-bold uppercase text-muted-foreground">{label}</p>
    </div>
  );
}

function EvolutionBox({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | null;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl px-3 py-3",
        highlight ? "bg-brand/12 ring-1 ring-brand/30" : "bg-muted/60",
      )}
    >
      <p className={cn("text-2xl font-black tabular-nums", highlight && "text-brand")}>
        {value != null ? `${value}º` : "—"}
      </p>
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
    </div>
  );
}
