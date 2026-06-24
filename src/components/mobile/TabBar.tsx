import * as React from "react";

import { cn } from "@/lib/utils";

export interface TabBarItem {
  key: string;
  label: string;
}

export interface TabBarProps {
  items: TabBarItem[];
  activeKey: string;
  onSelect?: (key: string) => void;
  className?: string;
}

function TabBar({ items, activeKey, onSelect, className }: TabBarProps) {
  return (
    <div className={cn("flex border-b bg-background", className)}>
      {items.map((item, index) => {
        const isActive = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect?.(item.key)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex-1 py-3 text-xs font-extrabold uppercase tracking-wide transition-colors",
              isActive ? "bg-brand text-brand-foreground" : "text-muted-foreground",
              index !== 0 && "border-l border-border",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export { TabBar };
