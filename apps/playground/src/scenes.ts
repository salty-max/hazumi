/** Starter scenes, written the way a user would write them. */
export interface Starter {
  readonly name: string;
  readonly code: string;
}

export const STARTERS: readonly Starter[] = [
  {
    name: "Hello circle",
    code: `// Everything you need is destructured from the context.
return {
  draw(_alpha, { background, circle, fill, width, height, t }) {
    background('oklch(0.15 0.02 260)');
    fill('oklch(0.72 0.18 250)');
    circle(width / 2, height / 2, 180 + Math.sin(t * 2) * 70);
  },
};`,
  },
  {
    name: "Noise field",
    code: `// s is the same context, available while the scene is created.
const points = Array.from({ length: 2500 }, () => ({
  x: s.random.range(0, s.width),
  y: s.random.range(0, s.height),
}));

return {
  draw(_alpha, { background, circle, fill, noise, width, height, t }) {
    // A translucent background fades the last frame instead of clearing it.
    background('oklch(0.12 0.02 265 / 0.08)');

    for (const p of points) {
      const a = noise.noise3(p.x * 0.003, p.y * 0.003, t * 0.1) * Math.PI * 3;
      p.x = (p.x + Math.cos(a) * 1.5 + width) % width;
      p.y = (p.y + Math.sin(a) * 1.5 + height) % height;
      fill('oklch(0.8 0.14 210 / 0.35)');
      circle(p.x, p.y, 2);
    }
  },
};`,
  },
  {
    name: "Transform stack",
    code: `return {
  draw(_alpha, { background, push, pop, translate, rotate, rect, fill, width, height, t }) {
    background('oklch(0.97 0.01 90)');
    push();
    translate(width / 2, height / 2);

    for (let ring = 1; ring <= 6; ring++) {
      push();
      rotate(t * 0.3 / ring * (ring % 2 ? 1 : -1));
      for (let i = 0; i < ring * 3; i++) {
        rotate((Math.PI * 2) / (ring * 3));
        push();
        translate(ring * 38, 0);
        fill(\`oklch(0.6 0.17 \${ring * 45})\`);
        rect(-9, -9, 18, 18);
        pop();
      }
      pop();
    }
    pop();
  },
};`,
  },
  {
    name: "Scoped style",
    code: `// with() restores style on exit — even if the body throws,
// which is the thing push()/pop() cannot promise.
return {
  draw(_alpha, { background, circle, fill, stroke, strokeWeight, with: scoped, width, height }) {
    background('oklch(0.96 0.01 80)');
    fill('oklch(0.55 0.2 25)');

    scoped({ fill: 'oklch(0.6 0.16 200)', stroke: 'white', strokeWeight: 6 }, () => {
      circle(width / 2 - 90, height / 2, 160);
    });

    // Back to the red fill, and no stroke.
    circle(width / 2 + 90, height / 2, 160);
  },
};`,
  },
  {
    name: "Text",
    code: `return {
  draw(_alpha, { background, text, textSize, textAlign, textFont, fill, width, height, t }) {
    background('oklch(0.16 0.03 265)');
    textFont('Georgia, serif');
    textAlign(1, 2); // Align.Center, Baseline.Middle

    for (let i = 0; i < 5; i++) {
      fill(\`oklch(\${0.5 + i * 0.09} 0.15 \${200 + i * 22})\`);
      textSize(20 + i * 14);
      text('Matter', width / 2, 110 + i * 90 + Math.sin(t + i) * 8);
    }
  },
};`,
  },
];
