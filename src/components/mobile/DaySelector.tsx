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
  const containerRef = React.useRef<HTMLDivElement>(null);
  const buttonRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const scrollTimerRef = React.useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const ignoreScrollSyncUntilRef = React.useRef(0);
  const selectedDateRef = React.useRef(selectedDate);

  React.useEffect(() => {
    selectedDateRef.current = selectedDate;
    ignoreScrollSyncUntilRef.current = Date.now() + 450;
    buttonRefs.current[selectedDate]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [selectedDate]);

  React.useEffect(
    () => () => {
      if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
    },
    [],
  );

  const syncSelectedDateFromScroll = React.useCallback(() => {
    if (Date.now() < ignoreScrollSyncUntilRef.current) return;

    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const containerCenter = containerRect.left + containerRect.width / 2;
    let closestDate = selectedDateRef.current;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const day of days) {
      const button = buttonRefs.current[day.date];
      if (!button) continue;
      const buttonRect = button.getBoundingClientRect();
      const buttonCenter = buttonRect.left + buttonRect.width / 2;
      const distance = Math.abs(buttonCenter - containerCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestDate = day.date;
      }
    }

    if (closestDate && closestDate !== selectedDateRef.current) onSelect?.(closestDate);
  }, [days, onSelect]);

  const handleScroll = React.useCallback(() => {
    if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = window.setTimeout(syncSelectedDateFromScroll, 120);
  }, [syncSelectedDateFromScroll]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={cn(
        "no-scrollbar sticky top-[65px] z-20 flex snap-x snap-mandatory items-stretch gap-2 overflow-x-auto overscroll-x-contain scroll-smooth border-b border-border/60 bg-background/75 px-3 py-2.5 backdrop-blur-xl",
        className,
      )}
    >
      {days.map((day) => {
        const isSelected = day.date === selectedDate;
        return (
          <button
            key={day.date}
            ref={(node) => {
              buttonRefs.current[day.date] = node;
            }}
            type="button"
            onClick={() => {
              selectedDateRef.current = day.date;
              ignoreScrollSyncUntilRef.current = Date.now() + 450;
              onSelect?.(day.date);
            }}
            aria-current={isSelected ? "date" : undefined}
            className={cn(
              "tap-feedback flex min-w-[4.5rem] shrink-0 snap-center scroll-mx-3 flex-col items-center gap-0.5 rounded-2xl px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35",
              isSelected
                ? "bg-brand text-brand-foreground shadow-lg shadow-brand/20 hover:bg-brand hover:text-brand-foreground active:bg-brand"
                : "bg-muted/55 text-muted-foreground hover:bg-brand/10 hover:text-foreground active:bg-brand/10",
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
