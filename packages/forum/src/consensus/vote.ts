/**
 * Vote Evaluation
 *
 * Logic for agents to evaluate proposals and decide how to vote.
 */

import type { Proposal, VoteType } from '@uniforum/shared';

export interface AgentVoteContext {
  strategy: 'conservative' | 'moderate' | 'aggressive';
  riskTolerance: number;
  preferredPools: string[];
  expertiseContext?: string;
}

export interface VoteEvaluationResult {
  vote: VoteType;
  confidence: number; // 0-1
  reasoning: string;
}

/**
 * Calculate the risk score of a proposal (0-1, higher = riskier)
 */
export function calculateProposalRisk(proposal: Proposal): number {
  let riskScore = 0.5; // Base risk

  // Larger amounts = higher risk
  const params = proposal.params as any;
  if (params.amount) {
    const amount = parseFloat(params.amount);
    if (amount > 1) riskScore += 0.1;
    if (amount > 10) riskScore += 0.2;
  }

  // Certain actions are riskier
  switch (proposal.action) {
    case 'swap':
      riskScore += 0; // Base risk
      break;
    case 'addLiquidity':
      riskScore += 0.1; // IL risk
      break;
    case 'removeLiquidity':
      riskScore -= 0.1; // Lower risk
      break;
    case 'limitOrder':
      riskScore += 0.15; // Execution uncertainty
      break;
  }

  // Hooks can modify risk
  if (proposal.hooks?.antiSandwich?.enabled) {
    riskScore -= 0.1; // MEV protection reduces risk
  }

  return Math.max(0, Math.min(1, riskScore));
}

/**
 * Rule-based vote evaluation (used before LLM decision)
 */
export function evaluateProposalRules(
  proposal: Proposal,
  agentContext: AgentVoteContext
): VoteEvaluationResult | null {
  const riskScore = calculateProposalRisk(proposal);

  // Conservative agents reject high-risk proposals
  if (agentContext.strategy === 'conservative' && riskScore > 0.6) {
    return {
      vote: 'disagree',
      confidence: 0.8,
      reasoning: `Risk score (${(riskScore * 100).toFixed(0)}%) exceeds conservative threshold`,
    };
  }

  // Aggressive agents are more likely to agree
  if (agentContext.strategy === 'aggressive' && riskScore < 0.7) {
    return {
      vote: 'agree',
      confidence: 0.7,
      reasoning: `Risk score (${(riskScore * 100).toFixed(0)}%) is within aggressive tolerance`,
    };
  }

  // Check if proposal involves preferred pools
  const params = proposal.params as any;
  const poolId = params.pool || `${params.tokenIn}-${params.tokenOut}`;

  if (agentContext.preferredPools.some((p) => poolId.includes(p) || p.includes(poolId))) {
    return {
      vote: 'agree',
      confidence: 0.6,
      reasoning: `Proposal involves preferred pool: ${poolId}`,
    };
  }

  // No clear rule-based decision
  return null;
}

/**
 * Build prompt for LLM-based vote evaluation
 */
export function buildVoteEvaluationPrompt(
  proposal: Proposal,
  agentContext: AgentVoteContext
): string {
  return `
You are evaluating a DeFi proposal as an autonomous agent.

Your Profile:
- Strategy: ${agentContext.strategy}
- Risk Tolerance: ${(agentContext.riskTolerance * 100).toFixed(0)}%
- Preferred Pools: ${agentContext.preferredPools.join(', ')}
- Expertise: ${agentContext.expertiseContext || 'General DeFi knowledge'}

Proposal Details:
- Action: ${proposal.action}
- Parameters: ${JSON.stringify(proposal.params, null, 2)}
- Hooks: ${JSON.stringify(proposal.hooks || {}, null, 2)}
- Description: ${proposal.description || 'No description provided'}

Risk Assessment:
- Calculated Risk Score: ${(calculateProposalRisk(proposal) * 100).toFixed(0)}%

Based on your profile and the proposal details, should you vote "agree" or "disagree"?

Respond with ONLY "agree" or "disagree" followed by a brief reason (max 50 words).
Example: "agree - The swap uses anti-sandwich protection and targets my preferred ETH-USDC pool."
`.trim();
}
