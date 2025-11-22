import React from 'react';
import { FeedbackData } from '../types';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import { CheckCircleIcon, ExclamationTriangleIcon, ArrowPathIcon, VideoCameraIcon, HandRaisedIcon, FaceSmileIcon, EyeIcon } from '@heroicons/react/24/solid';

interface FeedbackReportProps {
  data: FeedbackData;
  onReset: () => void;
}

const FeedbackReport: React.FC<FeedbackReportProps> = ({ data, onReset }) => {
  // Defensive coding: Ensure metrics exists, default to 0 if missing
  const metrics = data.metrics || {
    technical: 0,
    communication: 0,
    confidence: 0,
    clarity: 0,
    problemSolving: 0
  };

  const chartData = [
    { subject: 'Technical', A: metrics.technical, fullMark: 10 },
    { subject: 'Communication', A: metrics.communication, fullMark: 10 },
    { subject: 'Confidence', A: metrics.confidence, fullMark: 10 },
    { subject: 'Clarity', A: metrics.clarity, fullMark: 10 },
    { subject: 'Problem Solving', A: metrics.problemSolving, fullMark: 10 },
  ];

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="w-full max-w-6xl mx-auto animate-fade-in p-2 md:p-4 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 md:mb-8 border-b border-slate-700 pb-4 gap-4">
        <div className="text-center md:text-left">
          <h2 className="text-2xl md:text-3xl font-bold text-white">Interview Analysis</h2>
          <p className="text-slate-400 text-sm mt-1">Detailed breakdown of your performance</p>
        </div>
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-full text-white font-bold shadow-lg shadow-blue-500/20 transition-all transform hover:scale-105 text-sm md:text-base"
        >
          <ArrowPathIcon className="w-4 h-4" /> New Session
        </button>
      </div>

      {/* CHANGED: lg:grid-cols-3 -> lg:grid-cols-2 for better balance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        
        {/* Score Card - Now spans 50% (lg:col-span-1 in 2-col grid) */}
        <div className="glass-panel p-6 md:p-8 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden order-1">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 pointer-events-none" />
          
          <h3 className="text-lg font-semibold text-slate-300 mb-6 self-start w-full border-b border-slate-700/50 pb-2">Overall Score</h3>
          
          <div className="relative w-40 h-40 md:w-48 md:h-48 flex items-center justify-center mb-6">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 180 180">
              <circle
                cx="90"
                cy="90"
                r="70"
                stroke="#1e293b"
                strokeWidth="12"
                fill="transparent"
              />
              <circle
                cx="90"
                cy="90"
                r="70"
                stroke="currentColor"
                strokeWidth="12"
                fill="transparent"
                strokeDasharray={440}
                strokeDashoffset={440 - (440 * data.score) / 100}
                className={`${getScoreColor(data.score)} transition-all duration-1000 ease-out`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center animate-fade-in-up">
              <span className={`text-4xl md:text-5xl font-bold ${getScoreColor(data.score)}`}>{data.score}</span>
              <span className="text-xs text-slate-400 uppercase tracking-wider mt-1">/ 100</span>
            </div>
          </div>
          
          <div className="text-center bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 w-full">
            <p className="text-slate-300 text-sm leading-relaxed italic">"{data.summary}"</p>
          </div>
        </div>

        {/* Radar Chart - Now spans 50% (lg:col-span-1 in 2-col grid) */}
        <div className="glass-panel p-4 md:p-6 rounded-2xl min-h-[300px] md:min-h-[400px] flex flex-col order-2">
          <h3 className="text-lg font-semibold text-white mb-6 border-b border-slate-700/50 pb-2">Skill Breakdown</h3>
          <div className="flex-1 w-full h-full min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
                <Radar
                  name="Performance"
                  dataKey="A"
                  stroke="#818cf8"
                  strokeWidth={3}
                  fill="#818cf8"
                  fillOpacity={0.4}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Strengths - Spans 50% */}
        <div className="glass-panel p-6 rounded-2xl border-t-4 border-green-500 order-3">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <CheckCircleIcon className="w-6 h-6 text-green-500" /> 
            Top Strengths
          </h3>
          <ul className="space-y-3">
            {data.strengths.map((s, i) => (
              <li key={i} className="flex gap-3 text-slate-300 text-sm bg-slate-800/30 p-3 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-green-500 mt-1.5 shrink-0 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                {s}
              </li>
            ))}
          </ul>
        </div>

        {/* Improvements - Spans 50% */}
        <div className="glass-panel p-6 rounded-2xl border-t-4 border-yellow-500 order-4">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <ExclamationTriangleIcon className="w-6 h-6 text-yellow-500" /> 
            Areas for Growth
          </h3>
          {/* Changed from grid to vertical stack for better readability in 50% width */}
          <div className="flex flex-col gap-3">
             {data.improvements.map((s, i) => (
              <div key={i} className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50 hover:border-yellow-500/30 transition-colors">
                 <div className="flex gap-2">
                    <span className="text-yellow-500 font-bold text-lg">•</span>
                    <p className="text-slate-300 text-sm">{s}</p>
                 </div>
              </div>
            ))}
          </div>
        </div>

        {/* Body Language Analysis - Spans Full Width (lg:col-span-2) */}
        {data.gestureMetrics && (
          <div className="glass-panel p-6 rounded-2xl lg:col-span-2 border-t-4 border-indigo-500 order-5 animate-fade-in-up">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <VideoCameraIcon className="w-6 h-6 text-indigo-500" />
                Non-Verbal Communication Analysis
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {/* Smiles */}
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 text-center">
                    <FaceSmileIcon className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-white">{data.gestureMetrics.smileCount}</p>
                    <p className="text-xs text-slate-400 uppercase tracking-wide">Smiles Detected</p>
                </div>

                {/* Hand Gestures */}
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 text-center">
                    <HandRaisedIcon className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-white">{data.gestureMetrics.handGestureCount}</p>
                    <p className="text-xs text-slate-400 uppercase tracking-wide">Hand Gestures</p>
                </div>

                {/* Eye Touching */}
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 text-center">
                    <EyeIcon className="w-8 h-8 text-orange-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-white">{data.gestureMetrics.eyeTouchCount}</p>
                    <p className="text-xs text-slate-400 uppercase tracking-wide">Face Touches</p>
                </div>
            </div>
            <p className="mt-4 text-sm text-slate-400 text-center italic">
                * Metrics detected via camera analysis. Frequent face touching may indicate nervousness. Regular smiling improves perceived confidence.
            </p>
          </div>
        )}

      </div>
    </div>
  );
};

export default FeedbackReport;