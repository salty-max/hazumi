/**
 * Live editor.
 *
 * User code is the body of a setup function: it receives `s`, the sketch
 * context, and returns a draw function. Compiling with `new Function` keeps the
 * playground free of a bundler at runtime — the trade is that it is plain
 * JavaScript, not TypeScript.
 */
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { sketch, type SketchContext, type SketchHandle } from 'matter';
import { webgl2 } from 'matter/backends/webgl2';
import { toSvg } from '@matter/backend-svg';
import { STARTERS } from './sketches';

const SIZE = 520;

const editorHost = document.getElementById('editor') as HTMLElement;
const stage = document.getElementById('stage') as HTMLElement;
const status = document.getElementById('status') as HTMLElement;
const picker = document.getElementById('starter') as HTMLSelectElement;
const runButton = document.getElementById('run') as HTMLButtonElement;
const svgButton = document.getElementById('export-svg') as HTMLButtonElement;
const svgPanel = document.getElementById('svg-panel') as HTMLDetailsElement;
const svgOutput = document.getElementById('svg-output') as HTMLTextAreaElement;

let handle: SketchHandle | null = null;

for (const [index, starter] of STARTERS.entries()) {
  const option = document.createElement('option');
  option.value = String(index);
  option.textContent = starter.name;
  picker.append(option);
}

const view = new EditorView({
  state: EditorState.create({
    doc: STARTERS[0]?.code ?? '',
    extensions: [basicSetup, javascript()],
  }),
  parent: editorHost,
});

function setStatus(text: string, kind: 'ok' | 'error'): void {
  status.textContent = text;
  status.dataset['kind'] = kind;
}

/** Compile the editor contents into a setup function. */
function compile(): (s: SketchContext) => never {
  const source = view.state.doc.toString();
  // oxlint-disable-next-line no-new-func
  return new Function('s', source) as (s: SketchContext) => never;
}

function run(): void {
  handle?.stop();
  handle = null;
  stage.replaceChildren();

  try {
    const setup = compile();
    handle = sketch(
      { backend: webgl2(), width: SIZE, height: SIZE, parent: stage, seed: 1 },
      setup,
    );
    setStatus('running', 'ok');
  } catch (error) {
    // Sketch code is user input; a mistake in it should read as feedback, not
    // as the playground breaking.
    setStatus(error instanceof Error ? error.message : String(error), 'error');
  }
}

/**
 * Export one frame as SVG.
 *
 * A backend is just something that consumes a command buffer, so exporting is
 * running the same sketch against a different consumer. Nothing in the user's
 * code changes, which is the point of the command buffer.
 */
function exportSvg(): void {
  try {
    const setup = compile();
    let svg = '';

    const exporter = sketch(
      {
        backend: () => ({
          render: (buffer): void => {
            svg = toSvg(buffer, SIZE, SIZE);
          },
          setViewport: (): void => {},
          dispose: (): void => {},
        }),
        width: SIZE,
        height: SIZE,
        // Its own offscreen canvas, so the running sketch is untouched.
        canvas: document.createElement('canvas'),
        seed: 1,
      },
      setup,
    );

    exporter.redraw();
    exporter.stop();

    svgOutput.value = svg;
    svgPanel.open = true;
    setStatus(`exported ${(svg.length / 1024).toFixed(1)} kB of SVG`, 'ok');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), 'error');
  }
}

picker.addEventListener('change', () => {
  const starter = STARTERS[Number(picker.value)];
  if (starter === undefined) return;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: starter.code } });
  run();
});

runButton.addEventListener('click', run);
svgButton.addEventListener('click', exportSvg);

// Cmd/Ctrl+Enter, the shortcut every editor-plus-preview tool has.
globalThis.addEventListener('keydown', (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    run();
  }
});

run();
