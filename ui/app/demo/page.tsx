'use client'

import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from "react"
// Optional: high-fidelity DOM capture. Install with: npm i html2canvas
// If you don't want DOM capture, you can feed an existing <canvas> or <video> via the `sourceCanvas` prop.
import html2canvas from "html2canvas"

/**
 * CrtMonitor
 *
 * A self-contained React + TypeScript component that renders arbitrary page content
 * through a WebGL2 CRT shader with curvature, scanlines, phosphor mask, noise,
 * bloom-ish glow, chromatic aberration, and vignette. Includes a stylized bezel/case.
 *
 * Usage (capture this component's children):
 *
 * <CrtMonitor width={1024} height={768} bezelLabel="VINTAGE-3200">
 *   <YourContentComponent />
 * </CrtMonitor>
 *
 * Usage (capture any external HTMLElement by ref):
 * const targetRef = useRef<HTMLDivElement>(null);
 * ...
 * <div ref={targetRef}>.....</div>
 * <CrtMonitor width={1024} height={768} captureRef={targetRef} />
 *
 * Usage (feed an existing canvas or video):
 * <CrtMonitor width={800} height={600} sourceCanvas={yourCanvasEl} />
 *
 * Notes:
 * - html2canvas cannot capture cross-origin iframes due to browser security; keep content same-origin.
 * - For performance, the capture FPS defaults to 20. Tweak the `fps` prop.
 * - If you don’t use Tailwind in your app, replace the classNames with your CSS.
 */

export type CrtMonitorProps = {
  width: number;
  height: number;
  /** If provided, capture this DOM into a texture (overrides children capture) */
  captureRef?: React.RefObject<HTMLElement>;
  /** If provided, use this canvas/video directly as the source texture (skips html2canvas). */
  sourceCanvas?: HTMLCanvasElement | HTMLVideoElement | null;
  /** Frames per second for DOM capture */
  fps?: number; // default 20
  /** Barrel distortion strength (>0 curves outward). Typical 0.12 - 0.25 */
  curvature?: number; // default 0.18
  /** 0..1 intensity */
  scanlineIntensity?: number; // default 0.35
  /** 0..1 strength of RGB triad mask */
  maskStrength?: number; // default 0.35
  /** 0..1 vignette strength */
  vignette?: number; // default 0.35
  /** 0..1 chromatic aberration strength */
  aberration?: number; // default 0.12
  /** 0..1 noise strength */
  noise?: number; // default 0.08
  /** 0..1 bloom-ish glow mix */
  bloom?: number; // default 0.15
  /** Optional label on the bezel */
  bezelLabel?: string;
  /** Rounded corner radius for glass in CSS pixels */
  glassRadius?: number; // default 24
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

// Utility: Create a WebGL program
function createProgram(
  gl: WebGL2RenderingContext,
  vertSource: string,
  fragSource: string,
): WebGLProgram {
  const vs = gl.createShader(gl.VERTEX_SHADER)!
  gl.shaderSource(vs, vertSource)
  gl.compileShader(vs)
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    throw new Error("Vertex shader error: " + gl.getShaderInfoLog(vs))
  }

  const fs = gl.createShader(gl.FRAGMENT_SHADER)!
  gl.shaderSource(fs, fragSource)
  gl.compileShader(fs)
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    throw new Error("Fragment shader error: " + gl.getShaderInfoLog(fs))
  }

  const program = gl.createProgram()!
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error("Program link error: " + gl.getProgramInfoLog(program))
  }

  gl.deleteShader(vs)
  gl.deleteShader(fs)
  return program
}

// Fullscreen quad buffer
function createFullscreenQuad(gl: WebGL2RenderingContext) {
  const vao = gl.createVertexArray()!
  gl.bindVertexArray(vao)

  const vbo = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
  // Triangle strip covering clipspace
  const verts = new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    1, 1,
  ])
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)
  return {vao, vbo}
}

