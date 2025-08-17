'use client';

import { useEffect, useRef } from 'react';

interface CRTEffectProps {
  enabled: boolean;
  intensity?: number;
}

const vertexShaderSource = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const fragmentShaderSource = `
  precision mediump float;
  
  uniform sampler2D u_image;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_intensity;
  
  varying vec2 v_texCoord;
  
  vec2 barrelDistortion(vec2 coord, float amount) {
    vec2 cc = coord - 0.5;
    float dist = dot(cc, cc);
    return coord + cc * dist * amount;
  }
  
  float scanline(vec2 coord) {
    return sin(coord.y * 800.0) * 0.04;
  }
  
  float vignette(vec2 coord) {
    vec2 q = coord;
    q = q * 2.0 - 1.0;
    return 1.0 - dot(q * q, q * q) * 0.5;
  }
  
  vec3 chromaticAberration(sampler2D tex, vec2 coord) {
    float amount = 0.002;
    float r = texture2D(tex, coord + vec2(amount, 0.0)).r;
    float g = texture2D(tex, coord).g;
    float b = texture2D(tex, coord - vec2(amount, 0.0)).b;
    return vec3(r, g, b);
  }
  
  void main() {
    // Apply barrel distortion
    vec2 coord = barrelDistortion(v_texCoord, 0.2 * u_intensity);
    
    // Outside screen bounds check
    if (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    
    // Get color with chromatic aberration
    vec3 color = chromaticAberration(u_image, coord);
    
    // Apply scanlines
    float scanlineEffect = 1.0 + scanline(coord) * u_intensity;
    color *= scanlineEffect;
    
    // Apply vignette
    color *= vignette(coord);
    
    // Add some noise/grain
    float noise = (fract(sin(dot(coord * u_time, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.02 * u_intensity;
    color += vec3(noise);
    
    // Subtle brightness flicker
    float flicker = 1.0 + sin(u_time * 60.0) * 0.005 * u_intensity;
    color *= flicker;
    
    // Clamp and output
    color = clamp(color, 0.0, 1.0);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function CRTEffect({ enabled, intensity = 1.0 }: CRTEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);

  useEffect(() => {
    if (!enabled || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl');
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }

    glRef.current = gl;

    // Create shaders
    const createShader = (source: string, type: number) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      
      return shader;
    };

    const vertexShader = createShader(vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = createShader(fragmentShaderSource, gl.FRAGMENT_SHADER);
    
    if (!vertexShader || !fragmentShader) return;

    // Create program
    const program = gl.createProgram();
    if (!program) return;
    
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return;
    }
    
    programRef.current = program;
    gl.useProgram(program);

    // Set up geometry
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]);
    
    const texCoords = new Float32Array([
      0, 1,
      1, 1,
      0, 0,
      1, 0,
    ]);

    // Create buffers
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
    
    const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    // Create texture for screen capture
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    textureRef.current = texture;

    // Get uniform locations
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    const timeLocation = gl.getUniformLocation(program, 'u_time');
    const intensityLocation = gl.getUniformLocation(program, 'u_intensity');

    // Handle resize
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    };
    
    resize();
    window.addEventListener('resize', resize);

    // Capture screen content
    const captureScreen = () => {
      // Create an off-screen canvas to capture the page
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = window.innerWidth;
      offscreenCanvas.height = window.innerHeight;
      const ctx = offscreenCanvas.getContext('2d');
      
      if (!ctx) return null;
      
      // This is a simplified version - in production you'd use html2canvas or similar
      // For now, we'll create a test pattern
      ctx.fillStyle = '#352879'; // C64 blue
      ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
      
      return offscreenCanvas;
    };

    // Animation loop
    let startTime = Date.now();
    const animate = () => {
      if (!gl || !program) return;
      
      const screenCanvas = captureScreen();
      if (screenCanvas) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, screenCanvas);
      }
      
      const currentTime = (Date.now() - startTime) / 1000;
      gl.uniform1f(timeLocation, currentTime);
      gl.uniform1f(intensityLocation, intensity);
      
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (gl && program) {
        gl.deleteProgram(program);
      }
      if (gl && texture) {
        gl.deleteTexture(texture);
      }
    };
  }, [enabled, intensity]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[10002]"
      style={{ mixBlendMode: 'normal' }}
    />
  );
}