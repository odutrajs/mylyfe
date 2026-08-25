export type MascotMood = "idle" | "wave" | "think" | "celebrate" | "worry" | "search" | "work";
export type MascotSize = "sm" | "md" | "lg" | "xl" | "hero";

export const zeloMascotSrc = "/mascots/zelo-mascot.png";
export const zeloHeaderMascotSrc = "/mascots/mascot-header.png";

type MascotProps = {
  mood?: MascotMood;
  size?: MascotSize;
  src?: string;
  hoverWave?: boolean;
  className?: string;
  title?: string;
};

export function Mascot({
  mood = "idle",
  size = "md",
  src = zeloMascotSrc,
  hoverWave = false,
  className = "",
  title = "Zelo, quem cuida da sua vida"
}: MascotProps) {
  return (
    <img
      src={src}
      alt={title}
      className={`mascot mascot--${size} mascot--${mood}${hoverWave ? " mascot--hover-wave" : ""} mascot--static${className ? ` ${className}` : ""}`}
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
        <Mascot mood={mood} size="md" />
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
