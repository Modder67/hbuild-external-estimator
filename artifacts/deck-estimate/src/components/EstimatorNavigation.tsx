import { Bath, Hammer, Layers3, Warehouse } from "lucide-react";
import { Link } from "wouter";

type Estimator = "deck" | "flooring" | "bathroom" | "basement";

const estimators = [
  { id: "deck", label: "Deck", href: "/", icon: Hammer },
  { id: "flooring", label: "Flooring", href: "/flooring", icon: Layers3 },
  { id: "bathroom", label: "Bathroom", href: "/bathroom", icon: Bath },
  { id: "basement", label: "Basement", href: "/basement", icon: Warehouse },
] as const;

export function EstimatorNavigation({ active }: { active: Estimator }) {
  return (
    <nav
      aria-label="Estimate builders"
      className="w-full border-b border-border bg-card/80"
      data-testid="navigation-estimators"
    >
      <div className="mx-auto max-w-4xl px-3 py-3 sm:px-4 sm:py-4">
        <div className="mb-2.5 flex items-center gap-3 px-1 sm:mb-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.19em] text-primary">
            Your project
          </span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
          <span className="hidden text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground sm:inline">
            Select an estimator
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1.5 sm:gap-2" role="group" aria-label="Project type">
          {estimators.map(({ id, label, href, icon: Icon }) => {
            const isActive = active === id;
            return (
              <Link
                key={id}
                href={href}
                aria-current={isActive ? "page" : undefined}
                aria-label={`${label} estimator`}
                data-testid={`link-estimator-${id}`}
                className={[
                  "group relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-1.5 py-2 text-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-14 sm:flex-row sm:gap-2.5 sm:px-3",
                  isActive
                    ? "border-primary/50 bg-primary/12 text-primary shadow-[inset_0_1px_0_hsl(var(--primary)/0.12)]"
                    : "border-border/80 bg-background/50 text-muted-foreground hover:border-primary/35 hover:bg-accent hover:text-foreground",
                ].join(" ")}
              >
                <Icon
                  aria-hidden="true"
                  className={[
                    "h-[18px] w-[18px] shrink-0 transition-colors duration-200 sm:h-[19px] sm:w-[19px]",
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-primary",
                  ].join(" ")}
                  strokeWidth={1.8}
                />
                <span className="truncate text-[10px] font-semibold leading-tight tracking-tight min-[375px]:text-[11px] sm:text-sm">
                  {label}
                </span>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-5 -bottom-px h-[2px] rounded-full bg-primary"
                  />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}