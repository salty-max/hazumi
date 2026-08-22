import { javascript } from "@codemirror/lang-javascript";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { Check, Copy, ImageIcon, Play, Sparkles, Spline } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { toSvg } from "@hazumi/backend-svg";
import { FileTabs } from "../components/file-tabs";
import { PanelHeader } from "../components/panel-header";
import { SiteHeader } from "../components/site-header";
import * as assetsApi from "hazumi/assets";
import * as audioApi from "hazumi/audio";
import * as colorApi from "hazumi/color";
import * as debugApi from "hazumi/debug";
import * as drawApi from "hazumi/draw";
import * as inputApi from "hazumi/input";
import * as mathApi from "hazumi/math";
import * as particlesApi from "hazumi/particles";
import * as physicsApi from "hazumi/physics";
import * as sceneApi from "hazumi/scene";
import { createPluginHost, start, type HazumiApp, type PluginBuilder } from "hazumi/app";
import { audio } from "hazumi/audio";
import { webgl2 } from "hazumi/backends/webgl2";
import { overlay } from "hazumi/debug";
import { physics } from "hazumi/physics";
import { Button } from "../components/ui/button";
import { Kbd, KbdGroup } from "../components/ui/kbd";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../components/ui/resizable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { STARTERS, type Starter } from "../playground/scenes";
import { hazumiSyntaxHighlighting } from "../playground/syntax-theme";
import {
  compileWorkspace,
  copyStarterFiles,
  type EditableFile,
  type PlaygroundApi,
} from "../playground/workspace";

const SIZE = 520;
const INITIAL_STARTER: Starter = STARTERS[0] ?? { name: "Empty", code: "return {};" };
const STARTER_ITEMS: ReadonlyArray<{ readonly value: string; readonly label: string }> =
  STARTERS.map((starter, index) => ({
    value: String(index),
    label: starter.name,
  }));

const PLAYGROUND_MODULES = Object.freeze({
  "hazumi/assets": assetsApi,
  "hazumi/audio": audioApi,
  "hazumi/color": colorApi,
  "hazumi/debug": debugApi,
  "hazumi/draw": drawApi,
  "hazumi/input": inputApi,
  "hazumi/math": mathApi,
  "hazumi/particles": particlesApi,
  "hazumi/physics": physicsApi,
  "hazumi/scene": sceneApi,
});

function playgroundPlugins(): PluginBuilder<PlaygroundApi> {
  return createPluginHost()
    .use(audio({ gain: 0.8, maxVoices: 12 }))
    .use(physics())
    .use(overlay({ visible: false, toggleKey: "F1" }));
}
Object.defineProperty(globalThis, "__hazumiPlaygroundModules", {
  configurable: true,
  value: PLAYGROUND_MODULES,
});

interface PlaygroundStatus {
  readonly text: string;
  readonly kind: "idle" | "ok" | "error";
}

interface CodeEditorProps {
  readonly initialCode: string;
  readonly onChange: (code: string) => void;
  readonly onReady: (view: EditorView) => void;
}

function CodeEditor({ initialCode, onChange, onReady }: CodeEditorProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hostRef.current === null) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: initialCode,
        extensions: [
          basicSetup,
          javascript({ typescript: true }),
          hazumiSyntaxHighlighting,
          keymap.of([]),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update): void => {
            if (update.docChanged) onChange(update.state.doc.toString());
          }),
        ],
      }),
      parent: hostRef.current,
    });
    onReady(view);
    return (): void => view.destroy();
  }, [initialCode, onChange, onReady]);

  return <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden" />;
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const line = /blob:[^\s)]+:(\d+):(\d+)/.exec(error.stack ?? "");
  return line === null ? error.message : `${error.message} · line ${Number(line[1]) - 1}`;
}

function focusPreview(event: ReactPointerEvent<HTMLDivElement>): void {
  event.currentTarget.focus({ preventScroll: true });
}

function keepGameKeysInPreview(event: ReactKeyboardEvent<HTMLDivElement>): void {
  switch (event.key) {
    case "ArrowDown":
    case "ArrowLeft":
    case "ArrowRight":
    case "ArrowUp":
    case " ":
      event.preventDefault();
      break;
  }
}

function useNarrowLayout(): boolean {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const query = globalThis.matchMedia("(max-width: 860px)");
    const update = (): void => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return (): void => query.removeEventListener("change", update);
  }, []);

  return narrow;
}