const VERT_SRC = `#version 300 es
precision mediump float;
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5; // map from clip [-1,1] to UV [0,1]
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

// High-fidelity CRT fragment shader (WebGL2 / GLSL 300 es)
// Features: barrel distortion, vignette, scanlines, RGB mask, chromatic aberration, noise, simple bloom
const FRAG_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_tex;
uniform vec2 u_resolution; // canvas size in pixels
uniform float u_time;

uniform float u_curvature;      // 0.0..0.6
uniform float u_scanline;       // 0..1
uniform float u_maskStrength;   // 0..1
uniform float u_vignette;       // 0..1
uniform float u_aberration;     // 0..1
uniform float u_noise;          // 0..1
uniform float u_bloom;          // 0..1

// Hash-based noise
float rnd(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
}

// Barrel/pincushion distortion mapping
vec2 distort(vec2 uv, float k) {
  // remap uv 0..1 -> -1..1
  vec2 p = uv * 2.0 - 1.0;
  float r2 = dot(p, p);
  vec2 pd = p + p * (k * r2);
  return (pd * 0.5 + 0.5);
}

// Sample source texture with chromatic aberration (radial)
vec3 sampleWithCA(vec2 uv, vec2 center, float ca) {
  vec2 p = uv - center;
  vec2 dir = normalize(p + 1e-6);
  float d = length(p);
  vec2 offset = dir * d * ca * 0.01; // scale down
  float r = texture(u_tex, uv + offset).r;
  float g = texture(u_tex, uv).g;
  float b = texture(u_tex, uv - offset).b;
  return vec3(r,g,b);
}

// Simple separable blur-ish sample kernel (few taps) for glow/bloom
vec3 softGlow(vec2 uv) {
  vec2 texel = 1.0 / u_resolution;
  vec3 c = texture(u_tex, uv).rgb * 0.227027;
  c += texture(u_tex, uv + vec2(texel.x * 1.3846, 0.0)).rgb * 0.316216;
  c += texture(u_tex, uv - vec2(texel.x * 1.3846, 0.0)).rgb * 0.316216;
  c += texture(u_tex, uv + vec2(0.0, texel.y * 1.3846)).rgb * 0.070270;
  c += texture(u_tex, uv - vec2(0.0, texel.y * 1.3846)).rgb * 0.070270;
  return c;
}

void main() {
  // Apply barrel distortion to UVs
  vec2 uv = distort(v_uv, u_curvature);

  // Outside the screen after distortion? fade to black with rounded edge
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Base image with chromatic aberration
  vec3 col = sampleWithCA(uv, vec2(0.5), u_aberration);

  // Scanlines (horizontal) + shadow mask (vertical RGB triad)
  float pxY = v_uv.y * u_resolution.y; // use undistorted space for consistent density
  float scan = 0.9 + 0.1 * sin(pxY * 3.14159); // soft cosine
  col *= mix(1.0, scan, u_scanline);

  // RGB triad mask
  float pxX = v_uv.x * u_resolution.x;
  float tri = mod(floor(pxX), 3.0);
  vec3 mask = vec3(
    step(2.5, tri) * 0.6 + step(tri, 0.5) * 1.0, // R active on tri==0
    step(0.5, tri) * step(tri, 1.5) * 1.0 + (1.0 - step(0.5, tri) * step(tri, 1.5)) * 0.6, // G on tri==1
    step(1.5, tri) * step(tri, 2.5) * 1.0 + (1.0 - step(1.5, tri) * step(tri, 2.5)) * 0.6  // B on tri==2
  );
  col *= mix(vec3(1.0), mask, u_maskStrength);

  // Subtle bloom
  vec3 glow = softGlow(uv);
  col = mix(col, glow, u_bloom);

  // Vignette in distorted space to follow curvature
  float r = distance(uv, vec2(0.5));
  float vig = smoothstep(0.8, 0.2, r);
  col *= mix(1.0, vig, u_vignette);

  // Temporal noise
  float n = rnd(uv * u_resolution + u_time);
  col += (n - 0.5) * u_noise;

  // Slight gamma
  col = pow(max(col, 0.0), vec3(1.0/1.1));

  outColor = vec4(col, 1.0);
}
`

