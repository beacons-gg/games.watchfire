import { useEffect, useRef } from "react";
import { FLAME_PALETTE, FlameSim } from "@watchfire/core/flame";

const W = 160;
const H = 56;

/**
 * The game's own fire, drawn on a canvas: the same simulation as the terminal's, one canvas pixel
 * per flame pixel, scaled up crisp. `strength` 0..1 is how high it burns. Still for people who
 * ask for less motion.
 */
export function FlameCanvas(props: { strength: number; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strength = useRef(props.strength);
  strength.current = props.strength;

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const sim = new FlameSim(W, H);
    const image = ctx.createImageData(W, H);
    const draw = () => {
      const px = sim.px;
      for (let i = 0; i < px.length; i++) {
        const heat = px[i]!;
        const [r, g, b] = FLAME_PALETTE[heat]!;
        const o = i * 4;
        image.data[o] = r;
        image.data[o + 1] = g;
        image.data[o + 2] = b;
        image.data[o + 3] = heat === 0 ? 0 : Math.min(255, 60 + heat * 12);
      }
      ctx.putImageData(image, 0, 0);
    };
    for (let i = 0; i < H * 2; i++) sim.step(strength.current); // start lit
    draw();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let last = 0;
    const loop = (t: number) => {
      frame = requestAnimationFrame(loop);
      if (t - last < 70) return; // about 14 frames a second, like the terminal
      last = t;
      sim.step(strength.current);
      draw();
    };
    // Burn only while it's on screen: scrolled past, it waits where it was.
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const seen = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) stop();
      else if (!frame) frame = requestAnimationFrame(loop);
    });
    seen.observe(canvas.current!);
    return () => {
      seen.disconnect();
      stop();
    };
  }, []);

  return <canvas ref={canvas} width={W} height={H} className={props.className} aria-hidden="true" />;
}
