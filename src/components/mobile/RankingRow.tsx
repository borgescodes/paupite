import { Eye, ListChecks, Target, Trophy } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  rankingInitials,
  rankingName,
  type RankingEntry,
  type RankingMode,
  type RankingMovement,
} from "@/lib/ranking";

export function RankingRow({
  row,
  isMe,
  variant = "free",
  movement,
  onOpenProfile,
  onOpenOwnProfile,
}: {
  row: RankingEntry;
  isMe?: boolean;
  variant?: RankingMode;
  movement?: RankingMovement;
  onOpenProfile?: (row: RankingEntry) => void;
  onOpenOwnProfile?: () => void;
}) {
  const name = rankingName(row);
  const premium = variant === "pool";
  const canOpenPublicProfile = Boolean(row.user_id && !isMe && onOpenProfile);
  const canOpenOwnProfile = Boolean(isMe && onOpenOwnProfile);

  function handleOpenProfile() {
    if (canOpenOwnProfile) {
      onOpenOwnProfile?.();
      return;
    }
    if (canOpenPublicProfile) onOpenProfile?.(row);
  }

  return (
    <article
      className={cn(
        "glass-card interactive-card flex items-center gap-3 rounded-2xl p-3",
        premium &&
          "border-warning/35 bg-gradient-to-r from-warning/10 via-surface to-brand/10 shadow-lg",
        isMe && "border-brand/45 ring-2 ring-brand/15",
      )}
    >
      <div
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-sm font-extrabold tabular-nums",
          premium && "bg-warning/15 text-warning",
        )}
      >
        {row.rank_position ?? "—"}º
      </div>

      <button
        type="button"
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 rounded-2xl text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          canOpenPublicProfile || canOpenOwnProfile ? "hover:text-brand" : "cursor-default",
        )}
        disabled={!canOpenPublicProfile && !canOpenOwnProfile}
        onClick={handleOpenProfile}
        aria-label={isMe ? "Abrir meu perfil" : `Abrir perfil de ${name}`}
      >
        <Avatar
          className={cn(
            "size-11 border border-border shadow-sm",
            premium && "border-warning/40 shadow-warning/10",
          )}
        >
          {row.avatar_url && <AvatarImage src={row.avatar_url} alt={name} />}
          <AvatarFallback className="bg-brand/15 font-extrabold text-brand">
            {rankingInitials(row)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate font-extrabold">
              {name}
              {isMe && <span className="ml-1 text-[10px] font-bold text-brand">VOCÊ</span>}
            </p>
            {premium && (
              <span className="shrink-0 rounded-full bg-warning/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-warning">
                VIP
              </span>
            )}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px] font-bold text-muted-foreground">
            <span
              className="inline-flex shrink-0 items-center gap-0.5"
              aria-label={`${row.bets_count ?? 0} palpites`}
            >
              <ListChecks className="size-3" aria-hidden="true" />
              {row.bets_count ?? 0}
            </span>
            <span aria-hidden="true">·</span>
            <span
              className="inline-flex shrink-0 items-center gap-0.5"
              aria-label={`${row.exact_scores_count ?? 0} exatos`}
            >
              <Target className="size-3" aria-hidden="true" />
              {row.exact_scores_count ?? 0}
            </span>
            <span aria-hidden="true">·</span>
            <span
              className="inline-flex shrink-0 items-center gap-0.5"
              aria-label={`${row.knockout_qualified_count ?? 0} classificados`}
            >
              <Trophy className="size-3" aria-hidden="true" />
              {row.knockout_qualified_count ?? 0}
            </span>
          </div>
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-2">
        <div className="space-y-1 text-right">
          <RankingMovementBadge movement={movement} />
          <p className="text-xl font-extrabold tabular-nums">{row.total_points ?? 0}</p>
          <p className="eyebrow text-[9px] text-muted-foreground">pontos</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 rounded-xl"
          disabled={!canOpenPublicProfile && !canOpenOwnProfile}
          onClick={handleOpenProfile}
          aria-label={isMe ? "Abrir meu perfil" : `Ver perfil de ${name}`}
        >
          <Eye className="size-4" />
        </Button>
      </div>
    </article>
  );
}

export function RankingMovementBadge({ movement }: { movement?: RankingMovement }) {
  if (movement === undefined || movement === 0) return null;

  const up = movement > 0;
  const value = Math.abs(movement);

  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] font-black tabular-nums"
      aria-label={up ? `Subiu ${value} posições` : `Desceu ${value} posições`}
    >
      <i
        className={up ? "bxf bx-caret-up" : "bxf bx-caret-down"}
        style={{ color: up ? "green" : "red" }}
        aria-hidden="true"
      />
      {value}
    </span>
  );
}
