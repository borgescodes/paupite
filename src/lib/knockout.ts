export const KNOCKOUT_STAGES = [
  "round_of_32",
  "round_of_16",
  "quarterfinal",
  "semifinal",
  "third_place",
  "final",
] as const;

export type KnockoutStage = (typeof KNOCKOUT_STAGES)[number];
export type QualificationMethod = "regulation" | "extra_time" | "penalties";

export interface KnockoutScoringRules {
  stage_weights?: Record<string, number>;
  base_points?: Record<string, number>;
  team_multipliers?: Record<string, number>;
}

export interface KnockoutPredictionInput {
  homeScore: number;
  awayScore: number;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  qualifiedTeamId?: string | null;
  qualificationMethod?: QualificationMethod | null;
}

export interface KnockoutPointInput extends KnockoutPredictionInput {
  stage?: string | null;
  officialHomeScore: number;
  officialAwayScore: number;
  officialQualifiedTeamId?: string | null;
  officialQualificationMethod?: QualificationMethod | null;
  homeTeamExternalKey?: string | null;
  awayTeamExternalKey?: string | null;
  rules?: KnockoutScoringRules | null;
}

export const defaultKnockoutStageWeights: Record<KnockoutStage, number> = {
  round_of_32: 1,
  round_of_16: 2,
  quarterfinal: 3,
  semifinal: 4,
  third_place: 3,
  final: 6,
};

export const defaultKnockoutBasePoints = {
  exact_score: 3,
  regulation_result: 1,
  goal_difference: 1,
  qualified_team: 2,
  qualification_method: 1,
  perfect_combo: 1,
};

export const defaultSpecialPoints = {
  champion: 60,
  runner_up: 35,
  third_place: 25,
  top_scorer: 40,
  perfect_podium: 30,
};

export function normalizeKnockoutStage(stage?: string | null): KnockoutStage | null {
  if (!stage) return null;
  if (stage === "quarter_finals" || stage === "quarter-finals") return "quarterfinal";
  if (stage === "semi_finals" || stage === "semi-finals") return "semifinal";
  return KNOCKOUT_STAGES.includes(stage as KnockoutStage) ? (stage as KnockoutStage) : null;
}

export function isKnockoutStage(stage?: string | null) {
  return Boolean(normalizeKnockoutStage(stage));
}

export function knockoutStageLabel(stage?: string | null) {
  const labels: Record<KnockoutStage, string> = {
    round_of_32: "Fase de 32",
    round_of_16: "Oitavas",
    quarterfinal: "Quartas",
    semifinal: "Semifinal",
    third_place: "3º lugar",
    final: "Final",
  };
  const normalized = normalizeKnockoutStage(stage);
  return normalized ? labels[normalized] : null;
}

export function qualificationMethodLabel(method?: QualificationMethod | null) {
  const labels: Record<QualificationMethod, string> = {
    regulation: "Tempo regulamentar",
    extra_time: "Prorrogação",
    penalties: "Pênaltis",
  };
  return method ? labels[method] : "A definir";
}

export function parseBracketSource(value?: string | null) {
  if (!value) return null;
  const match = value.match(/^(winner|runner-up|loser)-match-(\d+)$/);
  if (!match) return null;
  const result = match[1] === "winner" ? "winner" : "loser";
  const matchNumber = Number(match[2]);
  return {
    result,
    matchNumber,
    label: result === "winner" ? `Vencedor Jogo ${matchNumber}` : `Perdedor Jogo ${matchNumber}`,
  };
}

export function isPlaceholderTeam(team?: { id?: string | null; placeholder?: boolean } | null) {
  return !team?.id || team.placeholder === true;
}

export function deriveKnockoutPredictionFields(input: KnockoutPredictionInput) {
  if (input.homeScore > input.awayScore) {
    return {
      qualifiedTeamId: input.homeTeamId ?? null,
      qualificationMethod:
        input.qualificationMethod === "regulation" || input.qualificationMethod === "extra_time"
          ? input.qualificationMethod
          : null,
      locked: true,
    };
  }

  if (input.awayScore > input.homeScore) {
    return {
      qualifiedTeamId: input.awayTeamId ?? null,
      qualificationMethod:
        input.qualificationMethod === "regulation" || input.qualificationMethod === "extra_time"
          ? input.qualificationMethod
          : null,
      locked: true,
    };
  }

  return {
    qualifiedTeamId: input.qualifiedTeamId ?? null,
    qualificationMethod: input.qualifiedTeamId ? ("penalties" as const) : null,
    locked: false,
  };
}

