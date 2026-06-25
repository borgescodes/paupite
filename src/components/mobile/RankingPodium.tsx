import { BiSolidCrown } from "react-icons/bi";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { rankingInitials, rankingName, type RankingEntry } from "@/lib/ranking";

const positionStyles: Record<number, string> = {
  1: "order-1 col-span-2 mx-auto w-[58%] border-warning/50 bg-warning/10 sm:order-2 sm:col-span-1 sm:w-auto sm:-translate-y-4",
  2: "order-2 border-border bg-surface sm:order-1",
  3: "order-3 border-amber-700/25 bg-amber-700/5",
};

export function RankingPodium({
  rows,
  currentUserId,
}: {
  rows: RankingEntry[];
  currentUserId?: string;
}) {
  if (!rows.length) return null;

  return (
    <div className="grid grid-cols-2 items-end gap-2 pt-4 sm:grid-cols-3">
      {rows.slice(0, 3).map((row) => {
        const position = row.rank_position ?? 0;
        const name = rankingName(row);
        return (
          <article
            key={row.user_id}
            className={cn(
              "glass-card relative flex min-w-0 flex-col items-center rounded-3xl border p-3 text-center",
              positionStyles[position],
              row.user_id === currentUserId && "ring-2 ring-brand/30",
            )}
          >
            {position === 1 && (
              <BiSolidCrown className="absolute -top-4 size-7 text-warning drop-shadow" />
            )}
            <div
              className={cn(
                "mb-2 grid size-7 place-items-center rounded-full text-xs font-extrabold",
                position === 1
                  ? "bg-warning text-warning-foreground"
                  : position === 2
                    ? "bg-slate-300 text-slate-800"
                    : "bg-amber-700 text-white",
              )}
            >
              {position}º
            </div>
            <Avatar
              className={cn(
                "border-2 border-background shadow-lg",
                position === 1 ? "size-16" : "size-13",
              )}
            >
              {row.avatar_url && <AvatarImage src={row.avatar_url} alt={name} />}
              <AvatarFallback className="bg-brand/15 font-extrabold text-brand">
                {rankingInitials(row)}
              </AvatarFallback>
            </Avatar>
            <p className="mt-2 w-full truncate text-sm font-extrabold">{name}</p>
            <p className="text-lg font-extrabold tabular-nums text-brand">
              {row.total_points ?? 0} pts
            </p>
          </article>
        );
      })}
    </div>
  );
}
