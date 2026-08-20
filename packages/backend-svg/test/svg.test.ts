import { describe, expect, test } from 'bun:test';
import { Blend, CommandBuffer, type Renderer } from '@matter/graphics';
import { escapeXml, SvgRenderer, toSvg } from '../src/index';

function render(draw: (b: CommandBuffer) => void, w = 200, h = 200): string {
  const buf = new CommandBuffer();
  draw(buf);
  return toSvg(buf, w, h);
}

describe('document', () => {
  test('is well-formed and carries a viewBox', () => {
    const svg = render((b) => b.circle(10, 10, 5), 300, 150);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('width="300"');
    expect(svg).toContain('height="150"');
    expect(svg).toContain('viewBox="0 0 300 150"');
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  test('every opening tag is closed', () => {
    const svg = render((b) => {
      b.background(0, 0, 0, 1);
      b.circle(1, 2, 3);
      b.rect(1, 2, 3, 4);
      b.setStrokeWidth(2);
      b.setStroke(1, 1, 1, 1);
      b.line(0, 0, 5, 5);
    });
    const opens = (svg.match(/<(circle|rect|line|ellipse)\b/g) ?? []).length;
    const closes = (svg.match(/\/>/g) ?? []).length;
    expect(closes).toBe(opens);
  });

  test('an empty buffer still produces a valid document', () => {
    const svg = render(() => {});
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });
});

describe('primitives stay primitives', () => {
  /**
   * The point of this backend: the buffer holds shapes, not triangles. A circle
   * arriving here as a polygon would mean tessellation had leaked into the
   * encoder, which is the invariant AGENTS.md protects.
   */
  test('a circle exports as <circle>, not a polygon', () => {
    const svg = render((b) => b.circle(50, 60, 20));
    expect(svg).toContain('<circle cx="50" cy="60" r="20"');
    expect(svg).not.toContain('<polygon');
    expect(svg).not.toContain('<path');
  });

  test('an ellipse exports as <ellipse>', () => {
    const svg = render((b) => b.ellipse(50, 60, 30, 15));
    expect(svg).toContain('<ellipse cx="50" cy="60" rx="30" ry="15"');
  });

  test('a rect exports as <rect>', () => {
    const svg = render((b) => b.rect(5, 6, 70, 80));
    expect(svg).toContain('<rect x="5" y="6" width="70" height="80"');
  });

  test('a line exports as <line>', () => {
    const svg = render((b) => {
      b.setStroke(1, 0, 0, 1);
      b.setStrokeWidth(3);
      b.line(1, 2, 30, 40);
    });
    expect(svg).toContain('<line x1="1" y1="2" x2="30" y2="40"');
    expect(svg).toContain('stroke-width="3"');
  });
});

describe('style', () => {
  test('fill becomes a hex colour', () => {
    const svg = render((b) => {
      b.setFill(1, 0, 0, 1);
      b.circle(1, 1, 1);
    });
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).not.toContain('fill-opacity');
  });

  test('translucent fill emits fill-opacity', () => {
    const svg = render((b) => {
      b.setFill(0, 0, 1, 0.5);
      b.circle(1, 1, 1);
    });
    expect(svg).toContain('fill="#0000ff"');
    expect(svg).toContain('fill-opacity="0.5"');
  });

  test('zero-alpha fill becomes fill="none"', () => {
    const svg = render((b) => {
      b.setFill(1, 1, 1, 0);
      b.setStroke(1, 1, 1, 1);
      b.setStrokeWidth(2);
      b.circle(1, 1, 1);
    });
    expect(svg).toContain('fill="none"');
  });

  test('a line never carries a fill', () => {
    const svg = render((b) => {
      b.setFill(1, 0, 0, 1);
      b.setStroke(0, 1, 0, 1);
      b.setStrokeWidth(2);
      b.line(0, 0, 10, 10);
    });
    const lineTag = svg.split('\n').find((l) => l.includes('<line')) ?? '';
    expect(lineTag).toContain('fill="none"');
  });

  test('additive blending maps to a CSS blend mode', () => {
    const svg = render((b) => {
      b.setBlend(Blend.Add);
      b.setFill(1, 1, 1, 1);
      b.circle(1, 1, 1);
    });
    expect(svg).toContain('mix-blend-mode:plus-lighter');
  });

  test('a stroke-less shape omits stroke attributes entirely', () => {
    const svg = render((b) => {
      b.setFill(1, 1, 1, 1);
      b.circle(1, 1, 1);
    });
    expect(svg).not.toContain('stroke=');
  });
});

describe('transforms', () => {
  test('identity emits no transform attribute', () => {
    expect(render((b) => b.circle(1, 1, 1))).not.toContain('transform=');
  });

  test('a translate is baked into a matrix', () => {
    const svg = render((b) => {
      b.translate(10, 20);
      b.circle(0, 0, 5);
    });
    expect(svg).toContain('transform="matrix(1 0 0 1 10 20)"');
  });

  test('composed transforms multiply', () => {
    const svg = render((b) => {
      b.translate(10, 0);
      b.scale(2, 2);
      b.circle(0, 0, 5);
    });
    expect(svg).toContain('matrix(2 0 0 2 10 0)');
  });

  test('pop restores the previous transform', () => {
    const svg = render((b) => {
      b.push();
      b.translate(50, 50);
      b.circle(0, 0, 5);
      b.pop();
      b.circle(1, 1, 5);
    });
    const circles = svg.split('\n').filter((l) => l.includes('<circle'));
    expect(circles[0]).toContain('matrix(1 0 0 1 50 50)');
    // Back to identity, so no attribute at all.
    expect(circles[1]).not.toContain('transform=');
  });

  test('pop restores the previous style', () => {
    const svg = render((b) => {
      b.setFill(1, 0, 0, 1);
      b.push();
      b.setFill(0, 1, 0, 1);
      b.circle(0, 0, 5);
      b.pop();
      b.circle(1, 1, 5);
    });
    const circles = svg.split('\n').filter((l) => l.includes('<circle'));
    expect(circles[0]).toContain('#00ff00');
    expect(circles[1]).toContain('#ff0000');
  });
});

describe('background', () => {
  test('opaque background discards everything before it', () => {
    const svg = render((b) => {
      b.circle(1, 1, 1);
      b.background(0, 0, 0, 1);
      b.rect(2, 2, 2, 2);
    });
    expect(svg).not.toContain('<circle');
    expect(svg).toContain('<rect');
  });

  test('translucent background keeps what came before', () => {
    const svg = render((b) => {
      b.circle(1, 1, 1);
      b.background(0, 0, 0, 0.5);
    });
    expect(svg).toContain('<circle');
    expect(svg).toContain('fill-opacity="0.5"');
  });
});

describe('output hygiene', () => {
  test('numbers are trimmed rather than padded with zeros', () => {
    const svg = render((b) => b.circle(10, 20, 5));
    expect(svg).toContain('cx="10"');
    expect(svg).not.toContain('cx="10.000"');
  });

  test('precision is configurable', () => {
    const buf = new CommandBuffer();
    buf.circle(1 / 3, 0, 1);
    expect(toSvg(buf, 10, 10, { precision: 1 })).toContain('cx="0.3"');
    expect(toSvg(buf, 10, 10, { precision: 5 })).toContain('cx="0.33333"');
  });

  test('escapes XML metacharacters', () => {
    expect(escapeXml('a & b < c > "d"')).toBe('a &amp; b &lt; c &gt; &quot;d&quot;');
  });

  test('re-rendering replaces rather than appends', () => {
    const renderer = new SvgRenderer(100, 100);
    const buf = new CommandBuffer();
    buf.circle(1, 1, 1);
    renderer.render(buf);
    renderer.render(buf);
    expect((renderer.svg.match(/<circle/g) ?? []).length).toBe(1);
  });
});

/**
 * SvgRenderer satisfies Renderer but deliberately not BackendFactory: there is
 * no canvas to build it from. Asserting the contract here means a change to
 * the interface breaks this file rather than surfacing at a call site.
 */
describe('Renderer contract', () => {
  test('is assignable to Renderer', () => {
    const renderer: Renderer = new SvgRenderer(100, 100);
    const buf = new CommandBuffer();
    buf.circle(1, 1, 1);

    renderer.setViewport(50, 50);
    renderer.render(buf);
    expect((renderer as SvgRenderer).svg).toContain('viewBox="0 0 50 50"');

    renderer.dispose();
    expect((renderer as SvgRenderer).svg).not.toContain('<circle');
  });
});
