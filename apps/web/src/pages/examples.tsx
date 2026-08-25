import { bloodMage } from "../../../../examples/blood-mage";
import { bike } from "../../../../examples/bike";
import { chain } from "../../../../examples/chain";
import { dungeon } from "../../../../examples/dungeon";
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
import { typeSpecimen } from "../../../../examples/type-specimen";
import { ArrowLeft, Code2, Maximize2, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { Link, useParams } from "react-router";
import { CodeBlock } from "../components/code-block";
import { Container } from "../components/container";
import { FileTabs } from "../components/file-tabs";
import { PageHeader } from "../components/page-header";
import { AspectRatio } from "../components/ui/aspect-ratio";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { loadExampleFiles, type ExampleFile } from "../lib/example-sources";
import { fitToScreen, type Viewport } from "../lib/fullscreen";
import { cn } from "../lib/utils";

interface RunningScene {
  stop(): void;
}

interface SceneSpec {
  readonly name: string;
  readonly run: (parent: HTMLElement) => RunningScene;
  /**
   * The files it is written in, relative to `examples/`, entry point first.
   *
   * Listed rather than derived from the name: a scene's directory does not have
   * to match what the gallery calls it, and "starfall" is four files under
   * `shmup/`.
   */
  readonly files: readonly string[];
}

const PREVIEW = "/examples/assets/previews";

/**
 * The still for a scene, filed under its name.
 *
 * Every scene has one, so nothing has to be listed twice and a new scene that
 * forgets its capture shows an empty frame rather than silently falling back
 * to something else. Refresh them all with `bun run capture:examples`.
 */
function previewOf(name: string): string {
  return `${PREVIEW}/${name.replaceAll(" ", "-")}.png`;
}

/** The name as it appears in a URL. */
function slugOf(name: string): string {
  return name.replaceAll(" ", "-");
}

const SCENES: readonly SceneSpec[] = [
  { name: "flow field", run: flowField, files: ["flow-field.ts"] },
  { name: "orbits", run: orbits, files: ["orbits.ts"] },
  { name: "mouse trail", run: mouseTrail, files: ["mouse-trail.ts"] },
  { name: "particles", run: sparks, files: ["particles.ts"] },
  { name: "grid waves", run: gridWaves, files: ["grid-waves.ts"] },
  { name: "static poster", run: staticPoster, files: ["static-poster.ts"] },
  { name: "type specimen", run: typeSpecimen, files: ["type-specimen.ts"] },
  { name: "image grid", run: imageGrid, files: ["image-grid.ts"] },
  { name: "post bloom", run: postBloom, files: ["post-bloom.ts"] },
  { name: "petals", run: petals, files: ["petals.ts"] },
  { name: "dungeon", run: dungeon, files: ["dungeon.ts"] },
  { name: "blood mage", run: bloodMage, files: ["blood-mage.ts"] },
  { name: "rigid bodies", run: rigidBodies, files: ["rigid-bodies.ts"] },
  { name: "chain", run: chain, files: ["chain.ts"] },
  { name: "bike", run: bike, files: ["bike.ts"] },
  {
    name: "starfall",
    run: shmup,
    files: ["shmup/index.ts", "shmup/art.ts", "shmup/sprites.ts", "shmup/font.ts"],
  },
  { name: "raycaster", run: raycaster, files: ["raycaster.ts"] },
];

/** The window, as the two numbers the fit needs. */
function screenSize(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

function SceneCard({
  name,
  run,
  onReady,
}: SceneSpec & {
  readonly onReady: (name: string, app: RunningScene | null) => void;
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const host = hostRef.current;
    if (stage === null || host === null) return;
    const onChange = (): void =>
      fitToScreen(host, document.fullscreenElement === stage, screenSize());
    const onResize = (): void => {
      if (document.fullscreenElement === stage) fitToScreen(host, true, screenSize());
    };
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("resize", onResize);
    return (): void => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  /**
   * Go fullscreen, starting the scene if it was still waiting for a click.
   *
   * The request goes first and the scene starts second, because building a
   * scene costs a frame or two and the browser only honours the request while
   * the click that caused it is still recent. The overlay that offers "Run"
   * sits on the card rather than on the stage, so a scene taken fullscreen
   * before starting would be a black screen with no way out but Escape — which
   * is why the same control does both.
   */
  const goFullscreen = useCallback((): void => {
    void stageRef.current?.requestFullscreen?.();
    setRunning(true);
  }, []);

  useEffect(() => {
    if (!running) return;
    const host = hostRef.current;
    if (host === null) return;
    host.replaceChildren();
    let app: RunningScene | null = null;
    try {
      app = run(host);
      onReady(name, app);
      // A scene started by the fullscreen control arrives after the stage is
      // already fullscreen, so it would sit at card size until it is refitted.
      if (document.fullscreenElement === stageRef.current) {
        fitToScreen(host, true, screenSize());
      }
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
    <Card className="group transition hover:-translate-y-0.5 hover:border-primary/50">
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
        <Link
          to={`/examples/${slugOf(name)}`}
          aria-label={`Read the code for ${name}`}
          title="Code"
          className="ml-auto grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Code2 className="size-3.5" />
        </Link>
        {error === null ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={goFullscreen}
            aria-label={`Show ${name} fullscreen`}
            title="Fullscreen"
          >
            <Maximize2 className="size-3.5" />
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="overflow-hidden p-0">
        <AspectRatio ratio={1}>
          {/* The element that goes fullscreen, so the canvas keeps a parent
              that centres it on a ground of our own rather than on white. */}
          {running ? null : (
            <img
              src={previewOf(name)}
              alt={`${name}, a frame from the scene`}
              width={600}
              height={600}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 size-full object-cover"
            />
          )}
          {/* The element that goes fullscreen, so the canvas keeps a parent
              that centres it on a ground of our own rather than on white. */}
          <div
            // An inset outline rather than a ring: the card clips its content,
            // and a ring drawn outside the stage would be cut off exactly where
            // it is meant to be read.
            className="absolute inset-0 outline-primary/80 focus-within:-outline-offset-2 focus-within:outline-2"
          >
            <div ref={stageRef} className={cn("size-full", running ? "bg-background" : undefined)}>
              <div
                ref={hostRef}
                className={cn(
                  "grid size-full place-items-center [&>canvas]:outline-none",
                  running
                    ? "bg-[radial-gradient(oklch(0.35_0.015_255_/_0.32)_0.7px,transparent_0.7px)] bg-size-[16px_16px]"
                    : undefined,
                )}
              />
            </div>
          </div>
          {!running && error === null ? (
            // The still is the card: it stays crisp, and the scrim that makes
            // the button legible only arrives with the pointer. Focus reveals
            // it too, or the control would be reachable by tab and invisible.
            <div className="absolute inset-0 flex items-center justify-center bg-background/40 opacity-0 backdrop-blur-md transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
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
          {SCENES.length} scenes, each showing a frame of itself. Hover one and press Run, or open
          it to read the code it is written in.
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

/**
 * One scene, and the source it is written in.
 *
 * The gallery answers "what does it look like"; this answers "what did that
 * cost to write", which is the question a library is actually being judged on.
 * The code is the file that runs — imported raw from `examples/`, not a copy
 * kept in step by hand.
 */
export function ExamplePage(): JSX.Element {
  const params = useParams();
  const slug = params.name ?? "";
  const scene = SCENES.find((candidate) => slugOf(candidate.name) === slug);
  const [files, setFiles] = useState<readonly ExampleFile[]>([]);
  const [active, setActive] = useState(0);
  const noop = useCallback((): void => {}, []);

  useEffect(() => {
    if (scene === undefined) return;
    let live = true;
    void loadExampleFiles(scene.files).then((loaded) => {
      if (live) {
        setFiles(loaded);
        setActive(0);
      }
    });
    return (): void => {
      live = false;
    };
  }, [scene]);

  if (scene === undefined) {
    return (
      <main>
        <Container className="py-16">
          <PageHeader title="Not a scene">
            Nothing here is called “{slug}”. <Link to="/examples">Back to the gallery</Link>.
          </PageHeader>
        </Container>
      </main>
    );
  }

  const file = files[active];
  return (
    <main>
      <Container className="py-16">
        <Link
          to="/examples"
          className="mb-6 inline-flex items-center gap-2 font-mono text-xs text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="size-3.5" />
          Examples
        </Link>
        <PageHeader title={scene.name}>
          {scene.files.length === 1
            ? "One file, exactly as it runs in the gallery."
            : `${scene.files.length} files, exactly as they run in the gallery.`}
        </PageHeader>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div>
            <SceneCard {...scene} onReady={noop} />
          </div>
          <div className="min-w-0">
            {files.length > 1 && (
              <div className="mb-2 h-7">
                <FileTabs files={files} activeIndex={active} onSelect={setActive} />
              </div>
            )}
            {file === undefined ? (
              <p className="text-sm text-muted-foreground">Loading the source…</p>
            ) : (
              <CodeBlock source={file.source} className="max-h-[70vh] overflow-auto leading-6" />
            )}
          </div>
        </div>
      </Container>
    </main>
  );
}
