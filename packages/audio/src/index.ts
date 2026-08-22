import { definePlugin, type Plugin } from "@matter/core";

const DEFAULT_MAX_VOICES = 16;

/** A decoded sound that can be played any number of times. */
export interface Sound {
  readonly duration: number;
}

/** Per-playback controls. */
export interface PlayOptions {
  /** Linear gain. One is unchanged, zero is silent. */
  readonly gain?: number;
  /** Playback-rate multiplier. One is the decoded speed. */
  readonly rate?: number;
}

/** One playback returned by `audio.play()` or `audio.loop()`. */
export interface AudioVoice {
  readonly playing: boolean;
  readonly looping: boolean;
  gain: number;
  stop: () => void;
}

/** Audio controls contributed to a Matter scene context. */
export interface AudioController {
  /** Decode one audio file. */
  load: (url: string) => Promise<Sound>;
  /** Play a sound once. */
  play: (sound: Sound, options?: PlayOptions) => AudioVoice;
  /** Play a sound until its returned voice is stopped. */
  loop: (sound: Sound, options?: PlayOptions) => AudioVoice;
  /** Stop every active voice without disposing the audio context. */
  stopAll: () => void;
  /** Master linear gain for every voice. */
  gain: number;
  /** Number of voices currently playing. */
  readonly activeVoices: number;
}

/** What the audio plugin adds to a Matter scene context. */
export interface AudioApi {
  readonly audio: AudioController;
}

export interface AudioPluginOptions {
  /** Initial master linear gain. Defaults to one. */
  readonly gain?: number;
  /** Maximum simultaneous voices. The oldest is replaced when full. Defaults to 16. */
  readonly maxVoices?: number;
  /** Use an existing context. Matter will not close a context it does not own. */
  readonly context?: AudioContext;
  /** Custom fetch implementation, primarily for non-browser hosts and tests. */
  readonly fetch?: (url: string) => Promise<Response>;
}

export class AudioUnavailableError extends Error {
  constructor() {
    super("Web Audio is unavailable in this environment");
    this.name = "AudioUnavailableError";
  }
}

export class AudioDisposedError extends Error {
  constructor() {
    super("This audio controller has been disposed");
    this.name = "AudioDisposedError";
  }
}

export class UnknownSoundError extends Error {
  constructor() {
    super("This sound was loaded by a different audio controller");
    this.name = "UnknownSoundError";
  }
}

export class AudioPluginInUseError extends Error {
  constructor() {
    super("This audio plugin instance is already installed in an application");
    this.name = "AudioPluginInUseError";
  }
}

interface VoiceSlot {
  readonly gain: GainNode;
  source: AudioBufferSourceNode | null;
  generation: number;
  startedAt: number;
}

interface AudioRuntime {
  readonly controller: AudioController;
  dispose: () => void;
}

function release(slot: VoiceSlot): void {
  const source = slot.source;
  if (source === null) return;
  slot.source = null;
  // WebKit throws InvalidStateError if the node has already ended.
  try {
    source.stop();
  } catch {
    /* already finished */
  }
  try {
    source.disconnect();
  } catch {
    /* already disconnected */
  }
}

