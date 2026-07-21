import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { RetrospectiveModal } from "@/components/retrospective/RetrospectiveModal";
import {
  fetchArchivedCompetition,
  fetchRetrospective,
  markRetrospectiveViewed,
} from "@/lib/retrospective";

const OPEN_EVENT = "paupite:open-retrospective";

/**
 * Dispara a abertura manual da retrospectiva de qualquer lugar do app.
 */
export function openRetrospective() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

interface RetrospectiveGateProps {
  userId: string | null | undefined;
  /** Quando true, tenta abrir automaticamente uma vez se o usuário ainda não viu. */
  autoOpen?: boolean;
}

export function RetrospectiveGate({ userId, autoOpen = false }: RetrospectiveGateProps) {
  const [open, setOpen] = useState(false);
  const [autoTried, setAutoTried] = useState(false);

  const competitionQuery = useQuery({
    queryKey: ["archived-competition"],
    queryFn: fetchArchivedCompetition,
    staleTime: 60_000,
    enabled: Boolean(userId),
  });

  const competition = competitionQuery.data ?? null;

  const dataQuery = useQuery({
    queryKey: ["retrospective", userId, competition?.id],
    queryFn: () => fetchRetrospective(userId!, competition!),
    enabled: Boolean(userId && competition),
    staleTime: 30_000,
  });

  // Abertura automática (uma vez por sessão + só se nunca visto).
  useEffect(() => {
    if (autoTried || !autoOpen) return;
    if (!userId || !competition || !dataQuery.data) return;
    setAutoTried(true);
    if (!dataQuery.data.alreadyViewed) {
      setOpen(true);
      void markRetrospectiveViewed(userId, competition.id);
    }
  }, [autoOpen, autoTried, competition, dataQuery.data, userId]);

  // Abertura manual via evento.
  useEffect(() => {
    if (!userId || !competition) return;
    function handler() {
      setOpen(true);
      if (userId && competition) {
        void markRetrospectiveViewed(userId, competition.id);
      }
    }
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, [competition, userId]);

  if (!userId || !competition || !dataQuery.data) return null;

  return (
    <RetrospectiveModal
      open={open}
      onClose={() => setOpen(false)}
      userId={userId}
      data={dataQuery.data}
    />
  );
}

/**
 * Retorna se existe uma competição arquivada — usado para mostrar botão
 * "Ver retrospectiva" no perfil.
 */
export function useHasArchivedCompetition() {
  const { data } = useQuery({
    queryKey: ["archived-competition"],
    queryFn: fetchArchivedCompetition,
    staleTime: 60_000,
  });
  return Boolean(data);
}
