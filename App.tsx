
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import SetupForm from './components/SetupForm';
import FeedbackReport from './components/FeedbackReport';
import AudioVisualizer from './components/AudioVisualizer';
import CountdownOverlay from './components/CountdownOverlay';
import {
  InterviewConfig,
  InterviewState,
  ChatMessage,
  FeedbackData,
  GestureMetrics
} from './types';
import { SYSTEM_INSTRUCTION_TEMPLATE, FEEDBACK_GENERATION_PROMPT, CREDITS_INFO } from './constants';
import { createPcmBlob, decodeAudioData } from './services/audioService';
import { gestureService } from './services/gestureService';
import { MicrophoneIcon, PhoneXMarkIcon, SpeakerWaveIcon, ArrowPathIcon, InformationCircleIcon, XMarkIcon, ExclamationTriangleIcon as ExclamationIcon, SparklesIcon, ClipboardDocumentListIcon, ChatBubbleLeftRightIcon, CheckCircleIcon, VideoCameraIcon } from '@heroicons/react/24/solid';

// Lazy load components
const SetupFormComp = SetupForm;
const FeedbackReportComp = FeedbackReport;

// Messages to display while analyzing
const LOADING_MESSAGES = [
  "Processing interview audio...",
  "Analyzing technical accuracy...",
  "Evaluating communication clarity...",
  "Detecting key strengths...",
  "Calculating confidence metrics...",
  "Compiling final score...",
  "Almost there..."
];

