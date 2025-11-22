
import React, { useState, useEffect } from 'react';
import { InterviewConfig, InterviewType, InterviewerPersona } from '../types';
import { PlayIcon, BriefcaseIcon, UserIcon, PencilSquareIcon, DocumentTextIcon, TrashIcon, ArrowUpTrayIcon, VideoCameraIcon, ChevronDownIcon } from '@heroicons/react/24/solid';
import { extractTextFromPDF } from '../services/pdfService';
import { gestureService } from '../services/gestureService';

interface SetupFormProps {
  onStart: (config: InterviewConfig) => void;
  isLoading: boolean;
}

const STORAGE_KEY = 'interview_flow_config_v1';

const SetupForm: React.FC<SetupFormProps> = ({ onStart, isLoading }) => {
  const [config, setConfig] = useState<InterviewConfig>({
    type: InterviewType.SOFTWARE_ENGINEER,
    persona: InterviewerPersona.FRIENDLY,
    context: '',
    resumeText: '',
    enableGestures: false
  });
  
  const [resumeFileName, setResumeFileName] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState(false);

  // Load saved config on mount AND pre-load Gesture AI
  useEffect(() => {
    // 1. Pre-load gesture service so it's ready when user clicks start
    gestureService.initialize().catch(e => console.warn("Background gesture init warning:", e));

    // 2. Load Config
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.type && parsed.persona) {
          setConfig(prev => ({
             ...prev,
             type: parsed.type,
             persona: parsed.persona,
             context: parsed.context || '',
             enableGestures: parsed.enableGestures || false,
             resumeText: '' // FORCE EMPTY RESUME ON LOAD
          }));
        }
      }
    } catch (e) {
      console.warn("Failed to load saved config", e);
    }
  }, []);

  // Save config whenever it changes
  useEffect(() => {
    try {
      const { resumeText, ...persistentConfig } = config;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistentConfig));
    } catch (e) {
      console.warn("Failed to save config", e);
    }
  }, [config]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
        alert("Please upload a PDF file.");
        return;
    }

    setIsExtracting(true);
    try {
        const text = await extractTextFromPDF(file);
        if (text.length < 50) {
            alert("Could not extract enough text from this PDF. It might be an image-only PDF.");
            return;
        }
        setConfig(prev => ({ ...prev, resumeText: text }));
        setResumeFileName(file.name);
    } catch (err) {
        alert("Failed to read PDF. Please try a different file.");
        console.error(err);
    } finally {
        setIsExtracting(false);
    }
  };

  const removeResume = () => {
    setConfig(prev => ({ ...prev, resumeText: '' }));
    setResumeFileName('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStart(config);
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-4 md:p-8 glass-panel rounded-2xl shadow-2xl animate-fade-in-up">
      <div className="text-center mb-6 md:mb-10">
        <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500 mb-2">
          AI InterviewBot
        </h1>
        <p className="text-slate-400 text-sm md:text-base">Configure your session to begin practice</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Role Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
            <BriefcaseIcon className="w-4 h-4 text-blue-400" /> Target Role
          </label>
          <div className="relative">
            <select
              value={config.type}
              onChange={(e) => setConfig({ ...config, type: e.target.value as InterviewType })}
              className="w-full appearance-none bg-slate-800/50 border border-slate-700 rounded-xl p-3 pr-10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm md:text-base shadow-sm cursor-pointer hover:bg-slate-800/80"
            >
              {Object.values(InterviewType).map((role) => (
                <option key={role} value={role} className="bg-slate-800 text-white">
                  {role}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
              <ChevronDownIcon className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Persona Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-purple-400" /> Interviewer Persona
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-3">
            {Object.values(InterviewerPersona).map((persona) => (
              <button
                key={persona}
                type="button"
                onClick={() => setConfig({ ...config, persona })}
                className={`p-3 rounded-lg border text-center text-sm transition-all ${
                  config.persona === persona
                    ? 'border-purple-500 bg-purple-500/20 text-white shadow-[0_0_15px_rgba(168,85,247,0.5)]'
                    : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500 hover:bg-slate-700'
                }`}
              >
                {persona}
              </button>
            ))}
          </div>
        </div>

        {/* Resume Upload */}
        <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                <DocumentTextIcon className="w-4 h-4 text-orange-400" /> Upload Resume (PDF)
            </label>
            
            {!config.resumeText ? (
                <div className="relative group">
                    <input 
                        type="file" 
                        accept="application/pdf"
                        onChange={handleFileChange}
                        disabled={isExtracting}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className={`flex items-center justify-center gap-3 p-4 border-2 border-dashed rounded-xl transition-all ${
                        isExtracting 
                        ? 'border-blue-500 bg-blue-500/10' 
                        : 'border-slate-700 bg-slate-800/50 group-hover:border-slate-500 group-hover:bg-slate-700'
                    }`}>
                        {isExtracting ? (
                            <>
                                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                <span className="text-blue-400 text-sm font-medium">Extracting...</span>
                            </>
                        ) : (
                            <>
                                <ArrowUpTrayIcon className="w-5 h-5 text-slate-400" />
                                <span className="text-slate-400 text-sm">Upload PDF resume</span>
                            </>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="p-2 bg-green-500/20 rounded-lg shrink-0">
                             <DocumentTextIcon className="w-5 h-5 text-green-400" />
                        </div>
                        <div className="min-w-0">
                             <p className="text-sm font-medium text-white truncate">{resumeFileName || "Resume Uploaded"}</p>
                             <p className="text-xs text-green-400">Ready</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={removeResume}
                        className="p-2 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-colors shrink-0"
                        title="Remove Resume"
                    >
                        <TrashIcon className="w-5 h-5" />
                    </button>
                </div>
            )}
        </div>

        {/* Gesture Analysis Toggle */}
        <div>
           <button
             type="button"
             onClick={() => setConfig(prev => ({ ...prev, enableGestures: !prev.enableGestures }))}
             className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                config.enableGestures 
                ? 'bg-indigo-500/20 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]' 
                : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'
             }`}
           >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${config.enableGestures ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                    <VideoCameraIcon className="w-5 h-5" />
                </div>
                <div className="text-left">
                    <p className={`text-sm font-semibold ${config.enableGestures ? 'text-white' : 'text-slate-400'}`}>
                        Body Language Analysis
                    </p>
                    <p className="text-xs text-slate-500">Uses camera to detect smiles, eye contact & gestures</p>
                </div>
              </div>
              
              <div className={`w-12 h-6 rounded-full p-1 transition-colors ${config.enableGestures ? 'bg-indigo-500' : 'bg-slate-700'}`}>
                 <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${config.enableGestures ? 'translate-x-6' : 'translate-x-0'}`} />
              </div>
           </button>
        </div>

        {/* Context */}
        <div>
           <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
            <PencilSquareIcon className="w-4 h-4 text-green-400" /> Additional Context (Optional)
          </label>
          <textarea
            value={config.context}
            onChange={(e) => setConfig({ ...config, context: e.target.value })}
            placeholder="E.g. Focus on System Design, or I am applying for a Senior React position..."
            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm md:text-base"
            rows={3}
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || isExtracting}
          className={`w-full py-3 md:py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] ${
            isLoading || isExtracting
              ? 'bg-slate-700 cursor-not-allowed text-slate-500'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg'
          }`}
        >
          {isLoading ? (
            'Initializing...'
          ) : (
            <>
              <PlayIcon className="w-6 h-6" /> Start Interview
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default SetupForm;
