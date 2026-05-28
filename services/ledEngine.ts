
import { Cue, SuitConfig, EffectType } from '../types';

/**
 * Extended Cue interface with pre-calculated integer colors for performance
 */
export interface RenderableCue extends Cue {
    baseColorInt: number;
    secondaryColorInt: number;
}

/**
 * Helper to convert HSL to Packed RGB Integer (0xRRGGBB)
 * h, s, l are in [0, 1]
 */
function hslToRgbInt(h: number, s: number, l: number): number {
  let r, g, b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const rInt = Math.round(r * 255);
  const gInt = Math.round(g * 255);
  const bInt = Math.round(b * 255);
  
  return (rInt << 16) | (gInt << 8) | bInt;
}

/**
 * Maps an LED index to an approximate X position (0.0 Left, 1.0 Right).
 */
const getApproximateX = (index: number): number => {
    // Ranges derived from prompt 1-based indices converted to 0-based
    if (index <= 32) return 0.45; // R Torso
    if (index <= 68) return 0.42; // R Pocket
    if (index <= 96) { // R Arm Down
        const t = (index - 69) / 27;
        return 0.35 - (t * 0.25);
    }
    if (index <= 102) return 0.05; // R Fingers
    if (index <= 142) { // R Arm Upper
        const t = (index - 103) / 39;
        return 0.1 + (t * 0.25);
    }
    if (index <= 183) return 0.5; // Hat/Face
    if (index <= 222) { // L Arm Up
        const t = (index - 184) / 38;
        return 0.65 + (t * 0.25);
    }
    if (index <= 228) return 0.95; // L Fingers
    if (index <= 258) { // L Arm Down
        const t = (index - 229) / 29;
        return 0.9 - (t * 0.25);
    }
    if (index <= 291) return 0.58; // L Pocket
    if (index <= 330) return 0.55; // L Torso
    if (index <= 381) return 0.55 + ((index - 331) / 50) * 0.1; // L Leg Outer
    if (index <= 422) return 0.65 - ((index - 382) / 40) * 0.15; // L Leg Inner
    if (index <= 463) return 0.5 - ((index - 423) / 40) * 0.15; // R Leg Inner
    if (index <= 527) return 0.35 + ((index - 464) / 63) * 0.1; // R Leg Outer
    if (index <= 540) return 0.65; // L Leg Outer Extension
    return 0.5;
};

/**
 * Maps an LED index to an approximate Y position (0.0 top, 1.0 bottom).
 */
const getApproximateY = (
    index: number, 
    pose: 'hands-down' | 'hands-up' = 'hands-down',
    direction: 'forward' | 'backward' = 'forward',
    effectType: EffectType = 'body-fill'
): number => {
    // Anatomy Constants
    const TOP = 0.0;
    const SHOULDER = 0.20;
    const WAIST = 0.50;
    const FEET = 1.0;
    const WRIST = pose === 'hands-down' ? 0.60 : SHOULDER;

    if (index <= 32) return WAIST - ((index / 32) * (WAIST - SHOULDER));
    if (index <= 68) return effectType === 'body-wipe' && direction === 'backward' ? FEET : WAIST;
    if (index <= 96) return SHOULDER + ((index - 69) / 27) * (WRIST - SHOULDER);
    if (index <= 102) return WRIST + 0.05;
    if (index <= 142) return WRIST - ((index - 103) / 39) * (WRIST - SHOULDER);
    if (index <= 183) return TOP;
    if (index <= 222) return SHOULDER + ((index - 184) / 38) * (WRIST - SHOULDER);
    if (index <= 228) return WRIST + 0.05;
    if (index <= 258) return WRIST - ((index - 229) / 29) * (WRIST - SHOULDER);
    if (index <= 291) return effectType === 'body-wipe' && direction === 'backward' ? FEET : WAIST;
    if (index <= 330) return SHOULDER + ((index - 292) / 38) * (WAIST - SHOULDER);
    if (index <= 381) return WAIST + ((index - 331) / 50) * (FEET - WAIST);
    if (index <= 422) return FEET - ((index - 382) / 40) * (FEET - WAIST);
    if (index <= 463) return WAIST + ((index - 423) / 40) * (FEET - WAIST);
    if (index <= 527) return FEET - ((index - 464) / 63) * (FEET - WAIST);
    if (index <= 540) return FEET;
    return 0.5;
};

