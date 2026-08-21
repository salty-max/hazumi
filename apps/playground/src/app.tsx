import { javascript } from "@codemirror/lang-javascript";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { Download, Play, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { toSvg } from "@matter/backend-svg";
import { start, type MatterApp, type SceneFactory } from "matter";
import { webgl2 } from "matter/backends/webgl2";
import { Button } from "./components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { STARTERS } from "./scenes";
import { matterSyntaxHighlighting } from "./syntax-theme";

const SIZE = 520;

interface PlaygroundStatus {
  readonly text: string;
  readonly kind: "idle" | "ok" | "error";
}

interface CodeEditorProps {
  readonly initialCode: string;
  readonly onReady: (view: EditorView) => void;
}

function CodeEditor({ initialCode, onReady }: CodeEditorProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hostRef.current === null) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: initialCode,
        extensions: [
          basicSetup,
          javascript({ typescript: true }),
          matterSyntaxHighlighting,
          keymap.of([]),
          EditorView.lineWrapping,
        ],
      }),
      parent: hostRef.current,
    });
    onReady(view);
    return (): void => view.destroy();
  }, [initialCode, onReady]);

  return <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden" />;
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const line = /blob:[^\s)]+:(\d+):(\d+)/.exec(error.stack ?? "");
  return line === null ? error.message : `${error.message} · line ${Number(line[1]) - 1}`;
}

async function compile(view: EditorView): Promise<SceneFactory> {
  const source = view.state.doc.toString();
  const module = `export default (s) => {\n${source}\n};`;
  const url = URL.createObjectURL(new Blob([module], { type: "text/javascript" }));

  try {
    const loaded = (await import(/* @vite-ignore */ url)) as { default: SceneFactory };
    return loaded.default;
  } finally {
    URL.revokeObjectURL(url);
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

function PanelHeading({ title }: { readonly title: string }): JSX.Element {
  return (
    <div className="flex h-9 shrink-0 items-center border-b border-border bg-panel px-3">
      <span className="text-xs font-medium text-foreground">{title}</span>
    </div>
  );
}

export function App(): JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<MatterApp | null>(null);
  const runIdRef = useRef(0);
  const [editor, setEditor] = useState<EditorView | null>(null);
  const [starterIndex, setStarterIndex] = useState("0");
  const [status, setStatus] = useState<PlaygroundStatus>({
    text: "Preparing editor",
    kind: "idle",
  });
  const [svg, setSvg] = useState("");
  const narrow = useNarrowLayout();

  const run = useCallback(async (): Promise<void> => {
    if (editor === null || stageRef.current === null) return;
    const runId = ++runIdRef.current;
    appRef.current?.stop();
    appRef.current = null;
    stageRef.current.replaceChildren();
    setStatus({ text: "Compiling", kind: "idle" });

    try {
      const scene = await compile(editor);
      if (runId !== runIdRef.current || stageRef.current === null) return;
      const app = start(
        {
          backend: webgl2(),
          width: SIZE,
          height: SIZE,
          parent: stageRef.current,
          seed: 1,
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
  }, [editor]);

  const exportSvg = useCallback(async (): Promise<void> => {
    if (editor === null) return;
    setStatus({ text: "Exporting", kind: "idle" });
    let exporter: MatterApp | null = null;

    try {
      const scene = await compile(editor);
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
  }, [editor]);

  useEffect(() => {
    if (editor !== null) void run();
    return (): void => {
      runIdRef.current++;
      appRef.current?.stop();
    };
  }, [editor, run]);

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

  const chooseStarter = (value: string): void => {
    setStarterIndex(value);
    const starter = STARTERS[Number(value)];
    if (starter === undefined || editor === null) return;
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: starter.code },
    });
    queueMicrotask(() => void run());
  };

  return (
    <div className="flex h-dvh min-h-[480px] flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-panel/95 px-3 shadow-sm backdrop-blur sm:px-4">
        <a href="/" className="group mr-1 flex items-center gap-2.5" aria-label="Matter home">
          <span className="matter-mark">
            <span />
          </span>
          <span className="hidden text-sm font-semibold tracking-tight sm:block">Matter</span>
        </a>

        <div className="mx-1 h-5 w-px bg-border" />
        <Select value={starterIndex} onValueChange={chooseStarter}>
          <SelectTrigger aria-label="Starter scene">
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

        <div className="ml-auto flex items-center gap-2">
          <span
            aria-live="polite"
            className={
              status.kind === "error"
                ? "hidden max-w-72 truncate text-xs text-destructive sm:block"
                : "hidden text-xs text-muted-foreground sm:block"
            }
          >
            {status.text}
          </span>
          <Button variant="outline" size="sm" onClick={() => void exportSvg()}>
            <Download />
            <span className="hidden sm:inline">Export SVG</span>
          </Button>
          <Button size="sm" onClick={() => void run()}>
            <Play className="fill-current" />
            Run
            <kbd className="hidden rounded border border-primary-foreground/20 px-1 font-mono text-[9px] opacity-70 lg:inline">
              ⌘↵
            </kbd>
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <ResizablePanelGroup orientation={narrow ? "vertical" : "horizontal"} id="workspace">
          <ResizablePanel id="code" defaultSize="54" minSize={narrow ? "220px" : "340px"}>
            <ResizablePanelGroup orientation="vertical" id="code-output">
              <ResizablePanel id="editor" defaultSize="72" minSize="180px">
                <section className="flex size-full min-h-0 flex-col bg-editor">
                  <PanelHeading title="Code" />
                  <CodeEditor initialCode={STARTERS[0]?.code ?? ""} onReady={setEditor} />
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
                  <PanelHeading title="SVG" />
                  {svg.length === 0 ? (
                    <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-xs leading-5 text-muted-foreground">
                      No SVG exported.
                    </div>
                  ) : (
                    <textarea
                      value={svg}
                      readOnly
                      spellCheck={false}
                      aria-label="SVG output"
                      className="min-h-0 flex-1 resize-none bg-editor p-4 font-mono text-[11px] leading-5 text-muted-foreground outline-none selection:bg-primary/20"
                    />
                  )}
                </section>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel id="preview" defaultSize="46" minSize={narrow ? "240px" : "360px"}>
            <section className="flex size-full min-h-0 flex-col bg-canvas">
              <PanelHeading title="Preview" />
              <div className="preview-grid min-h-0 flex-1 overflow-auto p-5 sm:p-8">
                <div className="m-auto w-fit rounded-xl border border-white/10 bg-black/20 p-2 shadow-2xl shadow-black/30">
                  <div ref={stageRef} id="stage" className="overflow-hidden rounded-lg" />
                </div>
              </div>
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  );
}
