import { useEffect, useRef } from 'react';
import { formatMultiplier } from './crashMath';

export type FlightPhase = 'waiting' | 'flying' | 'crashed';

export const WAITING_TIME = 10;

interface AviatorCanvasProps {
  phase: FlightPhase;
  multiplier: number;
  countdown: number;
  crashPoint: number | null;
}

interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
  tw: number;
}

interface Streak {
  x: number;
  y: number;
  len: number;
  a: number;
}

interface Cloud {
  x: number;
  y: number;
  w: number;
  h: number;
  layer: 0 | 1;
  puff: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
}

function pointOnQuad(
  t: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

function tangentOnQuad(
  t: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
) {
  return {
    x: 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
    y: 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
  };
}

function clampPitch(rad: number) {
  const min = (-32 * Math.PI) / 180;
  const max = (10 * Math.PI) / 180;
  return Math.max(min, Math.min(max, rad));
}

function climbAmount(multiplier: number) {
  const raw = Math.min(1, Math.max(0, (multiplier - 1) / 1.35));
  return 1 - (1 - raw) ** 1.45;
}

function seedClouds(w: number, h: number): Cloud[] {
  const back = Array.from({ length: 6 }, (_, i) => ({
    x: (w / 5) * i + Math.random() * 36,
    y: h * (0.58 + Math.random() * 0.32),
    w: 110 + Math.random() * 90,
    h: 28 + Math.random() * 22,
    layer: 0 as const,
    puff: 0.75 + Math.random() * 0.4,
  }));
  const front = Array.from({ length: 5 }, (_, i) => ({
    x: (w / 5) * i + Math.random() * 24,
    y: h * (0.68 + Math.random() * 0.26),
    w: 70 + Math.random() * 50,
    h: 16 + Math.random() * 14,
    layer: 1 as const,
    puff: 0.85 + Math.random() * 0.3,
  }));
  return [...back, ...front];
}

function drawSunsetCloud(ctx: CanvasRenderingContext2D, cloud: Cloud) {
  const { x, y, w, h, puff, layer } = cloud;
  const glow = ctx.createRadialGradient(x + w * 0.5, y + h, w * 0.2, x + w * 0.5, y, w * 0.7);
  if (layer === 0) {
    glow.addColorStop(0, 'rgba(251, 146, 60, 0.28)');
    glow.addColorStop(0.55, 'rgba(168, 85, 247, 0.16)');
    glow.addColorStop(1, 'rgba(168, 85, 247, 0)');
  } else {
    glow.addColorStop(0, 'rgba(249, 115, 22, 0.32)');
    glow.addColorStop(0.5, 'rgba(236, 72, 153, 0.18)');
    glow.addColorStop(1, 'rgba(236, 72, 153, 0)');
  }
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(x + w * 0.28, y + h * 0.55, w * 0.3 * puff, h * 0.6, 0, 0, Math.PI * 2);
  ctx.ellipse(x + w * 0.52, y + h * 0.32, w * 0.34 * puff, h * 0.78, 0, 0, Math.PI * 2);
  ctx.ellipse(x + w * 0.76, y + h * 0.5, w * 0.26 * puff, h * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.shadowColor = '#e879f9';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-8, -9);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-8, 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPropeller(ctx: CanvasRenderingContext2D, angle: number, spinningFast: boolean) {
  ctx.save();
  ctx.translate(24, 0);
  if (spinningFast) {
    const disc = ctx.createRadialGradient(0, 0, 0.6, 0, 0, 7.2);
    disc.addColorStop(0, 'rgba(255,255,255,0.55)');
    disc.addColorStop(0.4, 'rgba(232, 121, 249, 0.22)');
    disc.addColorStop(1, 'rgba(168, 85, 247, 0)');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.2, 7.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.rotate(angle);
  ctx.strokeStyle = spinningFast ? 'rgba(250, 232, 255, 0.45)' : 'rgba(250, 232, 255, 0.9)';
  ctx.lineWidth = spinningFast ? 1.05 : 1.35;
  ctx.beginPath();
  ctx.moveTo(0, -6.4);
  ctx.quadraticCurveTo(1.1, 0, 0, 6.4);
  ctx.quadraticCurveTo(-1.1, 0, 0, -6.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-6.4, 0);
  ctx.quadraticCurveTo(0, 1.1, 6.4, 0);
  ctx.quadraticCurveTo(0, -1.1, -6.4, 0);
  ctx.stroke();
  ctx.fillStyle = '#d8b4fe';
  ctx.beginPath();
  ctx.arc(0, 0, 1.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawNextpariFighter(ctx: CanvasRenderingContext2D, propAngle: number, scale: number, fast: boolean) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.shadowColor = '#a855f7';
  ctx.shadowBlur = 12;

  ctx.fillStyle = '#1e1b4b';
  ctx.beginPath();
  ctx.ellipse(-4, -11, 16, 2.4, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c084fc';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-18, -11);
  ctx.lineTo(10, -12.4);
  ctx.stroke();

  ctx.fillStyle = '#312e81';
  ctx.beginPath();
  ctx.moveTo(6, 3);
  ctx.lineTo(-8, 15);
  ctx.lineTo(-2, 16.5);
  ctx.lineTo(10, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#e879f9';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(8, 4.2);
  ctx.lineTo(-7, 16);
  ctx.stroke();
  ctx.fillStyle = '#e879f9';
  ctx.beginPath();
  ctx.arc(-7.2, 16, 1.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(196, 181, 253, 0.7)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-2, 4);
  ctx.lineTo(-6, -10);
  ctx.moveTo(4, 4);
  ctx.lineTo(2, -11);
  ctx.stroke();

  ctx.fillStyle = '#2e1065';
  ctx.beginPath();
  ctx.moveTo(-20, 1);
  ctx.lineTo(-28, -13);
  ctx.lineTo(-22, 0);
  ctx.lineTo(-27, 7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.moveTo(-27, -11.5);
  ctx.lineTo(-24.2, -3.2);
  ctx.lineTo(-21.2, -12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 4.4px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', -24.2, -6.4);

  ctx.fillStyle = '#312e81';
  ctx.beginPath();
  ctx.ellipse(-24, 2.4, 6.5, 1.7, 0.12, 0, Math.PI * 2);
  ctx.fill();

  const body = ctx.createLinearGradient(-26, 6, 22, -6);
  body.addColorStop(0, '#0f0a1f');
  body.addColorStop(0.45, '#1e1b4b');
  body.addColorStop(0.8, '#4338ca');
  body.addColorStop(1, '#a78bfa');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.bezierCurveTo(14, -6.5, 4, -8, -8, -6.5);
  ctx.lineTo(-22, -3.5);
  ctx.quadraticCurveTo(-26, 0, -22, 4.5);
  ctx.lineTo(-8, 6.8);
  ctx.bezierCurveTo(4, 8, 14, 6, 18, 0);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(216, 180, 254, 0.45)';
  ctx.lineWidth = 0.9;
  ctx.stroke();

  ctx.fillStyle = '#1e1b4b';
  ctx.beginPath();
  ctx.ellipse(16.5, 0.2, 4.4, 4.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c4b5fd';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  ctx.fillStyle = '#312e81';
  ctx.beginPath();
  ctx.moveTo(2, 4);
  ctx.quadraticCurveTo(-4, 11, -12, 14);
  ctx.lineTo(-6, 6);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.ellipse(-2, 7.5, 2.1, 2.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.arc(-2, 7.5, 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-2, 5.6);
  ctx.lineTo(-2, 3.8);
  ctx.stroke();

  ctx.font = '800 3.8px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('NEXT', -10, 1.4);
  ctx.fillStyle = '#22c55e';
  ctx.fillText('PARI', 2.6, 1.4);

  const canopy = ctx.createLinearGradient(2, -8, 10, 0);
  canopy.addColorStop(0, '#f5d0fe');
  canopy.addColorStop(1, '#6d28d9');
  ctx.fillStyle = canopy;
  ctx.beginPath();
  ctx.moveTo(-2, -5.2);
  ctx.quadraticCurveTo(6, -11.5, 12, -4.2);
  ctx.lineTo(10, -2.4);
  ctx.quadraticCurveTo(4, -5.5, -1, -3.6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(245, 208, 254, 0.7)';
  ctx.lineWidth = 0.6;
  ctx.stroke();

  drawPropeller(ctx, propAngle, fast);
  ctx.restore();
}

function drawGoldMultiplier(ctx: CanvasRenderingContext2D, w: number, h: number, multiplier: number) {
  const label = `x${multiplier.toFixed(2)}`;
  const size = Math.max(44, Math.min(w, h) * 0.22);
  ctx.save();
  ctx.font = `900 ${size}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const cx = w / 2;
  const cy = h * 0.42;
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = '#7c2d12';
  ctx.strokeText(label, cx, cy);
  ctx.lineWidth = size * 0.07;
  ctx.strokeStyle = '#fde68a';
  ctx.strokeText(label, cx, cy);
  const fill = ctx.createLinearGradient(cx, cy - size * 0.55, cx, cy + size * 0.5);
  fill.addColorStop(0, '#fff7cc');
  fill.addColorStop(0.4, '#fbbf24');
  fill.addColorStop(1, '#ea580c');
  ctx.fillStyle = fill;
  ctx.shadowColor = '#fb923c';
  ctx.shadowBlur = 22;
  ctx.fillText(label, cx, cy);
  ctx.restore();
}

export function AviatorCanvas({ phase, multiplier, countdown, crashPoint }: AviatorCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const streaksRef = useRef<Streak[]>([]);
  const cloudsRef = useRef<Cloud[]>([]);
  const smokeRef = useRef<Particle[]>([]);
  const flyAwayRef = useRef(0);
  const sizeRef = useRef({ w: 360, h: 280 });
  const lastTimeRef = useRef(0);
  const lastPhaseRef = useRef(phase);
  const propsRef = useRef({ phase, multiplier, countdown, crashPoint });
  propsRef.current = { phase, multiplier, countdown, crashPoint };

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let running = true;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };
      starsRef.current = Array.from({ length: 36 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h * 0.55,
        r: Math.random() * 1.2 + 0.2,
        a: Math.random() * 0.5 + 0.12,
        tw: Math.random() * Math.PI * 2,
      }));
      streaksRef.current = Array.from({ length: 9 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h * 0.45,
        len: 18 + Math.random() * 28,
        a: 0.12 + Math.random() * 0.18,
      }));
      cloudsRef.current = seedClouds(w, h);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    window.addEventListener('resize', resize);

    const loop = (now: number) => {
      if (!running) return;
      const { w, h } = sizeRef.current;
      const dt = lastTimeRef.current ? Math.min(0.05, (now - lastTimeRef.current) / 1000) : 0.016;
      lastTimeRef.current = now;
      const t = now / 1000;
      const { phase: p, multiplier: m } = propsRef.current;

      if (lastPhaseRef.current !== p) {
        if (p === 'crashed') flyAwayRef.current = 0;
        if (p === 'waiting') {
          flyAwayRef.current = 0;
          smokeRef.current = [];
        }
        lastPhaseRef.current = p;
      }
      if (p === 'crashed') {
        flyAwayRef.current = Math.min(1, flyAwayRef.current + dt * 1.35);
      }

      ctx.clearRect(0, 0, w, h);
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#14021f');
      sky.addColorStop(0.38, '#3b0764');
      sky.addColorStop(0.68, '#9d174d');
      sky.addColorStop(1, '#fb923c');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      const sun = ctx.createRadialGradient(w * 0.52, h * 0.78, 8, w * 0.52, h * 0.78, h * 0.38);
      sun.addColorStop(0, 'rgba(254, 243, 199, 0.85)');
      sun.addColorStop(0.25, 'rgba(251, 146, 60, 0.35)');
      sun.addColorStop(1, 'rgba(251, 146, 60, 0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, h * 0.45, w, h * 0.55);

      for (const star of starsRef.current) {
        const twinkle = star.a * (0.45 + 0.55 * Math.sin(t * 2.1 + star.tw));
        ctx.fillStyle = `rgba(233, 213, 255, ${twinkle})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = 'rgba(216, 180, 254, 0.22)';
      ctx.lineWidth = 1.2;
      for (const streak of streaksRef.current) {
        ctx.globalAlpha = streak.a;
        ctx.beginPath();
        ctx.moveTo(streak.x, streak.y);
        ctx.lineTo(streak.x + streak.len, streak.y + streak.len * 0.18);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      const speedMul = p === 'waiting' ? 0.28 : 1 + Math.min(2.4, Math.log(Math.max(1, m)) * 0.7);
      for (const cloud of cloudsRef.current) {
        const speed = cloud.layer === 0 ? 16 * speedMul : 36 * speedMul;
        cloud.x -= speed * dt;
        if (cloud.x + cloud.w < -30) cloud.x = w + 12 + Math.random() * 40;
        if (cloud.layer === 0) drawSunsetCloud(ctx, cloud);
      }

      ctx.strokeStyle = 'rgba(233, 213, 255, 0.08)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 8; i += 1) {
        const y = (h / 8) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const start = { x: 22, y: h - 22 };
      const climb = p === 'waiting' ? 0.04 : climbAmount(m);
      const cruise = { x: w * 0.76, y: h * 0.4 };
      const bob = p === 'flying' && climb > 0.72 ? Math.sin(t * 2) * 6 : 0;
      const fly = flyAwayRef.current ** 1.45;
      const end = {
        x: start.x + (cruise.x - start.x) * climb + fly * w * 0.95,
        y: start.y + (cruise.y - start.y) * climb + bob - fly * h * 0.28,
      };
      const ctrl = {
        x: start.x + (end.x - start.x) * 0.42,
        y: start.y + (end.y - start.y) * 0.58,
      };

      ctx.beginPath();
      ctx.moveTo(start.x, h);
      ctx.lineTo(start.x, start.y);
      ctx.quadraticCurveTo(ctrl.x, ctrl.y, end.x, end.y);
      ctx.lineTo(end.x + 12, h);
      ctx.closePath();
      const fill = ctx.createLinearGradient(0, Math.min(end.y, start.y), 0, h);
      fill.addColorStop(0, 'rgba(236, 72, 153, 0.32)');
      fill.addColorStop(0.4, 'rgba(168, 85, 247, 0.16)');
      fill.addColorStop(0.75, 'rgba(34, 197, 94, 0.06)');
      fill.addColorStop(1, 'rgba(168, 85, 247, 0)');
      ctx.fillStyle = fill;
      ctx.fill();

      for (let i = 1; i <= 6; i += 1) {
        const pt = pointOnQuad(i / 7, start, ctrl, end);
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.x, h);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#e879f9';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.quadraticCurveTo(ctrl.x, ctrl.y, end.x, end.y);
      ctx.strokeStyle = '#ec4899';
      ctx.shadowColor = '#a855f7';
      ctx.shadowBlur = 18;
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(233, 213, 255, 0.85)';
      ctx.lineWidth = 1.1;
      ctx.stroke();

      const tan = tangentOnQuad(0.96, start, ctrl, end);
      const rawAngle = Math.atan2(tan.y, tan.x);
      const angle = p === 'waiting' ? -0.18 : clampPitch(rawAngle);
      drawArrow(ctx, end.x + Math.cos(angle) * 10, end.y + Math.sin(angle) * 10, angle);

      for (const cloud of cloudsRef.current) {
        if (cloud.layer === 1) drawSunsetCloud(ctx, cloud);
      }

      const propSpeed = p === 'waiting' ? 8 : 26;
      const scale = Math.max(1.35, Math.min(w, h) / 220);

      if (p === 'flying' || p === 'crashed') {
        smokeRef.current.push({
          x: end.x - Math.cos(angle) * 18,
          y: end.y - Math.sin(angle) * 18,
          vx: -Math.cos(angle) * (12 + Math.random() * 10) * dt * 60,
          vy: -Math.sin(angle) * 5 * dt * 60 + (Math.random() - 0.5),
          life: 1,
          size: 1.8 + Math.random() * 3.2,
        });
        if (smokeRef.current.length > 60) smokeRef.current.splice(0, smokeRef.current.length - 60);
      }
      for (const particle of smokeRef.current) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life -= dt * 1.4;
        const alpha = Math.max(0, particle.life);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.45})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(236, 72, 153, ${alpha * 0.35})`;
        ctx.beginPath();
        ctx.arc(particle.x - 2, particle.y, particle.size * (0.5 + alpha), 0, Math.PI * 2);
        ctx.fill();
      }
      smokeRef.current = smokeRef.current.filter((particle) => particle.life > 0);

      ctx.save();
      ctx.translate(end.x, end.y);
      ctx.rotate(angle);
      drawNextpariFighter(ctx, t * propSpeed, scale, p !== 'waiting');
      ctx.restore();

      if (p !== 'waiting') {
        drawGoldMultiplier(ctx, w, h, m);
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, []);

  const secondsLeft = Math.max(0, Math.ceil(countdown));
  const waitProgress = Math.max(0, Math.min(1, countdown / WAITING_TIME));

  return (
    <div ref={wrapRef} className="relative h-full min-h-[180px] w-full overflow-hidden rounded-2xl ring-1 ring-fuchsia-400/25">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        {phase === 'crashed' && <div className="absolute inset-0 bg-white/10" />}
        {phase === 'waiting' && (
          <div className="w-[min(86%,20rem)] text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-fuchsia-200/85">Следующий раунд через</p>
            <p className="mt-1 text-5xl font-black tabular-nums text-white">{secondsLeft}...</p>
            <div className="mx-auto mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 via-violet-400 to-emerald-400 transition-[width] duration-150"
                style={{ width: `${waitProgress * 100}%` }}
              />
            </div>
          </div>
        )}
        {phase === 'crashed' && (
          <div className="mt-24 rounded-full bg-rose-500 px-4 py-1.5 text-sm font-black uppercase tracking-[0.22em] text-white shadow-lg shadow-rose-900/50">
            FLEW AWAY!
          </div>
        )}
        {phase === 'crashed' && crashPoint != null && (
          <p className="mt-2 text-xs font-bold text-fuchsia-100/80">краш {formatMultiplier(crashPoint)}</p>
        )}
      </div>
    </div>
  );
}
