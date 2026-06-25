import * as React from "react";
import { BiSolidDownArrow, BiSolidUpArrow } from "react-icons/bi";

import { cn } from "@/lib/utils";
import { Flag } from "@/components/mobile/Flag";
import type { ScoreValue, TeamInfo } from "@/components/mobile/types";

export interface ScoreStepperProps {
  home: TeamInfo;
  away: TeamInfo;
  value: ScoreValue;
  onChange?: (value: ScoreValue) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  className?: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function TeamTag({ team }: { team: TeamInfo }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
      <Flag code={team.flagCode} label={team.shortName} size="lg" className="shadow-md" />
      <span className="text-sm font-extrabold uppercase text-foreground">{team.shortName}</span>
    </div>
  );
}

function ScoreColumn({
  value,
  disabled,
  onIncrement,
  onDecrement,
}: {
  value: number;
  disabled?: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-muted/65 p-1.5">
      <button
        type="button"
        disabled={disabled}
        onClick={onIncrement}
        aria-label="Aumentar placar"
        className="tap-feedback grid size-8 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
      >
        <BiSolidUpArrow className="size-3.5" />
      </button>
      <span className="w-10 text-center text-4xl font-extrabold tabular-nums text-foreground">
        {value}
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={onDecrement}
        aria-label="Diminuir placar"
        className="tap-feedback grid size-8 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
      >
        <BiSolidDownArrow className="size-3.5" />
      </button>
    </div>
  );
}

function ScoreStepper({
  home,
  away,
  value,
  onChange,
  disabled,
  min = 0,
  max = 99,
  className,
}: ScoreStepperProps) {
  function step(side: "home" | "away", delta: number) {
    if (disabled || !onChange) return;
    onChange({ ...value, [side]: clamp(value[side] + delta, min, max) });
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-2xl bg-background/45 p-2",
        className,
      )}
    >
      <TeamTag team={home} />
      <ScoreColumn
        value={value.home}
        disabled={disabled}
        onIncrement={() => step("home", 1)}
        onDecrement={() => step("home", -1)}
      />
      <ScoreColumn
        value={value.away}
        disabled={disabled}
        onIncrement={() => step("away", 1)}
        onDecrement={() => step("away", -1)}
      />
      <TeamTag team={away} />
    </div>
  );
}

export { ScoreStepper };
