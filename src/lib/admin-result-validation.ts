export type AdminResultQualificationMethod = "regulation" | "extra_time" | "penalties";
export type AdminResultStatus = "live" | "finished";

export interface AdminMatchResultInput {
  knockout: boolean;
  status: AdminResultStatus;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeScore: number;
  awayScore: number;
  regulationHomeScore?: number | null;
  regulationAwayScore?: number | null;
  qualifiedTeamId?: string | null;
  qualificationMethod?: AdminResultQualificationMethod | null;
}

export interface NormalizedAdminMatchResult {
  homeScore: number;
  awayScore: number;
  regulationHomeScore: number | null;
  regulationAwayScore: number | null;
  qualifiedTeamId: string | null;
  qualificationMethod: AdminResultQualificationMethod | null;
  status: AdminResultStatus;
}

export type AdminMatchResultValidation =
  | { ok: true; value: NormalizedAdminMatchResult }
  | { ok: false; error: string };

export const adminResultErrorMessages = {
  invalidMethod: "Método de classificação inválido.",
  invalidScoreInteger: "Placar deve ser número inteiro.",
  invalidScoreNegative: "Placar não pode ser negativo.",
  invalidScoreMax: "Placar deve ser menor que 100.",
  missingTeams: "Defina as duas seleções antes de lançar o resultado do mata-mata.",
  groupQualification: "Fase de grupos não permite classificado ou método de classificação.",
  missingMethod: "Partida mata-mata encerrada sem qualification_method.",
  missingQualifiedTeam: "Partida mata-mata encerrada sem qualified_team_id.",
  invalidQualifiedTeam: "Classificado não pertence à partida.",
  regulationTie: "Partida decidida no tempo regulamentar precisa ter vencedor no placar final.",
  regulationWinnerMismatch: "Classificado diferente do vencedor em tempo regulamentar.",
  regulationScoreMismatch:
    "Campos dos 90 minutos devem corresponder ao placar final em tempo regulamentar.",
  missingRegulationScore: "Informe placar aos 90 minutos.",
  extraTimeRegulationNotTied:
    "Partida decidida na prorrogação precisa estar empatada ao fim dos 90 minutos.",
  extraTimeFinalTied: "Partida decidida na prorrogação precisa ter vencedor após 120 minutos.",
  extraTimeWinnerMismatch: "Classificado diferente do vencedor na prorrogação.",
  penaltiesMissingQualifiedTeam: "Informe seleção classificada na disputa de pênaltis.",
  penaltiesFinalNotTied:
    "No campo de placar, informe resultado após 120 minutos, sem incluir cobranças de pênaltis.",
  penaltiesRegulationNotTied:
    "Partida decidida nos pênaltis precisa estar empatada ao fim dos 90 minutos.",
} as const;

export function validateAdminMatchResult(
  input: AdminMatchResultInput,
): AdminMatchResultValidation {
  const scoreError = validateScore(input.homeScore) ?? validateScore(input.awayScore);
  if (scoreError) return { ok: false, error: scoreError };

  if (input.status === "live") {
    return {
      ok: true,
      value: {
        homeScore: input.homeScore,
        awayScore: input.awayScore,
        regulationHomeScore: null,
        regulationAwayScore: null,
        qualifiedTeamId: null,
        qualificationMethod: null,
        status: "live",
      },
    };
  }

  if (!input.knockout) {
    if (
      input.qualifiedTeamId ||
      input.qualificationMethod ||
      input.regulationHomeScore != null ||
      input.regulationAwayScore != null
    ) {
      return { ok: false, error: adminResultErrorMessages.groupQualification };
    }

    return {
      ok: true,
      value: {
        homeScore: input.homeScore,
        awayScore: input.awayScore,
        regulationHomeScore: null,
        regulationAwayScore: null,
        qualifiedTeamId: null,
        qualificationMethod: null,
        status: "finished",
      },
    };
  }

  if (!input.homeTeamId || !input.awayTeamId) {
    return { ok: false, error: adminResultErrorMessages.missingTeams };
  }

  if (!isQualificationMethod(input.qualificationMethod)) {
    return {
      ok: false,
      error: input.qualificationMethod
        ? adminResultErrorMessages.invalidMethod
        : adminResultErrorMessages.missingMethod,
    };
  }

  if (input.qualificationMethod === "regulation") {
    return validateRegulationResult(input);
  }

  if (input.qualificationMethod === "extra_time") {
    return validateExtraTimeResult(input);
  }

  return validatePenaltiesResult(input);
}

