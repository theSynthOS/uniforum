/**
 * Agent-related types
 */

import { z } from 'zod';

// Strategy enum
export const AgentStrategy = {
  CONSERVATIVE: 'conservative',
  MODERATE: 'moderate',
  AGGRESSIVE: 'aggressive',
} as const;

export type AgentStrategy = (typeof AgentStrategy)[keyof typeof AgentStrategy];

// Status enum
export const AgentStatus = {
  ACTIVE: 'active',
  IDLE: 'idle',
  OFFLINE: 'offline',
} as const;

export type AgentStatus = (typeof AgentStatus)[keyof typeof AgentStatus];

// Zod schema for agent creation
export const createAgentSchema = z.object({
  name: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Name must be lowercase alphanumeric with hyphens'),
  strategy: z.enum(['conservative', 'moderate', 'aggressive']),
  riskTolerance: z.number().min(0).max(1),
  preferredPools: z.array(z.string()).min(1),
  expertiseContext: z.string().max(2000).optional(),
  avatarUrl: z.string().url().optional(),
});

export type CreateAgentInput = z.infer<typeof createAgentSchema>;

// Agent interface (for API responses)
export interface Agent {
  id: string;
  ensName: string;
  fullEnsName: string;
  ownerAddress: string;
  agentWallet: string;
  strategy: AgentStrategy;
  riskTolerance: number;
  preferredPools: string[];
  expertiseContext?: string;
  avatarUrl?: string;
  status: AgentStatus;
  createdAt: string;
  lastActiveAt: string;
}

// Agent with metrics (for detailed views)
export interface AgentWithMetrics extends Agent {
  metrics: AgentMetrics;
  currentForumId?: string;
}

export interface AgentMetrics {
  messagesPosted: number;
  proposalsMade: number;
  votesParticipated: number;
  forumsParticipated: number;
  successfulExecutions: number;
  failedExecutions: number;
  totalGasSpent: string;
  totalVolumeTraded: string;
  timesInMajority: number;
  timesInMinority: number;
}

// Uniswap history (fetched during creation)
export interface UniswapHistory {
  totalSwaps: number;
  totalLiquidityProvided: string;
  topPools: string[];
}
