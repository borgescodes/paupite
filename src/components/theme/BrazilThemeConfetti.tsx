import { useEffect, useState, type CSSProperties } from "react";

import { BRAZIL_THEME_EVENT, type BrazilThemeEventDetail } from "@/hooks/use-theme";

const colors = ["#009739", "#ffdf00", "#002776", "#ffffff"];
const easings = ["cubic-bezier(.22,1,.36,1)", "cubic-bezier(.34,1.56,.64,1)", "ease-out"];
const shapes = ["rect", "circle", "ribbon"] as const;

type ConfettiShape = (typeof shapes)[number];

type Piece = {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  rotate: number;
  duration: number;
  ease: string;
  color: string;
  shape: ConfettiShape;
  size: number;
};

type Burst = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pieces: Piece[];
};

function createPieces(seed: number, origin: BrazilThemeEventDetail): Piece[] {
  const count = 24 + Math.floor(Math.random() * 10);

  return Array.from({ length: count }, (_, index) => {
    const angle = ((Math.PI * 2) / count) * index + (Math.random() - 0.5) * 0.75;
    const distance = 36 + Math.random() * 84;
    const shape = shapes[Math.floor(Math.random() * shapes.length)];

    return {
      id: seed + index,
      x: origin.x,
      y: origin.y,
      tx: Math.cos(angle) * distance,
      ty: Math.sin(angle) * distance - 28 - Math.random() * 28,
      rotate: (Math.random() - 0.5) * 720,
      duration: 1.15 + Math.random() * 0.8,
      ease: easings[Math.floor(Math.random() * easings.length)],
      color: colors[Math.floor(Math.random() * colors.length)],
      shape,
      size: 4 + Math.random() * 6,
    };
  });
}

function createBurst(origin: BrazilThemeEventDetail): Burst {
  const id = Date.now();
  return {
    id,
    x: origin.x,
    y: origin.y,
    width: origin.width,
    height: origin.height,
    pieces: createPieces(id, origin),
  };
}

export function BrazilThemeConfetti() {
  const [burst, setBurst] = useState<Burst | null>(null);

  useEffect(() => {
    const handleBurst = (event: Event) => {
      const detail = (event as CustomEvent<BrazilThemeEventDetail>).detail;
      const nextBurst = createBurst(
        detail ?? { x: window.innerWidth / 2, y: 160, width: 120, height: 52 },
      );
      setBurst(nextBurst);
      window.setTimeout(() => {
        setBurst((current) => (current?.id === nextBurst.id ? null : current));
      }, 2400);
    };

    window.addEventListener(BRAZIL_THEME_EVENT, handleBurst);
    return () => window.removeEventListener(BRAZIL_THEME_EVENT, handleBurst);
  }, []);

  if (!burst) return null;

  return (
    <div className="brazil-confetti" aria-hidden="true">
      <span
        className="brazil-confetti-ripple"
        style={
          {
            left: `${burst.x}px`,
            top: `${burst.y}px`,
            width: `${burst.width}px`,
            height: `${burst.height}px`,
          } as CSSProperties
        }
      />
      {burst.pieces.map((piece) => {
        const isRibbon = piece.shape === "ribbon";
        const isCircle = piece.shape === "circle";

        return (
          <span
            key={piece.id}
            className="brazil-confetti-piece"
            style={
              {
                left: `${piece.x}px`,
                top: `${piece.y}px`,
                width: `${isRibbon ? piece.size * 0.42 : piece.size}px`,
                height: `${isRibbon ? piece.size * 2.4 : piece.size}px`,
                borderRadius: isCircle ? "50%" : isRibbon ? "1px" : "2px",
                "--tx": `${piece.tx}px`,
                "--ty": `${piece.ty}px`,
                "--rotate": `${piece.rotate}deg`,
                "--duration": `${piece.duration}s`,
                "--ease": piece.ease,
                "--confetti-color": piece.color,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