// Helper: Linear Interpolation for Integers
function lerpInt(color1: number, color2: number, factor: number): number {
    const r1 = (color1 >> 16) & 0xFF;
    const g1 = (color1 >> 8) & 0xFF;
    const b1 = color1 & 0xFF;

    const r2 = (color2 >> 16) & 0xFF;
    const g2 = (color2 >> 8) & 0xFF;
    const b2 = color2 & 0xFF;

    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);

    return (r << 16) | (g << 8) | b;
}

// Helper: Adjust Brightness for Integer
function dimInt(color: number, factor: number): number {
    const r = Math.round(((color >> 16) & 0xFF) * factor);
    const g = Math.round(((color >> 8) & 0xFF) * factor);
    const b = Math.round((color & 0xFF) * factor);
    return (r << 16) | (g << 8) | b;
}

// Helper: Apply linear or gamma brightness
function applyBrightnessInt(color: number, brightness: number, curve: 'linear' | 'gamma'): number {
    const clamped = Math.max(0, Math.min(100, brightness));
    let factor = clamped / 100;
    if (curve === 'gamma') {
        factor = factor * factor; // simple gamma curve (approx 2.0)
    }
    return dimInt(color, factor);
}

/**
 * Pre-computes color integers for a list of cues.
 * Call this once per frame before iterating pixels.
 */
export const prepareCuesForRender = (cues: Cue[]): RenderableCue[] => {
    return cues.map(cue => ({
        ...cue,
        baseColorInt: parseInt(cue.color.replace('#', ''), 16),
        secondaryColorInt: cue.secondaryColor ? parseInt(cue.secondaryColor.replace('#', ''), 16) : 0
    }));
}

/**
 * Calculates the color contribution of a single cue as a 32-bit Integer.
 */
