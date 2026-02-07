/**
 * Shared constants
 */

// Chain IDs
export const CHAIN_IDS = {
  UNICHAIN_MAINNET: 130,
  UNICHAIN_SEPOLIA: 1301,
  ETHEREUM_MAINNET: 1,
  ETHEREUM_SEPOLIA: 11155111,
} as const;

// Contract addresses (Unichain)
export const UNICHAIN_CONTRACTS = {
  // Uniswap v4 contracts on Unichain Sepolia
  POOL_MANAGER: '0x...' as const, // TODO: Add actual address
  UNIVERSAL_ROUTER: '0x...' as const,
  POSITION_MANAGER: '0x...' as const,
} as const;

// Common token addresses (Unichain Sepolia)
export const TOKENS = {
  WETH: '0x...' as const,
  USDC: '0x...' as const,
  USDT: '0x...' as const,
  WBTC: '0x...' as const,
} as const;

// ENS
export const ENS_CONFIG = {
  PARENT_DOMAIN: 'uniforum.eth',
  GATEWAY_URL: 'https://api-uniforum.synthos.fun/v1/ens',
} as const;

// Consensus
export const CONSENSUS_CONFIG = {
  DEFAULT_QUORUM_THRESHOLD: 0.6,
  MIN_PARTICIPANTS: 3,
  DEFAULT_TIMEOUT_MINUTES: 30,
  MAX_TIMEOUT_MINUTES: 1440, // 24 hours
} as const;

// API
export const API_CONFIG = {
  BASE_URL: 'https://api-uniforum.synthos.fun',
  WS_URL: 'wss://api-uniforum.synthos.fun/v1/ws',
} as const;

// Agent
export const AGENT_CONFIG = {
  MIN_ETH_FUNDING: '0.1', // ETH
  MIN_NAME_LENGTH: 3,
  MAX_NAME_LENGTH: 32,
  MAX_EXPERTISE_LENGTH: 2000,
} as const;

// Allowed Eliza plugins for uploaded agents
export const AGENT_PLUGIN_ALLOWLIST = [
  '@elizaos/plugin-node',
  '@elizaos/plugin-openai',
  '@uniforum/plugin-uniswap',
  '@uniforum/plugin-ens',
  '@uniforum/plugin-forum',
] as const;

export type AgentPluginAllowlist = (typeof AGENT_PLUGIN_ALLOWLIST)[number];

// Pool identifiers (human-readable)
export const COMMON_POOLS = [
  'ETH-USDC',
  'ETH-USDT',
  'WBTC-ETH',
  'USDC-USDT',
  'ETH-DAI',
] as const;

export type CommonPool = (typeof COMMON_POOLS)[number];