export function PlaygroundPage(): JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<HazumiApp<PlaygroundApi> | null>(null);
  const runIdRef = useRef(0);
  const filesRef = useRef<EditableFile[]>(copyStarterFiles(INITIAL_STARTER));
  const [editorReady, setEditorReady] = useState(false);
  const [starterIndex, setStarterIndex] = useState("0");
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [editorRevision, setEditorRevision] = useState(0);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [status, setStatus] = useState<PlaygroundStatus>({
    text: "Preparing editor",
    kind: "idle",
  });
  const [svg, setSvg] = useState("");
  const narrow = useNarrowLayout();
  const handleEditorReady = useCallback((): void => setEditorReady(true), []);

  const run = useCallback(async (): Promise<void> => {
    if (!editorReady || stageRef.current === null) return;
    const runId = ++runIdRef.current;
    appRef.current?.stop();
    appRef.current = null;
    stageRef.current.replaceChildren();
    setStatus({ text: "Compiling", kind: "idle" });

    try {
      const scene = await compileWorkspace(filesRef.current);
      if (runId !== runIdRef.current || stageRef.current === null) return;
      const app = start(
        {
          backend: webgl2({ smoothing: false }),
          width: SIZE,
          height: SIZE,
          parent: stageRef.current,
          seed: 1,
          plugins: playgroundPlugins(),
          onError: (error): void => {
            if (runId === runIdRef.current) {
              setStatus({ text: describeError(error), kind: "error" });
            }
          },
        },
        scene,
      );
      appRef.current = app;
      await app.ready;
      if (runId !== runIdRef.current) {
        app.stop();
        return;
      }
      setStatus({ text: "Ready", kind: "ok" });
    } catch (error) {
      if (runId !== runIdRef.current) return;
      appRef.current?.stop();
      appRef.current = null;
      setStatus({ text: describeError(error), kind: "error" });
    }
  }, [editorReady]);

  const exportSvg = useCallback(async (): Promise<void> => {
    if (!editorReady) return;
    setStatus({ text: "Exporting", kind: "idle" });
    let exporter: HazumiApp<PlaygroundApi> | null = null;

    try {
      const scene = await compileWorkspace(filesRef.current);
      let output = "";
      exporter = start(
        {
          backend: () => ({
            render: (buffer): void => {
              output = toSvg(buffer, SIZE, SIZE);
            },
            setViewport: (): void => {},
            dispose: (): void => {},
          }),
          width: SIZE,
          height: SIZE,
          canvas: document.createElement("canvas"),
          seed: 1,
          plugins: playgroundPlugins(),
        },
        scene,
      );
      await exporter.ready;
      // A no-loop scene renders during ready; a looping scene has not
      // necessarily reached its first animation frame yet.
      if (output.length === 0) exporter.redraw();
      setSvg(output);
      setStatus({
        text: `SVG ready · ${(output.length / 1024).toFixed(1)} kB`,
        kind: "ok",
      });
    } catch (error) {
      setStatus({ text: describeError(error), kind: "error" });
    } finally {
      exporter?.stop();
    }
  }, [editorReady]);

  const exportPng = useCallback(async (): Promise<void> => {
    const app = appRef.current;
    if (app === null) return;
    setStatus({ text: "Exporting PNG", kind: "idle" });
    try {
      const blob = await app.capturePng();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "hazumi-frame.png";
      link.click();
      URL.revokeObjectURL(url);
      setStatus({ text: `PNG saved · ${(blob.size / 1024).toFixed(1)} kB`, kind: "ok" });
    } catch (error) {
      setStatus({ text: describeError(error), kind: "error" });
    }
  }, []);

  useEffect(() => {
    if (editorReady) void run();
    return (): void => {
      runIdRef.current++;
      appRef.current?.stop();
    };
  }, [editorReady, run]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void run();
      }
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return (): void => globalThis.removeEventListener("keydown", onKeyDown);
  }, [run]);

  const copyCode = useCallback(async (): Promise<void> => {
    const text = filesRef.current[activeFileIndex]?.code ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copiedTimer.current !== undefined) globalThis.clearTimeout(copiedTimer.current);
      copiedTimer.current = globalThis.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      setCopied(false);
      setStatus({ text: describeError(error), kind: "error" });
    }
  }, [activeFileIndex]);

  useEffect(() => {
    return (): void => {
      if (copiedTimer.current !== undefined) globalThis.clearTimeout(copiedTimer.current);
    };
  }, []);

  const chooseStarter = (value: string | null): void => {
    if (value === null) return;
    setStarterIndex(value);
    const starter = STARTERS[Number(value)];
    if (starter === undefined) return;
    filesRef.current = copyStarterFiles(starter);
    setActiveFileIndex(0);
    setEditorRevision((revision) => revision + 1);
    queueMicrotask(() => void run());
  };

  const updateActiveFile = useCallback(
    (code: string): void => {
      const file = filesRef.current[activeFileIndex];
      if (file !== undefined) file.code = code;
    },
    [activeFileIndex],
  );

  return (
    <div className="flex h-dvh min-h-[480px] flex-col overflow-hidden bg-background text-foreground">
      <SiteHeader>
        <Select value={starterIndex} onValueChange={chooseStarter} items={STARTER_ITEMS}>
          <SelectTrigger aria-label="Starter scene" className="hidden min-w-40 sm:flex">
            <Sparkles className="size-3.5 text-primary" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STARTERS.map((starter, index) => (
              <SelectItem value={String(index)} key={starter.name}>
                {starter.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span
          aria-live="polite"
          className={
            status.kind === "error"
              ? "hidden max-w-48 truncate text-xs text-destructive lg:block"
              : "hidden text-xs text-muted-foreground lg:block"
          }
        >
          {status.text}
        </span>
        {/* Distinct glyphs, not two download arrows: below `sm` the labels are
            hidden and identical icons made these two indistinguishable. A
            bezier curve for the vector export, a bitmap for the raster one.
            `aria-label` is on the button because a `display: none` label is
            absent from the accessibility tree too, so icon-only left these
            buttons with no accessible name at all. */}
        <Button
          variant="outline"
          size="sm"
          aria-label="Export SVG"
          title="Export SVG"
          onClick={() => void exportSvg()}
        >
          <Spline />
          <span className="hidden sm:inline">SVG</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label="Export PNG"
          title="Export PNG"
          onClick={() => void exportPng()}
        >
          <ImageIcon />
          <span className="hidden sm:inline">PNG</span>
        </Button>
        <Button size="sm" onClick={() => void run()}>
          <Play className="fill-current" />
          Run
          <KbdGroup data-icon="inline-end" className="hidden translate-x-0.5 lg:inline-flex">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
          </KbdGroup>
        </Button>
      </SiteHeader>

      <main className="min-h-0 flex-1">
        <ResizablePanelGroup orientation={narrow ? "vertical" : "horizontal"} id="workspace">
          <ResizablePanel id="code" defaultSize="54" minSize={narrow ? "220px" : "340px"}>
            <ResizablePanelGroup orientation="vertical" id="code-output">
              <ResizablePanel id="editor" defaultSize="72" minSize="180px">
                <section className="flex size-full min-h-0 flex-col bg-editor">
                  <PanelHeader title="Code">
                    {filesRef.current.length > 1 && (
                      <FileTabs
                        files={filesRef.current}
                        activeIndex={activeFileIndex}
                        onSelect={setActiveFileIndex}
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className={copied ? "ml-auto h-7 px-2 text-primary" : "ml-auto h-7 px-2"}
                      onClick={() => void copyCode()}
                      aria-label={copied ? "Copied to clipboard" : "Copy code"}
                    >
                      {copied ? <Check /> : <Copy />}
                      <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
                    </Button>
                  </PanelHeader>
                  <CodeEditor
                    key={`${editorRevision}:${activeFileIndex}`}
                    initialCode={filesRef.current[activeFileIndex]?.code ?? ""}
                    onChange={updateActiveFile}
                    onReady={handleEditorReady}
                  />
                </section>
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel
                id="svg"
                defaultSize="28"
                minSize="92px"
                collapsible
                collapsedSize="44px"
              >
                <section className="flex size-full min-h-0 flex-col bg-panel">
                  <PanelHeader title="SVG" />
                  {svg.length === 0 ? (
                    <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-xs leading-5 text-muted-foreground">
                      No SVG exported.
                    </div>
                  ) : (
                    <Textarea
                      value={svg}
                      readOnly
                      spellCheck={false}
                      aria-label="SVG output"
                      className="min-h-0 flex-1 rounded-none border-0 bg-editor p-4"
                    />
                  )}
                </section>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel id="preview" defaultSize="46" minSize={narrow ? "240px" : "360px"}>
            <section className="flex size-full min-h-0 flex-col bg-canvas">
              <PanelHeader title="Preview" />
              <div className="preview-grid min-h-0 flex-1 overflow-auto p-5 sm:p-8">
                <div
                  ref={stageRef}
                  id="stage"
                  role="application"
                  aria-label="Interactive preview"
                  tabIndex={0}
                  onPointerDown={focusPreview}
                  onKeyDown={keepGameKeysInPreview}
                  className="m-auto w-fit max-w-full outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-canvas"
                />
              </div>
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  );
}