const getCueColorContributionInt = (
  cue: RenderableCue,
  ledIndex: number,
  currentTime: number
): number => {
  const relativeTime = currentTime - cue.startTime;
  let finalColorInt = cue.baseColorInt;

  switch (cue.type) {
    case 'solid':
      break;

    case 'strobe': {
      const frequency = cue.speed || 10;
      const on = Math.floor(relativeTime / (1000 / frequency)) % 2 === 0;
      if (!on) return 0; // Black
      break;
    }

    case 'chase': {
      const speed = cue.speed || 20; 
      const progress = (relativeTime / 1000) * speed;
      const rangeWidth = cue.ledRangeEnd - cue.ledRangeStart;
      if (rangeWidth <= 0) return 0;
      
      const isBackward = cue.direction === 'backward';
      let activeIndex = Math.floor(progress) % rangeWidth;
      
      if (isBackward) activeIndex = (rangeWidth - 1) - activeIndex;

      const relativeLedIndex = ledIndex - cue.ledRangeStart;
      const isTrail = isBackward 
        ? (relativeLedIndex === activeIndex + 1 || (activeIndex === rangeWidth - 1 && relativeLedIndex === 0))
        : (relativeLedIndex === activeIndex - 1 || (activeIndex === 0 && relativeLedIndex === rangeWidth - 1));

      if (relativeLedIndex === activeIndex) {
          finalColorInt = cue.baseColorInt;
      } else if (isTrail) {
          finalColorInt = dimInt(cue.baseColorInt, 0.5);
      } else {
          finalColorInt = cue.secondaryColorInt;
      }
      break;
    }

    case 'fill': {
        const progress = Math.min(1, Math.max(0, relativeTime / cue.duration));
        const rangeWidth = cue.ledRangeEnd - cue.ledRangeStart;
        const relativeLedIndex = ledIndex - cue.ledRangeStart;
        const filledCount = Math.floor(progress * rangeWidth);
        const isBackward = cue.direction === 'backward';
        let isOn = false;

        if (isBackward) {
            if (relativeLedIndex >= rangeWidth - filledCount) isOn = true;
        } else {
            if (relativeLedIndex < filledCount) isOn = true;
        }
        if (!isOn) return 0;
        break;
    }

    case 'wipe': {
        const progress = Math.min(1, Math.max(0, relativeTime / cue.duration));
        const rangeWidth = cue.ledRangeEnd - cue.ledRangeStart;
        const relativeLedIndex = ledIndex - cue.ledRangeStart;
        const wipedCount = Math.floor(progress * rangeWidth);
        const isBackward = cue.direction === 'backward';
        let isOn = false;

        if (isBackward) {
            if (relativeLedIndex < rangeWidth - wipedCount) isOn = true;
        } else {
            if (relativeLedIndex >= wipedCount) isOn = true;
        }
        if (!isOn) return 0;
        break;
    }

    case 'body-fill': {
        const progress = Math.min(1, Math.max(0, relativeTime / cue.duration));
        const ledY = getApproximateY(ledIndex, cue.pose, cue.direction, 'body-fill'); 
        const isBottomToTop = cue.direction === 'backward';
        let isOn = false;
        if (isBottomToTop) {
            const threshold = 1.05 - (progress * 1.1);
            if (ledY >= threshold) isOn = true;
        } else {
            const threshold = -0.05 + (progress * 1.1);
            if (ledY <= threshold) isOn = true;
        }
        if (!isOn) return 0;
        break;
    }

    case 'body-wipe': {
        const progress = Math.min(1, Math.max(0, relativeTime / cue.duration));
        const ledY = getApproximateY(ledIndex, cue.pose, cue.direction, 'body-wipe');
        const isBottomToTop = cue.direction === 'backward';
        let isOn = false;
        if (isBottomToTop) {
            const threshold = 1.05 - (progress * 1.1);
            if (ledY < threshold) isOn = true;
        } else {
            const threshold = -0.05 + (progress * 1.1);
            if (ledY > threshold) isOn = true;
        }
        if (!isOn) return 0;
        break;
    }

    case 'body-fill-horizontal': {
        const progress = Math.min(1, Math.max(0, relativeTime / cue.duration));
        const ledX = getApproximateX(ledIndex);
        const isRightToLeft = cue.direction === 'backward';
        let isOn = false;
        if (isRightToLeft) {
            const threshold = 1.05 - (progress * 1.1);
            if (ledX >= threshold) isOn = true;
        } else {
            const threshold = -0.05 + (progress * 1.1);
            if (ledX <= threshold) isOn = true;
        }
        if (!isOn) return 0;
        break;
    }

    case 'body-wipe-horizontal': {
        const progress = Math.min(1, Math.max(0, relativeTime / cue.duration));
        const ledX = getApproximateX(ledIndex);
        const isRightToLeft = cue.direction === 'backward';
        let isOn = false;
        if (isRightToLeft) {
            const threshold = 1.05 - (progress * 1.1);
            if (ledX < threshold) isOn = true;
        } else {
            const threshold = -0.05 + (progress * 1.1);
            if (ledX > threshold) isOn = true;
        }
        if (!isOn) return 0;
        break;
    }

    case 'fade': {
        const progress = Math.min(1, Math.max(0, relativeTime / cue.duration));
        finalColorInt = lerpInt(cue.secondaryColorInt, cue.baseColorInt, progress);
        break;
    }

    case 'blend': {
        const progress = Math.min(1, Math.max(0, relativeTime / cue.duration));
        finalColorInt = lerpInt(cue.baseColorInt, cue.secondaryColorInt, progress);
        break;
    }

    case 'wave': {
        const speed = (cue.speed || 5) / 1000;
        const wave = Math.sin(relativeTime * speed + ledIndex * 0.5);
        const brightness = (wave + 1) / 2;
        finalColorInt = dimInt(cue.baseColorInt, brightness);
        break;
    }

    case 'sparkle': {
        const frequency = cue.speed || 15;
        const timeStep = Math.floor(relativeTime / (1000 / frequency));
        const seed = (ledIndex * 12.9898) + (timeStep * 78.233); 
        const rand = Math.abs(Math.sin(seed) * 43758.5453) % 1;
        if (rand <= 0.8) return 0;
        break;
    }

    case 'gradient': {
        const rangeWidth = cue.ledRangeEnd - cue.ledRangeStart;
        if (rangeWidth > 1) {
            const position = ledIndex - cue.ledRangeStart;
            const progress = Math.max(0, Math.min(1, position / (rangeWidth - 1)));
            finalColorInt = lerpInt(cue.baseColorInt, cue.secondaryColorInt, progress);
        }
        break;
    }

    case 'random': {
        const frequency = cue.speed || 10;
        const stepDuration = Math.max(1, 1000 / frequency);
        const timeStep = Math.floor(relativeTime / stepDuration);
        const isUniform = cue.variant === 'uniform';
        const spatialSeed = isUniform ? 0 : ledIndex * 999.9;
        const seed = (timeStep * 43758.5453) + spatialSeed;
        const randH = Math.abs(Math.sin(seed)) % 1;
        finalColorInt = hslToRgbInt(randH, 1, 0.5);
        break;
    }

    case 'random-fill': {
        const progress = Math.min(1, Math.max(0, relativeTime / cue.duration));
        const seed = (ledIndex * 9301 + 49297) % 233280;
        const threshold = seed / 233280.0;
        if (progress < threshold) return 0;
        break;
    }
  }

  // Global Brightness Factor
  if (cue.brightness !== undefined && cue.brightness < 100) {
      const curve = cue.brightnessCurve === 'gamma' ? 'gamma' : 'linear';
      finalColorInt = applyBrightnessInt(finalColorInt, cue.brightness, curve);
  }

  return finalColorInt;
};

