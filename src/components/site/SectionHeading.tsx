import { cn } from "@/lib/utils";

/**
 * §4.2 — a section label is a mono string carrying real information
 * (`03 / selected work / 2022–2026`), never a tracked-out decorative eyebrow.
 */
export function SectionLabel({
  index,
  label,
  meta,
  className,
}: {
  index: string;
  label: string;
  meta?: string;
  className?: string;
}) {
  return (
    <p className={cn("label-mono", className)}>
      <span className="text-signal">{index}</span>
      {" / "}
      {label}
      {meta ? ` / ${meta}` : null}
    </p>
  );
}

export function SectionHeading({
  id,
  index,
  label,
  meta,
  title,
  children,
  className,
}: {
  id: string;
  index: string;
  label: string;
  meta?: string;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4", className)}>
      <SectionLabel index={index} label={label} meta={meta} />
      {title ? (
        <h2 id={`${id}-title`} className="font-display text-section">
          {title}
        </h2>
      ) : null}
      {children}
    </header>
  );
}
