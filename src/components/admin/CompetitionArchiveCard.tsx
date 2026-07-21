import { useCallback, useEffect, useState } from "react";
import { BiArchive, BiRefresh } from "react-icons/bi";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

interface Competition {
  id: string;
  name: string;
  season: string | null;
  status: string;
  archived_at: string | null;
  archived_by: string | null;
}

export function CompetitionArchiveCard() {
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveText, setArchiveText] = useState("");
  const [unarchiveOpen, setUnarchiveOpen] = useState(false);
  const [unarchiveText, setUnarchiveText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("competitions")
      .select("id,name,season,status,archived_at,archived_by")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    setCompetition((data ?? null) as Competition | null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const archived = competition?.status === "archived";

  async function callArchive() {
    if (!competition) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_archive_competition", {
        _competition_id: competition.id,
      });
      if (error) throw new Error(error.message);
      toast.success("Copa arquivada. Jogadores verão a retrospectiva.");
      setArchiveOpen(false);
      setArchiveText("");
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Falha ao arquivar.");
    } finally {
      setBusy(false);
    }
  }

  async function callUnarchive() {
    if (!competition) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_unarchive_competition", {
        _competition_id: competition.id,
      });
      if (error) throw new Error(error.message);
      toast.success("Copa reaberta.");
      setUnarchiveOpen(false);
      setUnarchiveText("");
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Falha ao reabrir.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !competition) return null;

  return (
    <Card className="glass-card border-warning/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BiArchive className="size-5 text-warning" />
          Encerramento oficial da Copa
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-2xl bg-muted/45 p-3 text-sm">
          <p className="font-bold">
            {competition.name}
            {competition.season ? ` • ${competition.season}` : ""}
          </p>
          <p className="mt-1 text-muted-foreground">
            Status: <strong className="text-foreground">{archived ? "Arquivada" : "Ativa"}</strong>
            {archived && competition.archived_at && (
              <>
                {" "}
                — arquivada em {new Date(competition.archived_at).toLocaleString("pt-BR")}
              </>
            )}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Arquivar congela partidas, palpites e ranking. Ninguém pode alterar resultados ou
            recalcular. Snapshots históricos e dados dos jogadores permanecem intactos.
            Jogadores verão a retrospectiva automaticamente no próximo acesso.
          </p>
        </div>

        {!archived ? (
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => {
              setArchiveText("");
              setArchiveOpen(true);
            }}
          >
            <BiArchive className="size-4" />
            Encerrar e arquivar Copa
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setUnarchiveText("");
              setUnarchiveOpen(true);
            }}
          >
            <BiRefresh className="size-4" />
            Reabrir Copa arquivada
          </Button>
        )}
      </CardContent>

      <AlertDialog
        open={archiveOpen}
        onOpenChange={(next) => {
          if (!next && !busy) {
            setArchiveOpen(false);
            setArchiveText("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar e arquivar a Copa?</AlertDialogTitle>
            <AlertDialogDescription>
              Depois de arquivada, ninguém poderá alterar partidas, resultados, palpites ou
              recalcular pontuação. Ranking final fica congelado. Esta ação não apaga dados e
              pode ser revertida apenas manualmente por superadmin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label>Digite "ENCERRAR" para confirmar</Label>
            <Input value={archiveText} onChange={(e) => setArchiveText(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || archiveText !== "ENCERRAR"}
              onClick={(e) => {
                e.preventDefault();
                void callArchive();
              }}
            >
              Encerrar Copa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={unarchiveOpen}
        onOpenChange={(next) => {
          if (!next && !busy) {
            setUnarchiveOpen(false);
            setUnarchiveText("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reabrir Copa arquivada?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso libera edição de partidas e palpites novamente. Nenhum dado histórico é
              alterado. Use apenas para corrigir um arquivamento acidental.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label>Digite "REABRIR" para confirmar</Label>
            <Input value={unarchiveText} onChange={(e) => setUnarchiveText(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || unarchiveText !== "REABRIR"}
              onClick={(e) => {
                e.preventDefault();
                void callUnarchive();
              }}
            >
              Reabrir Copa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
