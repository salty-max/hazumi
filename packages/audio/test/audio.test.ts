import { describe, expect, test } from "bun:test";
import { createPluginHost } from "@hazumi/core";
import {
  audio,
  AudioDisposedError,
  AudioPluginInUseError,
  UnknownSoundError,
  type AudioController,
} from "../src/index";

class FakeGain {
  readonly gain = { value: 1 };
  connections = 0;
  disconnections = 0;

  connect(): void {
    this.connections++;
  }

  disconnect(): void {
    this.disconnections++;
  }
}

class FakeSource {
  buffer: AudioBuffer | null = null;
  loop = false;
  readonly playbackRate = { value: 1 };
  endedListener: ((this: AudioScheduledSourceNode, event: Event) => unknown) | null = null;
  starts = 0;
  stops = 0;
  connections = 0;
  disconnections = 0;

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (type !== "ended" || listener === null) return;
    this.endedListener =
      typeof listener === "function"
        ? (listener as (this: AudioScheduledSourceNode, event: Event) => unknown)
        : (_event: Event): void => listener.handleEvent(_event);
  }

  connect(): void {
    this.connections++;
  }

  disconnect(): void {
    this.disconnections++;
  }

  start(): void {
    this.starts++;
  }

  stopThrows = false;

  stop(): void {
    this.stops++;
    if (this.stopThrows) throw new DOMException("already stopped", "InvalidStateError");
  }

  finish(): void {
    this.endedListener?.call(this as unknown as AudioScheduledSourceNode, new Event("ended"));
  }
}

class FakeAudioContext {
  readonly destination = {};
  state: AudioContextState = "suspended";
  readonly gains: FakeGain[] = [];
  readonly sources: FakeSource[] = [];
  resumes = 0;
  closes = 0;
  decodes = 0;

