export type MascotMood = "idle" | "wave" | "think" | "celebrate" | "worry" | "search" | "work";
export type MascotSize = "sm" | "md" | "lg" | "xl" | "hero";

type MascotProps = {
  mood?: MascotMood;
  size?: MascotSize;
  hoverWave?: boolean;
  className?: string;
  title?: string;
};

export function ZeloMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Zelo">
      <defs>
        <linearGradient id="zelo-mark-fill" x1="8" y1="6" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#37C978" />
          <stop offset="0.55" stopColor="#0878F9" />
          <stop offset="1" stopColor="#102A4C" />
        </linearGradient>
      </defs>
      <path
        d="M24 4c7 0 12 3 15 8 4 6 6 10 4 16-2 8-8 16-19 16S5 36 5 26C5 16 12 4 24 4Z"
        fill="url(#zelo-mark-fill)"
      />
      <path d="M26 7c3-1 8 2 7 7-3-2-7-2-9-1 1-3 1-5 2-6Z" fill="#37C978" />
      <path d="M16 28.5 24 22l8 6.5V36a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2Z" fill="#102A4C" />
      <path d="M24 30.6c2.4-2.2 5.8.2 3.4 2.6-1 .9-2.2 1.6-3.4 2.4-1.2-.8-2.4-1.5-3.4-2.4-2.4-2.4 1-4.8 3.4-2.6Z" fill="#FFFFFF" />
    </svg>
  );
}

export function Mascot({
  mood = "idle",
  size = "md",
  hoverWave = false,
  className = "",
  title = "Zelo, quem cuida da sua vida"
}: MascotProps) {
  return (
    <img
      className={`mascot mascot--${size} mascot--${mood}${hoverWave ? " mascot--hover-wave" : ""}${className ? ` ${className}` : ""}`}
      src="/zelo-mascot.png"
      alt={title}
    />
  );
}

export function BrandLockup({
  title,
  caption
}: {
  title: string;
  caption: string;
  mood?: MascotMood;
}) {
  return (
    <div className="brand-lockup">
      <div className="brand-mark" aria-hidden="true">
        <ZeloMark />
      </div>
      <div>
        <strong>{title}</strong>
        <span>{caption}</span>
      </div>
    </div>
  );
}

export function mascotMoodFromScore(band: string): MascotMood {
  if (band === "excellent" || band === "healthy") return "celebrate";
  if (band === "attention" || band === "critical") return "worry";
  return "idle";
}

export function mascotMoodFromCommitment(status: string): MascotMood {
  if (status === "healthy") return "celebrate";
  if (status === "high" || status === "critical") return "worry";
  return "idle";
}
