import React, { useEffect, useState, useRef } from 'react';

interface CountdownOverlayProps {
  onComplete: () => void;
}

const CountdownOverlay: React.FC<CountdownOverlayProps> = ({ onComplete }) => {
  // 'breath' | 'message' | 3 | 2 | 1
  const [stage, setStage] = useState<string | number>('breath');
  
  // Use a ref for the callback to avoid effect re-triggering if the prop changes
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    // Timeline:
    // 0ms: "Take a long breath" (lasts 2.5s)
    // 2500ms: "We are going to start..." (lasts 1.5s)
    // 4000ms: 3
    // 5000ms: 2
    // 6000ms: 1
    // 7000ms: Complete

    const t1 = setTimeout(() => setStage('message'), 2500);
    const t2 = setTimeout(() => setStage(3), 4000);
    const t3 = setTimeout(() => setStage(2), 5000);
    const t4 = setTimeout(() => setStage(1), 6000);
    const t5 = setTimeout(() => {
        if (onCompleteRef.current) onCompleteRef.current();
    }, 7000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, []); // Empty dependency ensures this runs exactly once on mount

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px] transition-opacity duration-300">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl max-w-sm w-full mx-4 text-center relative overflow-hidden transform transition-all animate-fade-in-up">
        
        {/* Decorative top bar */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 to-indigo-500" />

        {stage === 'breath' && (
          <div className="py-2 animate-fade-in">
             <div className="mb-6 relative mx-auto w-12 h-12 flex items-center justify-center">
                <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping" />
                <div className="relative w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center border border-blue-500/50 text-blue-400">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                      <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576l.813-2.846A.75.75 0 019 4.5zM6.97 11.03a.75.75 0 111.06-1.06l1.06 1.06a.75.75 0 11-1.06 1.06l-1.06-1.06zm9.94 2.06a.75.75 0 111.06-1.06l1.06 1.06a.75.75 0 11-1.06 1.06l-1.06-1.06z" clipRule="evenodd" />
                    </svg>
                </div>
             </div>
             <h3 className="text-lg font-semibold text-white mb-1">Take a deep breath</h3>
             <p className="text-slate-400 text-sm">Relax and center yourself.</p>
          </div>
        )}
        
        {stage === 'message' && (
           <div className="py-2 animate-fade-in">
              <h3 className="text-lg font-semibold text-white mb-1">Preparing Environment</h3>
              <p className="text-slate-400 text-sm">Starting interview session...</p>
           </div>
        )}

        {typeof stage === 'number' && (
          <div key={stage} className="py-4 animate-zoom-in flex flex-col items-center justify-center min-h-[120px]">
             <span className="text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-blue-400 to-blue-600 font-mono drop-shadow-lg">
               {stage}
             </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CountdownOverlay;