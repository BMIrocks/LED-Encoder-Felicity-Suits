# Lumina Choreographer

Lumina Choreographer is a browser-based editor for building WS2812B (NeoPixel) LED suit shows. It combines a multi-track timeline, a real-time visualizer for five dancers, and a FastLED export pipeline.

## Features
- Visualizer with five suits and spatial body mapping
- Timeline editing with overlapping cues and millisecond timing
- Effect engine with motion, spatial, and generative effects
- Palette presets for fast color picking
- Per-cue brightness curve (linear or gamma)
- One-click Arduino export with embedded project data

## Controls
- Play/Pause: Spacebar or the play button
- Scrub: click the timeline ruler
- Nudge time: Left/Right arrows (use the UI to change nudge step)
- Delete cue: Delete or Backspace
- Add cue: Double-click in a track or Shift+click on the ruler

## Export
1. Click Export Arduino in the header.
2. Choose All Suits or a specific dancer.
3. Set a time offset if you need sync staging.
4. Generate and download the .ino file.
5. Open it in Arduino IDE and upload (FastLED required).

Project data is embedded inside the exported file, so you can import it later via Import Project.

## Development
### Prerequisites
- Node.js 16+
- npm

### Setup
```bash
git clone https://github.com/AKSHAY-RSOL/led-encoder-v3.git
cd led-encoder-v3
npm install
npm run dev
```

Open the URL printed in the terminal (typically http://localhost:5173).

## How The App Is Built
Lumina is a React + TypeScript single-page app bundled by Vite. Rendering and playback are handled on the client for quick iteration and low-latency previewing.

### Rendering Pipeline
- The visualizer uses a single canvas and pre-renders the static suit geometry to an offscreen backing canvas.
- Each frame, only active LEDs are drawn, which keeps draw calls low even with large LED counts.
- Spatial effects use an approximate body coordinate system to map LED indices to X/Y positions.

### Effect Engine
- Cues are stored as typed objects and evaluated per frame based on current time.
- Effects are computed in integer color space for speed, then blended additively.
- Brightness uses per-cue curves (linear or gamma) to match physical LED perception.

### Export Format
- Export generates a FastLED-compatible .ino file.
- Project data is embedded as JSON in C++ comments so it can be re-imported.
- Each cue is encoded with compact flags for direction, pose, and brightness curve.

## Project Structure
- App.tsx: top-level state, playback, and orchestration
- components/Visualizer.tsx: canvas visualizer and video sync
- components/Timeline.tsx: timeline UI and cue layout
- components/PropertiesPanel.tsx: cue editing and presets
- components/ExportModal.tsx: export configuration
- services/ledEngine.ts: cue evaluation and export generation
- constants.ts: default suits and sample cues
- types.ts: shared data types
