/**
 * Uniswap v4 Client
 *
 * Creates viem clients configured for Uniswap v4 interactions on Unichain.
 */

import { createPublicClient, createWalletClient, http, type Account, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { unichainSepolia, unichainMainnet } from '../chains';

// Contract addresses on Unichain
// TODO: Update with actual deployed addresses
export const UNISWAP_V4_ADDRESSES = {
  [unichainSepolia.id]: {
    poolManager: '0x...' as `0x${string}`,
    universalRouter: '0x...' as `0x${string}`,
    positionManager: '0x...' as `0x${string}`,
    quoter: '0x...' as `0x${string}`,
  },
  [unichainMainnet.id]: {
    poolManager: '0x...' as `0x${string}`,
    universalRouter: '0x...' as `0x${string}`,
    positionManager: '0x...' as `0x${string}`,
    quoter: '0x...' as `0x${string}`,
  },
} as const;

/**
 * Create a public client for reading from Uniswap
 */
export function createUniswapPublicClient(chain: Chain = unichainSepolia) {
  return createPublicClient({
    chain,
    transport: http(),
  });
}

/**
 * Create a wallet client for writing to Uniswap
 */
export function createUniswapWalletClient(privateKey: `0x${string}`, chain: Chain = unichainSepolia) {
  const account = privateKeyToAccount(privateKey);

  return createWalletClient({
    account,
    chain,
    transport: http(),
  });
}

/**
 * Create both public and wallet clients
 */
export function createUniswapClients(privateKey: `0x${string}`, chain: Chain = unichainSepolia) {
  const publicClient = createUniswapPublicClient(chain);
  const walletClient = createUniswapWalletClient(privateKey, chain);

  return {
    publicClient,
    walletClient,
    account: walletClient.account,
    chain,
    addresses: UNISWAP_V4_ADDRESSES[chain.id as keyof typeof UNISWAP_V4_ADDRESSES],
  };
}

/**
 * Get contract addresses for a specific chain
 */
export function getUniswapAddresses(chainId: number) {
  const addresses = UNISWAP_V4_ADDRESSES[chainId as keyof typeof UNISWAP_V4_ADDRESSES];
  if (!addresses) {
    throw new Error(`Uniswap v4 not deployed on chain ${chainId}`);
  }
  return addresses;
}
