/**
 * Chromatic Waves — Originkit component, adapted for Vite + Tailwind.
 * Tuned light: paper background + soft blue palette to match the app.
 */
import { useEffect, useRef, type CSSProperties } from "react";
import {
  Renderer,
  Camera,
  Mesh,
  Plane,
  Program,
  RenderTarget as OglRenderTarget,
} from "ogl";

const INTRINSIC_WIDTH = 600;
const INTRINSIC_HEIGHT = 600;

const perlinVertexShader = `#version 300 es
in vec2 uv;
in vec2 position;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0., 1.);
}`;

const perlinFragmentShader = `#version 300 es
precision mediump float;
uniform float uFrequency;
uniform float uTime;
uniform float uSpeed;
uniform float uValue;
uniform vec2 uResolution;
in vec2 vUv;
out vec4 fragColor;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  uv = (uv - 0.5) * vec2(aspect, 1.0) + 0.5;
  float hue = abs(snoise(vec3(uv * uFrequency, uTime * uSpeed)));
  vec3 rainbowColor = hsv2rgb(vec3(hue, 1.0, uValue));
  fragColor = vec4(rainbowColor, 1.0);
}`;

const dotVertexShader = `#version 300 es
in vec2 uv;
in vec2 position;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0., 1.);
}`;

const dotFragmentShader = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform sampler2D uTexture;
uniform int uPaletteCount;
uniform vec3 uPalette[10];
uniform float uPaletteAlpha[10];
uniform float uCellSize;
uniform float uGamma;
uniform float uPaletteBias;
out vec4 fragColor;

