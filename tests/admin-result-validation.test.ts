import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  validateAdminMatchResult,
  type AdminMatchResultInput,
} from "../src/lib/admin-result-validation.js";

const HOME = "home-team-id";
const AWAY = "away-team-id";
const OTHER = "other-team-id";

function input(overrides: Partial<AdminMatchResultInput> = {}): AdminMatchResultInput {
  return {
    knockout: true,
    status: "finished",
    homeTeamId: HOME,
    awayTeamId: AWAY,
    homeScore: 0,
    awayScore: 0,
    regulationHomeScore: null,
    regulationAwayScore: null,
    qualifiedTeamId: null,
    qualificationMethod: null,
    ...overrides,
  };
}

function expectValid(
  value: AdminMatchResultInput,
): Extract<ReturnType<typeof validateAdminMatchResult>, { ok: true }>["value"] {
  const result = validateAdminMatchResult(value);
  if (!result.ok) assert.fail(result.error);
  return result.value;
}

function expectInvalid(value: AdminMatchResultInput, message: string) {
  const result = validateAdminMatchResult(value);
  if (result.ok) assert.fail("Expected validation to fail.");
  assert.equal(result.error, message);
}

describe("validateAdminMatchResult", () => {
  it("allows group matches to finish tied without qualification fields", () => {
    assert.deepEqual(
      expectValid(
        input({
          knockout: false,
          homeScore: 2,
          awayScore: 2,
        }),
      ),
      {
        homeScore: 2,
        awayScore: 2,
        regulationHomeScore: null,
        regulationAwayScore: null,
        qualifiedTeamId: null,
        qualificationMethod: null,
        status: "finished",
      },
    );
  });

  it("accepts a regulation knockout winner and normalizes 90-minute fields to the final score", () => {
    assert.deepEqual(
      expectValid(
        input({
          homeScore: 2,
          awayScore: 1,
          qualifiedTeamId: HOME,
          qualificationMethod: "regulation",
        }),
      ),
      {
        homeScore: 2,
        awayScore: 1,
        regulationHomeScore: 2,
        regulationAwayScore: 1,
        qualifiedTeamId: HOME,
        qualificationMethod: "regulation",
        status: "finished",
      },
    );
  });

  it("rejects a tied regulation knockout result", () => {
    expectInvalid(
      input({
        homeScore: 1,
        awayScore: 1,
        qualifiedTeamId: HOME,
        qualificationMethod: "regulation",
      }),
      "Partida decidida no tempo regulamentar precisa ter vencedor no placar final.",
    );
  });

  it("accepts an extra-time knockout winner after a tied 90-minute score", () => {
    assert.deepEqual(
      expectValid(
        input({
          homeScore: 2,
          awayScore: 1,
          regulationHomeScore: 1,
          regulationAwayScore: 1,
          qualifiedTeamId: HOME,
          qualificationMethod: "extra_time",
        }),
      ),
      {
        homeScore: 2,
        awayScore: 1,
        regulationHomeScore: 1,
        regulationAwayScore: 1,
        qualifiedTeamId: HOME,
        qualificationMethod: "extra_time",
        status: "finished",
      },
    );
  });

  it("rejects extra time when the 90-minute score is not tied", () => {
    expectInvalid(
      input({
        homeScore: 2,
        awayScore: 1,
        regulationHomeScore: 1,
        regulationAwayScore: 0,
        qualifiedTeamId: HOME,
        qualificationMethod: "extra_time",
      }),
      "Partida decidida na prorrogação precisa estar empatada ao fim dos 90 minutos.",
    );
  });

  it("rejects extra time when the 120-minute score is still tied", () => {
    expectInvalid(
      input({
        homeScore: 2,
        awayScore: 2,
        regulationHomeScore: 1,
        regulationAwayScore: 1,
        qualifiedTeamId: HOME,
        qualificationMethod: "extra_time",
      }),
      "Partida decidida na prorrogação precisa ter vencedor após 120 minutos.",
    );
  });

  it("accepts penalties only when the match remains tied after extra time", () => {
    assert.deepEqual(
      expectValid(
        input({
          homeScore: 1,
          awayScore: 1,
          regulationHomeScore: 1,
          regulationAwayScore: 1,
          qualifiedTeamId: AWAY,
          qualificationMethod: "penalties",
        }),
      ),
      {
        homeScore: 1,
        awayScore: 1,
        regulationHomeScore: 1,
        regulationAwayScore: 1,
        qualifiedTeamId: AWAY,
        qualificationMethod: "penalties",
        status: "finished",
      },
    );
  });

  it("rejects penalty shootout counts entered as the official final score", () => {
    expectInvalid(
      input({
        homeScore: 5,
        awayScore: 4,
        regulationHomeScore: 1,
        regulationAwayScore: 1,
        qualifiedTeamId: HOME,
        qualificationMethod: "penalties",
      }),
      "No campo de placar, informe resultado após 120 minutos, sem incluir cobranças de pênaltis.",
    );
  });

  it("rejects qualified teams outside the match", () => {
    expectInvalid(
      input({
        homeScore: 1,
        awayScore: 1,
        regulationHomeScore: 1,
        regulationAwayScore: 1,
        qualifiedTeamId: OTHER,
        qualificationMethod: "penalties",
      }),
      "Classificado não pertence à partida.",
    );
  });

  it("rejects a knockout finish without qualification method", () => {
    expectInvalid(
      input({
        homeScore: 2,
        awayScore: 1,
        qualifiedTeamId: HOME,
        qualificationMethod: null,
      }),
      "Partida mata-mata encerrada sem qualification_method.",
    );
  });

  it("rejects a penalty finish without a qualified team", () => {
    expectInvalid(
      input({
        homeScore: 1,
        awayScore: 1,
        regulationHomeScore: 1,
        regulationAwayScore: 1,
        qualifiedTeamId: null,
        qualificationMethod: "penalties",
      }),
      "Informe seleção classificada na disputa de pênaltis.",
    );
  });

  it("rejects qualification that conflicts with a regulation winner", () => {
    expectInvalid(
      input({
        homeScore: 2,
        awayScore: 1,
        qualifiedTeamId: AWAY,
        qualificationMethod: "regulation",
      }),
      "Classificado diferente do vencedor em tempo regulamentar.",
    );
  });

  it("rejects qualification that conflicts with an extra-time winner", () => {
    expectInvalid(
      input({
        homeScore: 2,
        awayScore: 1,
        regulationHomeScore: 1,
        regulationAwayScore: 1,
        qualifiedTeamId: AWAY,
        qualificationMethod: "extra_time",
      }),
      "Classificado diferente do vencedor na prorrogação.",
    );
  });

  it("rejects negative and non-integer scores with specific messages", () => {
    expectInvalid(input({ homeScore: -1, awayScore: 0 }), "Placar não pode ser negativo.");
    expectInvalid(input({ homeScore: 1.5, awayScore: 0 }), "Placar deve ser número inteiro.");
  });
});
