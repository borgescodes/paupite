import { useEffect, useState } from "react";
import { BiTime } from "react-icons/bi";

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function calcTimeLeft(target: Date): TimeLeft | null {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function ComingSoonCountdown({
  opensAt,
  message,
}: {
  opensAt: string | null;
  message: string | null;
}) {
  const target = opensAt ? new Date(opensAt) : null;
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(
    target ? calcTimeLeft(target) : null,
  );

  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setTimeLeft(calcTimeLeft(target)), 1_000);
    return () => clearInterval(id);
  }, [target]);

  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div className="grid size-16 place-items-center rounded-3xl bg-brand/10 text-brand">
        <BiTime className="size-8" />
      </div>

      <div>
        <p className="text-xl font-extrabold tracking-tight">Em breve</p>
        {message && <p className="mt-1 text-sm text-muted-foreground">{message}</p>}
      </div>

      {target && timeLeft && (
        <div className="flex gap-3">
          {[
            { label: "dias", value: timeLeft.days },
            { label: "horas", value: timeLeft.hours },
            { label: "min", value: timeLeft.minutes },
            { label: "seg", value: timeLeft.seconds },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="flex min-w-14 flex-col items-center gap-1 rounded-2xl bg-muted px-3 py-2"
            >
              <span className="text-2xl font-extrabold tabular-nums slashed-zero">{pad(value)}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {label}
              </span>
            </div>
          ))}
        </div>
      )}

      {target && !timeLeft && (
        <p className="text-sm font-bold text-success">As inscrições estão abertas! Recarregue.</p>
      )}

      {!target && (
        <p className="text-sm text-muted-foreground">Data de abertura a definir.</p>
      )}
    </div>
  );
}
