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
            variant: "default",
            className:
              "gap-1.5 px-2.5 py-1 text-[11px] tracking-normal hover:bg-primary hover:text-primary-foreground",
          })}
        >
          <NpmMark />
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

function NpmMark(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-3.5">
      <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474C23.214 24 24 23.214 24 22.237V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L11.99 19.15H5.113z" />
    </svg>
  );
}
