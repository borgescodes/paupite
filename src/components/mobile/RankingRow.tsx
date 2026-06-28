import { BiBullseye, BiCheckDouble } from "react-icons/bi";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { rankingInitials, rankingName, type RankingEntry } from "@/lib/ranking";

export function RankingRow({
  row,
  isMe,
  onOpenProfile,
}: {
  row: RankingEntry;
  isMe?: boolean;
  onOpenProfile?: (row: RankingEntry) => void;
}) {
  const name = rankingName(row);
  const canOpenProfile = Boolean(row.user_id && !isMe && onOpenProfile);
  const playerContent = (
    <>
      <Avatar className="size-11 border border-border shadow-sm">
        {row.avatar_url && <AvatarImage src={row.avatar_url} alt={name} />}
        <AvatarFallback className="bg-brand/15 font-extrabold text-brand">
          {rankingInitials(row)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-extrabold">
          {name}
          {isMe && <span className="ml-1 text-[10px] font-bold text-brand">VOCÊ</span>}
        </p>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <BiBullseye className="size-3.5" />
            {row.exact_scores_count ?? 0} exatos
          </span>
          <span className="inline-flex items-center gap-1">
            <BiCheckDouble className="size-3.5" />
            {row.outcome_hits_count ?? 0} resultados
          </span>
          <span className="inline-flex items-center gap-1">
            <BiCheckDouble className="size-3.5" />
            {row.knockout_qualified_count ?? 0} classificados
          </span>
          <span className="inline-flex items-center gap-1">
            <BiBullseye className="size-3.5" />
            {row.special_points ?? 0} especiais
          </span>
        </div>
      </div>
    </>
  );

  return (
    <article
      className={cn(
        "glass-card interactive-card flex items-center gap-3 rounded-2xl p-3",
        isMe && "border-brand/45 ring-2 ring-brand/15",
      )}
    >
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-sm font-extrabold tabular-nums">
        {row.rank_position ?? "—"}º
      </div>
      {canOpenProfile ? (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl text-left outline-none transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onOpenProfile?.(row)}
          aria-label={`Abrir perfil público de ${name}`}
        >
          {playerContent}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{playerContent}</div>
      )}
      <div className="text-right">
        <p className="text-xl font-extrabold tabular-nums">{row.total_points ?? 0}</p>
        <p className="eyebrow text-[9px] text-muted-foreground">pontos</p>
      </div>
    </article>
  );
}
