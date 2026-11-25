import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
}

interface FireworksCanvasProps {
  burstKey: number;
}

const COLORS = ['#0284C7', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4', '#F97316'];

export function FireworksCanvas({ burstKey }: FireworksCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (burstKey === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    // Launch 3 coordinated bursts across upper/middle screen
    const centers = [
      { x: canvas.width * 0.28, y: canvas.height * 0.34 },
      { x: canvas.width * 0.52, y: canvas.height * 0.26 },
      { x: canvas.width * 0.74, y: canvas.height * 0.36 },
    ];

    centers.forEach((c) => {
      const count = 34;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.25;
        const speed = 2.6 + Math.random() * 5.2;
        particlesRef.current.push({
          x: c.x,
          y: c.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.2,
          size: 3 + Math.random() * 4,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          alpha: 1,
          decay: 0.015 + Math.random() * 0.012,
        });
      }
    });

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const list = particlesRef.current;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.11; // gentle gravity
        p.vx *= 0.985;
        p.alpha -= p.decay;
        if (p.alpha <= 0) {
          list.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (list.length > 0) {
        rafRef.current = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [burstKey]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-50"
      aria-hidden="true"
    />
  );
}
