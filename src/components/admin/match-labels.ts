import { knockoutStageLabel } from "@/lib/knockout";

export const matchStageOptions = [
  { value: "group_stage", label: "Fase de grupos" },
  { value: "round_of_32", label: "Fase de 32" },
  { value: "round_of_16", label: "Oitavas" },
  { value: "quarterfinal", label: "Quartas" },
  { value: "semifinal", label: "Semifinal" },
  { value: "third_place", label: "3º lugar" },
  { value: "final", label: "Final" },
] as const;

export const resultStatusOptions = [
  { value: "live", label: "Em andamento" },
  { value: "finished", label: "Encerrado" },
  { value: "closed", label: "Pontuação calculada" },
  { value: "scored", label: "Pontuada" },
] as const;

export function matchStageLabel(stage: string | null | undefined) {
  if (!stage) return "Fase a definir";
  return knockoutStageLabel(stage) ? "Eliminatórias" : stageLabelFallback(stage);
}

function stageLabelFallback(stage: string) {
  return (
    matchStageOptions.find((option) => option.value === stage)?.label ?? stage.replaceAll("_", " ")
  );
}

export function matchStatusLabel(status: string, future: boolean) {
  if (status === "canceled") return "Cancelada";
  if (status === "scored") return "Pontuada";
  if (status === "closed") return "Pontuação calculada";
  if (status === "finished") return "Encerrado";
  if (status === "live") return "Em andamento";
  if (status === "locked") return "Bloqueada";
  if (status === "open") return "Aberta";
  if (future) return "Aberto para palpite";
  return "Agendado";
}
