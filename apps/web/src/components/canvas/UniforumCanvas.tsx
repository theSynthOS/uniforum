'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CanvasManager } from './core/CanvasManager';
import { Agent } from './core/types';
import { ForumMessages, ForumTopic } from './ForumMessages';

import { getRandomWalkablePosition, findPath } from './assets/mapData';

// Placeholder mock data hook
const useCanvasData = () => {
    const [agents, setAgents] = useState<Agent[]>([
        // Group on right side
        { id: 'a1', name: 'yudhagent.eth', position: { x: 200, y: 50 }, color: '#3b82f6', status: 'moving' },
        { id: 'a2', name: 'trader.eth', position: { x: 220, y: 70 }, color: '#10b981', status: 'moving', direction: 'left' },
        { id: 'a3', name: 'whale.eth', position: { x: 240, y: 90 }, color: '#ec4899', status: 'moving', direction: 'right' },
        // Group in middle-right area
        { id: 'a4', name: 'degen.eth', position: { x: 100, y: 200 }, color: '#f59e0b', status: 'moving' },
        { id: 'a5', name: 'lpking.eth', position: { x: 120, y: 220 }, color: '#8b5cf6', status: 'moving' },
        // Group on left side
        { id: 'a6', name: 'yieldfarmer.eth', position: { x: -200, y: 100 }, color: '#06b6d4', status: 'moving' },
        { id: 'a7', name: 'gasmaster.eth', position: { x: -220, y: 120 }, color: '#ef4444', status: 'moving' },
        { id: 'a8', name: 'hodler.eth', position: { x: -180, y: 140 }, color: '#84cc16', status: 'moving' },
    ]);

    useEffect(() => {
        const interval = setInterval(() => {
             setAgents(prev => prev.map(a => {
                // Skip if already discussing
                if (a.status === 'discussing') return a;
                
                const move = Math.random() > 0.2; // 80% chance to move
                if (!move) return a;
                
                // Pick a random walkable position
                const target = getRandomWalkablePosition();
                if (!target) return a;
                
                // Calculate Path
                const path = findPath(a.position, target);
                
                // Assign Path (or stay idle if no valid path)
                if (path.length > 0) {
                    return {
                         ...a,
                         status: 'moving',
                         targetPosition: undefined,
                         path: path
                     };
                }
                return a; // No valid path, stay put
             }));
        }, 1500); // Faster interval
        return () => clearInterval(interval);
    }, []);

    return { agents, setAgents };
};

