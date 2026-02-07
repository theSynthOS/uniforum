/**
 * Agent Character Template
 *
 * Creates Eliza character configurations from agent database records.
 * Each agent's personality is shaped by their strategy, risk tolerance,
 * and LP expertise.
 */

import type { AgentConfig, AgentCharacter } from '../types';

export function createAgentCharacter(config: AgentConfig): AgentCharacter {
  const riskPercent = Math.round(config.riskTolerance * 100);
  const poolSummary =
    config.preferredPools.length > 0 ? config.preferredPools.join(', ') : 'general DeFi pools';
  const expertiseText = config.expertiseContext?.trim();
  const strategyTone = getStrategyTone(config.strategy);
  const plugins = buildDefaultPlugins(config.characterPlugins);
  const heuristics = extractAgentHeuristics(config);
  const baseTemperature = config.strategy === 'aggressive' ? 0.8 : 0.4;
  const temperature =
    baseTemperature +
    deriveTemperatureDelta(config.name) +
    (heuristics.temperatureDelta ?? 0);

  return {
    name: config.name,

    // Core identity - shapes how the agent introduces itself
    bio: [
      `I am ${config.name}, an autonomous DeFi agent on Uniforum.`,
      `My creator is an experienced Uniswap LP with expertise in ${poolSummary}.`,
      `I follow a ${config.strategy} trading strategy with ${riskPercent}% risk tolerance.`,
      expertiseText || '',
    ].filter(Boolean),

    // Personality traits affect discussion style
    adjectives: getAdjectives(config.strategy),

    topics: [
      'liquidity provision',
      'impermanent loss',
      'uniswap v4 hooks',
      ...config.preferredPools,
    ],

    // System behavior controls tone and caution level
    system: [
      `You are ${config.name}, an autonomous Uniforum DeFi agent.`,
      `Operate as a ${config.strategy} LP with ${riskPercent}% risk tolerance.`,
      `Your pool focus is ${poolSummary}.`,
      expertiseText ? `Your expertise: ${expertiseText}` : '',
      `Speak in a ${strategyTone} tone. Avoid generic advice.`,
      `When discussing trades or proposals, be concrete with numbers and parameters.`,
      `Do not claim to execute trades; propose or vote based on the forum context.`,
    ]
      .filter(Boolean)
      .join(' '),

    // Conversation style
    style: {
      all: [
        `Stay concise (2-3 sentences) unless asked for details.`,
        `Be specific and quantify risk when possible.`,
        `Reference preferred pools when relevant.`,
      ],
      chat: [
        `Ground opinions in LP experience and risk settings.`,
        `Acknowledge uncertainty rather than overconfident claims.`,
      ],
      post: [`Write as a distinct LP persona, not a generic assistant.`],
    },

    // Knowledge base
    knowledge: [
      'Uniswap v4 pool mechanics',
      'Liquidity provision strategies',
      'Impermanent loss mitigation',
      'MEV protection',
      'Hook configurations',
      'Dynamic fee optimization',
      ...(expertiseText ? [expertiseText] : []),
      ...config.preferredPools.map((pool) => `Pool focus: ${pool}`),
    ],

    // Model configuration
    settings: {
      model: 'gpt-4-turbo',
      temperature: clamp(temperature, 0.1, 1.2),
      maxTokens: 512,
      secrets: {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      },
    },

    // Plugins to load
    plugins,

    // Custom data accessible throughout the agent
    clientConfig: {
      uniforum: {
        ensName: `${config.name.toLowerCase()}.uniforum.eth`,
        ownerAddress: config.ownerAddress,
        agentWallet: config.agentWallet,
        strategy: config.strategy,
        riskTolerance: config.riskTolerance,
        preferredPools: config.preferredPools,
        expertiseContext: expertiseText,
        uniswapHistory: config.uniswapHistory,
        rulesOfThumb: heuristics.rulesOfThumb,
        constraints: heuristics.constraints,
        objectiveWeights: heuristics.objectiveWeights,
        debate: heuristics.debate,
        temperatureDelta: heuristics.temperatureDelta,
      },
    },

    // Secrets are provided at runtime via environment variables
    secrets: {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    },
  };
}

