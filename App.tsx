
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Download, Upload, Video, Monitor, Settings, Zap, X, FileUp } from 'lucide-react';
import Visualizer from './components/Visualizer';
import Timeline from './components/Timeline';
import PropertiesPanel from './components/PropertiesPanel';
import ExportModal from './components/ExportModal';
import { DEFAULT_SUITS, SAMPLE_CUES } from './constants';
import { Cue, SuitConfig } from './types';
import { generateFastLedCode, parseProjectFromCode } from './services/ledEngine';

const App: React.FC = () => {
  // --- State ---
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(240000); // 4 minutes default
  const [zoom, setZoom] = useState(50); // pixels per second
  const [playbackRate, setPlaybackRate] = useState(1); // 1.0 = Normal speed
  const [nudgeStep, setNudgeStep] = useState(100); // Default 100ms step for arrows
  
  const [suits, setSuits] = useState<SuitConfig[]>(DEFAULT_SUITS);
  const [cues, setCues] = useState<Cue[]>([...SAMPLE_CUES]);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  
  // Video Import State
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  
  // Export State
  const [showExportModal, setShowExportModal] = useState(false);

  // Animation Frame Ref
  const requestRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        // Ignore if user is typing in an input field
        if (document.activeElement instanceof HTMLInputElement || 
            document.activeElement instanceof HTMLTextAreaElement ||
            document.activeElement instanceof HTMLSelectElement) {
            return;
        }

        switch(e.key) {
            case 'Delete':
            case 'Backspace':
                if (selectedCueId) {
                    handleDeleteCue(selectedCueId);
                }
                break;
            case 'ArrowLeft':
                handleTimeChange(currentTime - nudgeStep);
                break;
            case 'ArrowRight':
                handleTimeChange(currentTime + nudgeStep);
                break;
            case ' ': // Spacebar
                e.preventDefault(); // Prevent scrolling
                handleTogglePlay();
                break;
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCueId, currentTime, nudgeStep, isPlaying]); // Dependencies crucial for closure capture

  // --- Playback Loop (Delta Accumulator for Variable Speed) ---
  const animate = useCallback((time: number) => {
      const now = performance.now();
      const delta = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;

      // Only update if delta is reasonable (prevents huge jumps after tab switching)
      if (delta < 500) {
          setCurrentTime(prevTime => {
              const nextTime = prevTime + (delta * playbackRate);
              
              if (nextTime >= duration) {
                  setIsPlaying(false);
                  return duration;
              }
              return nextTime;
          });
      }

      if (isPlaying) {
          requestRef.current = requestAnimationFrame(animate);
      }
  }, [isPlaying, duration, playbackRate]);

  useEffect(() => {
    if (isPlaying) {
        lastFrameTimeRef.current = performance.now();
        requestRef.current = requestAnimationFrame(animate);
    } else {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, animate]); 

  // --- Handlers ---

  const handleTogglePlay = () => {
      if (currentTime >= duration) {
          setCurrentTime(0);
      }
      setIsPlaying(!isPlaying);
  };

  const handleTimeChange = (time: number) => {
    const newTime = Math.max(0, Math.min(time, duration));
    setCurrentTime(newTime);
    if (isPlaying) setIsPlaying(false); // Stop when scrubbing
  };

  const handleAddCue = (suitId: number, time: number) => {
      // Cycle through neon colors
      const colors = ['#00d9ff', '#ff00ff', '#00ff9d', '#ff9900', '#ff0055'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];

      const newCue: Cue = {
          id: Math.random().toString(36).substr(2, 9),
          suitId,
          startTime: time,
          duration: 1000,
          type: 'solid',
          color: randomColor,
          ledRangeStart: 0,
          ledRangeEnd: 100, // Default to full suit
          speed: 10,
          brightness: 100,
          brightnessCurve: 'linear',
          direction: 'forward',
          pose: 'hands-down'
      };
      setCues([...cues, newCue]);
      setSelectedCueId(newCue.id);
  };

  const handleUpdateCue = (id: string, updates: Partial<Cue>) => {
      setCues(cues.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const handleDeleteCue = (id: string) => {
      setCues(cues => cues.filter(c => c.id !== id));
      // Only clear selection if the deleted cue was selected
      if (selectedCueId === id) setSelectedCueId(null);
  };

  const handleDuplicateCue = (id: string) => {
      const original = cues.find(c => c.id === id);
      if (original) {
          const newCue = {
              ...original,
              id: Math.random().toString(36).substr(2, 9),
              startTime: original.startTime + original.duration + 100 // Place slightly after
          };
          setCues([...cues, newCue]);
          setSelectedCueId(newCue.id);
      }
  };

  const executeExport = (suitId: number | null, timeOffset: number) => {
      const code = generateFastLedCode(suits, cues, duration, suitId, timeOffset);
      const blob = new Blob([code], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const fileName = suitId === null 
         ? 'choreography_all.ino' 
         : `choreography_dancer_${suitId + 1}${timeOffset > 0 ? '_sync' : ''}.ino`;
         
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleProjectImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const content = event.target?.result as string;
          if (content) {
              const projectData = parseProjectFromCode(content);
              if (projectData) {
                  // Restore State
                  setSuits(projectData.suits);
                  setCues(projectData.cues);
                  setDuration(projectData.duration);
                  setCurrentTime(0);
                  setIsPlaying(false);
                  setSelectedCueId(null);
                  alert("Project successfully imported!");
              } else {
                  alert("Could not find project data in this file. Ensure it was exported with the latest version of Lumina.");
              }
          }
      };
      reader.readAsText(file);
      // Reset input value to allow re-selecting same file
      e.target.value = '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const url = URL.createObjectURL(file);
          setVideoUrl(url);
          setShowVideoModal(false);
          // Optional: Reset timeline to 0
          setCurrentTime(0);
      }
  };

  const selectedCue = cues.find(c => c.id === selectedCueId);

  return (
    <div className="flex flex-col h-screen w-screen text-neutral-200 font-sans overflow-hidden">
      
      {/* Header / Menu */}
      <header className="h-12 bg-[#151515] border-b border-neutral-800 flex items-center px-4 justify-between shrink-0 z-50">
        <div className="flex items-center gap-3">
            <Zap className="text-cyan-400" size={20} />
            <h1 className="font-bold text-lg tracking-tight text-white">LUMINA <span className="text-cyan-400 font-light">CHOREOGRAPHER</span></h1>
        </div>
        
        <div className="flex items-center gap-4">
             <input 
                type="file" 
                ref={projectInputRef}
                className="hidden"
                accept=".ino,.txt,.cpp"
                onChange={handleProjectImport}
             />
             <button 
                onClick={() => projectInputRef.current?.click()}
                className="flex items-center gap-2 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 px-3 py-1.5 rounded transition-colors"
                title="Upload previously exported .ino file to restore project"
             >
                 <FileUp size={14} /> Import Project
             </button>

             <button 
                onClick={() => setShowVideoModal(true)}
                className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded transition-colors ${videoUrl ? 'bg-cyan-900/30 text-cyan-400 border border-cyan-800' : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'}`}
             >
                 <Video size={14} /> {videoUrl ? 'Replace Video' : 'Import Video'}
             </button>
             <button 
                onClick={() => setShowExportModal(true)}
                className="flex items-center gap-2 text-xs bg-cyan-900/40 hover:bg-cyan-900/60 border border-cyan-700/50 px-3 py-1.5 rounded transition-colors text-cyan-400 font-medium"
             >
                 <Download size={14} /> Export Arduino
             </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
         {/* Left: Visualizer */}
         <Visualizer 
            suits={suits} 
            currentTime={currentTime} 
            cues={cues}
            onLedClick={(s, l) => console.log(s, l)}
            isPlaying={isPlaying}
            videoUrl={videoUrl}
            playbackRate={playbackRate}
         />

         {/* Right: Properties */}
         <PropertiesPanel 
            selectedCue={selectedCue}
            suits={suits}
            onUpdateCue={handleUpdateCue}
            onDeleteCue={handleDeleteCue}
            onDuplicateCue={handleDuplicateCue}
         />
      </div>

      {/* Bottom: Timeline */}
      <div className="h-96 shrink-0 z-40">
         <Timeline 
            cues={cues}
            suits={suits}
            currentTime={currentTime}
            duration={duration}
            zoom={zoom}
            isPlaying={isPlaying}
            onTimeChange={handleTimeChange}
            onTogglePlay={handleTogglePlay}
            onSelectCue={setSelectedCueId}
            selectedCueId={selectedCueId}
            onAddCue={handleAddCue}
            playbackRate={playbackRate}
            onPlaybackRateChange={setPlaybackRate}
            nudgeStep={nudgeStep}
            onNudgeStepChange={setNudgeStep}
            onZoomChange={setZoom}
         />
      </div>

      {/* Export Configuration Modal */}
      <ExportModal 
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          onExport={executeExport}
          suits={suits}
      />

      {/* Video Import Modal */}
      {showVideoModal && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-10">
            <div className="bg-[#222] border border-neutral-700 rounded-lg max-w-2xl w-full p-6 shadow-2xl relative">
                <button 
                    onClick={() => setShowVideoModal(false)}
                    className="absolute top-4 right-4 text-neutral-500 hover:text-white"
                >
                    <X size={20} />
                </button>

                <h3 className="text-xl text-white mb-4">Import Reference Video</h3>
                <div 
                    className="aspect-video bg-black rounded flex flex-col items-center justify-center border-2 border-dashed border-neutral-700 mb-6 hover:border-cyan-500 hover:bg-neutral-900/50 transition-all cursor-pointer group"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <div className="text-center text-neutral-500 group-hover:text-cyan-400">
                        <Upload className="mx-auto mb-3 w-12 h-12" />
                        <p className="font-medium">Click to select MP4 / MOV</p>
                        <p className="text-xs mt-2 text-neutral-600">Video will overlay behind dancers</p>
                    </div>
                    <input 
                        type="file" 
                        ref={fileInputRef}
                        className="hidden"
                        accept="video/mp4,video/quicktime,video/webm"
                        onChange={handleFileSelect}
                    />
                </div>
                
                <div className="flex justify-end gap-3">
                    <button onClick={() => setShowVideoModal(false)} className="px-4 py-2 text-sm text-neutral-400 hover:text-white">Cancel</button>
                    {videoUrl && (
                        <button 
                            onClick={() => {
                                setVideoUrl(null); 
                                setShowVideoModal(false);
                            }} 
                            className="px-4 py-2 text-sm text-red-400 hover:text-red-300"
                        >
                            Remove Current Video
                        </button>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
