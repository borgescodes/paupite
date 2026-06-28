import { Eye } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { rankingInitials, rankingName, type RankingEntry } from "@/lib/ranking";

export function RankingRow({
  row,
  isMe,
  onOpenProfile,
  onOpenOwnProfile,
}: {
  row: RankingEntry;
  isMe?: boolean;
  onOpenProfile?: (row: RankingEntry) => void;
  onOpenOwnProfile?: () => void;
}) {
  const name = rankingName(row);
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
        isMe && "border-brand/45 ring-2 ring-brand/15",
      )}
    >
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-sm font-extrabold tabular-nums">
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
        aria-label={isMe ? "Abrir meu perfil" : `Abrir perfil público de ${name}`}
      >
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
          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Perfil público
          </p>
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-2">
        <div className="text-right">
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
          aria-label={isMe ? "Abrir meu perfil" : `Ver perfil público de ${name}`}
        >
          <Eye className="size-4" />
        </Button>
      </div>
    </article>
  );
}