export function mergeUploadedCharacter(
  base: AgentCharacter,
  uploaded: Partial<AgentCharacter>,
  pluginOverride?: string[]
): AgentCharacter {
  const merged: AgentCharacter = {
    ...base,
    bio: uploaded.bio ?? base.bio,
    adjectives: uploaded.adjectives ?? base.adjectives,
    topics: uploaded.topics ?? base.topics,
    knowledge: normalizeKnowledge(uploaded.knowledge) ?? base.knowledge,
    system: uploaded.system ?? base.system,
    templates: uploaded.templates ?? base.templates,
    messageExamples: uploaded.messageExamples ?? base.messageExamples,
    postExamples: uploaded.postExamples ?? base.postExamples,
    style: uploaded.style ?? base.style,
    settings: mergeSettings(base.settings, uploaded.settings),
    plugins: buildDefaultPlugins(pluginOverride),
    clientConfig: base.clientConfig,
    secrets: base.secrets,
    name: base.name,
  };

  return merged;
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

function getStrategyTone(strategy: string): string {
  switch (strategy) {
    case 'conservative':
      return 'careful and risk-aware';
    case 'moderate':
      return 'balanced and pragmatic';
    case 'aggressive':
      return 'bold and opportunistic';
    default:
      return 'thoughtful and strategic';
  }
}

function buildDefaultPlugins(plugins?: string[]): string[] {
  const set = new Set<string>(plugins ?? []);
  set.add('@elizaos/plugin-node');
  if (process.env.OPENAI_API_KEY) {
    set.add('@elizaos/plugin-openai');
  }
  return Array.from(set);
}

function extractAgentHeuristics(config: AgentConfig) {
  const fromUpload = config.characterConfig || {};
  const rulesOfThumb =
    Array.isArray((fromUpload as any).rulesOfThumb) && (fromUpload as any).rulesOfThumb.length > 0
      ? (fromUpload as any).rulesOfThumb.filter((item: unknown) => typeof item === 'string')
      : getDefaultRulesOfThumb(config.strategy, config.preferredPools);

  const constraints =
    (fromUpload as any).constraints && typeof (fromUpload as any).constraints === 'object'
      ? (fromUpload as any).constraints
      : getDefaultConstraints(config.strategy, config.riskTolerance);

  const objectiveWeights =
    (fromUpload as any).objectiveWeights && typeof (fromUpload as any).objectiveWeights === 'object'
      ? (fromUpload as any).objectiveWeights
      : getDefaultObjectiveWeights(config.strategy);

  const debate =
    (fromUpload as any).debate && typeof (fromUpload as any).debate === 'object'
      ? (fromUpload as any).debate
      : { enabled: true, rounds: 2, delayMs: 1200 };

  const temperatureDelta =
    typeof (fromUpload as any).temperatureDelta === 'number'
      ? (fromUpload as any).temperatureDelta
      : undefined;

  return {
    rulesOfThumb,
    constraints,
    objectiveWeights,
    debate,
    temperatureDelta,
  };
}

function getDefaultRulesOfThumb(strategy: string, pools: string[]) {
  const poolFocus = pools.length > 0 ? pools.join(', ') : 'general pools';
  switch (strategy) {
    case 'conservative':
      return [
        `Avoid swaps with slippage > 0.5% unless liquidity is deep`,
        `Prefer tighter ranges on ${poolFocus} with low volatility`,
        `Require MEV protection hooks for volatile pairs`,
      ];
    case 'aggressive':
      return [
        `Accept higher slippage (up to 1.5%) when volatility spikes`,
        `Favor dynamic fees on ${poolFocus} to capture volatility`,
        `Use limit orders around key ticks for momentum trades`,
      ];
    default:
      return [
        `Balance fee capture and IL risk on ${poolFocus}`,
        `Prefer swaps with slippage under 1% unless opportunity is exceptional`,
        `Adjust ranges when price drifts beyond 1 std dev`,
      ];
  }
}

function getDefaultConstraints(strategy: string, riskTolerance: number) {
  const maxRiskScore = strategy === 'conservative' ? 0.55 : strategy === 'aggressive' ? 0.75 : 0.65;
  return {
    maxRiskScore,
    maxSlippageBps: Math.round(riskTolerance * 200), // 0-200 bps
    requirePoolMatch: strategy === 'conservative',
  };
}

function getDefaultObjectiveWeights(strategy: string) {
  switch (strategy) {
    case 'conservative':
      return { capitalPreservation: 0.5, feeIncome: 0.35, growth: 0.15 };
    case 'aggressive':
      return { capitalPreservation: 0.2, feeIncome: 0.3, growth: 0.5 };
    default:
      return { capitalPreservation: 0.35, feeIncome: 0.4, growth: 0.25 };
  }
}

function deriveTemperatureDelta(seed: string, maxDelta: number = 0.1): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 33) ^ seed.charCodeAt(i);
  }
  const normalized = (hash >>> 0) / 0xffffffff;
  return (normalized * 2 - 1) * maxDelta;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
function normalizeKnowledge(
  knowledge?: AgentCharacter['knowledge']
): AgentCharacter['knowledge'] | undefined {
  if (!knowledge) return undefined;
  if (!Array.isArray(knowledge)) return undefined;
  const filtered = knowledge.filter((item) => typeof item === 'string');
  return filtered.length > 0 ? filtered : undefined;
}

function mergeSettings(
  base?: AgentCharacter['settings'],
  uploaded?: AgentCharacter['settings']
): AgentCharacter['settings'] | undefined {
  if (!uploaded) return base;
  const merged = { ...(base || {}), ...(uploaded || {}) };
  if (merged?.secrets) {
    delete (merged as any).secrets;
  }
  return merged;
}
