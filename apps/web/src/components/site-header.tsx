import type { JSX, ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { BrandMark } from "./brand-mark";
import { OutboundLinks } from "./outbound-links";
import { HAZUMI_VERSION, NPM_URL } from "../lib/site";
import { badgeVariants } from "./ui/badge";
import { cn } from "../lib/utils";

const links = [
  { to: "/examples", label: "Examples" },
  { to: "/reference", label: "Reference" },
  { to: "/playground", label: "Playground" },
] as const;

export function SiteHeader({ children }: { readonly children?: ReactNode }): JSX.Element {
  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-5 sm:px-8">
        <Link
          to="/"
          className="flex items-center gap-3 font-display text-lg font-semibold tracking-tight"
        >
          <BrandMark />
          Hazumi
        </Link>
        <a
          href={NPM_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`hazumi ${HAZUMI_VERSION} on npm`}
          className={badgeVariants({
            variant: "outline",
            className:
              "hidden hover:border-muted-foreground/60 hover:text-foreground sm:inline-flex",
          })}
        >
          {HAZUMI_VERSION}
        </a>
        <nav className="hidden items-center gap-4 text-sm sm:flex" aria-label="Primary">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  "transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
          <OutboundLinks />
          {children === undefined ? null : children}
        </div>
      </div>
    </header>
  );
}
