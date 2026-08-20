export type MascotMood = "idle" | "wave" | "think" | "celebrate" | "worry" | "search" | "work";
export type MascotSize = "sm" | "md" | "lg" | "xl" | "hero";

type MascotProps = {
  mood?: MascotMood;
  size?: MascotSize;
  hoverWave?: boolean;
  className?: string;
  title?: string;
};

export function Mascot({
  mood = "idle",
  size = "md",
  hoverWave = false,
  className = "",
  title = "Lyfo, o companheiro do MyLyfe"
}: MascotProps) {
  return (
    <svg
      className={`mascot mascot--${size} mascot--${mood}${hoverWave ? " mascot--hover-wave" : ""}${className ? ` ${className}` : ""}`}
      viewBox="0 0 80 96"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <ellipse className="mascot-shadow" cx="40" cy="91" rx="16" ry="3.2" />
      <g className="mascot-sparkles" aria-hidden="true">
        <path d="M12 28 13.6 32.2 18 33.8 13.6 35.4 12 39.6 10.4 35.4 6 33.8 10.4 32.2Z" />
        <path d="M68 22 69.2 25.4 72.8 26.6 69.2 27.8 68 31.2 66.8 27.8 63.2 26.6 66.8 25.4Z" />
        <path d="M70 48 71 50.6 73.8 51.6 71 52.6 70 55.2 69 52.6 66.2 51.6 69 50.6Z" />
      </g>
      <path className="mascot-sweat" d="M59 34c0-3.4 3.6-3.6 3.6 0 0 2.8-1.8 5-3.6 6.2-1.8-1.2-3.6-3.4-3.6-6.2 0-3.6 3.6-3.4 3.6 0Z" />
      <g className="mascot-paper">
        <rect x="54" y="58" width="16" height="12" rx="2" />
        <path d="M57 62h10M57 65.5h7" />
      </g>
      <g className="mascot-figure">
        <g className="mascot-sprout">
          <path className="mascot-leaf mascot-leaf-left" d="M40 22c-1-8-10-11-13.4-5.2 4.2-.2 10 3.2 13.4 8.6Z" />
          <path className="mascot-leaf mascot-leaf-right" d="M40 22c1.2-9.2 12-10.6 14.6-3.8-4.4-.8-10.6 2.6-14.6 8.2Z" />
          <rect x="38.4" y="18" width="3.2" height="15" rx="1.6" />
        </g>
        <path className="mascot-arm mascot-arm-left" d="M20 54c-7 3.4-8.4 12.2-1.2 12" />
        <path className="mascot-arm mascot-arm-right" d="M60 54c7 3.4 8.4 12.2 1.2 12" />
        <g className="mascot-body">
          <ellipse cx="40" cy="58" rx="22.5" ry="25.5" />
          <ellipse className="mascot-belly" cx="40" cy="64" rx="13.5" ry="11.5" />
          <circle className="mascot-badge" cx="40" cy="66.5" r="3.1" />
          <ellipse className="mascot-cheek" cx="26.5" cy="58.5" rx="4.2" ry="2.6" />
          <ellipse className="mascot-cheek" cx="53.5" cy="58.5" rx="4.2" ry="2.6" />
          <g className="mascot-brows">
            <path className="mascot-brow mascot-brow-left" d="M28 46.2q4-2.2 8 .2" />
            <path className="mascot-brow mascot-brow-right" d="M44 46.4q4-2.2 8 0" />
          </g>
          <g className="mascot-eyes">
            <ellipse cx="32" cy="52.2" rx="3.3" ry="4.1" />
            <ellipse cx="48" cy="52.2" rx="3.3" ry="4.1" />
            <circle className="mascot-glint" cx="33.3" cy="50.6" r="1.15" />
            <circle className="mascot-glint" cx="49.3" cy="50.6" r="1.15" />
          </g>
          <g className="mascot-lids">
            <rect x="28" y="47.2" width="8.2" height="10" rx="4" />
            <rect x="44" y="47.2" width="8.2" height="10" rx="4" />
          </g>
          <path className="mascot-mouth mascot-mouth-smile" d="M35.5 62.2q4.5 5 9 0" />
          <ellipse className="mascot-mouth mascot-mouth-o" cx="40" cy="63.2" rx="2.8" ry="3.2" />
          <path className="mascot-mouth mascot-mouth-sad" d="M35.8 65.4q4.2-4.4 8.4 0" />
          <path className="mascot-mouth mascot-mouth-flat" d="M36 63h8" />
        </g>
        <g className="mascot-legs">
          <path className="mascot-leg mascot-leg-left" d="M33 81.5c0 5.4-3.2 7.6-1.4 8.2" />
          <path className="mascot-leg mascot-leg-right" d="M47 81.5c0 5.4 3.2 7.6 1.4 8.2" />
        </g>
      </g>
    </svg>
  );
}

export function BrandLockup({
  title,
  caption,
  mood = "idle"
}: {
  title: string;
  caption: string;
  mood?: MascotMood;
}) {
  return (
    <div className="brand-lockup">
      <div className="brand-mark" aria-hidden="true">
        <Mascot mood={mood} size="sm" hoverWave />
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
