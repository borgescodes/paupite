import * as React from "react";

import { cn } from "@/lib/utils";

export interface FlagProps {
  code: string;
  label?: string;
  size?: "sm" | "lg";
  className?: string;
}

const sizeClasses: Record<NonNullable<FlagProps["size"]>, string> = {
  sm: "h-5 w-7",
  lg: "h-11 w-16 sm:h-12 sm:w-[4.5rem]",
};

function Flag({ code, label, size = "sm", className }: FlagProps) {
  return (
    <img
      src={`/flags/${code}.svg`}
      alt={label ?? code.toUpperCase()}
      className={cn(
        "rounded-md border border-border/70 object-cover",
        sizeClasses[size],
        className,
      )}
    />
  );
}

export { Flag };