const App: React.FC = () => {
  // Use a ref to track state instantly for async callbacks
  const stateRef = useRef<InterviewState>(InterviewState.IDLE);
  const [state, setState] = useState<InterviewState>(InterviewState.IDLE);
  
  // Sync Ref with State
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const [config, setConfig] = useState<InterviewConfig | null>(null);
  const [transcripts, setTranscripts] = useState<ChatMessage[]>([]);
  
  // UI State for text streaming (Visual only)
  const [currentInputTrans, setCurrentInputTrans] = useState('');
  const [currentOutputTrans, setCurrentOutputTrans] = useState('');
  
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [tokenUsage, setTokenUsage] = useState(0);
  
  // UX States
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const [showResetNotification, setShowResetNotification] = useState(false);
  const [showCountdown, setShowCountdown] = useState(false);

  // Refs for Audio and Session Management
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Gesture Video Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const gestureReqIdRef = useRef<number | null>(null);

  // IMPORTANT: Refs to track the active session object for cleanup
  const sessionRef = useRef<Promise<any> | null>(null);
  const activeSessionRef = useRef<any>(null); // Stores the actual resolved session for closing
  
  // Session ID to prevent race conditions (Old session events crashing new session)
  const currentSessionIdRef = useRef<string>("");
  
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  
  // DATA INTEGRITY REFS:
  const currentInputRef = useRef<string>('');
  const currentOutputRef = useRef<string>('');
  const fullTranscriptRef = useRef<string>(''); // For final analysis
  
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const errorTranscriptEndRef = useRef<HTMLDivElement>(null);
  
  // Cleanup on mount/unmount
  useEffect(() => {
    return () => {
      stopAllMedia();
    };
  }, []);

  // Cancel countdown if error occurs or we return to IDLE
  useEffect(() => {
    if (state === InterviewState.ERROR || state === InterviewState.IDLE) {
        setShowCountdown(false);
    }
  }, [state]);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [transcripts, currentInputTrans, currentOutputTrans, state]);

  // Auto-scroll error transcript
  useEffect(() => {
    if (state === InterviewState.ERROR && errorTranscriptEndRef.current) {
      errorTranscriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state, transcripts]);

  // Cycle loading messages
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (state === InterviewState.ANALYZING) {
      setLoadingMsgIndex(0);
      interval = setInterval(() => {
        setLoadingMsgIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
      }, 6000); 
    }
    return () => clearInterval(interval);
  }, [state]);

  // Clean up function for ALL media resources (Audio + Video)
  const stopAllMedia = async () => {
    console.log("Stopping all media & sessions...");
    
    // Invalidate current session immediately
    currentSessionIdRef.current = ""; 
    
    // 1. Stop Audio Stream
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => {
            track.stop();
            track.enabled = false;
        });
      } catch(e) {}
      streamRef.current = null;
    }

    // 2. Stop Video Stream (Gesture)
    if (videoStreamRef.current) {
        try {
            videoStreamRef.current.getTracks().forEach(track => track.stop());
        } catch(e) {}
        videoStreamRef.current = null;
    }
    
    // 3. Clear Gesture Loop
    if (gestureReqIdRef.current) {
        cancelAnimationFrame(gestureReqIdRef.current);
        gestureReqIdRef.current = null;
    }

    // 4. Close Audio Processors
    if (processorRef.current) {
      try { 
        processorRef.current.disconnect(); 
        processorRef.current.onaudioprocess = null;
      } catch(e) {}
      processorRef.current = null;
    }

    // 5. Close Live API Session
    if (activeSessionRef.current) {
      try {
        await activeSessionRef.current.close();
      } catch (e) {
        console.warn("Error closing Live session:", e);
      }
      activeSessionRef.current = null;
    }
    
    // 6. Close Audio Contexts - Safely
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { await audioContextRef.current.close(); } catch (e) { console.warn("Input Ctx close warning", e); }
      audioContextRef.current = null;
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
      try { await outputAudioContextRef.current.close(); } catch (e) { console.warn("Output Ctx close warning", e); }
      outputAudioContextRef.current = null;
    }
    
    // 7. Stop any playing audio sources
    if (sourcesRef.current) {
        sourcesRef.current.forEach(source => {
            try { source.stop(); } catch (e) {}
        });
        sourcesRef.current.clear();
    }
  };

  const startGestureAnalysis = async (sessionId: string) => {
    // NOTE: Initialization is now triggered in SetupForm. We just use the instance.
    try {
        if (!gestureService.isServiceReady()) {
            console.warn("Gesture service not ready yet, attempting init...");
            await gestureService.initialize();
        }

        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        videoStreamRef.current = stream;
        
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadeddata = () => {
                 // Verify session is still valid before playing
                 if (currentSessionIdRef.current !== sessionId) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                 }

                 videoRef.current?.play().catch(e => console.warn("Video play blocked", e));
                 gestureService.reset();
                 
                 // Run high-performance animation frame loop for detection
                 const loop = () => {
                     if (currentSessionIdRef.current !== sessionId) {
                         if (gestureReqIdRef.current) {
                             cancelAnimationFrame(gestureReqIdRef.current);
                             gestureReqIdRef.current = null;
                         }
                         return;
                     }

                     if (videoRef.current && videoRef.current.readyState >= 2) {
                         gestureService.detect(videoRef.current);
                     }
                     gestureReqIdRef.current = requestAnimationFrame(loop);
                 };
                 
                 loop();
            };
        }
    } catch (e) {
        console.error("Failed to start gesture camera:", e);
        // Do not fail the interview if camera fails, just log it
    }
  };

  const startInterview = async (selectedConfig: InterviewConfig) => {
    if (!navigator.onLine) {
        setError("No internet connection. Please check your network.");
        setState(InterviewState.ERROR);
        return;
    }

    await stopAllMedia();
    
    // START COUNTDOWN (Runs in parallel with setup)
    setShowCountdown(true);

    await new Promise(resolve => setTimeout(resolve, 600)); // Cooldown to ensure sockets close

    // GENERATE NEW SESSION ID
    const newSessionId = Date.now().toString();
    currentSessionIdRef.current = newSessionId;

    // RESET ALL CURSORS AND REFS
    nextStartTimeRef.current = 0;
    currentInputRef.current = '';
    currentOutputRef.current = '';
    fullTranscriptRef.current = '';
    gestureService.reset();

    const cleanResumeText = selectedConfig.resumeText 
        ? selectedConfig.resumeText.trim().slice(0, 4000).replace(/[\{\}]/g, '') 
        : '';
    
    const finalConfig = {
        ...selectedConfig,
        resumeText: cleanResumeText
    };

    setConfig(finalConfig);
    setState(InterviewState.CONNECTING);
    setError(null);
    setTranscripts([]);
    setCurrentInputTrans('');
    setCurrentOutputTrans('');
    setTokenUsage(0);

    try {
      // Start Gesture Analysis INDEPENDENTLY if enabled
      // We do not await this, so it doesn't block audio start
      if (finalConfig.enableGestures) {
         startGestureAnalysis(newSessionId);
      }

      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API Key not found in environment");

      // 1. Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      
      // Request 16kHz but accept whatever the browser gives
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      const outputCtx = new AudioContextClass({ sampleRate: 24000 });
      
      if (inputCtx.state === 'suspended') await inputCtx.resume();
      if (outputCtx.state === 'suspended') await outputCtx.resume();
      
      audioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      // Silence loop
      const startSilenceLoop = (ctx: AudioContext) => {
        try {
          const silenceBuffer = ctx.createBuffer(1, 1, ctx.sampleRate);
          const chData = silenceBuffer.getChannelData(0);
          chData[0] = 0; 
          const silenceSource = ctx.createBufferSource();
          silenceSource.buffer = silenceBuffer;
          silenceSource.loop = true;
          silenceSource.connect(ctx.destination);
          silenceSource.start();
          sourcesRef.current.add(silenceSource);
        } catch (e) {
          console.warn("Silence loop failed", e);
        }
      };
      startSilenceLoop(inputCtx);
      startSilenceLoop(outputCtx);

      // 2. Analysers
      const inputAnalyser = inputCtx.createAnalyser();
      inputAnalyser.fftSize = 256;
      inputAnalyserRef.current = inputAnalyser;

      const outputAnalyser = outputCtx.createAnalyser();
      outputAnalyser.fftSize = 256;
      outputAnalyserRef.current = outputAnalyser;
      outputAnalyser.connect(outputCtx.destination);

      // 3. Microphone
      try {
        // Explicitly enable echo cancellation and noise suppression
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } 
        });
        streamRef.current = stream;
        const source = inputCtx.createMediaStreamSource(stream);
        source.connect(inputAnalyser);
        
        // Use a slightly larger buffer to ensure stable downsampling math
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        
        source.connect(processor);
        processor.connect(inputCtx.destination);
      } catch (micErr) {
        console.error("Microphone access denied:", micErr);
        throw new Error("Microphone access denied. Please allow permissions.");
      }

      // 4. Gemini Live Connection
      const ai = new GoogleGenAI({ apiKey });
      
      const sysInstruction = SYSTEM_INSTRUCTION_TEMPLATE(
        finalConfig.type,
        finalConfig.persona,
        finalConfig.context,
        finalConfig.resumeText
      );

      let sessionResolver: (value: any) => void;
      const sessionPromiseWrapper = new Promise<any>((resolve) => {
        sessionResolver = resolve;
      });
      sessionRef.current = sessionPromiseWrapper;

      const connection = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } },
          },
          systemInstruction: sysInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            if (currentSessionIdRef.current !== newSessionId) return;
            console.log("Session Opened", newSessionId);
            setState(InterviewState.ACTIVE);
            
            if (processorRef.current) {
                processorRef.current.onaudioprocess = (e) => {
                    // CRITICAL: Check Session ID
                    if (currentSessionIdRef.current !== newSessionId) return;
    
                    const inputData = e.inputBuffer.getChannelData(0);
                    
                    // DOWNSAMPLING LOGIC: Convert whatever the browser gives us (e.g. 48kHz) to 16kHz
                    // This significantly reduces latency for the transcription events.
                    const targetSampleRate = 16000;
                    const sourceSampleRate = inputCtx.sampleRate;
                    
                    let finalData = inputData;
                    
                    if (sourceSampleRate > targetSampleRate) {
                        const ratio = sourceSampleRate / targetSampleRate;
                        const newLength = Math.floor(inputData.length / ratio);
                        finalData = new Float32Array(newLength);
                        for (let i = 0; i < newLength; i++) {
                            finalData[i] = inputData[Math.floor(i * ratio)];
                        }
                    }

                    const pcmBlob = createPcmBlob(finalData, targetSampleRate);
                    
                    sessionPromiseWrapper.then(session => {
                      if (currentSessionIdRef.current !== newSessionId) return;
                      try {
                        session.sendRealtimeInput({ media: pcmBlob });
                      } catch (err) {
                        console.warn("Failed to send audio chunk:", err);
                      }
                    });
                };
            }
          },
          onmessage: async (msg: LiveServerMessage) => {
             if (currentSessionIdRef.current !== newSessionId) return;

             // --- 1. HANDLE TEXT IMMEDIATELY (Reduces UI Latency) ---
             let hasTextUpdate = false;
             
             if (msg.serverContent?.outputTranscription?.text) {
                const text = msg.serverContent.outputTranscription.text;
                currentOutputRef.current += text;
                setCurrentOutputTrans(currentOutputRef.current);
                hasTextUpdate = true;
             } 
             
             if (msg.serverContent?.inputTranscription?.text) {
                const text = msg.serverContent.inputTranscription.text;
                currentInputRef.current += text;
                setCurrentInputTrans(currentInputRef.current);
                hasTextUpdate = true;
             }

             // Handle turn completion
             if (msg.serverContent?.turnComplete) {
                const input = currentInputRef.current;
                const output = currentOutputRef.current;

                if (input.trim() || output.trim()) {
                  setTranscripts(prev => [
                     ...prev,
                     { role: 'user', text: input },
                     { role: 'model', text: output }
                  ]);
                  
                  const newTokens = Math.ceil((input.length + output.length) / 3.5);
                  setTokenUsage(prev => prev + newTokens);

                  fullTranscriptRef.current += `Candidate: ${input}\nInterviewer: ${output}\n`;
                }
                
                // Clear state
                currentInputRef.current = '';
                currentOutputRef.current = '';
                setCurrentInputTrans(''); 
                setCurrentOutputTrans('');
                hasTextUpdate = true;
             }
             
             // Handle Interruption
             if (msg.serverContent?.interrupted) {
               if (sourcesRef.current) {
                   sourcesRef.current.forEach(s => { try { s.stop() } catch(e){} });
                   sourcesRef.current.clear();
               }
               nextStartTimeRef.current = outputAudioContextRef.current?.currentTime || 0;
               
               const input = currentInputRef.current;
               const output = currentOutputRef.current;

               if (input.trim() || output.trim()) {
                 setTranscripts(prev => [
                    ...prev,
                    { role: 'user', text: input },
                    { role: 'model', text: output + " (interrupted)" }
                 ]);
                 fullTranscriptRef.current += `Candidate: ${input}\nInterviewer: ${output} (interrupted)\n`;
                 
                 currentInputRef.current = '';
                 currentOutputRef.current = '';
                 setCurrentInputTrans(''); 
                 setCurrentOutputTrans('');
               }
             }

             // --- 2. HANDLE AUDIO ASYNCHRONOUSLY (Does not block text UI) ---
             const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
             if (base64Audio) {
               // We purposely do not await this immediately if we want text to paint first
               // But React state updates are batched anyway. 
               // The key is that we already called setCurrent... above.
               
               if (outputAudioContextRef.current && outputAudioContextRef.current.state === 'running') {
                 const ctx = outputAudioContextRef.current;
                 
                 try {
                    const audioBuffer = await decodeAudioData(
                        base64ToUint8Array(base64Audio),
                        ctx,
                        24000,
                        1
                    );
                    
                    // Recalculate timing to prevent overlap or gaps
                    nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                    
                    const source = ctx.createBufferSource();
                    source.buffer = audioBuffer;
                    
                    if (outputAnalyserRef.current) {
                        try { source.connect(outputAnalyserRef.current); } catch(e) {}
                    } else {
                        try { source.connect(ctx.destination); } catch(e) {}
                    }
                    
                    source.addEventListener('ended', () => {
                        if (sourcesRef.current) sourcesRef.current.delete(source);
                    });
                    
                    source.start(nextStartTimeRef.current);
                    nextStartTimeRef.current += audioBuffer.duration;
                    if (sourcesRef.current) sourcesRef.current.add(source);
                 } catch (decodeErr) {
                     console.warn("Audio decode error", decodeErr);
                 }
               }
             }
          },
          onclose: () => {
             console.log("Session Closed", newSessionId);
             // Only treat as error if we didn't initiate the close (currentSessionIdRef still matches)
             if (currentSessionIdRef.current === newSessionId) {
                setState(InterviewState.ERROR);
                setError("Session closed unexpectedly by server.");
                stopAllMedia();
             }
          },
          onerror: (e) => {
            // IGNORE errors from old sessions to prevent race conditions
            if (currentSessionIdRef.current !== newSessionId) {
                console.warn("Ignored error from old session:", e);
                return;
            }

            console.error("Live API Error:", e);
            
            const errorStr = e.toString();
            const isNetworkError = errorStr.includes("Network error") || errorStr.includes("network");
            const isPermissionError = errorStr.includes("permission");

            let errorMsg = "Connection was interrupted.";
            if (isNetworkError) {
                errorMsg = "Connection interrupted due to network instability. Please check your internet.";
            } else if (isPermissionError) {
                errorMsg = "Session expired or permission denied. Please reset and try again.";
            }
                 
            setError(errorMsg);
            setState(InterviewState.ERROR);
            stopAllMedia(); 
          }
        }
      });
      
      connection.then(session => {
        if (currentSessionIdRef.current !== newSessionId) {
            console.log("Session connected AFTER cancellation. Closing immediately.");
            try { session.close(); } catch(e) {}
            return;
        }

        sessionResolver(session);
        activeSessionRef.current = session; 
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to initialize");
      setState(InterviewState.ERROR);
      stopAllMedia();
    }
  };

  const sanitizeAndParseJSON = (jsonText: string): any => {
    // 1. Remove markdown code blocks if any
    let cleaned = jsonText.replace(/```json/g, '').replace(/```/g, '');
    
    // 2. Find the *first* '{' and the *last* '}' to handle introductory text
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    } else {
        // Fallback: If no braces found, this is definitely not JSON
        throw new Error("No JSON object found in response");
    }

    // 3. Attempt parsing
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      console.warn("Standard JSON parse failed, attempting recovery...", cleaned);
      // 4. Attempt to fix common JSON trailing comma issues (e.g. "item", } -> "item" })
      cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      try {
          return JSON.parse(cleaned);
      } catch (e2) {
          throw e; // Give up
      }
    }
  };

  const handleEndInterview = async () => {
    // Capture metrics BEFORE stopping media completely
    const gestureResults = config?.enableGestures ? gestureService.getMetrics() : undefined;
    
    // Mark session as inactive to stop incoming messages
    currentSessionIdRef.current = ""; 
    
    await stopAllMedia();
    setState(InterviewState.ANALYZING);

    const finalTranscript = fullTranscriptRef.current + 
        (currentInputRef.current ? `\nCandidate (Final): ${currentInputRef.current}` : '') + 
        (currentOutputRef.current ? `\nInterviewer (Final): ${currentOutputRef.current}` : '');

    // Default fallback object
    const emptyMetrics = { technical: 0, communication: 0, confidence: 0, clarity: 0, problemSolving: 0 };

    if (!finalTranscript || finalTranscript.length < 10) {
      const emptyData: FeedbackData = {
         score: 0,
         summary: "No meaningful conversation was recorded. Please check microphone settings.",
         strengths: ["N/A"],
         improvements: ["Ensure microphone is enabled", "Check network connection"],
         metrics: emptyMetrics,
         gestureMetrics: gestureResults 
      };
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (stateRef.current === InterviewState.ANALYZING) {
        setFeedback(emptyData);
        setState(InterviewState.FEEDBACK);
      }
      return;
    }

    try {
       const apiKey = process.env.API_KEY;
       if (!apiKey) throw new Error("API Key missing");
       
       const ai = new GoogleGenAI({ apiKey });
       const prompt = `${FEEDBACK_GENERATION_PROMPT}\n\nTRANSCRIPT:\n${finalTranscript}`;
       
       const response = await ai.models.generateContent({
         model: 'gemini-2.5-flash',
         contents: prompt,
         config: {
           responseMimeType: 'application/json',
           maxOutputTokens: 8192, 
         }
       });

       const jsonText = response.text || "{}";
       let feedbackData: FeedbackData;

       try {
         const parsed = sanitizeAndParseJSON(jsonText);
         
         feedbackData = {
            score: typeof parsed.score === 'number' ? parsed.score : 0,
            summary: parsed.summary || "Analysis complete.",
            strengths: Array.isArray(parsed.strengths) ? parsed.strengths : ["No specific strengths detected"],
            improvements: Array.isArray(parsed.improvements) ? parsed.improvements : ["No specific improvements detected"],
            metrics: {
                technical: parsed.metrics?.technical || 0,
                communication: parsed.metrics?.communication || 0,
                confidence: parsed.metrics?.confidence || 0,
                clarity: parsed.metrics?.clarity || 0,
                problemSolving: parsed.metrics?.problemSolving || 0
            },
            gestureMetrics: gestureResults // Attach gesture data
         };
       } catch (parseError) {
         console.error("JSON Parse Error:", parseError);
         feedbackData = {
            score: 0,
            summary: "The AI analyzed the interview but returned an invalid format.",
            strengths: ["Analysis Error"],
            improvements: ["Please try again"],
            metrics: emptyMetrics,
            gestureMetrics: gestureResults 
         };
       }
       
       if (stateRef.current === InterviewState.ANALYZING) {
          setFeedback(feedbackData);
          setState(InterviewState.FEEDBACK);
       } 
       
    } catch (e: any) {
      console.error("Feedback Generation Error:", e);
      if (stateRef.current === InterviewState.ANALYZING) {
          // Even in catastrophic error, try to show gestures if we have them
          const emergencyData: FeedbackData = {
                score: 0,
                summary: "Network or API error during analysis.",
                strengths: ["N/A"],
                improvements: ["N/A"],
                metrics: emptyMetrics,
                gestureMetrics: gestureResults
          };
          setFeedback(emergencyData);
          setState(InterviewState.FEEDBACK);
      }
    }
  };

  function base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  const handleHardReset = async () => {
    console.log("Triggering aggressive internal reset...");
    currentSessionIdRef.current = ""; // Invalidate sessions

    try {
      await stopAllMedia();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try { await audioContextRef.current.close(); } catch(e) {}
      }
      if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
        try { await outputAudioContextRef.current.close(); } catch(e) {}
      }
      
      audioContextRef.current = null;
      outputAudioContextRef.current = null;
      streamRef.current = null;
      videoStreamRef.current = null;
      processorRef.current = null;
      activeSessionRef.current = null;
      sourcesRef.current.clear();
      
      nextStartTimeRef.current = 0;
      currentInputRef.current = '';
      currentOutputRef.current = '';
      fullTranscriptRef.current = '';
      
      setTranscripts([]);
      setCurrentInputTrans('');
      setCurrentOutputTrans('');
      setFeedback(null);
      setError(null);
      setTokenUsage(0);
      
      setState(InterviewState.IDLE);
      setShowCountdown(false);
      
      setShowResetNotification(true);
      setTimeout(() => setShowResetNotification(false), 3000);
      
    } catch (e) {
      console.error("Reset failed:", e);
      setState(InterviewState.IDLE);
      setShowResetNotification(true);
      setTimeout(() => setShowResetNotification(false), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white relative selection:bg-blue-500 selection:text-white font-inter">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none fixed">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[100px]" />
      </div>

      {/* Hidden Video Element for Gesture Analysis */}
      <video 
        ref={videoRef} 
        className={`fixed top-4 right-4 w-32 h-24 object-cover rounded-xl border-2 border-indigo-500 shadow-2xl z-50 ${state === InterviewState.ACTIVE && config?.enableGestures && !showCountdown ? 'block' : 'hidden'}`} 
        muted 
        playsInline 
        style={{ transform: 'scaleX(-1)' }} // Mirror effect
      />

      {showCountdown && (
         <CountdownOverlay onComplete={() => setShowCountdown(false)} />
      )}

      {showResetNotification && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-full shadow-2xl z-50 animate-fade-in-down flex items-center gap-2 max-w-[90%] text-sm md:text-base">
           <CheckCircleIcon className="w-5 h-5 flex-shrink-0" />
           <span className="font-medium">Session Reset Successfully.</span>
        </div>
      )}

      <div className="relative z-10 container mx-auto px-4 py-4 md:py-6 min-h-screen flex flex-col">
        <header className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setState(InterviewState.IDLE)}>
            <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-indigo-500 rounded-lg shadow-lg flex items-center justify-center">
              <MicrophoneIcon className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg md:text-xl tracking-tight hidden xs:block">AI InterviewBot</span>
            <span className="font-bold text-lg tracking-tight xs:hidden">FlowAI</span>
          </div>
          
          <div className="flex items-center gap-2 md:gap-3">
             <button 
              onClick={handleHardReset}
              title="Reset Session (Clear connections)"
              className="p-2 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-full transition-colors"
             >
               <ArrowPathIcon className="w-5 h-5 md:w-6 md:h-6" />
             </button>
             
            <button 
              onClick={() => setShowInfoModal(true)}
              className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
            >
              <InformationCircleIcon className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center relative w-full">
          
          {state === InterviewState.IDLE && (
             <SetupFormComp onStart={startInterview} isLoading={false} />
          )}

          {(state === InterviewState.CONNECTING || (state === InterviewState.ACTIVE && showCountdown)) && !showCountdown && (
            <div className="flex flex-col items-center animate-pulse">
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-lg font-medium text-blue-400">Establishing secure connection...</p>
              <p className="text-sm text-slate-500 mt-2">Preparing AI Persona</p>
            </div>
          )}

          {(state === InterviewState.ACTIVE) && !showCountdown && (
            <div className="w-full max-w-4xl animate-fade-in flex flex-col gap-4 md:gap-6">
               <div className="relative w-full h-64 sm:h-80 bg-slate-800/50 rounded-3xl overflow-hidden border border-slate-700/50 shadow-2xl">
                  <AudioVisualizer 
                    analyser={inputAnalyserRef.current} 
                    isActive={true} 
                    color="#60a5fa"
                  />
                  
                  <div className="absolute top-4 left-4 sm:top-6 sm:left-6 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                    <span className="text-xs font-medium text-white tracking-wide">LIVE</span>
                  </div>

                  <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 max-w-[65%] sm:max-w-[70%]">
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-1 truncate">{config?.type}</h3>
                    <div className="text-slate-400 text-sm flex flex-wrap items-center gap-2">
                       <span className="truncate max-w-[150px]">{config?.persona}</span>
                       {config?.context && <span className="text-blue-400 text-[10px] sm:text-xs px-2 py-0.5 bg-blue-500/10 rounded border border-blue-500/20 whitespace-nowrap">Context</span>}
                       {config?.resumeText && <span className="text-green-400 text-[10px] sm:text-xs px-2 py-0.5 bg-green-500/10 rounded border border-green-500/20 whitespace-nowrap">Resume</span>}
                       {config?.enableGestures && <span className="text-indigo-400 text-[10px] sm:text-xs px-2 py-0.5 bg-indigo-500/10 rounded border border-indigo-500/20 whitespace-nowrap flex items-center gap-1"><VideoCameraIcon className="w-3 h-3" /> Video Analysis</span>}
                    </div>
                  </div>

                  <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6">
                    <button 
                      onClick={handleEndInterview}
                      className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 sm:px-6 sm:py-3 rounded-full font-bold shadow-lg shadow-red-500/30 flex items-center gap-2 transition-all transform hover:scale-105 text-sm sm:text-base"
                    >
                      <PhoneXMarkIcon className="w-4 h-4 sm:w-5 sm:h-5" /> 
                      <span className="hidden xs:inline">End Interview</span>
                      <span className="xs:hidden">End</span>
                    </button>
                  </div>
               </div>

               {/* Live Transcript UI */}
               <div className="w-full glass-panel bg-slate-900/80 rounded-2xl p-4 border-t border-slate-700/50 flex flex-col h-64">
                  <div className="flex items-center gap-2 mb-3 border-b border-slate-700/50 pb-2">
                    <ChatBubbleLeftRightIcon className="w-4 h-4 text-blue-400" />
                    <h3 className="text-sm font-semibold text-slate-300">Live Transcript</h3>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                    {transcripts.length === 0 && !currentInputTrans && !currentOutputTrans && (
                      <div className="text-center text-slate-500 text-sm mt-10 italic">
                        Conversation will appear here...
                      </div>
                    )}
                    
                    {transcripts.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] sm:max-w-[80%] p-3 rounded-xl text-sm ${
                          msg.role === 'user' 
                            ? 'bg-blue-600/20 text-blue-100 rounded-tr-none border border-blue-500/20' 
                            : 'bg-slate-700/40 text-slate-200 rounded-tl-none border border-slate-600/30'
                        }`}>
                          {msg.text}
                        </div>
                      </div>
                    ))}

                    {(currentInputTrans || currentOutputTrans) && (
                       <>
                         {currentInputTrans && (
                            <div className="flex justify-end opacity-80">
                               <div className="max-w-[85%] sm:max-w-[80%] p-3 rounded-xl text-sm bg-blue-600/10 text-blue-100 rounded-tr-none border border-blue-500/10 italic animate-pulse">
                                  {currentInputTrans}
                               </div>
                            </div>
                         )}
                         {currentOutputTrans && (
                            <div className="flex justify-start opacity-80">
                               <div className="max-w-[85%] sm:max-w-[80%] p-3 rounded-xl text-sm bg-slate-700/30 text-slate-200 rounded-tl-none border border-slate-600/20 italic animate-pulse">
                                  {currentOutputTrans}
                               </div>
                            </div>
                         )}
                       </>
                    )}
                    <div ref={transcriptEndRef} />
                  </div>
               </div>
            </div>
          )}

          {state === InterviewState.ANALYZING && (
             <div className="text-center animate-fade-in max-w-md px-4">
                <div className="relative w-24 h-24 mx-auto mb-8">
                   <div className="absolute inset-0 border-4 border-slate-700 rounded-full" />
                   <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin" />
                   <SparklesIcon className="absolute inset-0 m-auto w-8 h-8 text-blue-400 animate-pulse" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Analysis in Progress</h2>
                <p className="text-slate-400 h-6 transition-all duration-500 ease-in-out text-sm md:text-base">{LOADING_MESSAGES[loadingMsgIndex]}</p>
                
                <div className="mt-8 p-4 bg-slate-800/50 rounded-lg border border-slate-700/50 text-sm text-slate-500">
                  <p>Generating comprehensive feedback report...</p>
                </div>
             </div>
          )}

          {state === InterviewState.FEEDBACK && feedback && (
             <FeedbackReportComp data={feedback} onReset={() => setState(InterviewState.IDLE)} />
          )}

          {state === InterviewState.ERROR && (
            <div className="w-full max-w-4xl mx-auto animate-fade-in flex flex-col gap-6 px-4">
                <div className="bg-red-500/10 p-6 md:p-8 rounded-3xl border border-red-500/20 text-center shadow-2xl">
                  <ExclamationIcon className="w-12 h-12 md:w-16 md:h-16 text-red-500 mx-auto mb-4" />
                  <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Connection Status</h2>
                  <p className="text-slate-300 mb-6 text-sm md:text-base">{error || "An unexpected error occurred."}</p>
                  
                  <div className="flex flex-col sm:flex-row justify-center gap-3 md:gap-4">
                    <button
                        onClick={() => setState(InterviewState.IDLE)}
                        className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-xl font-bold transition-all text-sm md:text-base"
                    >
                        Start New Session
                    </button>
                    
                    {(transcripts.length > 0 || currentInputTrans || currentOutputTrans) && (
                        <button
                            onClick={handleEndInterview}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 transition-all text-sm md:text-base"
                        >
                            <SparklesIcon className="w-5 h-5" />
                            Analyze Session
                        </button>
                    )}
                  </div>
                  
                  <div className="mt-6 pt-6 border-t border-red-500/20">
                     <p className="text-xs text-slate-400 mb-3">Stuck in a loop? Use the reset button to clear internal connections.</p>
                     <button
                        onClick={handleHardReset}
                        className="text-red-400 hover:text-red-300 text-sm font-semibold underline decoration-dashed underline-offset-4"
                     >
                        Reset Session State
                     </button>
                  </div>
                </div>
                
                {/* Transcript History in Error State */}
                <div className="w-full glass-panel bg-slate-900/80 rounded-2xl p-4 border-t border-slate-700/50 flex flex-col h-64">
                     <div className="flex items-center gap-2 mb-3 border-b border-slate-700/50 pb-2">
                        <ChatBubbleLeftRightIcon className="w-4 h-4 text-slate-400" />
                        <h3 className="text-sm font-semibold text-slate-400">Transcript History</h3>
                     </div>
                     <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                         {transcripts.length === 0 && !currentInputTrans && !currentOutputTrans && (
                            <p className="text-slate-500 text-sm text-center italic mt-4">No transcript data available.</p>
                         )}
                         {transcripts.map((msg, idx) => (
                              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] sm:max-w-[80%] p-3 rounded-xl text-sm ${
                                  msg.role === 'user' 
                                    ? 'bg-blue-600/20 text-blue-100' 
                                    : 'bg-slate-700/40 text-slate-200'
                                }`}>
                                  {msg.text}
                                </div>
                              </div>
                          ))}

                         {(currentInputTrans || currentOutputTrans) && (
                           <>
                             {currentInputTrans && (
                                <div className="flex justify-end opacity-80">
                                   <div className="max-w-[85%] sm:max-w-[80%] p-3 rounded-xl text-sm bg-blue-600/10 text-blue-100 italic border border-red-500/20">
                                      {currentInputTrans} <span className="text-xs text-red-400">(interrupted)</span>
                                   </div>
                                </div>
                             )}
                             {currentOutputTrans && (
                                <div className="flex justify-start opacity-80">
                                   <div className="max-w-[85%] sm:max-w-[80%] p-3 rounded-xl text-sm bg-slate-700/30 text-slate-200 italic border border-red-500/20">
                                      {currentOutputTrans} <span className="text-xs text-red-400">(interrupted)</span>
                                   </div>
                                </div>
                             )}
                           </>
                        )}
                        <div ref={errorTranscriptEndRef} />
                     </div>
                </div>
            </div>
          )}
        </main>

        <footer className="mt-auto pt-6 border-t border-slate-800 text-center text-slate-500 text-xs">
           <p>© 2025 AI InterviewBot</p>
        </footer>
      </div>

      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
           <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
              <button 
                onClick={() => setShowInfoModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
              
              <h2 className="text-xl md:text-2xl font-bold text-white mb-6 flex items-center gap-2">
                 <InformationCircleIcon className="w-6 h-6 text-blue-500" /> About
              </h2>
              
              <div className="space-y-4 text-slate-300 text-sm leading-relaxed">
                <p><strong className="text-white">Real-time Analysis:</strong> We stream audio directly to Gemini 1.5 Flash using the low-latency Live API over WebSockets.</p>
                
                <p><strong className="text-white">Context Awareness:</strong> Your "Additional Context" inputs are injected into the system prompt, forcing the model to adapt its persona using few-shot prompting techniques.</p>
                
                <p><strong className="text-white">Deep Analysis:</strong> After the call, the full transcript is sent back to Gemini. We use a specialized prompt to extract structured JSON metrics (0-100 scoring) and actionable feedback.</p>
                
                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 mt-4">
                  <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                     <ClipboardDocumentListIcon className="w-4 h-4 text-purple-400" /> Credits
                  </h3>
                  <ul className="space-y-1 text-xs text-slate-400">
                     <li>Developer: {CREDITS_INFO.developer}</li>
                     <li>For: {CREDITS_INFO.assignmentFor}</li>
                     <li>Email: {CREDITS_INFO.email}</li>
                  </ul>
                </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
