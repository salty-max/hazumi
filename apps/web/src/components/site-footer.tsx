import type { JSX } from "react";
import { Container } from "./container";
import { OutboundLinks } from "./outbound-links";

export function SiteFooter(): JSX.Element {
  return (
    <footer className="mt-auto border-t border-border/60">
      <Container className="flex flex-col items-start justify-between gap-4 py-8 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground">MIT. Pre-alpha.</p>
        <OutboundLinks labeled />
      </Container>
    </footer>
  );
}
