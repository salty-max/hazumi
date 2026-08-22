import type { JSX, ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { BrandMark } from "./brand-mark";
import { Badge } from "./ui/badge";
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
        <Badge variant="outline" className="hidden sm:inline-flex">
          0.1 · pre-alpha
        </Badge>
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
        {children === undefined ? null : (
          <div className="ml-auto flex min-w-0 items-center gap-2">{children}</div>
        )}
      </div>
    </header>
  );
}