function validateRegulationResult(input: AdminMatchResultInput): AdminMatchResultValidation {
  const winnerId = winnerFor(input.homeScore, input.awayScore, input.homeTeamId!, input.awayTeamId!);
  if (!winnerId) return { ok: false, error: adminResultErrorMessages.regulationTie };
  if (!input.qualifiedTeamId) {
    return { ok: false, error: adminResultErrorMessages.missingQualifiedTeam };
  }
  if (!isMatchTeam(input.qualifiedTeamId, input)) {
    return { ok: false, error: adminResultErrorMessages.invalidQualifiedTeam };
  }
  if (input.qualifiedTeamId !== winnerId) {
    return { ok: false, error: adminResultErrorMessages.regulationWinnerMismatch };
  }

  if (
    hasRegulationScore(input) &&
    (input.regulationHomeScore !== input.homeScore || input.regulationAwayScore !== input.awayScore)
  ) {
    return { ok: false, error: adminResultErrorMessages.regulationScoreMismatch };
  }

  return {
    ok: true,
    value: {
      homeScore: input.homeScore,
      awayScore: input.awayScore,
      regulationHomeScore: input.homeScore,
      regulationAwayScore: input.awayScore,
      qualifiedTeamId: winnerId,
      qualificationMethod: "regulation",
      status: "finished",
    },
  };
}

function validateExtraTimeResult(input: AdminMatchResultInput): AdminMatchResultValidation {
  const regulationError = validateRequiredRegulationScore(input);
  if (regulationError) return { ok: false, error: regulationError };
  if (input.regulationHomeScore !== input.regulationAwayScore) {
    return { ok: false, error: adminResultErrorMessages.extraTimeRegulationNotTied };
  }

  const winnerId = winnerFor(input.homeScore, input.awayScore, input.homeTeamId!, input.awayTeamId!);
  if (!winnerId) return { ok: false, error: adminResultErrorMessages.extraTimeFinalTied };
  if (!input.qualifiedTeamId) {
    return { ok: false, error: adminResultErrorMessages.missingQualifiedTeam };
  }
  if (!isMatchTeam(input.qualifiedTeamId, input)) {
    return { ok: false, error: adminResultErrorMessages.invalidQualifiedTeam };
  }
  if (input.qualifiedTeamId !== winnerId) {
    return { ok: false, error: adminResultErrorMessages.extraTimeWinnerMismatch };
  }

  return {
    ok: true,
    value: {
      homeScore: input.homeScore,
      awayScore: input.awayScore,
      regulationHomeScore: input.regulationHomeScore!,
      regulationAwayScore: input.regulationAwayScore!,
      qualifiedTeamId: winnerId,
      qualificationMethod: "extra_time",
      status: "finished",
    },
  };
}

function validatePenaltiesResult(input: AdminMatchResultInput): AdminMatchResultValidation {
  const regulationError = validateRequiredRegulationScore(input);
  if (regulationError) return { ok: false, error: regulationError };
  if (input.regulationHomeScore !== input.regulationAwayScore) {
    return { ok: false, error: adminResultErrorMessages.penaltiesRegulationNotTied };
  }
  if (input.homeScore !== input.awayScore) {
    return { ok: false, error: adminResultErrorMessages.penaltiesFinalNotTied };
  }
  if (!input.qualifiedTeamId) {
    return { ok: false, error: adminResultErrorMessages.penaltiesMissingQualifiedTeam };
  }
  if (!isMatchTeam(input.qualifiedTeamId, input)) {
    return { ok: false, error: adminResultErrorMessages.invalidQualifiedTeam };
  }

  return {
    ok: true,
    value: {
      homeScore: input.homeScore,
      awayScore: input.awayScore,
      regulationHomeScore: input.regulationHomeScore!,
      regulationAwayScore: input.regulationAwayScore!,
      qualifiedTeamId: input.qualifiedTeamId,
      qualificationMethod: "penalties",
      status: "finished",
    },
  };
}

function validateRequiredRegulationScore(input: AdminMatchResultInput) {
  if (
    input.regulationHomeScore === null ||
    input.regulationHomeScore === undefined ||
    input.regulationAwayScore === null ||
    input.regulationAwayScore === undefined
  ) {
    return adminResultErrorMessages.missingRegulationScore;
  }

  return validateScore(input.regulationHomeScore) ?? validateScore(input.regulationAwayScore);
}

function validateScore(value: number) {
  if (!Number.isInteger(value)) return adminResultErrorMessages.invalidScoreInteger;
  if (value < 0) return adminResultErrorMessages.invalidScoreNegative;
  if (value > 99) return adminResultErrorMessages.invalidScoreMax;
  return null;
}

function hasRegulationScore(input: AdminMatchResultInput) {
  return input.regulationHomeScore != null || input.regulationAwayScore != null;
}

function winnerFor(
  homeScore: number,
  awayScore: number,
  homeTeamId: string,
  awayTeamId: string,
) {
  if (homeScore > awayScore) return homeTeamId;
  if (awayScore > homeScore) return awayTeamId;
  return null;
}

function isMatchTeam(teamId: string, input: AdminMatchResultInput) {
  return teamId === input.homeTeamId || teamId === input.awayTeamId;
}

function isQualificationMethod(
  value: AdminMatchResultInput["qualificationMethod"],
): value is AdminResultQualificationMethod {
  return value === "regulation" || value === "extra_time" || value === "penalties";
}
