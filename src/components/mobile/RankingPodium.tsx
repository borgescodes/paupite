import { BiSolidCrown } from "react-icons/bi";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  rankingInitials,
  rankingName,
  type RankingEntry,
  type RankingMode,
  type RankingMovement,
} from "@/lib/ranking";
import { RankingMovementBadge } from "@/components/mobile/RankingRow";

const positionStyles: Record<number, string> = {
  1: "order-1 col-span-2 mx-auto w-[58%] border-warning/50 bg-warning/10 sm:order-2 sm:col-span-1 sm:w-auto sm:-translate-y-4",
  2: "order-2 border-border bg-surface sm:order-1",
  3: "order-3 border-amber-700/25 bg-amber-700/5",
};

export function RankingPodium({
  rows,
  currentUserId,
  variant = "free",
  movementByUserId,
  onOpenProfile,
  onOpenOwnProfile,
}: {
  rows: RankingEntry[];
  currentUserId?: string;
  variant?: RankingMode;
  movementByUserId?: Record<string, RankingMovement>;
  onOpenProfile?: (row: RankingEntry) => void;
  onOpenOwnProfile?: () => void;
}) {
  if (!rows.length) return null;

  return (
    <div className="grid grid-cols-2 items-end gap-2 pt-4 sm:grid-cols-3">
      {rows.slice(0, 3).map((row, index) => {
        const position = index + 1;
        const name = rankingName(row);
        const isMe = row.user_id === currentUserId;
        const canOpenPublicProfile = Boolean(row.user_id && !isMe && onOpenProfile);
        const canOpenOwnProfile = Boolean(isMe && onOpenOwnProfile);
        const premium = variant === "pool";
        const movement = row.user_id ? movementByUserId?.[row.user_id] : undefined;

        function handleOpenProfile() {
          if (canOpenOwnProfile) {
            onOpenOwnProfile?.();
            return;
          }
          if (canOpenPublicProfile) onOpenProfile?.(row);
        }

        return (
          <article
            key={row.user_id}
            className={cn(
              "glass-card relative flex min-w-0 flex-col items-center rounded-3xl border p-3 text-center",
              positionStyles[position],
              premium &&
                "border-warning/40 bg-gradient-to-b from-warning/15 via-surface to-brand/10 shadow-lg",
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
            <button
              type="button"
              className={cn(
                "flex w-full min-w-0 flex-col items-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring",
                canOpenPublicProfile || canOpenOwnProfile ? "hover:text-brand" : "cursor-default",
              )}
              onClick={handleOpenProfile}
              disabled={!canOpenPublicProfile && !canOpenOwnProfile}
              aria-label={isMe ? "Abrir meu perfil" : `Abrir perfil de ${name}`}
            >
              <Avatar
                className={cn(
                  "border-2 border-background shadow-lg",
                  position === 1 ? "size-16" : "size-13",
                  premium && "border-warning/35 shadow-warning/10",
                )}
              >
                {row.avatar_url && <AvatarImage src={row.avatar_url} alt={name} />}
                <AvatarFallback className="bg-brand/15 font-extrabold text-brand">
                  {rankingInitials(row)}
                </AvatarFallback>
              </Avatar>
              <p className="mt-2 w-full truncate text-sm font-extrabold">
                {name}
                {isMe && <span className="ml-1 text-[10px] font-bold text-brand">VOCÊ</span>}
              </p>
              {premium && (
                <span className="mt-1 rounded-full bg-warning/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-warning">
                  VIP
                </span>
              )}
            </button>
            <div className="mt-1 flex items-center gap-2">
              <RankingMovementBadge movement={movement} />
              <p className="text-lg font-extrabold tabular-nums text-brand">
                {row.total_points ?? 0} pts
              </p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
