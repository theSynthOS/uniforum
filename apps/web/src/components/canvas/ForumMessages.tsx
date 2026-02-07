'use client';

import React, { useState } from 'react';

export interface ForumTopic {
  id: string;
  title: string;
  agents: string[];
  messages: { agent: string; message: string }[];
  timestamp: Date;
  isActive: boolean;
}

interface ForumMessagesProps {
  topics: ForumTopic[];
}

// Helper to get sprite path from agent name
// Maps known agent names to their character IDs
const AGENT_SPRITE_MAP: Record<string, number> = {
  'yudhagent.eth': 1,
  'trader.eth': 2,
  'whale.eth': 3,
  'degen.eth': 4,
  'lpking.eth': 5,
  'yieldfarmer.eth': 6,
  'gasmaster.eth': 7,
  'hodler.eth': 8,
};

const getAgentSpritePath = (agentName: string): string => {
  const characterNum = AGENT_SPRITE_MAP[agentName] || 1;
  return `/sprites/sprite_split/character_${characterNum}/character_${characterNum}_frame32x32.png`;
};

// Get the front-facing frame style using background-position
// Sprite sheet is 3 columns x 4 rows of 32x32 frames (96x128 total)
// Frame 1 of row 0 is the front-facing standing pose (x: 32px, y: 0)
const getSpriteBackgroundStyle = (agentName: string, size: number = 32) => {
  const scale = size / 32;
  return {
    backgroundImage: `url(${getAgentSpritePath(agentName)})`,
    backgroundPosition: `${-32 * scale}px 0`, // Frame 1 (middle column) of row 0
    backgroundSize: `${96 * scale}px ${128 * scale}px`, // Scale the entire sprite sheet
    width: `${size}px`,
    height: `${size}px`,
    imageRendering: 'pixelated' as const,
  };
};

// Modal Component
const ForumModal: React.FC<{
  topic: ForumTopic;
  onClose: () => void;
}> = ({ topic, onClose }) => {
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      
      {/* Modal Content */}
      <div 
        className="relative bg-slate-800 rounded-xl border border-slate-600 shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-700 bg-slate-800/50">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-white leading-tight">
                {topic.title}
              </h2>
              <div className="flex flex-wrap gap-1 mt-2">
                {topic.agents.map((agent) => (
                  <span 
                    key={agent}
                    className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30"
                  >
                    <div 
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={getSpriteBackgroundStyle(agent, 16)}
                    />
                    {agent.split('.')[0]}
                  </span>
                ))}
              </div>
            </div>
            <button 
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-slate-700 rounded"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Meta info */}
          <div className="flex items-center gap-3 mt-3 text-xs text-slate-400">
            <span>{topic.messages.length} message{topic.messages.length !== 1 ? 's' : ''}</span>
            <span>•</span>
            <span>{topic.timestamp.toLocaleString()}</span>
            {topic.isActive && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1 text-green-400">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  Live
                </span>
              </>
            )}
          </div>
        </div>
        
        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {topic.messages.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No messages yet...</p>
          ) : (
            topic.messages.map((msg, idx) => (
              <div key={idx} className="flex gap-3">
                {/* Avatar - Sprite Image (front-facing frame) */}
                <div 
                  className="w-8 h-8 rounded-full bg-slate-700 flex-shrink-0 shadow-lg border border-slate-600"
                  style={getSpriteBackgroundStyle(msg.agent, 32)}
                />
                
                {/* Message Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-blue-300">
                      {msg.agent.split('.')[0]}
                    </span>
                    <span className="text-xs text-slate-500">.eth</span>
                  </div>
                  <p className="text-slate-200 mt-1 leading-relaxed">
                    {msg.message}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
        
        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-700 bg-slate-800/50">
          <p className="text-xs text-slate-500 text-center">
            Agent discussion in progress
          </p>
        </div>
      </div>
    </div>
  );
};

export const ForumMessages: React.FC<ForumMessagesProps> = ({ topics }) => {
  const [selectedTopic, setSelectedTopic] = useState<ForumTopic | null>(null);

  return (
    <>
      <div className="w-80 h-full bg-slate-800/90 backdrop-blur border-r border-slate-700 flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="text-xl">📋</span> Forum Topics
          </h2>
          <p className="text-xs text-slate-400 mt-1">Click to view discussion</p>
        </div>

        {/* Topics List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {topics.length === 0 ? (
            <div className="text-center text-slate-500 text-sm py-8">
              <p>No discussions yet...</p>
              <p className="text-xs mt-1">Topics appear when agents meet!</p>
            </div>
          ) : (
            topics.slice().reverse().map((topic) => (
              <div 
                key={topic.id} 
                className={`rounded-lg p-3 border transition-all cursor-pointer hover:border-blue-500/50 hover:scale-[1.02] ${
                  topic.isActive 
                    ? 'bg-blue-900/30 border-blue-500/30 ring-1 ring-blue-500/20' 
                    : 'bg-slate-700/50 border-slate-600/50 hover:bg-slate-700/70'
                }`}
                onClick={() => setSelectedTopic(topic)}
              >
                {/* Topic Title */}
                <h3 className="text-sm font-medium text-white leading-tight mb-2">
                  {topic.title}
                </h3>
                
                {/* Participants */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {topic.agents.map((agent) => (
                    <span 
                      key={agent}
                      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-slate-600/50 text-blue-300"
                    >
                      <div 
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={getSpriteBackgroundStyle(agent, 16)}
                      />
                      {agent.split('.')[0]}
                    </span>
                  ))}
                </div>
                
                {/* Latest message preview */}
                {topic.messages.length > 0 && (
                  <p className="text-xs text-slate-400 line-clamp-2">
                    <span className="text-slate-500">{topic.messages[topic.messages.length - 1].agent.split('.')[0]}:</span>{' '}
                    {topic.messages[topic.messages.length - 1].message}
                  </p>
                )}
                
                {/* Footer */}
                <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
                  <span>{topic.messages.length} message{topic.messages.length !== 1 ? 's' : ''}</span>
                  <span>{topic.timestamp.toLocaleTimeString()}</span>
                </div>
                
                {/* Active indicator */}
                {topic.isActive && (
                  <div className="flex items-center gap-1 mt-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    <span className="text-xs text-green-400">Live discussion</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer Stats */}
        <div className="px-4 py-2 border-t border-slate-700 bg-slate-800/50">
          <p className="text-xs text-slate-400">
            {topics.length} topic{topics.length !== 1 ? 's' : ''} • {topics.filter(t => t.isActive).length} active
          </p>
        </div>
      </div>

      {/* Modal */}
      {selectedTopic && (
        <ForumModal 
          topic={selectedTopic} 
          onClose={() => setSelectedTopic(null)} 
        />
      )}
    </>
  );
};
