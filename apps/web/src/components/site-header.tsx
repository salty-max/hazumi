import { Menu, X } from "lucide-react";
import { useEffect, useState, type JSX, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { BrandMark } from "./brand-mark";
import { OutboundLinks } from "./outbound-links";
import { HAZUMI_VERSION, NPM_URL } from "../lib/site";
import { Button } from "./ui/button";
import { badgeVariants } from "./ui/badge";
import { cn } from "../lib/utils";

const links = [
  { to: "/examples", label: "Examples" },
  { to: "/reference", label: "Reference" },
  { to: "/playground", label: "Playground" },
] as const;

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "transition-colors",
    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
  );
}

export function SiteHeader({ children }: { readonly children?: ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  // Navigating is the most common way to leave the menu, and leaving it open
  // over the new page reads as the app being stuck.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return (): void => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-5 sm:px-8">
        <Link
          to="/"
          aria-label="Hazumi home"
          className="flex items-center gap-3 font-display text-lg font-semibold tracking-tight"
        >
          <BrandMark />
          {/* The wordmark is the first thing worth dropping on a narrow screen:
              a page with its own toolbar needs those ~110px more than the name
              does, and the mark still says whose site this is. */}
          <span className="hidden sm:inline">Hazumi</span>
        </Link>
        <a
          href={NPM_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`hazumi ${HAZUMI_VERSION} on npm`}
          // Merged through `cn` rather than passed into the variant: cva
          // concatenates, so `hidden` and the variant's own `inline-flex` would
          // both survive and the stylesheet order would decide which wins.
          className={cn(
            badgeVariants({
              variant: "default",
              className:
                "gap-1.5 px-2.5 py-1 text-[11px] tracking-normal hover:bg-primary hover:text-primary-foreground",
            }),
            "hidden sm:inline-flex",
          )}
        >
          <NpmMark />
          {HAZUMI_VERSION}
        </a>
        <nav className="hidden items-center gap-4 text-sm sm:flex" aria-label="Primary">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} className={navLinkClass}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
          <OutboundLinks className="hidden sm:flex" />
          <Button
            variant="ghost"
            size="icon"
            className="order-first sm:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="primary-menu"
            onClick={() => setOpen((wasOpen) => !wasOpen)}
          >
            {open ? <X /> : <Menu />}
          </Button>
          {children === undefined ? null : children}
        </div>
      </div>
      {open ? (
        <nav
          id="primary-menu"
          aria-label="Primary"
          className="border-t border-border/60 px-5 pb-3 text-sm sm:hidden"
        >
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => cn(navLinkClass({ isActive }), "block py-2.5")}
            >
              {link.label}
            </NavLink>
          ))}
          <div className="mt-1 flex items-center gap-2 border-t border-border/60 pt-2">
            <OutboundLinks />
            <a
              href={NPM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              hazumi {HAZUMI_VERSION} on npm
            </a>
          </div>
        </nav>
      ) : null}
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
