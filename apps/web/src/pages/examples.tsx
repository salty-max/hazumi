import { bloodMage } from "../../../../examples/blood-mage";
import { bike } from "../../../../examples/bike";
import { chain } from "../../../../examples/chain";
import { characters } from "../../../../examples/characters";
import { flowField } from "../../../../examples/flow-field";
import { gridWaves } from "../../../../examples/grid-waves";
import { imageGrid } from "../../../../examples/image-grid";
import { mouseTrail } from "../../../../examples/mouse-trail";
import { orbits } from "../../../../examples/orbits";
import { sparks } from "../../../../examples/particles";
import { petals } from "../../../../examples/petals";
import { postBloom } from "../../../../examples/post-bloom";
import { raycaster } from "../../../../examples/raycaster";
import { rigidBodies } from "../../../../examples/rigid-bodies";
import { shmup } from "../../../../examples/shmup";
import { staticPoster } from "../../../../examples/static-poster";
import { tileField } from "../../../../examples/tile-field";
import { typeSpecimen } from "../../../../examples/type-specimen";
import { Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { Container } from "../components/container";
import { PageHeader } from "../components/page-header";
import { AspectRatio } from "../components/ui/aspect-ratio";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { cn } from "../lib/utils";

interface RunningScene {
  stop(): void;
}

interface SceneSpec {
  readonly name: string;
  readonly run: (parent: HTMLElement) => RunningScene;
  /** Skip autoplay: thousands of shapes, extra passes, or a WebGL hog. */
  readonly heavy?: boolean;
  /** Still shown under the Run overlay. Capture with `bun run capture:examples`. */
  readonly preview?: string;
}

const PREVIEW = "/examples/assets/previews";

const SCENES: readonly SceneSpec[] = [
  { name: "flow field", run: flowField, heavy: true, preview: `${PREVIEW}/flow-field.png` },
  { name: "orbits", run: orbits },
  { name: "mouse trail", run: mouseTrail },
  { name: "particles", run: sparks },
  { name: "grid waves", run: gridWaves, heavy: true, preview: `${PREVIEW}/grid-waves.png` },
  { name: "static poster", run: staticPoster },
  { name: "type specimen", run: typeSpecimen },
  { name: "image grid", run: imageGrid },
  { name: "post bloom", run: postBloom, heavy: true, preview: `${PREVIEW}/post-bloom.png` },
  { name: "petals", run: petals, heavy: true, preview: `${PREVIEW}/petals.png` },
  { name: "tile field", run: tileField },
  { name: "characters", run: characters, heavy: true, preview: `${PREVIEW}/characters.png` },
  { name: "blood mage", run: bloodMage, heavy: true, preview: `${PREVIEW}/blood-mage.png` },
  { name: "rigid bodies", run: rigidBodies },
  { name: "chain", run: chain },
  { name: "bike", run: bike },
  { name: "starfall", run: shmup, heavy: true, preview: `${PREVIEW}/starfall.png` },
  { name: "raycaster", run: raycaster, heavy: true, preview: `${PREVIEW}/raycaster.png` },
];

function SceneCard({
  name,
  run,
  heavy = false,
  preview,
  onReady,
}: SceneSpec & {
  readonly onReady: (name: string, app: RunningScene | null) => void;
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(!heavy);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!running) return;
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
  }, [name, onReady, run, running]);

  return (
    <Card className="transition hover:-translate-y-0.5 hover:border-primary/50">
      <CardHeader
        className={cn(
          "gap-2.5 font-mono text-[0.65rem] font-semibold tracking-[0.08em] uppercase",
          error === null ? "text-muted-foreground" : "text-destructive",
        )}
      >
        <span
          className={
            running && error === null
              ? "size-1.5 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]"
              : "size-1.5 rounded-full bg-muted-foreground/35"
          }
        />
        <CardTitle>{error === null ? name : `${name} — failed`}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-hidden p-0">
        <AspectRatio ratio={1}>
          {!running && preview !== undefined ? (
            <img
              src={preview}
              alt=""
              width={600}
              height={600}
              decoding="async"
              aria-hidden="true"
              className="absolute inset-0 size-full object-cover"
            />
          ) : null}
          <div
            ref={hostRef}
            className={cn(
              "absolute inset-0 grid place-items-center",
              running
                ? "bg-[radial-gradient(oklch(0.35_0.015_255_/_0.32)_0.7px,transparent_0.7px)] bg-size-[16px_16px]"
                : undefined,
            )}
          />
          {!running && error === null ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-md">
              <Button type="button" onClick={() => setRunning(true)} aria-label={`Run ${name}`}>
                <Play className="fill-current" />
                Run
              </Button>
            </div>
          ) : null}
        </AspectRatio>
      </CardContent>
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
        <PageHeader title="Examples">
          {SCENES.length} scenes. The heavy ones wait for a click.
        </PageHeader>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SCENES.map((scene) => (
            <SceneCard key={scene.name} {...scene} onReady={onReady} />
          ))}
        </div>
      </Container>
    </main>
  );
}
