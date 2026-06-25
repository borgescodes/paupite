import * as React from "react";

import { cn } from "@/lib/utils";
import type { DayOption } from "@/components/mobile/types";

export interface DaySelectorProps {
  days: DayOption[];
  selectedDate: string;
  onSelect?: (date: string) => void;
  className?: string;
}

function DaySelector({ days, selectedDate, onSelect, className }: DaySelectorProps) {
  const activeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedDate]);

  return (
    <div
      className={cn(
        "no-scrollbar sticky top-[65px] z-20 flex items-stretch gap-2 overflow-x-auto border-b border-border/60 bg-background/75 px-3 py-2.5 backdrop-blur-xl",
        className,
      )}
    >
      {days.map((day) => {
        const isSelected = day.date === selectedDate;
        return (
          <button
            key={day.date}
            ref={isSelected ? activeRef : undefined}
            type="button"
            onClick={() => onSelect?.(day.date)}
            aria-current={isSelected ? "date" : undefined}
            className={cn(
              "tap-feedback flex min-w-[4.5rem] shrink-0 flex-col items-center gap-0.5 rounded-2xl px-3 py-2 transition-colors",
              isSelected
                ? "bg-brand text-brand-foreground shadow-lg shadow-brand/20"
                : "bg-muted/55 text-muted-foreground hover:bg-accent",
            )}
          >
            <span
              className={cn(
                "text-lg font-extrabold uppercase leading-none tracking-tight transition-all",
                isSelected ? "text-brand-foreground" : "text-foreground/75",
              )}
            >
              {day.label}
            </span>
            <span className={cn("text-[10px]", isSelected ? "text-brand-foreground/80" : "")}>
              {day.phaseLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export { DaySelector };