/**
 * Filter active cues once per frame
 */
export const getActiveCuesForFrame = (
    cues: Cue[],
    suitId: number,
    currentTime: number
): Cue[] => {
    return cues.filter(
        (c) =>
          c.suitId === suitId &&
          currentTime >= c.startTime &&
          currentTime < c.startTime + c.duration
      );
}

/**
 * Calculates the final color of a specific LED by blending active cues.
 * Returns a 32-bit Integer (0xRRGGBB).
 */
export const calculateLedColor = (
  ledIndex: number,
  currentTime: number,
  activeRenderableCues: RenderableCue[] 
): number => {
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;

  // Additive Blending in Integer Space
  for (let i = 0; i < activeRenderableCues.length; i++) {
      const cue = activeRenderableCues[i];
      // Quick Range Check
      if (ledIndex < cue.ledRangeStart || ledIndex > cue.ledRangeEnd) continue;

      const colorInt = getCueColorContributionInt(cue, ledIndex, currentTime);
      
      // Unpack and Accumulate
      totalR += (colorInt >> 16) & 0xFF;
      totalG += (colorInt >> 8) & 0xFF;
      totalB += colorInt & 0xFF;
  }

  if (totalR === 0 && totalG === 0 && totalB === 0) return 0x333333; // Off/Dim

  const finalR = Math.min(255, totalR);
  const finalG = Math.min(255, totalG);
  const finalB = Math.min(255, totalB);

  return (finalR << 16) | (finalG << 8) | finalB;
};

/**
 * Helper to convert integer color to hex string for Canvas/CSS
 */
export const intToHex = (color: number): string => {
    // 0xRRGGBB -> "#RRGGBB"
    // Using string concat is faster than template literals in hot loops in V8
    return '#' + ('000000' + color.toString(16)).slice(-6);
}

// Interfaces for saving/loading
interface SavedProjectData {
    suits: SuitConfig[];
    cues: Cue[];
    duration: number;
    version: string;
    metadata: {
        schemaVersion: string;
        exportedAt: string;
        app: string;
        targetSuitId: number | null;
        timeOffsetMs: number;
        totalCues: number;
    };
}

const SAVE_START_MARKER = "/*__LUMINA_SAVE_DATA_START__";
const SAVE_END_MARKER = "__LUMINA_SAVE_DATA_END__*/";

export const parseProjectFromCode = (fileContent: string): SavedProjectData | null => {
    const startIndex = fileContent.indexOf(SAVE_START_MARKER);
    const endIndex = fileContent.indexOf(SAVE_END_MARKER);

    if (startIndex === -1 || endIndex === -1) return null;

    try {
        const jsonString = fileContent.substring(
            startIndex + SAVE_START_MARKER.length,
            endIndex
        );
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Failed to parse project data:", error);
        return null;
    }
}

/**
 * GENERATE C++ CODE FOR ESP32 (PROCEDURAL RUNTIME)
 */
