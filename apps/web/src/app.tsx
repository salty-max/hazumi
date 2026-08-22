import { lazy, Suspense, type JSX } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { SiteFooter } from "./components/site-footer";
import { SiteHeader } from "./components/site-header";
import { cn } from "./lib/utils";
import { HomePage } from "./pages/home";

const PlaygroundPage = lazy(async () => {
  const mod = await import("./pages/playground");
  return { default: mod.PlaygroundPage };
});
const ExamplesPage = lazy(async () => {
  const mod = await import("./pages/examples");
  return { default: mod.ExamplesPage };
});
const ReferencePage = lazy(async () => {
  const mod = await import("./pages/reference");
  return { default: mod.ReferencePage };
});

function PageFallback(): JSX.Element {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      Loading…
    </div>
  );
}

function SiteShell({
  children,
  className = "site-page min-h-dvh",
}: {
  readonly children: JSX.Element;
  readonly className?: string;
}): JSX.Element {
  return (
    <div className={cn("flex flex-col", className)}>
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/playground"
          element={
            <Suspense fallback={<PageFallback />}>
              <PlaygroundPage />
            </Suspense>
          }
        />
        <Route
          path="/"
          element={
            <SiteShell>
              <HomePage />
            </SiteShell>
          }
        />
        <Route
          path="/examples"
          element={
            <SiteShell>
              <Suspense fallback={<PageFallback />}>
                <ExamplesPage />
              </Suspense>
            </SiteShell>
          }
        />
        <Route
          path="/reference"
          element={
            <SiteShell className="min-h-dvh bg-background">
              <Suspense fallback={<PageFallback />}>
                <ReferencePage />
              </Suspense>
            </SiteShell>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