void main() {
  vec2 pix = gl_FragCoord.xy;
  float cell = max(uCellSize, 1.0);
  vec2 cellIdx = floor(pix / cell);
  vec2 cellCenter = (cellIdx + 0.5) * cell;
  vec3 col = texture(uTexture, cellCenter / uResolution.xy).rgb;
  float gray = 0.3 * col.r + 0.59 * col.g + 0.11 * col.b;
  gray = pow(clamp(gray, 0.0001, 1.0), uGamma);
  vec2 cellUV = fract(pix / cell) - 0.5;
  float dist = length(cellUV);
  float radius = clamp(gray + uPaletteBias, 0.0, 1.0) * 0.5;
  float aa = fwidth(dist) + 1e-4;
  float mark = 1.0 - smoothstep(radius - aa, radius + aa, dist);
  float g2 = clamp(gray + uPaletteBias, 0.0, 1.0);
  int cnt = max(uPaletteCount, 1);
  vec3 dotCol;
  float dotOpacity;
  if (cnt <= 1) {
    dotCol = uPalette[0];
    dotOpacity = uPaletteAlpha[0];
  } else {
    float scaled = g2 * float(cnt - 1);
    int seg = int(floor(scaled));
    seg = clamp(seg, 0, cnt - 2);
    float f = clamp(scaled - float(seg), 0.0, 1.0);
    dotCol = mix(uPalette[seg], uPalette[seg + 1], f);
    dotOpacity = mix(uPaletteAlpha[seg], uPaletteAlpha[seg + 1], f);
  }
  fragColor = vec4(dotCol, mark * dotOpacity);
}`;

type Rgba = { r: number; g: number; b: number; a: number };

function parseColorToRgba(input: string): Rgba {
  if (!input) return { r: 0, g: 0, b: 0, a: 1 };
  const str = input.trim();
  const rgbaMatch = str.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/i,
  );
  if (rgbaMatch) {
    return {
      r: Math.max(0, Math.min(255, parseFloat(rgbaMatch[1]!))) / 255,
      g: Math.max(0, Math.min(255, parseFloat(rgbaMatch[2]!))) / 255,
      b: Math.max(0, Math.min(255, parseFloat(rgbaMatch[3]!))) / 255,
      a: rgbaMatch[4] !== undefined ? Math.max(0, Math.min(1, parseFloat(rgbaMatch[4]))) : 1,
    };
  }
  const hex = str.replace(/^#/, "");
  if (hex.length === 8) {
    return {
      r: parseInt(hex.slice(0, 2), 16) / 255,
      g: parseInt(hex.slice(2, 4), 16) / 255,
      b: parseInt(hex.slice(4, 6), 16) / 255,
      a: parseInt(hex.slice(6, 8), 16) / 255,
    };
  }
  if (hex.length === 6) {
    return {
      r: parseInt(hex.slice(0, 2), 16) / 255,
      g: parseInt(hex.slice(2, 4), 16) / 255,
      b: parseInt(hex.slice(4, 6), 16) / 255,
      a: 1,
    };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

function colorStringToVec4(input: string): [number, number, number, number] {
  const { r, g, b, a } = parseColorToRgba(input);
  return [r, g, b, a];
}

function mapLinear(value: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  if (inMax === inMin) return outMin;
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

const mapFrequencyUiToShader = (ui: number) => mapLinear(ui, 1, 10, 0.3, 6);
const mapSpeedUiToShader = (ui: number) => ui * 0.05;
const mapCellSizeUiToShader = (ui: number) => mapLinear(ui, 1, 100, 6, 60);
const mapGammaUiToShader = (ui: number) => mapLinear(ui, 1, 20, 0.5, 8);
const mapPaletteBiasUiToShader = (ui: number) => ui * 0.05;

const MAX_COLORS = 10;

function buildPaletteUniforms(colorList: string[]) {
  const rgb: [number, number, number][] = [];
  const alpha: number[] = [];
  for (let i = 0; i < MAX_COLORS; i++) {
    const src = colorList[i];
    if (src != null) {
      const [r, g, b, a] = colorStringToVec4(src);
      rgb.push([r, g, b]);
      alpha.push(a);
    } else {
      rgb.push([0, 0, 0]);
      alpha.push(0);
    }
  }
  return { rgb, alpha };
}

export interface ChromaticWavesProps {
  frequency?: number;
  speed?: number;
  bgColor?: string;
  colors?: string[];
  cellSize?: number;
  gamma?: number;
  paletteBias?: number;
  style?: CSSProperties;
  className?: string;
}

/** Very soft blue dots — atmosphere only, never compete with UI. */
export const LIGHT_WAVES_PALETTE = [
  "rgba(174, 183, 244, 0.28)",
  "rgba(107, 122, 235, 0.16)",
  "rgba(51, 71, 224, 0.08)",
  "rgba(236, 238, 252, 0.2)",
];

export default function ChromaticWaves({
  frequency = 2,
  speed = 2.5,
  bgColor = "transparent",
  colors = LIGHT_WAVES_PALETTE,
  cellSize = 42,
  gamma = 8,
  paletteBias = -4,
  style,
  className,
}: ChromaticWavesProps) {
  const paletteColors = Array.isArray(colors) && colors.length > 0 ? colors : LIGHT_WAVES_PALETTE;
  const effPaletteCount = Math.min(MAX_COLORS, Math.max(1, paletteColors.length));
  const palette = buildPaletteUniforms(paletteColors);
  const paletteKey = paletteColors.slice(0, MAX_COLORS).join("|");
  const effectivePlay = true;

  const containerRef = useRef<HTMLDivElement>(null);
  const perlinProgramRef = useRef<Program | null>(null);
  const dotProgramRef = useRef<Program | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const perlinMeshRef = useRef<Mesh | null>(null);
  const dotMeshRef = useRef<Mesh | null>(null);
  const renderTargetRef = useRef<OglRenderTarget | null>(null);
  // ogl's gl context is WebGL1|2 depending on browser — keep loose
  const glRef = useRef<any>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const isPlayingRef = useRef(effectivePlay);

  const renderOnce = () => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const perlinMesh = perlinMeshRef.current;
    const dotMesh = dotMeshRef.current;
    const renderTarget = renderTargetRef.current;
    const gl = glRef.current;
    const dotProgram = dotProgramRef.current;
    if (!renderer || !camera || !perlinMesh || !dotMesh || !renderTarget || !gl || !dotProgram) return;
    renderer.render({ scene: perlinMesh, camera, target: renderTarget });
    (dotProgram.uniforms as any).uResolution.value = [gl.canvas.width, gl.canvas.height];
    renderer.render({ scene: dotMesh, camera });
  };

  useEffect(() => {
    let resizeHandler: (() => void) | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const container = containerRef.current;
    if (!container) return;

    const renderer = new Renderer({
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      alpha: true,
      premultipliedAlpha: false,
    });
    const gl = renderer.gl;
    container.appendChild(gl.canvas);
    gl.canvas.style.width = "100%";
    gl.canvas.style.height = "100%";
    gl.canvas.style.display = "block";
    rendererRef.current = renderer;
    glRef.current = gl;

    const camera = new Camera(gl, { near: 0.1, far: 100 });
    camera.position.set(0, 0, 3);
    cameraRef.current = camera;

    const doResize = () => {
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;
      renderer.setSize(width, height);
      camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
      if (renderTargetRef.current?.setSize) {
        renderTargetRef.current.setSize(gl.canvas.width, gl.canvas.height);
      }
      if (perlinProgramRef.current) {
        (perlinProgramRef.current.uniforms as any).uResolution.value = [
          gl.canvas.width,
          gl.canvas.height,
        ];
      }
    };

    let resizePending = false;
    const scheduleResize = () => {
      if (resizePending) return;
      resizePending = true;
      requestAnimationFrame(() => {
        resizePending = false;
        doResize();
        if (!isPlayingRef.current) renderOnce();
      });
    };
    resizeHandler = scheduleResize;
    window.addEventListener("resize", scheduleResize);
    if (typeof window.ResizeObserver !== "undefined") {
      resizeObserver = new window.ResizeObserver(scheduleResize);
      resizeObserver.observe(container);
    }
    scheduleResize();

    const perlinProgram = new Program(gl, {
      vertex: perlinVertexShader,
      fragment: perlinFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uFrequency: { value: mapFrequencyUiToShader(frequency) },
        uSpeed: { value: effectivePlay ? mapSpeedUiToShader(speed) : 0 },
        uValue: { value: 1 },
        uResolution: { value: [gl.canvas.width, gl.canvas.height] },
      },
    });
    perlinProgramRef.current = perlinProgram;
    const perlinMesh = new Mesh(gl, {
      geometry: new Plane(gl, { width: 2, height: 2 }),
      program: perlinProgram,
    });
    perlinMeshRef.current = perlinMesh;

    const renderTarget = new OglRenderTarget(gl);
    renderTargetRef.current = renderTarget;

    const dotProgram = new Program(gl, {
      vertex: dotVertexShader,
      fragment: dotFragmentShader,
      uniforms: {
        uResolution: { value: [gl.canvas.width, gl.canvas.height] },
        uTexture: { value: renderTarget.texture },
        uPaletteCount: { value: effPaletteCount },
        uPalette: { value: palette.rgb },
        uPaletteAlpha: { value: palette.alpha },
        uCellSize: { value: mapCellSizeUiToShader(cellSize) },
        uGamma: { value: mapGammaUiToShader(gamma) },
        uPaletteBias: { value: mapPaletteBiasUiToShader(paletteBias) },
      },
      transparent: true,
      depthTest: false,
    });
    dotProgramRef.current = dotProgram;
    const dotMesh = new Mesh(gl, {
      geometry: new Plane(gl, { width: 2, height: 2 }),
      program: dotProgram,
    });
    dotMeshRef.current = dotMesh;

    const frameInterval = 1000 / 30;
    const update = (time: number) => {
      if (!isPlayingRef.current) {
        rafIdRef.current = null;
        return;
      }
      if (time - lastTimeRef.current < frameInterval) {
        rafIdRef.current = requestAnimationFrame(update);
        return;
      }
      lastTimeRef.current = time;
      (perlinProgram.uniforms as any).uTime.value = time * 0.001;
      renderer.render({ scene: perlinMesh, camera, target: renderTarget });
      (dotProgram.uniforms as any).uResolution.value = [gl.canvas.width, gl.canvas.height];
      (perlinProgram.uniforms as any).uResolution.value = [gl.canvas.width, gl.canvas.height];
      renderer.render({ scene: dotMesh, camera });
      rafIdRef.current = requestAnimationFrame(update);
    };

    renderOnce();
    isPlayingRef.current = effectivePlay;
    if (effectivePlay && rafIdRef.current == null) {
      lastTimeRef.current = 0;
      rafIdRef.current = requestAnimationFrame(update);
    }

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      resizeObserver?.disconnect();
      if (gl.canvas.parentElement === container) container.removeChild(gl.canvas);
      perlinProgramRef.current = null;
      dotProgramRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
      perlinMeshRef.current = null;
      dotMeshRef.current = null;
      renderTargetRef.current = null;
      glRef.current = null;
      rafIdRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const perlin = perlinProgramRef.current;
    if (perlin) {
      (perlin.uniforms as any).uFrequency.value = mapFrequencyUiToShader(frequency);
      (perlin.uniforms as any).uSpeed.value = effectivePlay ? mapSpeedUiToShader(speed) : 0;
    }
    const dot = dotProgramRef.current;
    if (dot) {
      (dot.uniforms as any).uPaletteCount.value = effPaletteCount;
      (dot.uniforms as any).uPalette.value = palette.rgb;
      (dot.uniforms as any).uPaletteAlpha.value = palette.alpha;
      (dot.uniforms as any).uCellSize.value = mapCellSizeUiToShader(cellSize);
      (dot.uniforms as any).uGamma.value = mapGammaUiToShader(gamma);
      (dot.uniforms as any).uPaletteBias.value = mapPaletteBiasUiToShader(paletteBias);
    }
    if (!isPlayingRef.current) renderOnce();
  }, [frequency, speed, effPaletteCount, paletteKey, cellSize, gamma, paletteBias, effectivePlay]);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: bgColor,
        lineHeight: 0,
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          width: `${INTRINSIC_WIDTH}px`,
          height: `${INTRINSIC_HEIGHT}px`,
          minWidth: `${INTRINSIC_WIDTH}px`,
          minHeight: `${INTRINSIC_HEIGHT}px`,
          visibility: "hidden",
          position: "absolute",
          pointerEvents: "none",
        }}
      />
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}
