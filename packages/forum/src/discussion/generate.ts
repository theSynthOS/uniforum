/**
 * Discussion Message Generation
 *
 * Generate context-aware discussion messages for agents.
 */

import type { Forum, ForumMessage } from '@uniforum/shared';

export interface AgentDiscussionContext {
  name: string;
  ensName: string;
  strategy: 'conservative' | 'moderate' | 'aggressive';
  riskTolerance: number;
  preferredPools: string[];
  expertiseContext?: string;
  rulesOfThumb?: string[];
  constraints?: Record<string, unknown>;
  objectiveWeights?: Record<string, number>;
  debate?: {
    enabled?: boolean;
    rounds?: number;
    delayMs?: number;
  };
}

export interface DiscussionContext {
  forum: Forum;
  recentMessages: ForumMessage[];
  currentProposal?: {
    action: string;
    params: Record<string, any>;
  };
  poolSnapshot?: Record<string, unknown> | null;
}

/**
 * Build a prompt for generating a discussion message
 */
export function buildDiscussionPrompt(
  agent: AgentDiscussionContext,
  context: DiscussionContext
): string {
  const recentMessagesText = context.recentMessages
    .slice(-5)
    .map((m) => `${m.agentEnsName}: ${m.content}`)
    .join('\n');

  return `
You are ${agent.name} (${agent.ensName}), an autonomous DeFi agent participating in a Uniforum discussion.

Your Profile:
- Strategy: ${agent.strategy}
- Risk Tolerance: ${(agent.riskTolerance * 100).toFixed(0)}%
- Preferred Pools: ${agent.preferredPools.join(', ')}
- Expertise: ${agent.expertiseContext || 'General DeFi knowledge'}
${agent.rulesOfThumb?.length ? `- Rules of Thumb: ${agent.rulesOfThumb.join(' | ')}` : ''}
${agent.constraints ? `- Constraints: ${JSON.stringify(agent.constraints)}` : ''}
${agent.objectiveWeights ? `- Objective Weights: ${JSON.stringify(agent.objectiveWeights)}` : ''}

Forum Context:
- Title: ${context.forum.title}
- Goal: ${context.forum.goal}
- Pool Focus: ${context.forum.pool || 'General'}
${context.poolSnapshot ? `- Pool Snapshot: ${JSON.stringify(context.poolSnapshot)}` : ''}

Recent Messages:
${recentMessagesText || '(No messages yet - you are starting the discussion)'}

${context.currentProposal ? `Current Proposal: ${JSON.stringify(context.currentProposal)}` : '(No proposal yet)'}

Instructions:
1. Provide your perspective on the discussion based on your expertise and strategy
2. Be concise (2-3 sentences maximum)
3. If suggesting a specific strategy, include concrete numbers
4. Reference other agents' points if relevant
5. Stay in character based on your ${agent.strategy} strategy

Your response:
`.trim();
}

/**
 * Build a prompt for a debate follow-up response (counterpoint / critique).
 */
export function buildDebatePrompt(
  agent: AgentDiscussionContext,
  context: DiscussionContext
): string {
  const recentMessagesText = context.recentMessages
    .slice(-5)
    .map((m) => `${m.agentEnsName}: ${m.content}`)
    .join('\n');

  return `
You are ${agent.name} (${agent.ensName}), providing a follow-up critique or alternative view.

Your Profile:
- Strategy: ${agent.strategy}
- Risk Tolerance: ${(agent.riskTolerance * 100).toFixed(0)}%
- Preferred Pools: ${agent.preferredPools.join(', ')}
${agent.rulesOfThumb?.length ? `- Rules of Thumb: ${agent.rulesOfThumb.join(' | ')}` : ''}
${agent.constraints ? `- Constraints: ${JSON.stringify(agent.constraints)}` : ''}

Forum Context:
- Title: ${context.forum.title}
- Goal: ${context.forum.goal}
- Pool Focus: ${context.forum.pool || 'General'}
${context.poolSnapshot ? `- Pool Snapshot: ${JSON.stringify(context.poolSnapshot)}` : ''}

Recent Messages:
${recentMessagesText || '(No messages yet)'}

Instructions:
1. Offer a critique, counterpoint, or refinement to prior points
2. Provide at least one concrete numeric or parameter suggestion
3. Keep it concise (2-3 sentences)

Your response:
`.trim();
}

/**
 * Determine if an agent should participate in a discussion
 */
export function shouldParticipate(
  agent: AgentDiscussionContext,
  forum: Forum,
  recentMessages: ForumMessage[]
): { should: boolean; reason: string } {
  // Always participate if no messages yet
  if (recentMessages.length === 0) {
    return { should: true, reason: 'Starting discussion' };
  }

  // Check if forum topic matches agent's expertise
  const forumPool = forum.pool?.toLowerCase() || '';
  const matchesPool = agent.preferredPools.some(
    (p) => p.toLowerCase().includes(forumPool) || forumPool.includes(p.toLowerCase())
  );

  if (matchesPool) {
    return { should: true, reason: `Forum matches preferred pool: ${forum.pool}` };
  }

  // Check if agent was mentioned in recent messages
  const wasMentioned = recentMessages.some(
    (m) => m.content.toLowerCase().includes(agent.ensName.toLowerCase())
  );

  if (wasMentioned) {
    return { should: true, reason: 'Agent was mentioned in discussion' };
  }

  // If the forum is pool-specific and this agent doesn't match, skip.
  if (forum.pool && !matchesPool) {
    return { should: false, reason: 'Forum pool mismatch' };
  }

  // Rate limit: don't respond too frequently
  const agentLastMessage = recentMessages.filter((m) => m.agentEnsName === agent.ensName).pop();

  if (agentLastMessage) {
    const timeSinceLastMessage = Date.now() - new Date(agentLastMessage.createdAt).getTime();
    const minInterval = 30 * 1000; // 30 seconds minimum between messages

    if (timeSinceLastMessage < minInterval) {
      return { should: false, reason: 'Too soon since last message' };
    }
  }

  // Randomly participate sometimes (20% chance) for general forums
  if (!forum.pool && Math.random() < 0.2) {
    return { should: true, reason: 'Random participation' };
  }

  return { should: false, reason: 'No relevant trigger' };
}

/**
 * Build a prompt for generating a proposal
 */
export function buildProposalPrompt(
  agent: AgentDiscussionContext,
  context: DiscussionContext
): string {
  return `
You are ${agent.name} (${agent.ensName}), proposing a specific action for the forum.

Forum Goal: ${context.forum.goal}
Pool Focus: ${context.forum.pool || 'General'}
Your Strategy: ${agent.strategy}
${agent.rulesOfThumb?.length ? `Rules of Thumb: ${agent.rulesOfThumb.join(' | ')}` : ''}
${agent.constraints ? `Constraints: ${JSON.stringify(agent.constraints)}` : ''}
${context.poolSnapshot ? `Pool Snapshot: ${JSON.stringify(context.poolSnapshot)}` : ''}

Based on the discussion, create a concrete proposal with:
1. Action type: swap, addLiquidity, removeLiquidity, or limitOrder
2. Specific parameters (tokens, amounts, etc.)
3. Optional: hooks to enable (antiSandwich, dynamicFee, etc.)

Format your response as JSON:
{
  "action": "swap",
  "params": {
    "tokenIn": "ETH",
    "tokenOut": "USDC",
    "amount": "0.5",
    "slippage": 0.005
  },
  "hooks": {
    "antiSandwich": { "enabled": true }
  },
  "description": "Brief explanation of why this proposal"
}
`.trim();
}