  createGain(): GainNode {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  async decodeAudioData(): Promise<AudioBuffer> {
    this.decodes++;
    return { duration: 2.5 } as AudioBuffer;
  }

  async resume(): Promise<void> {
    this.resumes++;
    this.state = "running";
  }

  async close(): Promise<void> {
    this.closes++;
    this.state = "closed";
  }
}

function createHarness(maxVoices = 2): {
  readonly controller: AudioController;
  readonly context: FakeAudioContext;
  readonly dispose: () => void;
} {
  const context = new FakeAudioContext();
  const plugin = audio({
    context: context as unknown as AudioContext,
    maxVoices,
    fetch: async () => new Response(new Uint8Array([1, 2, 3])),
  });
  const host = createPluginHost().use(plugin).build();
  return { controller: host.audio, context, dispose: host.dispose };
}

describe("audio loading", () => {
  test("fetches and decodes a sound", async () => {
    const { controller, context, dispose } = createHarness();

    const sound = await controller.load("/sound.wav");

    expect(sound.duration).toBe(2.5);
    expect(context.decodes).toBe(1);
    dispose();
    expect(context.closes).toBe(0);
  });

  test("reports HTTP failures before decoding", async () => {
    const context = new FakeAudioContext();
    const host = createPluginHost()
      .use(
        audio({
          context: context as unknown as AudioContext,
          fetch: async () => new Response(null, { status: 404 }),
        }),
      )
      .build();

    expect(host.audio.load("/missing.wav")).rejects.toThrow(
      'Could not load audio "/missing.wav": 404',
    );
    expect(context.decodes).toBe(0);
    host.dispose();
  });
});

describe("audio playback", () => {
  test("unlocks a suspended context from the next user gesture", async () => {
    const { controller, context, dispose } = createHarness();
    await controller.load("/sound.wav");

    globalThis.dispatchEvent(new Event("keydown"));

    expect(context.resumes).toBe(1);
    expect(context.state).toBe("running");
    dispose();
  });

  test("plays, loops, controls gain, and resumes a suspended context", async () => {
    const { controller, context, dispose } = createHarness();
    const sound = await controller.load("/sound.wav");
    controller.gain = 0.6;

    const once = controller.play(sound, { gain: 0.25, rate: 1.5 });
    const looping = controller.loop(sound);

    expect(context.resumes).toBe(1);
    expect(context.gains[0]?.gain.value).toBe(0.6);
    expect(context.sources[0]).toMatchObject({ loop: false, starts: 1 });
    expect(context.sources[0]?.playbackRate.value).toBe(1.5);
    expect(once.gain).toBe(0.25);
    expect(looping.looping).toBe(true);
    expect(controller.activeVoices).toBe(2);

    once.gain = 0.4;
    expect(once.gain).toBe(0.4);
    looping.stop();
    expect(looping.playing).toBe(false);
    expect(controller.activeVoices).toBe(1);
    dispose();
  });

  test("reuses bounded voice slots and replaces the oldest voice", async () => {
    const { controller, context, dispose } = createHarness(2);
    const sound = await controller.load("/sound.wav");

    const first = controller.play(sound);
    const second = controller.play(sound);
    const third = controller.play(sound);

    expect(context.gains).toHaveLength(3);
    expect(context.sources).toHaveLength(3);
    expect(first.playing).toBe(false);
    expect(second.playing).toBe(true);
    expect(third.playing).toBe(true);
    expect(context.sources[0]).toMatchObject({ stops: 1, disconnections: 1 });
    expect(controller.activeVoices).toBe(2);
    dispose();
  });

  test("does not let a stale handle stop a reused voice", async () => {
    const { controller, context, dispose } = createHarness(1);
    const sound = await controller.load("/sound.wav");
    const stale = controller.play(sound);
    const current = controller.play(sound);

    stale.stop();

    expect(current.playing).toBe(true);
    expect(context.sources[1]?.stops).toBe(0);
    dispose();
  });

  test("release survives stop() throwing after the source has ended", async () => {
    const { controller, context, dispose } = createHarness();
    const sound = await controller.load("/sound.wav");
    controller.play(sound);
    context.sources[0]!.stopThrows = true;
    expect(() => controller.stopAll()).not.toThrow();
    expect(context.sources[0]?.disconnections).toBe(1);
    dispose();
  });

  test("releases a voice when its source finishes naturally", async () => {
    const { controller, context, dispose } = createHarness();
    const sound = await controller.load("/sound.wav");
    const voice = controller.play(sound);

    context.sources[0]!.finish();

    expect(voice.playing).toBe(false);
    expect(controller.activeVoices).toBe(0);
    expect(context.sources[0]?.disconnections).toBe(1);
    dispose();
  });

  test("rejects sounds owned by another controller", async () => {
    const first = createHarness();
    const second = createHarness();
    const sound = await first.controller.load("/sound.wav");

    expect(() => second.controller.play(sound)).toThrow(UnknownSoundError);
    first.dispose();
    second.dispose();
  });
});

describe("audio lifecycle", () => {
  test("closes the AudioContext it creates", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
    const context = new FakeAudioContext();
    const Constructor = function (): FakeAudioContext {
      return context;
    } as unknown as typeof AudioContext;
    Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: Constructor });

    try {
      const host = createPluginHost()
        .use(
          audio({
            fetch: async () => new Response(new Uint8Array([1, 2, 3])),
          }),
        )
        .build();
      await host.audio.load("/sound.wav");

      host.dispose();

      expect(context.closes).toBe(1);
    } finally {
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, "AudioContext");
      else Object.defineProperty(globalThis, "AudioContext", descriptor);
    }
  });

  test("stops every voice and rejects work after disposal", async () => {
    const { controller, context, dispose } = createHarness();
    const sound = await controller.load("/sound.wav");
    controller.play(sound);
    controller.loop(sound);

    dispose();

    expect(context.sources.every((source) => source.stops === 1)).toBe(true);
    expect(() => controller.play(sound)).toThrow(AudioDisposedError);
    expect(controller.load("/again.wav")).rejects.toThrow(AudioDisposedError);
  });

  test("prevents one plugin instance from serving concurrent applications", () => {
    const context = new FakeAudioContext();
    const plugin = audio({ context: context as unknown as AudioContext });
    const first = createPluginHost().use(plugin).build();

    expect(() => createPluginHost().use(plugin).build()).toThrow(AudioPluginInUseError);

    first.dispose();
    const next = createPluginHost().use(plugin).build();
    next.dispose();
  });

  test("validates pool size and gain before creating Web Audio resources", () => {
    expect(() =>
      createPluginHost()
        .use(audio({ maxVoices: 0 }))
        .build(),
    ).toThrow(RangeError);
    expect(() =>
      createPluginHost()
        .use(audio({ gain: -1 }))
        .build(),
    ).toThrow(RangeError);
  });
});