export const UniforumCanvas = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const managerRef = useRef<CanvasManager | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // Data
    const { agents, setAgents } = useCanvasData();
    
    // Forum Topics State
    const [forumTopics, setForumTopics] = useState<ForumTopic[]>([]);

    // Interaction State
    const isDragging = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });
    
    // Forum topic titles - aligned with AGENTS.md terminology
    const FORUM_TOPICS = [
      "Proposal: Enable AntiSandwichHook for MEV protection",
      "Fee tier vote - should we adjust to 0.3% base fee?",
      "DynamicFee hook implementation for volatile periods",
      "LimitOrderHook placement at key price ticks",
      "Consensus: Increase liquidity in ETH-USDC pool",
      "Impermanent loss mitigation with BaseAsyncSwap",
      "Governance: LiquidityPenaltyHook for JIT protection",
      "Strategy debate: Conservative vs aggressive rebalancing",
      "Proposal: Cross-pool liquidity optimization on Unichain",
      "Vote on BaseOverrideFee hook parameters",
    ];
    
    // Callback to create forum topic when agents meet
    const handleAgentMeeting = useCallback((meetingAgents: Agent[]) => {
        const discussingAgents = meetingAgents.filter(a => a.status === 'discussing' && a.lastMessage);
        
        if (discussingAgents.length < 2) return;
        
        // Group agents by their discussionGroup (set by CanvasManager)
        const groupedAgents = new Map<string, Agent[]>();
        
        discussingAgents.forEach(agent => {
            const groupKey = (agent as any).discussionGroup || agent.id;
            if (!groupedAgents.has(groupKey)) {
                groupedAgents.set(groupKey, []);
            }
            groupedAgents.get(groupKey)!.push(agent);
        });
        
        // Create/update forum for each group
        groupedAgents.forEach((agents, groupKey) => {
            if (agents.length < 2) return;
            
            const agentNames = agents.map(a => a.name);
            
            setForumTopics(prev => {
                // Check if topic already exists for this group
                const existingTopic = prev.find(t => 
                    t.agents.sort().join('-') === agentNames.sort().join('-') && t.isActive
                );
                
                if (existingTopic) {
                    // Add new messages to existing topic
                    const newMessages = agents
                        .filter(a => a.lastMessage)
                        .map(a => ({ agent: a.name, message: a.lastMessage as string }));
                    
                    return prev.map(t => 
                        t.id === existingTopic.id 
                            ? { ...t, messages: [...t.messages, ...newMessages] }
                            : t
                    );
                }
                
                // Create new topic for this group
                const topicTitle = FORUM_TOPICS[Math.floor(Math.random() * FORUM_TOPICS.length)];
                const messages = agents
                    .filter(a => a.lastMessage)
                    .map(a => ({ agent: a.name, message: a.lastMessage as string }));
                    
                return [...prev, {
                    id: `topic-${groupKey}-${Date.now()}`,
                    title: topicTitle,
                    agents: agentNames,
                    messages: messages,
                    timestamp: new Date(),
                    isActive: true
                }];
            });
        });
    }, []);

    useEffect(() => {
        if (!canvasRef.current) return;

        const manager = new CanvasManager(
            canvasRef.current, 
            (event) => {
                // console.log('Interaction:', event);
            },
            (updatedAgents) => {
                // Sync status changes from CanvasManager back to React
                setAgents(updatedAgents);
                // Add to forum messages when agents meet
                handleAgentMeeting(updatedAgents);
            }
        );
        
        manager.start();
        managerRef.current = manager;

        return () => manager.destroy();
    }, [setAgents]);

    // Sync Data
    useEffect(() => {
        if (managerRef.current) {
            managerRef.current.setAgents(agents);
        }
    }, [agents]);

    // Handle Resize - DISABLED (Fixed Size)
    // useEffect(() => {
    //     const handleResize = () => {
    //          if (containerRef.current && managerRef.current) {
    //              const { clientWidth, clientHeight } = containerRef.current;
    //              managerRef.current.resize(clientWidth, clientHeight);
    //          }
    //     };
    //     window.addEventListener('resize', handleResize);
    //     handleResize();
    //     return () => window.removeEventListener('resize', handleResize);
    // }, []);

    // Initial Setup with Fixed Size
    useEffect(() => {
        if (managerRef.current) {
             managerRef.current.resize(928, 640);
        }
    }, [managerRef.current]);

    // Pan & Zoom Handlers - DISABLED
    const handleMouseDown = (e: React.MouseEvent) => {
        // Just click detection, no dragging
        managerRef.current?.handleInteractionRaw(e.clientX, e.clientY, 'click');
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        // Just hover detection
        managerRef.current?.handleInteractionRaw(e.clientX, e.clientY, 'hover');
    };

    const handleMouseUp = () => {
        // No-op
    };

    return (
        <div className="w-full h-full flex bg-slate-900 overflow-hidden">
            {/* Forum Messages Panel - Left Side */}
            <ForumMessages topics={forumTopics} />
            
            {/* Canvas Area - Center */}
            <div className="flex-1 flex items-center justify-center">
                <div 
                    ref={containerRef} 
                    style={{ width: 928, height: 640 }}
                    className="relative shadow-2xl rounded-lg overflow-hidden border border-slate-700"
                >
                    <canvas 
                        ref={canvasRef} 
                        className="block outline-none cursor-default"
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    />
                </div>
            </div>
        </div>
    );
};