export function validateKnockoutPrediction(input: KnockoutPredictionInput) {
  if (!input.homeTeamId || !input.awayTeamId) {
    return "Palpites abrem quando o confronto for definido.";
  }

  if (!Number.isInteger(input.homeScore) || !Number.isInteger(input.awayScore)) {
    return "Informe um placar válido.";
  }

  if (input.homeScore < 0 || input.awayScore < 0 || input.homeScore > 99 || input.awayScore > 99) {
    return "Informe um placar válido entre 0 e 99.";
  }

  const derived = deriveKnockoutPredictionFields(input);

  if (input.homeScore !== input.awayScore) {
    if (input.qualifiedTeamId && input.qualifiedTeamId !== derived.qualifiedTeamId) {
      return "O classificado precisa seguir o placar informado.";
    }
    if (!input.qualificationMethod) {
      return "Escolha se a vitória foi no tempo regulamentar ou na prorrogação.";
    }
    if (
      !(["regulation", "extra_time"] as QualificationMethod[]).includes(input.qualificationMethod)
    ) {
      return "Vitória com placar diferente não pode ser por pênaltis.";
    }
    return null;
  }

  if (!input.qualifiedTeamId) return "Escolha quem se classifica.";
  if (![input.homeTeamId, input.awayTeamId].includes(input.qualifiedTeamId)) {
    return "Escolha um classificado válido.";
  }
  if (input.qualificationMethod && input.qualificationMethod !== "penalties") {
    return "Placar empatado exige definição por pênaltis.";
  }

  return null;
}

export function calculateKnockoutPoints(input: KnockoutPointInput) {
  const stage = normalizeKnockoutStage(input.stage);
  const baseRules = { ...defaultKnockoutBasePoints, ...input.rules?.base_points };
  const stageWeights = { ...defaultKnockoutStageWeights, ...input.rules?.stage_weights };
  const teamMultipliers = input.rules?.team_multipliers ?? {};

  const actualOutcome =
    input.officialQualificationMethod === "extra_time" ||
    input.officialQualificationMethod === "penalties"
      ? "draw"
      : outcome(input.officialHomeScore, input.officialAwayScore);
  const predictedOutcome =
    input.qualificationMethod === "extra_time" || input.qualificationMethod === "penalties"
      ? "draw"
      : outcome(input.homeScore, input.awayScore);
  const exactScore =
    input.homeScore === input.officialHomeScore && input.awayScore === input.officialAwayScore;
  const regulationResult = actualOutcome === predictedOutcome;
  const goalDifference =
    input.homeScore - input.awayScore === input.officialHomeScore - input.officialAwayScore;
  const qualifiedTeam =
    Boolean(input.officialQualifiedTeamId) &&
    input.qualifiedTeamId === input.officialQualifiedTeamId;
  const qualificationMethod =
    qualifiedTeam &&
    Boolean(input.officialQualificationMethod) &&
    input.qualificationMethod === input.officialQualificationMethod;
  const perfectCombo = exactScore && regulationResult && qualifiedTeam && qualificationMethod;

  let basePoints = 0;
  if (exactScore) basePoints += baseRules.exact_score;
  if (regulationResult) basePoints += baseRules.regulation_result;
  if (goalDifference) basePoints += baseRules.goal_difference;
  if (qualifiedTeam) basePoints += baseRules.qualified_team;
  if (qualificationMethod) basePoints += baseRules.qualification_method;
  if (perfectCombo) basePoints += baseRules.perfect_combo;

  const phaseWeight = stage ? stageWeights[stage] : 1;
  const teamMultiplier = Math.max(
    multiplierFor(teamMultipliers, input.homeTeamId, input.homeTeamExternalKey),
    multiplierFor(teamMultipliers, input.awayTeamId, input.awayTeamExternalKey),
    1,
  );

  return {
    exactScore,
    regulationResult,
    goalDifference,
    qualifiedTeam,
    qualificationMethod,
    perfectCombo,
    basePoints,
    phaseWeight,
    teamMultiplier,
    points: Math.round(basePoints * phaseWeight * teamMultiplier),
  };
}

function outcome(home: number, away: number) {
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}

function multiplierFor(
  multipliers: Record<string, number>,
  teamId?: string | null,
  externalKey?: string | null,
) {
  return Math.max(
    Number(multipliers[teamId ?? ""] ?? 1),
    Number(multipliers[externalKey ?? ""] ?? 1),
  );
}
