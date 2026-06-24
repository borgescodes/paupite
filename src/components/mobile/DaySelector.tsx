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
        "no-scrollbar flex items-start gap-5 overflow-x-auto bg-muted/60 px-4 py-3",
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
            className="flex shrink-0 flex-col items-center gap-0.5"
          >
            <span
              className={cn(
                "font-extrabold uppercase leading-none tracking-tight transition-all",
                isSelected ? "text-3xl text-brand" : "text-xl text-muted-foreground/70",
              )}
            >
              {day.label}
            </span>
            <span className="text-[11px] text-muted-foreground">{day.phaseLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

export { DaySelector };
