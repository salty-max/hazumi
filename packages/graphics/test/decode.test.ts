import { describe, expect, test } from "bun:test";
import { CommandBuffer, decode, UnknownOpcodeError, type CommandVisitor } from "../src/index";

describe("decode", () => {
  test("dispatches commands in stream order", () => {
    const buf = new CommandBuffer();
    buf.setFill(1, 0, 0, 1);
    buf.circle(1, 2, 3);
    buf.rect(4, 5, 6, 7);
    buf.circle(8, 9, 10);

    const seen: string[] = [];
    const visitor: CommandVisitor = {
      setFill: (): void => void seen.push("fill"),
      circle: (): void => void seen.push("circle"),
      rect: (): void => void seen.push("rect"),
    };

    decode(buf, visitor);
    expect(seen).toEqual(["fill", "circle", "rect", "circle"]);
  });

  test("passes operands through exactly", () => {
    const buf = new CommandBuffer();
    buf.circle(1.5, -2.5, 0.25);

    let got: number[] = [];
    decode(buf, {
      circle: (x: number, y: number, r: number): void => {
        got = [x, y, r];
      },
    });

    expect(got).toEqual([1.5, -2.5, 0.25]);
  });

  test("skips commands the visitor does not implement", () => {
    const buf = new CommandBuffer();
    buf.setFill(1, 1, 1, 1);
    buf.circle(1, 2, 3);

    let circles = 0;
    // No setFill handler at all — the walk must still advance correctly.
    decode(buf, { circle: (): void => void circles++ });

    expect(circles).toBe(1);
  });

  test("walking an empty buffer is a no-op", () => {
    const buf = new CommandBuffer();
    let calls = 0;
    decode(buf, { circle: (): void => void calls++ });
    expect(calls).toBe(0);
  });

  test("every known opcode has a decode case", () => {
    const buf = new CommandBuffer();
    buf.setFill(1, 0, 0, 1);
    buf.setTint(1, 1, 1, 1);
    buf.setStroke(0, 1, 0, 1);
    buf.setStrokeWidth(2);
    buf.setBlend(0);
    buf.push();
    buf.translate(1, 2);
    buf.rotate(0.1);
    buf.scale(2, 2);
    buf.resetTransform();
    buf.background(0, 0, 0, 1);
    buf.circle(0, 0, 1);
    buf.ellipse(0, 0, 1, 2);
    buf.rect(0, 0, 1, 1);
    buf.line(0, 0, 1, 1);
    buf.setTextSize(12);
    buf.setTextAlign(0, 0);
    buf.setFont("sans-serif");
    buf.text(0, 0, "x");
    buf.beginPath();
    buf.moveTo(0, 0);
    buf.lineTo(1, 0);
    buf.quadraticTo(1, 1, 0, 1);
    buf.cubicTo(0, 1, 1, 1, 1, 0);
    buf.closePath();
    buf.fillPath();
    buf.strokePath();
    buf.image({ width: 1, height: 1 } as never, 0, 0, 1, 1);
    buf.imageRegion({ width: 1, height: 1 } as never, 0, 0, 1, 1, 0, 0, 1, 1);
    buf.pop();

    expect(() => decode(buf, {})).not.toThrow();
  });

  test("rejects an opcode this build does not know", () => {
    const buf = new CommandBuffer();
    buf.circle(1, 2, 3);
    // Corrupt the opcode in place, simulating a stream from a newer build.
    buf.u32[0] = 999;

    expect(() => decode(buf, {})).toThrow(UnknownOpcodeError);
  });

  test("the unknown-opcode error reports what and where", () => {
    const buf = new CommandBuffer();
    buf.circle(1, 2, 3);
    buf.circle(4, 5, 6);
    buf.u32[4] = 999;

    try {
      decode(buf, {});
      throw new Error("expected decode to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownOpcodeError);
      expect((error as UnknownOpcodeError).opcode).toBe(999);
      expect((error as UnknownOpcodeError).offset).toBe(4);
    }
  });

  test("a reset buffer decodes as empty", () => {
    const buf = new CommandBuffer();
    buf.circle(1, 2, 3);
    buf.reset();

    let calls = 0;
    decode(buf, { circle: (): void => void calls++ });
    expect(calls).toBe(0);
  });
});

describe("text decoding", () => {
  test("resolves string ids so backends never see the table", () => {
    const buf = new CommandBuffer();
    buf.setFont("Georgia");
    buf.setTextSize(24);
    buf.text(10, 20, "hello");

    let font = "";
    let size = 0;
    let content = "";
    let position: number[] = [];

    decode(buf, {
      setFont: (family: string): void => {
        font = family;
      },
      setTextSize: (value: number): void => {
        size = value;
      },
      text: (x: number, y: number, value: string): void => {
        position = [x, y];
        content = value;
      },
    });

    expect(font).toBe("Georgia");
    expect(size).toBe(24);
    expect(content).toBe("hello");
    expect(position).toEqual([10, 20]);
  });

  test("text commands interleave correctly with shapes", () => {
    const buf = new CommandBuffer();
    buf.circle(0, 0, 1);
    buf.text(0, 0, "a");
    buf.rect(0, 0, 1, 1);

    const seen: string[] = [];
    decode(buf, {
      circle: (): void => void seen.push("circle"),
      text: (): void => void seen.push("text"),
      rect: (): void => void seen.push("rect"),
    });
    expect(seen).toEqual(["circle", "text", "rect"]);
  });

  test("an unresolvable string id degrades to empty rather than undefined", () => {
    const buf = new CommandBuffer();
    buf.text(0, 0, "x");
    buf.u32[3] = 99; // point past the table

    let content = "unset";
    decode(buf, { text: (_x, _y, value: string): void => void (content = value) });
    expect(content).toBe("");
  });
});

describe("text with non-ASCII characters", () => {
  test("the buffer carries the string unchanged", () => {
    // Whether a backend can draw a character is the backend's problem; the
    // format must not mangle it on the way through.
    const buf = new CommandBuffer();
    const content = "Café · 100% — “quoted” ¿qué?";
    buf.text(0, 0, content);

    let seen = "";
    decode(buf, { text: (_x, _y, value: string): void => void (seen = value) });
    expect(seen).toBe(content);
  });
});
