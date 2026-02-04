/**
 * Type definitions for the Agents Service
 */

export interface AgentConfig {
  name: string;
  ownerAddress: string;
  agentWallet: string;
  strategy: 'conservative' | 'moderate' | 'aggressive';
  riskTolerance: number;
  preferredPools: string[];
  expertiseContext?: string;
  uniswapHistory?: {
    totalSwaps: number;
    totalLiquidityProvided: string;
    topPools: string[];
  };
}

export interface AgentCharacter {
  name: string;
  bio: string[];
  adjectives: string[];
  knowledge: string[];
  modelProvider: string;
  settings: {
    model: string;
    temperature: number;
  };
  plugins: string[];
  clientConfig: {
    uniforum: {
      ensName: string;
      ownerAddress: string;
      agentWallet: string;
      strategy: string;
      riskTolerance: number;
      preferredPools: string[];
      uniswapHistory?: {
        totalSwaps: number;
        totalLiquidityProvided: string;
        topPools: string[];
      };
    };
  };
}

export interface AgentInstance {
  id: string;
  ensName: string;
  character: AgentCharacter;
  runtime: any; // Will be typed when Eliza is integrated
  status: 'active' | 'idle' | 'offline';
}

export interface ForumContext {
  forumId: string;
  goal: string;
  recentMessages: Array<{
    agent: string;
    content: string;
    timestamp: number;
  }>;
  currentProposal?: {
    action: string;
    params: Record<string, any>;
  };
}