function assertGain(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite number greater than or equal to zero`);
  }
}

function assertRate(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError("rate must be a finite number greater than zero");
  }
}

function ignoreRejection(): void {}

function createRuntime(options: AudioPluginOptions): AudioRuntime {
  const maxVoices = options.maxVoices ?? DEFAULT_MAX_VOICES;
  if (!Number.isInteger(maxVoices) || maxVoices <= 0) {
    throw new RangeError("maxVoices must be a positive integer");
  }
  let masterGainValue = options.gain ?? 1;
  assertGain(masterGainValue, "gain");

  const buffers = new WeakMap<Sound, AudioBuffer>();
  const slots: VoiceSlot[] = [];
  let context = options.context;
  let master: GainNode | undefined;
  let disposed = false;
  let playOrder = 0;

  const removeUnlockListeners = (): void => {
    globalThis.removeEventListener?.("pointerdown", unlock);
    globalThis.removeEventListener?.("keydown", unlock);
  };

  const unlock = (): void => {
    if (disposed) return;
    if (context === undefined && globalThis.AudioContext === undefined) return;
    const audioContext = ensureContext();
    if (audioContext.state !== "suspended") {
      removeUnlockListeners();
      return;
    }
    audioContext.resume().then(removeUnlockListeners, ignoreRejection);
  };

  const ensureContext = (): AudioContext => {
    if (disposed) throw new AudioDisposedError();
    if (context === undefined) {
      const AudioContextConstructor = globalThis.AudioContext;
      if (AudioContextConstructor === undefined) throw new AudioUnavailableError();
      context = new AudioContextConstructor();
    }
    if (master === undefined) {
      master = context.createGain();
      master.gain.value = masterGainValue;
      master.connect(context.destination);
    }
    return context;
  };

  const acquire = (audioContext: AudioContext): VoiceSlot => {
    for (const slot of slots) {
      if (slot.source === null) return slot;
    }
    if (slots.length < maxVoices) {
      const gain = audioContext.createGain();
      gain.connect(master!);
      const slot: VoiceSlot = { gain, source: null, generation: 0, startedAt: 0 };
      slots.push(slot);
      return slot;
    }

    let oldest = slots[0]!;
    for (let index = 1; index < slots.length; index++) {
      if (slots[index]!.startedAt < oldest.startedAt) oldest = slots[index]!;
    }
    release(oldest);
    return oldest;
  };

  const startPlayback = (sound: Sound, loop: boolean, optionsValue?: PlayOptions): AudioVoice => {
    const buffer = buffers.get(sound);
    if (buffer === undefined) throw new UnknownSoundError();
    const gainValue = optionsValue?.gain ?? 1;
    const rate = optionsValue?.rate ?? 1;
    assertGain(gainValue, "gain");
    assertRate(rate);

    const audioContext = ensureContext();
    if (audioContext.state === "suspended") audioContext.resume().catch(ignoreRejection);
    const slot = acquire(audioContext);
    const source = audioContext.createBufferSource();
    const generation = ++slot.generation;
    slot.startedAt = ++playOrder;
    slot.gain.gain.value = gainValue;
    slot.source = source;
    source.buffer = buffer;
    source.loop = loop;
    source.playbackRate.value = rate;
    source.connect(slot.gain);
    source.addEventListener("ended", (): void => {
      if (slot.generation !== generation || slot.source !== source) return;
      slot.source = null;
      source.disconnect();
    });
    try {
      source.start();
    } catch (error) {
      slot.source = null;
      source.disconnect();
      throw error;
    }

    return {
      get playing(): boolean {
        return slot.generation === generation && slot.source === source;
      },
      looping: loop,
      get gain(): number {
        return slot.gain.gain.value;
      },
      set gain(value: number) {
        assertGain(value, "gain");
        if (slot.generation === generation && slot.source === source) slot.gain.gain.value = value;
      },
      stop: (): void => {
        if (slot.generation === generation && slot.source === source) release(slot);
      },
    };
  };

  const controller: AudioController = {
    load: async (url: string): Promise<Sound> => {
      const audioContext = ensureContext();
      const fetchAudio = options.fetch ?? globalThis.fetch;
      if (fetchAudio === undefined) throw new TypeError("fetch is unavailable in this environment");
      const response = await fetchAudio(url);
      if (!response.ok)
        throw new Error(`Could not load audio ${JSON.stringify(url)}: ${response.status}`);
      const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
      if (disposed) throw new AudioDisposedError();
      const sound: Sound = Object.freeze({ duration: buffer.duration });
      buffers.set(sound, buffer);
      return sound;
    },
    play: (sound: Sound, playOptions?: PlayOptions): AudioVoice =>
      startPlayback(sound, false, playOptions),
    loop: (sound: Sound, playOptions?: PlayOptions): AudioVoice =>
      startPlayback(sound, true, playOptions),
    stopAll: (): void => {
      for (const slot of slots) release(slot);
    },
    get gain(): number {
      return masterGainValue;
    },
    set gain(value: number) {
      assertGain(value, "gain");
      masterGainValue = value;
      if (master !== undefined) master.gain.value = value;
    },
    get activeVoices(): number {
      let active = 0;
      for (const slot of slots) if (slot.source !== null) active++;
      return active;
    },
  };

  globalThis.addEventListener?.("pointerdown", unlock);
  globalThis.addEventListener?.("keydown", unlock);

  return {
    controller,
    dispose: (): void => {
      if (disposed) return;
      disposed = true;
      removeUnlockListeners();
      for (const slot of slots) {
        release(slot);
        slot.gain.disconnect();
      }
      slots.length = 0;
      master?.disconnect();
      if (options.context === undefined && context !== undefined) {
        context.close().catch(ignoreRejection);
      }
      context = undefined;
      master = undefined;
    },
  };
}

/**
 * Create an audio plugin and install it on a Matter application.
 *
 * @example
 * const plugins = createPluginHost().use(audio({ maxVoices: 12 }));
 *
 * start({ backend: webgl2(), plugins }, async ({ audio }) => {
 *   const hit = await audio.load('/hit.wav');
 *   return {
 *     update(_dt, { keyJustPressed }) {
 *       if (keyJustPressed(' ')) audio.play(hit, { gain: 0.7 });
 *     },
 *     draw() {},
 *   };
 * });
 */
export function audio(options: AudioPluginOptions = {}): Plugin<AudioApi> {
  let runtime: AudioRuntime | null = null;
  return definePlugin<AudioApi>({
    name: "audio",
    setup: () => {
      if (runtime !== null) throw new AudioPluginInUseError();
      runtime = createRuntime(options);
      return { audio: runtime.controller };
    },
    dispose: () => {
      runtime?.dispose();
      runtime = null;
    },
  });
}
