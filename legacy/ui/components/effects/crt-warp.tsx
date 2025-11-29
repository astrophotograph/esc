'use client';

import { useEffect, useRef } from 'react';

interface CRTWarpProps {
  theme: string;
}

export function CRTWarp({ theme }: CRTWarpProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    // Only apply to C64 theme
    if (theme !== 'c64') return;

    // Create SVG filter for authentic CRT barrel distortion
    const createCRTFilter = () => {
      if (!svgRef.current) return;
      
      const svg = svgRef.current;
      svg.innerHTML = `
        <defs>
          <!-- Barrel distortion using displacement map -->
          <filter id="crt-warp" x="-20%" y="-20%" width="140%" height="140%">
            <!-- Create displacement map for barrel distortion -->
            <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="1" result="warp" seed="1"/>
            <feColorMatrix in="warp" type="matrix" 
              values="1 0 0 0 0.5
                      0 1 0 0 0.5
                      0 0 1 0 0.5
                      0 0 0 0 1" result="distortion"/>
            
            <!-- Radial gradient for barrel effect -->
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.5" result="blurred"/>
            
            <!-- Displacement -->
            <feDisplacementMap in="SourceGraphic" in2="distortion" scale="15" 
              xChannelSelector="R" yChannelSelector="G" result="displaced"/>
            
            <!-- Chromatic aberration -->
            <feOffset in="displaced" dx="1" dy="0" result="red"/>
            <feOffset in="displaced" dx="0" dy="0" result="green"/>
            <feOffset in="displaced" dx="-1" dy="0" result="blue"/>
            
            <feComponentTransfer in="red" result="red-channel">
              <feFuncR type="identity"/>
              <feFuncG type="discrete" tableValues="0"/>
              <feFuncB type="discrete" tableValues="0"/>
            </feComponentTransfer>
            
            <feComponentTransfer in="green" result="green-channel">
              <feFuncR type="discrete" tableValues="0"/>
              <feFuncG type="identity"/>
              <feFuncB type="discrete" tableValues="0"/>
            </feComponentTransfer>
            
            <feComponentTransfer in="blue" result="blue-channel">
              <feFuncR type="discrete" tableValues="0"/>
              <feFuncG type="discrete" tableValues="0"/>
              <feFuncB type="identity"/>
            </feComponentTransfer>
            
            <feComposite in="red-channel" in2="green-channel" operator="screen" result="rg"/>
            <feComposite in="rg" in2="blue-channel" operator="screen" result="rgb"/>
            
            <!-- Add scanlines -->
            <feTurbulence type="fractalNoise" baseFrequency="0 0.2" numOctaves="1" result="scanlines"/>
            <feColorMatrix in="scanlines" type="matrix"
              values="0 0 0 0 0
                      0 0 0 0 0
                      0 0 0 0 0
                      0 0 0 -0.1 1"/>
            <feComposite in="rgb" operator="multiply" result="final"/>
            
            <!-- Slight blur for phosphor glow -->
            <feGaussianBlur in="final" stdDeviation="0.3" result="glowed"/>
            <feComposite in="glowed" in2="final" operator="over"/>
          </filter>
          
          <!-- Simpler warp for performance -->
          <filter id="crt-simple-warp">
            <feTurbulence type="turbulence" baseFrequency="0.02 0.01" numOctaves="2" result="turbulence" seed="2"/>
            <feDisplacementMap in2="turbulence" in="SourceGraphic" scale="20" xChannelSelector="R" yChannelSelector="G"/>
          </filter>
        </defs>
      `;
    };

    createCRTFilter();

    // Apply the warp effect to the main content
    const applyWarp = () => {
      const mainContent = document.querySelector('body > div:first-child');
      if (mainContent && mainContent instanceof HTMLElement) {
        mainContent.style.filter = 'url(#crt-simple-warp)';
      }
    };

    // Small delay to ensure DOM is ready
    setTimeout(applyWarp, 100);

    return () => {
      const mainContent = document.querySelector('body > div:first-child');
      if (mainContent && mainContent instanceof HTMLElement) {
        mainContent.style.filter = '';
      }
    };
  }, [theme]);

  if (theme !== 'c64') return null;

  return (
    <>
      <svg
        ref={svgRef}
        className="absolute w-0 h-0"
        style={{ position: 'absolute', width: 0, height: 0 }}
        aria-hidden="true"
      />
      
      {/* Additional CSS-based warping */}
      <style dangerouslySetInnerHTML={{ __html: `
        .c64 > div:first-child {
          animation: crt-flicker 0.15s infinite alternate;
          will-change: transform;
        }
        
        @keyframes crt-flicker {
          0% {
            transform: scale(0.94) perspective(800px) rotateX(1deg) translateZ(0);
          }
          100% {
            transform: scale(0.9401) perspective(800px) rotateX(1deg) translateZ(0);
          }
        }
        
        /* Enhanced scanline effect */
        .c64 body::before {
          content: "";
          position: fixed;
          top: 35px;
          left: 35px;
          right: 35px;
          bottom: 35px;
          background: 
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(0, 0, 0, 0.1) 2px,
              rgba(0, 0, 0, 0.1) 4px
            ),
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 2px,
              rgba(0, 0, 0, 0.05) 2px,
              rgba(0, 0, 0, 0.05) 4px
            );
          pointer-events: none;
          z-index: 9998;
          border-radius: 45px;
          animation: scanline-roll 8s linear infinite;
        }
        
        @keyframes scanline-roll {
          0% {
            background-position: 0 0, 0 0;
          }
          100% {
            background-position: 0 10px, 10px 0;
          }
        }
        
        /* Phosphor bloom effect */
        .c64 * {
          text-shadow: 
            0 0 2px rgba(140, 170, 255, 0.8),
            0 0 4px rgba(140, 170, 255, 0.6),
            0 0 6px rgba(140, 170, 255, 0.4);
        }
        
        /* Enhanced monitor curve */
        .c64::before {
          content: "";
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          border: 35px solid;
          border-image: linear-gradient(
            45deg,
            hsl(221 70% 60%),
            hsl(221 60% 65%),
            hsl(221 50% 70%),
            hsl(221 60% 65%)
          ) 1;
          border-radius: 80px;
          pointer-events: none;
          z-index: 10000;
          box-shadow: 
            inset 0 0 120px rgba(0, 0, 0, 0.8),
            inset 0 0 80px rgba(0, 0, 0, 0.6),
            inset 0 0 40px rgba(0, 0, 0, 0.4),
            inset 0 5px 15px rgba(0, 0, 0, 0.8),
            0 0 50px rgba(0, 0, 0, 0.5),
            inset 0 0 10px 5px rgba(140, 170, 255, 0.1);
        }
      `}} />
    </>
  );
}