import * as React from "react";
import type { IconType } from "react-icons";

import { cn } from "@/lib/utils";

export interface TabBarItem {
  key: string;
  label: string;
  icon: IconType;
}

export interface TabBarProps {
  items: TabBarItem[];
  activeKey: string;
  onSelect?: (key: string) => void;
  className?: string;
}

function TabBar({ items, activeKey, onSelect, className }: TabBarProps) {
  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      <div className="glass-card mx-auto flex max-w-xl rounded-[1.4rem] p-1.5 shadow-2xl">
        {items.map((item) => {
          const isActive = item.key === activeKey;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect?.(item.key)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "tap-feedback flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-2 text-[10px] font-extrabold transition-colors",
                isActive
                  ? "bg-brand text-brand-foreground shadow-lg shadow-brand/20"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export { TabBar };
