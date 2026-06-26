import { useEffect, useState, type CSSProperties } from "react";

import { BRAZIL_THEME_EVENT } from "@/hooks/use-theme";

const colors = ["#009739", "#ffdf00", "#002776", "#ffffff"];

type Piece = {
  id: number;
  x: number;
  drift: number;
  delay: number;
  duration: number;
  rotate: number;
  color: string;
};

function createPieces(seed: number): Piece[] {
  return Array.from({ length: 42 }, (_, index) => ({
    id: seed + index,
    x: Math.random() * 100,
    drift: Math.random() * 32 - 16,
    delay: Math.random() * 0.28,
    duration: 1.25 + Math.random() * 0.75,
    rotate: Math.random() * 420 - 210,
    color: colors[index % colors.length],
  }));
}

export function BrazilThemeConfetti() {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    const burst = () => {
      const seed = Date.now();
      setPieces(createPieces(seed));
      window.setTimeout(() => {
        setPieces((current) => (current.some((piece) => piece.id >= seed) ? [] : current));
      }, 2400);
    };

    window.addEventListener(BRAZIL_THEME_EVENT, burst);
    return () => window.removeEventListener(BRAZIL_THEME_EVENT, burst);
  }, []);

  if (!pieces.length) return null;

  return (
    <div className="brazil-confetti" aria-hidden="true">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          style={
            {
              "--x": `${piece.x}vw`,
              "--drift": `${piece.drift}vw`,
              "--delay": `${piece.delay}s`,
              "--duration": `${piece.duration}s`,
              "--rotate": `${piece.rotate}deg`,
              "--confetti-color": piece.color,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
