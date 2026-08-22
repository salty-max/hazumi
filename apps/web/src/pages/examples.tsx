import { bloodMage } from "../../../../examples/blood-mage";
import { characters } from "../../../../examples/characters";
import { flowField } from "../../../../examples/flow-field";
import { gridWaves } from "../../../../examples/grid-waves";
import { imageGrid } from "../../../../examples/image-grid";
import { mouseTrail } from "../../../../examples/mouse-trail";
import { orbits } from "../../../../examples/orbits";
import { petals } from "../../../../examples/petals";
import { postBloom } from "../../../../examples/post-bloom";
import { rigidBodies } from "../../../../examples/rigid-bodies";
import { staticPoster } from "../../../../examples/static-poster";
import { tileField } from "../../../../examples/tile-field";
import { typeSpecimen } from "../../../../examples/type-specimen";
import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { Container } from "../components/container";
import { PageHeader } from "../components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { cn } from "../lib/utils";

interface RunningScene {
  stop(): void;
}

const SCENES: ReadonlyArray<{
  readonly name: string;
  readonly run: (parent: HTMLElement) => RunningScene;
}> = [
  { name: "flow field", run: flowField },
  { name: "orbits", run: orbits },
  { name: "mouse trail", run: mouseTrail },
  { name: "grid waves", run: gridWaves },
  { name: "static poster", run: staticPoster },
  { name: "type specimen", run: typeSpecimen },
  { name: "image grid", run: imageGrid },
  { name: "post bloom", run: postBloom },
  { name: "petals", run: petals },
  { name: "tile field", run: tileField },
  { name: "characters", run: characters },
  { name: "blood mage", run: bloodMage },
  { name: "rigid bodies", run: rigidBodies },
];

function SceneCard({
  name,
  run,
  onReady,
}: {
  readonly name: string;
  readonly run: (parent: HTMLElement) => RunningScene;
  readonly onReady: (name: string, app: RunningScene | null) => void;
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    host.replaceChildren();
    let app: RunningScene | null = null;
    try {
      app = run(host);
      onReady(name, app);
    } catch (caught) {
      setError(String(caught));
      onReady(name, null);
    }
    return (): void => {
      app?.stop();
      onReady(name, null);
    };
  }, [name, onReady, run]);

  return (
    <Card className="transition hover:-translate-y-0.5 hover:border-primary/50">
      <CardHeader
        className={cn(
          "gap-2.5 font-mono text-[0.65rem] font-semibold tracking-[0.08em] uppercase",
          error === null ? "text-muted-foreground" : "text-destructive",
        )}
      >
        <span className="size-1.5 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
        <CardTitle>{error === null ? name : `${name} — failed`}</CardTitle>
      </CardHeader>
      <CardContent
        ref={hostRef}
        className="grid min-h-[300px] place-items-center overflow-hidden bg-[radial-gradient(oklch(0.35_0.015_255_/_0.32)_0.7px,transparent_0.7px)] bg-size-[16px_16px] p-3"
      />
    </Card>
  );
}

export function ExamplesPage(): JSX.Element {
  const appsRef = useRef(new Map<string, RunningScene>());
  const onReady = useCallback((name: string, app: RunningScene | null): void => {
    if (app === null) appsRef.current.delete(name);
    else appsRef.current.set(name, app);
  }, []);

  useEffect(() => {
    const target = window as unknown as {
      galleryReady: boolean;
      apps: Map<string, RunningScene>;
    };
    target.galleryReady = true;
    target.apps = appsRef.current;
    return (): void => {
      target.galleryReady = false;
    };
  }, []);

  return (
    <main>
      <Container className="py-16">
        <PageHeader title="Examples">{SCENES.length} scenes, running in the page.</PageHeader>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SCENES.map((scene) => (
            <SceneCard key={scene.name} name={scene.name} run={scene.run} onReady={onReady} />
          ))}
        </div>
      </Container>
    </main>
  );
}