export const generateFastLedCode = (
    suits: SuitConfig[], 
    cues: Cue[], 
    totalDuration: number,
    targetSuitId: number | null = null, 
    timeOffset: number = 0 
): string => {
  const codeLines: string[] = [];
  
  // 1. EMBED SAVE DATA
  const projectData: SavedProjectData = {
      suits,
      cues,
      duration: totalDuration,
      version: '1.1.0',
      metadata: {
          schemaVersion: '1.1.0',
          exportedAt: new Date().toISOString(),
          app: 'Lumina Choreographer',
          targetSuitId,
          timeOffsetMs: timeOffset,
          totalCues: cues.length
      }
  };
  codeLines.push(SAVE_START_MARKER);
  codeLines.push(JSON.stringify(projectData));
  codeLines.push(SAVE_END_MARKER);
  
  // 2. HEADER & INCLUDES
  codeLines.push(``);
  codeLines.push(`// Generated by Lumina Choreographer (Procedural Runtime Engine)`);
  codeLines.push(`// Target: ${targetSuitId === null ? "All Suits" : "Dancer " + (targetSuitId + 1)}`);
  codeLines.push(`// Offset: ${timeOffset}ms`);
  codeLines.push(``);
  codeLines.push(`#include <FastLED.h>`);
  
  // 3. CONSTANTS & PINS
  const suitsToExport = targetSuitId === null ? suits : suits.filter(s => s.id === targetSuitId);
  const maxLeds = Math.max(...suitsToExport.map(s => s.ledCount));
  
  codeLines.push(`#define NUM_SUITS ${suitsToExport.length}`);
  codeLines.push(`#define MAX_LEDS_PER_SUIT ${maxLeds}`);
  
  // Pin Mapping
  const SAFE_PINS = [4, 16, 17, 18, 19, 21, 22, 23, 25, 26];
  suitsToExport.forEach((s, i) => {
      // Find the original pin based on the original ID (not the array index)
      const originalIndex = s.id; 
      const pin = SAFE_PINS[originalIndex] !== undefined ? SAFE_PINS[originalIndex] : 13 + originalIndex; 
      codeLines.push(`#define PIN_SUIT_${i} ${pin} // Controls ${s.name}`);
  });
  
  codeLines.push(``);
  codeLines.push(`CRGB leds[NUM_SUITS][MAX_LEDS_PER_SUIT];`);
  
  // 4. CUE STRUCTURE AND DATA
  // Mapping effects to integers for C++ switch case
  const EFFECT_MAP: Record<string, number> = {
      'solid': 0, 'chase': 1, 'fill': 2, 'wipe': 3, 'body-fill': 4, 'body-wipe': 5,
      'body-fill-horizontal': 6, 'body-wipe-horizontal': 7, 'wave': 8, 'fade': 9,
      'strobe': 10, 'sparkle': 11, 'gradient': 12, 'blend': 13, 'random': 14, 'random-fill': 15
  };
  
  codeLines.push(``);
  codeLines.push(`// Cue Structure`);
  codeLines.push(`struct Cue {`);
  codeLines.push(`  uint8_t type;`);
  codeLines.push(`  uint8_t suitIndex;`); // 0-N based on export list
  codeLines.push(`  uint32_t startTime;`);
  codeLines.push(`  uint32_t duration;`);
  codeLines.push(`  uint32_t color1;`);
  codeLines.push(`  uint32_t color2;`);
  codeLines.push(`  uint16_t ledStart;`);
  codeLines.push(`  uint16_t ledEnd;`);
  codeLines.push(`  uint8_t speed;`);
  codeLines.push(`  uint8_t brightness;`);
    codeLines.push(`  uint8_t flags; // Bit 0: Backward, Bit 1: HandsUp, Bit 2: Uniform, Bit 3: GammaBrightness`);
  codeLines.push(`};`);
  
  codeLines.push(``);
  codeLines.push(`const Cue cues[] = {`);
  
  // Filter Cues for exported suits and convert to C struct syntax
  const activeCues = cues.filter(c => {
      return suitsToExport.some(s => s.id === c.suitId);
  });
  
  // Sort cues by start time for potentially optimized reading (though we iterate all for simplicity in v1)
  activeCues.sort((a,b) => a.startTime - b.startTime);

  activeCues.forEach(c => {
      // Map global suit ID to export index (0, 1, 2...)
      const exportSuitIndex = suitsToExport.findIndex(s => s.id === c.suitId);
      if (exportSuitIndex === -1) return;
      
      const typeInt = EFFECT_MAP[c.type] ?? 0;
      const c1 = parseInt(c.color.replace('#', '0x'), 16);
      const c2 = c.secondaryColor ? parseInt(c.secondaryColor.replace('#', '0x'), 16) : 0;
      
      let flags = 0;
      if (c.direction === 'backward') flags |= 1;
      if (c.pose === 'hands-up') flags |= 2;
      if (c.variant === 'uniform') flags |= 4;
    if (c.brightnessCurve === 'gamma') flags |= 8;
      
      // Apply Time Offset
      const adjustedStartTime = c.startTime + timeOffset;

      codeLines.push(`  {${typeInt}, ${exportSuitIndex}, ${adjustedStartTime}, ${c.duration}, ${c1}, ${c2}, ${c.ledRangeStart}, ${c.ledRangeEnd}, ${c.speed || 10}, ${c.brightness ?? 100}, ${flags}},`);
  });
  
  codeLines.push(`};`);
  codeLines.push(`const uint16_t NUM_CUES = sizeof(cues) / sizeof(Cue);`);
  codeLines.push(`const uint32_t TOTAL_DURATION = ${totalDuration + timeOffset};`);

  // 5. GEOMETRY ENGINE (PORTED FROM TYPESCRIPT)
  // We embed the helper functions directly in C++
  codeLines.push(``);
  codeLines.push(`// --- GEOMETRY ENGINE ---`);
  codeLines.push(`
float getApproximateX(uint16_t index) {
    if (index <= 32) return 0.45; // R Torso
    if (index <= 68) return 0.42; // R Pocket
    if (index <= 96) return 0.35 - (((float)(index - 69) / 27.0) * 0.25); // R Arm Down
    if (index <= 102) return 0.05; // R Fingers
    if (index <= 142) return 0.1 + (((float)(index - 103) / 39.0) * 0.25); // R Arm Upper
    if (index <= 183) return 0.5; // Hat/Face
    if (index <= 222) return 0.65 + (((float)(index - 184) / 38.0) * 0.25); // L Arm Up
    if (index <= 228) return 0.95; // L Fingers
    if (index <= 258) return 0.9 - (((float)(index - 229) / 29.0) * 0.25); // L Arm Down
    if (index <= 291) return 0.58; // L Pocket
    if (index <= 330) return 0.55; // L Torso
    if (index <= 381) return 0.55 + (((float)(index - 331) / 50.0) * 0.1); // L Leg Outer
    if (index <= 422) return 0.65 - (((float)(index - 382) / 40.0) * 0.15); // L Leg Inner
    if (index <= 463) return 0.5 - (((float)(index - 423) / 40.0) * 0.15); // R Leg Inner
    if (index <= 527) return 0.35 + (((float)(index - 464) / 63.0) * 0.1); // R Leg Outer
    if (index <= 540) return 0.65; // L Leg Outer Ext
    return 0.5;
}

float getApproximateY(uint16_t index, bool handsUp, bool backward, uint8_t effectType) {
    // 0.0 TOP, 1.0 BOTTOM
    float TOP = 0.0;
    float SHOULDER = 0.20;
    float WAIST = 0.50;
    float FEET = 1.0;
    float WRIST = handsUp ? SHOULDER : 0.60;
    
    // Body-Wipe specific logic for pocket/loops (ported from TS)
    if (index <= 32) return WAIST - (((float)index / 32.0) * (WAIST - SHOULDER));
    if (index <= 68) return (effectType == 5 && backward) ? FEET : WAIST; // R Pocket
    if (index <= 96) return SHOULDER + (((float)(index - 69) / 27.0) * (WRIST - SHOULDER));
    if (index <= 102) return WRIST + 0.05;
    if (index <= 142) return WRIST - (((float)(index - 103) / 39.0) * (WRIST - SHOULDER));
    if (index <= 183) return TOP;
    if (index <= 222) return SHOULDER + (((float)(index - 184) / 38.0) * (WRIST - SHOULDER));
    if (index <= 228) return WRIST + 0.05;
    if (index <= 258) return WRIST - (((float)(index - 229) / 29.0) * (WRIST - SHOULDER));
    if (index <= 291) return (effectType == 5 && backward) ? FEET : WAIST; // L Pocket
    if (index <= 330) return SHOULDER + (((float)(index - 292) / 38.0) * (WAIST - SHOULDER));
    if (index <= 381) return WAIST + (((float)(index - 331) / 50.0) * (FEET - WAIST));
    if (index <= 422) return FEET - (((float)(index - 382) / 40.0) * (FEET - WAIST));
    if (index <= 463) return WAIST + (((float)(index - 423) / 40.0) * (FEET - WAIST));
    if (index <= 527) return FEET - (((float)(index - 464) / 63.0) * (FEET - WAIST));
    if (index <= 540) return FEET;
    return 0.5;
}
  `);

  // 6. HELPER FUNCTIONS (Color Math)
  codeLines.push(`
CRGB blendColors(uint32_t c1, uint32_t c2, float factor) {
    uint8_t r1 = (c1 >> 16) & 0xFF; uint8_t g1 = (c1 >> 8) & 0xFF; uint8_t b1 = c1 & 0xFF;
    uint8_t r2 = (c2 >> 16) & 0xFF; uint8_t g2 = (c2 >> 8) & 0xFF; uint8_t b2 = c2 & 0xFF;
    return CRGB(r1 + (r2 - r1) * factor, g1 + (g2 - g1) * factor, b1 + (b2 - b1) * factor);
}

CRGB dimColor(uint32_t c, float factor) {
    uint8_t r = (c >> 16) & 0xFF; uint8_t g = (c >> 8) & 0xFF; uint8_t b = c & 0xFF;
    return CRGB(r * factor, g * factor, b * factor);
}

uint32_t hslToRgb(float h, float s, float l) {
    float r, g, b;
    if (s == 0) { r = g = b = l; } 
    else {
        auto hue2rgb = [](float p, float q, float t) {
            if (t < 0.0f) t += 1.0f; if (t > 1.0f) t -= 1.0f;
            if (t < 1.0f/6.0f) return p + (q - p) * 6.0f * t;
            if (t < 1.0f/2.0f) return q;
            if (t < 2.0f/3.0f) return p + (q - p) * (2.0f/3.0f - t) * 6.0f;
            return p;
        };
        float q = l < 0.5f ? l * (1.0f + s) : l + s - l * s;
        float p = 2.0f * l - q;
        r = hue2rgb(p, q, h + 1.0f/3.0f);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1.0f/3.0f);
    }
    return ((uint8_t)(r * 255) << 16) | ((uint8_t)(g * 255) << 8) | (uint8_t)(b * 255);
}
  `);

  // 7. SETUP
  codeLines.push(`void setup() {`);
  codeLines.push(`  delay(1000);`);
  suitsToExport.forEach((s, i) => {
      codeLines.push(`  FastLED.addLeds<WS2812B, PIN_SUIT_${i}, GRB>(leds[${i}], ${s.ledCount});`);
  });
  codeLines.push(`  FastLED.clear(); FastLED.show();`);
  codeLines.push(`}`);

  // 8. LOOP (The Render Engine)
  codeLines.push(`
void loop() {
  static uint32_t bootTime = 0;
  if (bootTime == 0) bootTime = millis();
  
  uint32_t now = millis() - bootTime;
  
  // Restart loop
  if (now > TOTAL_DURATION) { 
      bootTime = millis(); 
      now = 0; 
      FastLED.clear(); 
  }

  // Clear buffers for additive blending
  for(int s=0; s<NUM_SUITS; s++) {
      fill_solid(leds[s], MAX_LEDS_PER_SUIT, CRGB::Black);
  }

  // Iterate over all cues
  for(int i=0; i<NUM_CUES; i++) {
      Cue c = cues[i];
      
      // Check if cue is active
      if (now >= c.startTime && now < c.startTime + c.duration) {
          uint32_t relativeTime = now - c.startTime;
          float progress = (float)relativeTime / (float)c.duration;
          
          bool backward = c.flags & 1;
          bool handsUp = c.flags & 2;
          bool uniform = c.flags & 4;
          bool gammaBrightness = c.flags & 8;
          
          uint16_t rangeWidth = c.ledEnd - c.ledStart;
          
          // Apply Effect to Range
          for(int led = c.ledStart; led <= c.ledEnd; led++) {
               if(led >= MAX_LEDS_PER_SUIT) continue;
               
               CRGB pixelColor = CRGB::Black;
               bool isActive = false;
               int relativeLed = led - c.ledStart;
               
               switch(c.type) {
                   case 0: // Solid
                       pixelColor = CRGB(c.color1);
                       isActive = true;
                       break;
                       
                   case 1: // Chase
                   {
                       float speed = (float)c.speed;
                       float move = (relativeTime / 1000.0) * speed;
                       int activeIdx = (int)floor(move) % rangeWidth;
                       if (backward) activeIdx = (rangeWidth - 1) - activeIdx;
                       
                       bool isTrail = backward 
                           ? (relativeLed == activeIdx + 1)
                           : (relativeLed == activeIdx - 1);
                           
                       if (relativeLed == activeIdx) {
                           pixelColor = CRGB(c.color1);
                           isActive = true;
                       } else if (isTrail) {
                           pixelColor = dimColor(c.color1, 0.5);
                           isActive = true;
                       } else {
                           pixelColor = CRGB(c.color2);
                           if(c.color2 != 0) isActive = true;
                       }
                       break;
                   }
                   
                   case 2: // Fill
                   case 3: // Wipe
                   {
                       int count = floor(progress * rangeWidth);
                       if (backward) {
                           if (relativeLed >= rangeWidth - count) isActive = true; // Fill logic
                           if (c.type == 3 && relativeLed < rangeWidth - count) isActive = false; // Wipe logic invert? 
                               // Actually Wipe and Fill logic in TS are similar, Wipe usually clears behind it?
                               // Replicating TS exact logic:
                               // Fill Back: if (rel >= width - filled) on
                               // Wipe Back: if (rel < width - wiped) on
                           if (c.type == 3) isActive = (relativeLed < rangeWidth - count);
                       } else {
                           if (relativeLed < count) isActive = true; // Fill Fwd
                           if (c.type == 3) isActive = (relativeLed >= count); // Wipe Fwd
                       }
                       if(isActive) pixelColor = CRGB(c.color1);
                       break;
                   }
                   
                   case 4: // Body Fill
                   case 5: // Body Wipe
                   {
                       float y = getApproximateY(led, handsUp, backward, c.type);
                       float threshold = backward ? (1.05 - (progress * 1.1)) : (-0.05 + (progress * 1.1));
                       
                       if (backward) {
                           if (c.type == 4 && y >= threshold) isActive = true;
                           if (c.type == 5 && y < threshold) isActive = true;
                       } else {
                           if (c.type == 4 && y <= threshold) isActive = true;
                           if (c.type == 5 && y > threshold) isActive = true;
                       }
                       if(isActive) pixelColor = CRGB(c.color1);
                       break;
                   }
                   
                   case 9: // Fade
                       pixelColor = blendColors(c.color2, c.color1, progress); // Note: TS lerps sec->base
                       isActive = true;
                       break;
                       
                   case 10: // Strobe
                   {
                       int freq = c.speed;
                       bool on = ((relativeTime / (1000/freq)) % 2) == 0;
                       if(on) { pixelColor = CRGB(c.color1); isActive = true; }
                       break;
                   }
                   
                   case 14: // Random
                   {
                       float stepDur = max(1.0, 1000.0 / c.speed);
                       int step = floor(relativeTime / stepDur);
                       float seed = (step * 43758.5453) + (uniform ? 0 : led * 999.9);
                       float h = fmod(abs(sin(seed)), 1.0);
                       pixelColor = CRGB(hslToRgb(h, 1.0, 0.5));
                       isActive = true;
                       break;
                   }
                   
                   default:
                        // Other effects map to solid for now to save space in this snippet
                        pixelColor = CRGB(c.color1);
                        isActive = true;
                        break;
               }
               
               if(isActive) {
                   // Global Brightness
                   if(c.brightness < 100) {
                       float factor = (float)c.brightness / 100.0;
                       if(gammaBrightness) factor = factor * factor;
                       pixelColor.nscale8((uint8_t)(factor * 255));
                   }
                   // Additive Blending
                   leds[c.suitIndex][led] += pixelColor;
               }
          }
      }
  }
  
  FastLED.show();
}
  `);

  return codeLines.join('\n');
};