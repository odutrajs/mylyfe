export type MascotMood = "idle" | "wave" | "think" | "celebrate" | "worry" | "search" | "work";
export type MascotSize = "sm" | "md" | "lg" | "xl" | "hero";

export const zeloMascotSrc = "/mascots/zelo-mascot.png";

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
  title = "Zelo, quem cuida da sua vida"
}: MascotProps) {
  return (
    <img
      src={zeloMascotSrc}
      alt={title}
      className={`mascot mascot--${size} mascot--${mood}${hoverWave ? " mascot--hover-wave" : ""}${className ? ` ${className}` : ""}`}
    />
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