const CrtMonitor: React.FC<CrtMonitorProps> = ({
                                                 width,
                                                 height,
                                                 captureRef,
                                                 sourceCanvas = null,
                                                 fps = 20,
                                                 curvature = 0.18,
                                                 scanlineIntensity = 0.35,
                                                 maskStrength = 0.35,
                                                 vignette = 0.35,
                                                 aberration = 0.12,
                                                 noise = 0.08,
                                                 bloom = 0.15,
                                                 bezelLabel = "",
                                                 glassRadius = 48,
                                                 className,
                                                 style,
                                                 children,
                                               }) => {
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const hiddenCaptureRef = useRef<HTMLDivElement | null>(null)
  const offscreen2DRef = useRef<HTMLCanvasElement | null>(null)
  const [glReady, setGlReady] = useState(false)

  // Initialize offscreen 2D canvas for html2canvas snapshots
  useEffect(() => {
    const c = document.createElement("canvas")
    c.width = width
    c.height = height
    offscreen2DRef.current = c
  }, [width, height])

  // WebGL init
  useEffect(() => {
    const canvas = glCanvasRef.current
    if (!canvas) return
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    })
    if (!gl) {
      console.error("WebGL2 not available")
      return
    }

    // Program
    const program = createProgram(gl, VERT_SRC, FRAG_SRC)
    gl.useProgram(program)

    // Fullscreen quad
    const {vao, vbo} = createFullscreenQuad(gl)
    gl.bindVertexArray(vao)
    const aPosLoc = 0 // layout(location=0)
    gl.enableVertexAttribArray(aPosLoc)
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0)

    // Texture
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    // Uniform locations
    const u_tex = gl.getUniformLocation(program, "u_tex")
    const u_resolution = gl.getUniformLocation(program, "u_resolution")
    const u_time = gl.getUniformLocation(program, "u_time")

    const u_curvature = gl.getUniformLocation(program, "u_curvature")
    const u_scanline = gl.getUniformLocation(program, "u_scanline")
    const u_maskStrength = gl.getUniformLocation(program, "u_maskStrength")
    const u_vignette = gl.getUniformLocation(program, "u_vignette")
    const u_aberration = gl.getUniformLocation(program, "u_aberration")
    const u_noise = gl.getUniformLocation(program, "u_noise")
    const u_bloom = gl.getUniformLocation(program, "u_bloom")

    gl.uniform1i(u_tex, 0)

    let rafId = 0
    const start = performance.now()

    const render = () => {
      const now = performance.now()
      const t = (now - start) / 1000

      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)

      gl.useProgram(program)
      gl.bindVertexArray(vao)

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, tex)

      // Update uniforms
      gl.uniform2f(u_resolution, canvas.width, canvas.height)
      gl.uniform1f(u_time, t)

      gl.uniform1f(u_curvature, curvature)
      gl.uniform1f(u_scanline, scanlineIntensity)
      gl.uniform1f(u_maskStrength, maskStrength)
      gl.uniform1f(u_vignette, vignette)
      gl.uniform1f(u_aberration, aberration)
      gl.uniform1f(u_noise, noise)
      gl.uniform1f(u_bloom, bloom)

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      rafId = requestAnimationFrame(render)
    }

    setGlReady(true)
    rafId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(rafId)
      gl.deleteBuffer(vbo)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
      const ext = gl.getExtension("WEBGL_lose_context")
      ext?.loseContext()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, curvature, scanlineIntensity, maskStrength, vignette, aberration, noise, bloom])

  // Texture updater (from sourceCanvas or html2canvas)
  useEffect(() => {
    if (!glReady) return
    const canvas = glCanvasRef.current!
    const gl = canvas.getContext("webgl2")!
    const tex = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null
    if (!tex) return

    let stopped = false
    const interval = 1000 / Math.max(1, fps)
    let last = 0

    const tick = async (ts: number) => {
      if (stopped) return
      if (ts - last >= interval) {
        last = ts
        try {
          let src: HTMLCanvasElement | HTMLVideoElement | null = sourceCanvas
          if (!src) {
            const targetEl = captureRef?.current ?? hiddenCaptureRef.current
            if (targetEl) {
              // Capture DOM to canvas at desired resolution
              const scaleX = width / targetEl.clientWidth
              const scaleY = height / targetEl.clientHeight
              const scale = Math.min(scaleX || 1, scaleY || 1) || 1
              const snap = await html2canvas(targetEl, {
                backgroundColor: null,
                scale,
                useCORS: true,
                logging: false,
                width: targetEl.clientWidth,
                height: targetEl.clientHeight,
              })
              const off = offscreen2DRef.current!
              const ctx2d = off.getContext("2d")!
              ctx2d.clearRect(0, 0, off.width, off.height)
              // Letterbox to preserve aspect
              const sAR = snap.width / snap.height
              const dAR = off.width / off.height
              let dw = off.width, dh = off.height, dx = 0, dy = 0
              if (sAR > dAR) { // source wider
                dh = Math.round(off.width / sAR)
                dy = Math.round((off.height - dh) / 2)
              } else {
                dw = Math.round(off.height * sAR)
                dx = Math.round((off.width - dw) / 2)
              }
              ctx2d.drawImage(snap, dx, dy, dw, dh)
              src = off
            }
          }
          if (src) {
            gl.bindTexture(gl.TEXTURE_2D, tex)
            // For video/canvas sources
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
            gl.texImage2D(
              gl.TEXTURE_2D,
              0,
              gl.RGBA,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              src,
            )
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("CRT capture warning:", e)
        }
      }
      requestAnimationFrame(tick)
    }

    const raf = requestAnimationFrame(tick)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
    }
  }, [glReady, fps, sourceCanvas, captureRef, width, height])

  // Keep the GL canvas bitmap size matched to props
  useLayoutEffect(() => {
    const c = glCanvasRef.current
    if (!c) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = Math.floor(width * dpr)
    c.height = Math.floor(height * dpr)
    c.style.width = `${width}px`
    c.style.height = `${height}px`
  }, [width, height])

  return (
    <div
      className={[
        "w-full flex items-center justify-center p-6",
        "bg-neutral-900",
        className || "",
      ].join(" ")}
      style={style}
    >
      {/* Monitor case */}
      <div
        className={[
          "relative",
          "rounded-[36px]",
          "shadow-2xl",
          "bg-gradient-to-br from-neutral-800 to-neutral-700",
          "p-6",
          "border border-neutral-600",
        ].join(" ")}
        style={{
          // Subtle plastic texture noise overlay
          boxShadow:
            "inset 0 8px 16px rgba(255,255,255,0.06), inset 0 -8px 16px rgba(0,0,0,0.4), 0 30px 60px rgba(0,0,0,0.6)",
        }}
      >
        {/* Fake screws */}
        <div className="absolute top-3 left-3 w-3 h-3 rounded-full bg-neutral-600 shadow-inner"/>
        <div className="absolute top-3 right-3 w-3 h-3 rounded-full bg-neutral-600 shadow-inner"/>
        <div className="absolute bottom-3 left-3 w-3 h-3 rounded-full bg-neutral-600 shadow-inner"/>
        <div className="absolute bottom-3 right-3 w-3 h-3 rounded-full bg-neutral-600 shadow-inner"/>

        {/* Bezel */}
        <div
          className={[
            "relative",
            "rounded-[28px]",
            "bg-gradient-to-br from-neutral-700 to-neutral-600",
            "p-3",
            "border border-neutral-500",
          ].join(" ")}
          style={{
            boxShadow:
              "inset 0 10px 20px rgba(0,0,0,0.5), inset 0 -10px 20px rgba(255,255,255,0.06)",
          }}
        >
          {/* Glass cavity */}
          <div
            className="relative overflow-hidden border border-neutral-700"
            style={{
              borderRadius: glassRadius,
              background:
                "radial-gradient(120% 160% at 50% 40%, rgba(255,255,255,0.06), rgba(0,0,0,0.85))",
              boxShadow:
                "inset 0 40px 80px rgba(255,255,255,0.05), inset 0 -40px 80px rgba(0,0,0,0.7)",
              width,
              height,
            }}
          >
            {/* WebGL canvas */}
            <canvas ref={glCanvasRef} className="block"/>

            {/* Glass highlight overlay */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(120deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02) 40%, rgba(255,255,255,0) 60%), radial-gradient(80% 100% at 50% 10%, rgba(255,255,255,0.05), rgba(255,255,255,0) 70%)",
                mixBlendMode: "screen",
              }}
            />

            {/* Shadow edge to simulate curved tube depth */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                boxShadow: "inset 0 0 120px rgba(0,0,0,0.7)",
                borderRadius: glassRadius,
              }}
            />
          </div>
        </div>

        {/* Branding / label area */}
        {bezelLabel ? (
          <div className="mt-3 text-center text-xs tracking-[0.3em] text-neutral-300 select-none">
            {bezelLabel}
          </div>
        ) : null}
      </div>

      {/* Hidden capture slot when using children */}
      {(!captureRef && !sourceCanvas) && (
        <div
          ref={hiddenCaptureRef}
          className="sr-only absolute -z-10"
          aria-hidden
          style={{width, height}}
        >
          {children}
        </div>
      )}
    </div>
  )
}

// export default CrtMonitor;

// ---------------------------------------------------------------------------
// Optional demo for local testing
// ---------------------------------------------------------------------------
export default function CrtDemo() {
  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 flex items-center justify-center p-10">
      <CrtMonitor width={960} height={560} bezelLabel="VINTAGE-3200" curvature={0.22}>
        {/* The children will be captured invisibly. This is only for demo purposes.
          Put anything you want inside; it will render on the CRT. */}
        <div className="z-999">
          <div
            className="w-[960px] h-[560px] flex flex-col items-center justify-center bg-black text-green-300 font-mono">
            <div className="text-5xl mb-6">HELLO, WORLD_</div>
            <div className="opacity-80">Press any key to continue…</div>
          </div>
        </div>
      </CrtMonitor>
    </div>
  )
};
