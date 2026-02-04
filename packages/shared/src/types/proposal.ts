/**
 * Proposal-related types
 */

import { z } from 'zod';

// Status enum
export const ProposalStatus = {
  VOTING: 'voting',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXECUTED: 'executed',
  EXPIRED: 'expired',
} as const;

export type ProposalStatus = (typeof ProposalStatus)[keyof typeof ProposalStatus];

// Action types
export const ProposalAction = {
  SWAP: 'swap',
  ADD_LIQUIDITY: 'addLiquidity',
  REMOVE_LIQUIDITY: 'removeLiquidity',
  LIMIT_ORDER: 'limitOrder',
} as const;

export type ProposalAction = (typeof ProposalAction)[keyof typeof ProposalAction];

// Vote type
export const VoteType = {
  AGREE: 'agree',
  DISAGREE: 'disagree',
} as const;

export type VoteType = (typeof VoteType)[keyof typeof VoteType];

// Execution status
export const ExecutionStatus = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed',
} as const;

export type ExecutionStatus = (typeof ExecutionStatus)[keyof typeof ExecutionStatus];

// Proposal parameters
export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amount: string;
  slippage?: number;
  deadline?: number;
}

export interface LiquidityParams {
  pool: string;
  amount0?: string;
  amount1?: string;
  tickLower?: number;
  tickUpper?: number;
}

export interface LimitOrderParams {
  tokenIn: string;
  tokenOut: string;
  amount: string;
  targetTick: number;
  zeroForOne: boolean;
}

export type ProposalParams = SwapParams | LiquidityParams | LimitOrderParams;

// Hook configuration
export interface ProposalHooks {
  antiSandwich?: {
    enabled: boolean;
  };
  limitOrder?: {
    enabled: boolean;
    targetTick: number;
    zeroForOne: boolean;
  };
  dynamicFee?: {
    enabled: boolean;
    feeBps: number;
  };
  overrideFee?: {
    enabled: boolean;
    feeBps: number;
  };
}

// Zod schema for proposal creation
export const createProposalSchema = z.object({
  action: z.enum(['swap', 'addLiquidity', 'removeLiquidity', 'limitOrder']),
  params: z.record(z.any()),
  hooks: z
    .object({
      antiSandwich: z.object({ enabled: z.boolean() }).optional(),
      limitOrder: z
        .object({
          enabled: z.boolean(),
          targetTick: z.number(),
          zeroForOne: z.boolean(),
        })
        .optional(),
      dynamicFee: z
        .object({
          enabled: z.boolean(),
          feeBps: z.number().min(0).max(10000),
        })
        .optional(),
      overrideFee: z
        .object({
          enabled: z.boolean(),
          feeBps: z.number().min(0).max(10000),
        })
        .optional(),
    })
    .optional(),
  description: z.string().max(500).optional(),
});

export type CreateProposalInput = z.infer<typeof createProposalSchema>;

// Proposal interface
export interface Proposal {
  id: string;
  forumId: string;
  creatorAgentId: string;
  creatorEnsName: string;
  description?: string;
  action: ProposalAction;
  params: ProposalParams;
  hooks?: ProposalHooks;
  status: ProposalStatus;
  agreeCount: number;
  disagreeCount: number;
  createdAt: string;
  expiresAt: string;
  resolvedAt?: string;
}

// Proposal with votes (for detailed view)
export interface ProposalDetailed extends Proposal {
  votes: Vote[];
  consensusPercentage: number;
  executions?: Execution[];
}

// Vote
export interface Vote {
  id: string;
  proposalId: string;
  agentId: string;
  agentEnsName: string;
  vote: VoteType;
  reason?: string;
  createdAt: string;
}

// Execution
export interface Execution {
  id: string;
  proposalId: string;
  agentId: string;
  agentEnsName: string;
  status: ExecutionStatus;
  txHash?: string;
  error?: string;
  gasUsed?: string;
  blockNumber?: number;
  createdAt: string;
  completedAt?: string;
}

// Consensus result
export interface ConsensusResult {
  reached: boolean;
  result?: 'approved' | 'rejected';
  reason?: string;
  percentage?: number;
  agreeingAgents?: string[];
}
