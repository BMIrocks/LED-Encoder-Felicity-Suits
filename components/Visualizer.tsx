import React, { useRef, useEffect, useMemo, useState } from 'react';
import { SuitConfig, Cue, LEDPosition } from '../types';
import { calculateLedColor, getActiveCuesForFrame, intToHex, prepareCuesForRender } from '../services/ledEngine';

interface VisualizerProps {
  suits: SuitConfig[];
  currentTime: number;
  cues: Cue[];
  onLedClick: (suitId: number, ledIndex: number) => void;
  isPlaying: boolean;
  videoUrl: string | null;
  playbackRate?: number;
}

// Flattened Geometry Object for Canvas Drawing
interface FlattenedSuitGeometry {
    suitId: number;
    suitName: string;
    offsetX: number;
    offsetY: number;
    strips: {
        path: Path2D; // Pre-calculated path for the strip backing
        points: LEDPosition[]; // Pre-calculated points for LEDs
    }[];
    allLeds: { x: number, y: number, id: number }[]; // For fast hit testing / looping
}

const OFF_COLOR_INT = 0x333333;

const Visualizer: React.FC<VisualizerProps> = ({ 
    suits, 
    currentTime, 
    cues, 
    onLedClick, 
    isPlaying,
    videoUrl,
    playbackRate = 1
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Backing canvas to cache the static geometry (lines + off LEDs)
  const backingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0, scale: 1 });
  
    // -- GEOMETRY CALCULATION --
    const geometry = useMemo(() => {
    // Helper helpers
    const interpolate = (start: {x: number, y: number}, end: {x: number, y: number}, fraction: number) => ({
        x: start.x + (end.x - start.x) * fraction,
        y: start.y + (end.y - start.y) * fraction
    });

    const generatePoints = (count: number, fn: (t: number) => {x:number, y:number}, startIndex: number, part: string) => {
        const pts: LEDPosition[] = [];
        for(let i=0; i<count; i++) {
            const t = i / (count - 1 || 1);
            const pos = fn(t);
            pts.push({ id: startIndex + i, part, ...pos });
        }
        return pts;
    };

    const geometries: FlattenedSuitGeometry[] = [];
    
    suits.forEach((suit, index) => {
        const offsetX = 50 + (index * 200);
        const offsetY = 50; 
        const center = { x: offsetX + 50, y: offsetY + 50 };
        
        // ANATOMY CONFIG
        const shoulderY = center.y + 10; 
        const hipY = center.y + 100;
        const kneeY = hipY + 60;
        const ankleY = kneeY + 50;
        const shoulderWidth = 40;
        const hipWidth = 22;
        const ankleStance = 40;
        const elbowY = shoulderY + 30;
        const wristY = elbowY + 30;
        
        const shoulderR = { x: center.x - shoulderWidth, y: shoulderY };
        const shoulderL = { x: center.x + shoulderWidth, y: shoulderY };
        const hipR = { x: center.x - hipWidth, y: hipY };
        const hipL = { x: center.x + hipWidth, y: hipY };
        const elbowR = { x: shoulderR.x - 20, y: elbowY };
        const wristR = { x: elbowR.x - 20, y: wristY };
        const elbowL = { x: shoulderL.x + 20, y: elbowY };
        const wristL = { x: elbowL.x + 20, y: wristY };
        const kneeR = { x: hipR.x - 10, y: kneeY };
        const ankleR = { x: center.x - ankleStance, y: ankleY };
        const kneeL = { x: hipL.x + 10, y: kneeY };
        const ankleL = { x: center.x + ankleStance, y: ankleY };

        let idx = 0;
        const suitStrips = [];
        const suitLeds: { x: number, y: number, id: number }[] = [];

        const addStrip = (name: string, count: number, points: LEDPosition[], closeLoop: boolean = false) => {
            const path = new Path2D();
            if (points.length > 0) {
                path.moveTo(points[0].x, points[0].y);
                for(let i=1; i<points.length; i++) path.lineTo(points[i].x, points[i].y);
                if (closeLoop) path.closePath();
            }
            suitStrips.push({ path, points });
            points.forEach(p => suitLeds.push({ x: p.x, y: p.y, id: p.id }));
            idx += count;
        };

        // 1. R Torso
        const zipperRBottom = { x: hipR.x + 8, y: hipR.y };
        const zipperRTop = { x: shoulderR.x + 20, y: shoulderY };
        addStrip('rTorso', suit.parts.rTorso, generatePoints(suit.parts.rTorso, t => interpolate(zipperRBottom, zipperRTop, t), idx, 'rTorso'));

        // 2. R Pocket (Rect)
        const rPocketCenter = { x: shoulderR.x + 22, y: shoulderY + 35 };
        const pocketSize = 14;
        const perimeter = pocketSize*4;
        const half = pocketSize/2;
        const tl = {x: rPocketCenter.x-half, y: rPocketCenter.y-half};
        const tr = {x: rPocketCenter.x+half, y: rPocketCenter.y-half};
        const br = {x: rPocketCenter.x+half, y: rPocketCenter.y+half};
        const bl = {x: rPocketCenter.x-half, y: rPocketCenter.y+half};
        
        const getRectPos = (t:number) => {
            const d = t * perimeter;
            if (d<=pocketSize) return interpolate(tl,tr,d/pocketSize);
            if (d<=pocketSize*2) return interpolate(tr,br,(d-pocketSize)/pocketSize);
            if (d<=pocketSize*3) return interpolate(br,bl,(d-pocketSize*2)/pocketSize);
            return interpolate(bl,tl,(d-pocketSize*3)/pocketSize);
        }
        addStrip('rPocket', suit.parts.rPocket, generatePoints(suit.parts.rPocket, getRectPos, idx, 'rPocket'), true);

        // 3. R Arm Down (Poly)
        const rArmPts = [shoulderR, elbowR, wristR];
        const getPolyPos = (t: number, pts: {x:number, y:number}[]) => {
            if (t <= 0.5) return interpolate(pts[0], pts[1], t*2);
            return interpolate(pts[1], pts[2], (t-0.5)*2);
        };
        addStrip('rArmDown', suit.parts.rArmDown, generatePoints(suit.parts.rArmDown, t => getPolyPos(t, rArmPts), idx, 'rArmDown'));

        // 4. R Fingers (Loop)
        addStrip('rFingers', suit.parts.rFingers, generatePoints(suit.parts.rFingers, t => {
            const ang = t * Math.PI * 2;
            return { x: wristR.x + Math.cos(ang)*5, y: wristR.y + Math.sin(ang)*5 };
        }, idx, 'rFingers'), true);

        // 5. R Arm Upper
        const wristRInner = { x: wristR.x + 6, y: wristR.y + 4 };
        const elbowRInner = { x: elbowR.x + 6, y: elbowR.y + 4 };
        const armpitR = { x: shoulderR.x + 5, y: shoulderY + 15 };
        addStrip('rArmUpper', suit.parts.rArmUpper, generatePoints(suit.parts.rArmUpper, t => getPolyPos(t, [wristRInner, elbowRInner, armpitR]), idx, 'rArmUpper'));

        // 6. Face
        const headCenter = { x: center.x, y: shoulderY - 25 };
        addStrip('face', suit.parts.face, generatePoints(suit.parts.face, t => {
            const startAng = Math.PI/2;
            const endAng = -Math.PI*1.5;
            const ang = startAng + (endAng - startAng) * t;
            return { x: headCenter.x + Math.cos(ang)*18, y: headCenter.y + Math.sin(ang)*22 };
        }, idx, 'face'), true);

        // 7. L Arm Up (Poly)
        addStrip('lArmUp', suit.parts.lArmUp, generatePoints(suit.parts.lArmUp, t => getPolyPos(t, [shoulderL, elbowL, wristL]), idx, 'lArmUp'));

        // 8. L Fingers
        addStrip('lFingers', suit.parts.lFingers, generatePoints(suit.parts.lFingers, t => {
             const ang = t * Math.PI * 2;
            return { x: wristL.x + Math.cos(ang)*5, y: wristL.y + Math.sin(ang)*5 };
        }, idx, 'lFingers'), true);

        // 9. L Arm Down
        const wristLInner = { x: wristL.x - 6, y: wristL.y + 4 };
        const elbowLInner = { x: elbowL.x - 6, y: elbowL.y + 4 };
        const armpitL = { x: shoulderL.x - 5, y: shoulderY + 15 };
        addStrip('lArmDown', suit.parts.lArmDown, generatePoints(suit.parts.lArmDown, t => getPolyPos(t, [wristLInner, elbowLInner, armpitL]), idx, 'lArmDown'));

        // 10. L Pocket
        const lPocketCenter = { x: shoulderL.x - 22, y: shoulderY + 35 };
        const tlL = {x: lPocketCenter.x-half, y: lPocketCenter.y-half};
        const trL = {x: lPocketCenter.x+half, y: lPocketCenter.y-half};
        const brL = {x: lPocketCenter.x+half, y: lPocketCenter.y+half};
        const blL = {x: lPocketCenter.x-half, y: lPocketCenter.y+half};
        const getRectPosL = (t:number) => {
             const d = t * perimeter;
             if (d<=pocketSize) return interpolate(tlL,trL,d/pocketSize);
             if (d<=pocketSize*2) return interpolate(trL,brL,(d-pocketSize)/pocketSize);
             if (d<=pocketSize*3) return interpolate(brL,blL,(d-pocketSize*2)/pocketSize);
             return interpolate(blL,tlL,(d-pocketSize*3)/pocketSize);
        }
        addStrip('lPocket', suit.parts.lPocket, generatePoints(suit.parts.lPocket, getRectPosL, idx, 'lPocket'), true);

        // 11. L Torso
        const zipperLTop = { x: shoulderL.x - 20, y: shoulderY };
        const zipperLBottom = { x: hipL.x - 8, y: hipL.y };
        addStrip('lTorso', suit.parts.lTorso, generatePoints(suit.parts.lTorso, t => interpolate(zipperLTop, zipperLBottom, t), idx, 'lTorso'));

        // 12. L Leg Outer
        addStrip('lLegOuter', suit.parts.lLegOuter, generatePoints(suit.parts.lLegOuter, t => getPolyPos(t, [hipL, kneeL, ankleL]), idx, 'lLegOuter'));

        // 13. L Leg Inner
        const crotch = { x: center.x, y: hipY + 15 };
        const ankleLInner = { x: ankleL.x - 8, y: ankleL.y };
        const kneeLInner = { x: kneeL.x - 8, y: kneeL.y };
        addStrip('lLegInner', suit.parts.lLegInner, generatePoints(suit.parts.lLegInner, t => getPolyPos(t, [ankleLInner, kneeLInner, crotch]), idx, 'lLegInner'));

        // 14. R Leg Inner
        const ankleRInner = { x: ankleR.x + 8, y: ankleR.y };
        const kneeRInner = { x: kneeR.x + 8, y: kneeR.y };
        addStrip('rLegInner', suit.parts.rLegInner, generatePoints(suit.parts.rLegInner, t => getPolyPos(t, [crotch, kneeRInner, ankleRInner]), idx, 'rLegInner'));

        // 15. R Leg Outer
        addStrip('rLegOuter', suit.parts.rLegOuter, generatePoints(suit.parts.rLegOuter, t => getPolyPos(t, [ankleR, kneeR, hipR]), idx, 'rLegOuter'));

        // 16. L Leg Outer Ext
        addStrip('lLegOuterExt', suit.parts.lLegOuterExt, generatePoints(suit.parts.lLegOuterExt, t => interpolate({x: ankleL.x, y: ankleL.y - 10}, ankleL, t), idx, 'lLegOuterExt'));

        geometries.push({
            suitId: suit.id,
            suitName: suit.name,
            offsetX,
            offsetY,
            strips: suitStrips,
            allLeds: suitLeds
        });
    });

    return geometries;
    }, [suits]);

    const sceneBounds = useMemo(() => {
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;

        geometry.forEach((suit) => {
            suit.allLeds.forEach((led) => {
                if (led.x < minX) minX = led.x;
                if (led.y < minY) minY = led.y;
                if (led.x > maxX) maxX = led.x;
                if (led.y > maxY) maxY = led.y;
            });
        });

        if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
            return { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1, centerX: 0.5, centerY: 0.5 };
        }

        const padding = 40;
        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;

        const width = Math.max(1, maxX - minX);
        const height = Math.max(1, maxY - minY);
        const centerX = minX + width / 2;
        const centerY = minY + height / 2;

        return { minX, minY, maxX, maxY, width, height, centerX, centerY };
    }, [geometry]);

  // -- INIT CANVAS SIZE --
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const updateCanvasSize = () => {
            const rect = canvas.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2x for performance

            const w = rect.width * dpr;
            const h = rect.height * dpr;

            canvas.width = w;
            canvas.height = h;

            const scaleX = rect.width / sceneBounds.width;
            const scaleY = rect.height / sceneBounds.height;
            const scale = Math.min(scaleX, scaleY) * 0.98;

            setDimensions({ width: w, height: h, scale });
        };

        updateCanvasSize();

        const observer = new ResizeObserver(updateCanvasSize);
        observer.observe(canvas);
        window.addEventListener('resize', updateCanvasSize);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateCanvasSize);
        };
    }, [sceneBounds.width, sceneBounds.height]);

  // -- RENDER CACHED BACKING (Lines + OFF LEDs) --
  useEffect(() => {
      if (dimensions.width === 0) return;

      const backingCanvas = document.createElement('canvas');
      backingCanvas.width = dimensions.width;
      backingCanvas.height = dimensions.height;
      const ctx = backingCanvas.getContext('2d', { alpha: true });
      if (!ctx) return;

      // Transform context to match logical coordinate system
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.scale(dpr, dpr);
      
      const rectWidth = dimensions.width / dpr;
      const rectHeight = dimensions.height / dpr;
      
      const centerX = rectWidth / 2;
      const centerY = rectHeight / 2;
    const sceneCenterX = sceneBounds.centerX;
    const sceneCenterY = sceneBounds.centerY;

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.scale(dimensions.scale, dimensions.scale);
      ctx.translate(-sceneCenterX, -sceneCenterY);

      // Draw Geometry
      geometry.forEach(suitGeo => {
             // 1. Draw Suit Name
             ctx.fillStyle = '#333';
             ctx.font = 'bold 10px monospace';
             ctx.textAlign = 'center';
             ctx.fillText(suitGeo.suitName.toUpperCase(), suitGeo.offsetX + 50, suitGeo.offsetY + 340);

             // 2. Draw Backing Strips
             ctx.strokeStyle = '#1f1f1f';
             ctx.lineWidth = 6;
             ctx.lineCap = 'round';
             ctx.lineJoin = 'round';
             suitGeo.strips.forEach(strip => {
                 ctx.stroke(strip.path);
             });

             // 3. Draw "OFF" LEDs (Base state)
             // We draw the dim grey LEDs here permanently so we don't have to draw them every frame
             ctx.fillStyle = '#333333';
             suitGeo.allLeds.forEach((led) => {
                 ctx.beginPath();
                 ctx.arc(led.x, led.y, 1.5, 0, Math.PI * 2);
                 ctx.fill();
             });
      });
      ctx.restore();

      backingCanvasRef.current = backingCanvas;

    }, [geometry, dimensions, sceneBounds]); // Re-render backing if geometry or window size changes


  // -- ANIMATION RENDER LOOP --
  useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !backingCanvasRef.current) return;
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) return;

      const drawFrame = () => {
          // 1. FAST CLEAR & RESTORE BACKGROUND
          // Instead of calculating 2700 paths, we just blit the cached image
          ctx.clearRect(0, 0, dimensions.width, dimensions.height);
          ctx.drawImage(backingCanvasRef.current!, 0, 0);

          // Prepare Context for Active LEDs
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const rectWidth = dimensions.width / dpr;
          const rectHeight = dimensions.height / dpr;
          const centerX = rectWidth / 2;
          const centerY = rectHeight / 2;
          const sceneCenterX = sceneBounds.centerX;
          const sceneCenterY = sceneBounds.centerY;

          ctx.save();
          // We must apply the same transform to draw the active dots in the correct spot
          ctx.scale(dpr, dpr);
          ctx.translate(centerX, centerY);
          ctx.scale(dimensions.scale, dimensions.scale);
          ctx.translate(-sceneCenterX, -sceneCenterY);

          // 2. DRAW ONLY ACTIVE LEDs
          // Massive optimization: Loop through LEDs, calculate color, but ONLY draw if ON.
          geometry.forEach(suitGeo => {
             const activeCues = getActiveCuesForFrame(cues, suitGeo.suitId, currentTime);
             // Skip logic if no cues active for this suit to save CPU
             if (activeCues.length === 0) return;

             const renderableCues = prepareCuesForRender(activeCues);

             suitGeo.allLeds.forEach((led) => {
                 const colorInt = calculateLedColor(led.id, currentTime, renderableCues);
                 
                 // CRITICAL OPTIMIZATION:
                 // Only draw if the color is NOT the default off color.
                 // This reduces draw calls from ~2700/frame to ~50-200/frame
                 if (colorInt !== OFF_COLOR_INT) {
                     ctx.beginPath();
                     ctx.arc(led.x, led.y, 3.5, 0, Math.PI * 2); // Active radius
                     
                     ctx.fillStyle = intToHex(colorInt);
                     ctx.shadowColor = ctx.fillStyle;
                     ctx.shadowBlur = 4;
                     ctx.fill();
                 }
             });
          });
          
          ctx.restore();
      };

      drawFrame();

    }, [currentTime, cues, geometry, dimensions, sceneBounds]); 

  // -- VIDEO SYNC --
  useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const appTimeSec = currentTime / 1000;
      
      if (video.playbackRate !== playbackRate) {
          video.playbackRate = playbackRate;
      }
      
      if (isPlaying) {
          if (video.paused && video.readyState >= 2) {
            video.play().catch(e => {}); 
          }
          if (video.readyState >= 2) {
             const diff = video.currentTime - appTimeSec;
             // Relaxed tolerance to 0.5s to prevent stutter
             if (Math.abs(diff) > 0.5) {
                 video.currentTime = appTimeSec;
             }
          }
      } else {
          video.pause();
          if (Math.abs(video.currentTime - appTimeSec) > 0.1 && video.readyState >= 2) {
              video.currentTime = appTimeSec;
          }
      }
  }, [currentTime, isPlaying, playbackRate]);

  // -- INTERACTION --
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Inverse Transform
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
    const sceneCenterX = sceneBounds.centerX;
    const sceneCenterY = sceneBounds.centerY;
      
      const logicalX = (x - centerX) / dimensions.scale + sceneCenterX;
      const logicalY = (y - centerY) / dimensions.scale + sceneCenterY;

      for (const suitGeo of geometry) {
          for (const led of suitGeo.allLeds) {
              const dx = logicalX - led.x;
              const dy = logicalY - led.y;
              if (dx*dx + dy*dy <= 25) { 
                  onLedClick(suitGeo.suitId, led.id);
                  return;
              }
          }
      }
  };

  return (
    <div className="flex-1 bg-black relative overflow-hidden flex items-center justify-center border-r border-neutral-800">
      {videoUrl && (
          <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full h-full object-contain opacity-40 will-change-transform"
                muted={false} 
                playsInline
                preload="auto"
              />
          </div>
      )}
      <div className="absolute top-4 left-4 text-neutral-600 font-mono text-xs pointer-events-none z-20">
        <div>VISUALIZER // {suits.length} SUITS</div>
        <div className="text-neutral-700 mt-1">RENDERER: CACHED COMPOSITE (OPTIMIZED)</div>
        <div className="text-cyan-600 mt-1">{playbackRate !== 1 ? `SPEED: ${playbackRate}x` : ''}</div>
      </div>
      <div className="z-10 relative w-full h-full">
         <canvas 
            ref={canvasRef}
            className="w-full h-full block cursor-pointer"
            onClick={handleCanvasClick}
         />
      </div>
    </div>
  );
};

export default Visualizer;