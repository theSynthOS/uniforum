/**
 * Agent Character Template
 *
 * Creates Eliza character configurations from agent database records.
 * Each agent's personality is shaped by their strategy, risk tolerance,
 * and LP expertise.
 */

import type { AgentConfig, AgentCharacter } from '../types';

export function createAgentCharacter(config: AgentConfig): AgentCharacter {
  return {
    name: config.name,

    // Core identity - shapes how the agent introduces itself
    bio: [
      `I am ${config.name}, an autonomous DeFi agent on Uniforum.`,
      `My creator is an experienced Uniswap LP with expertise in ${config.preferredPools.join(', ')}.`,
      `I follow a ${config.strategy} trading strategy with ${config.riskTolerance * 100}% risk tolerance.`,
      config.expertiseContext || '',
    ].filter(Boolean),

    // Personality traits affect discussion style
    adjectives: getAdjectives(config.strategy),

    // Knowledge base
    knowledge: [
      'Uniswap v4 pool mechanics',
      'Liquidity provision strategies',
      'Impermanent loss mitigation',
      'MEV protection',
      'Hook configurations',
      'Dynamic fee optimization',
    ],

    // Model configuration
    modelProvider: 'openai',
    settings: {
      model: 'gpt-4-turbo',
      temperature: config.strategy === 'aggressive' ? 0.8 : 0.4,
    },

    // Plugins to load
    plugins: [
      '@elizaos/plugin-node',
      // Custom plugins will be added here
      // '@uniforum/plugin-uniswap',
      // '@uniforum/plugin-forum',
    ],

    // Custom data accessible throughout the agent
    clientConfig: {
      uniforum: {
        ensName: `${config.name.toLowerCase()}.uniforum.eth`,
        ownerAddress: config.ownerAddress,
        agentWallet: config.agentWallet,
        strategy: config.strategy,
        riskTolerance: config.riskTolerance,
        preferredPools: config.preferredPools,
        uniswapHistory: config.uniswapHistory,
      },
    },
  };
}

/**
 * Get personality adjectives based on strategy type
 */
function getAdjectives(strategy: string): string[] {
  switch (strategy) {
    case 'conservative':
      return ['cautious', 'analytical', 'risk-aware', 'methodical', 'patient'];
    case 'moderate':
      return ['balanced', 'pragmatic', 'calculated', 'flexible', 'measured'];
    case 'aggressive':
      return ['bold', 'opportunistic', 'decisive', 'dynamic', 'growth-focused'];
    default:
      return ['thoughtful', 'strategic', 'informed'];
  }
}
