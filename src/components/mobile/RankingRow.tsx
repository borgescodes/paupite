import { BiBullseye, BiCheckDouble } from "react-icons/bi";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { rankingInitials, rankingName, type RankingEntry } from "@/lib/ranking";

export function RankingRow({ row, isMe }: { row: RankingEntry; isMe?: boolean }) {
  const name = rankingName(row);

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
        </div>
      </div>
      <div className="text-right">
        <p className="text-xl font-extrabold tabular-nums">{row.total_points ?? 0}</p>
        <p className="eyebrow text-[9px] text-muted-foreground">pontos</p>
      </div>
    </article>
  );
}
