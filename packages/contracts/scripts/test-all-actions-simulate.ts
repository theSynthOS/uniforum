/**
 * Simulate all four actions (swap, addLiquidity, removeLiquidity, limitOrder) with hooks.
 *
 * Use this to verify encoding and that the Universal Router accepts the calldata shape.
 * With placeholder addresses (0x0) simulation may revert; use real pool/position data for live tests.
 *
 * Usage:
 *   pnpm --filter @uniforum/contracts run test:execution-all-actions
 *   UNICHAIN_SEPOLIA_RPC_URL=https://... pnpm --filter @uniforum/contracts run test:execution-all-actions
 *
 * What to prepare beforehand (see PREP checklist below):
 *   - RPC URL for chain (default Unichain Sepolia)
 *   - For swap/limitOrder: real currency0, currency1, fee, tickSpacing, amountOutMinimum (e.g. from quoter)
 *   - For addLiquidity: real pool key + amount0, amount1, tickLower, tickUpper
 *   - For removeLiquidity: real tokenId of an existing position, liquidityAmount, currency0, currency1
 *   - For limitOrder: same as swap + targetTick, zeroForOne, and pool with LimitOrderHook (hooksAddress)
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createPublicClient, decodeFunctionData, http, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { unichainSepolia } from '../src/chains';
import type { ExecutionPayload } from '@uniforum/shared';
import { buildCalldataForPayload, UNIVERSAL_ROUTER_ABI } from './build-execution-calldata';

// Load root .env.local so TEST_EXECUTOR_PRIVATE_KEY etc. are available when run via pnpm from repo root
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env.local') });

const RPC_URL = process.env.UNICHAIN_SEPOLIA_RPC_URL ?? 'https://sepolia.unichain.org';

/** Unichain Sepolia (1301) token addresses — from docs.unichain.org contract-addresses */
const UNICHAIN_SEPOLIA_ETH = '0x0000000000000000000000000000000000000000';
const UNICHAIN_SEPOLIA_USDC = '0x31d0220469e10c4E71834a79b1f276d740d3768F';

/** Known revert selectors (Universal Router / execution layer) for clearer error messages */
const KNOWN_ERROR_SELECTORS: Record<string, string> = {
  '0x2c4029e9':
    'ExecutionFailed(uint256,bytes) — inner command failed (e.g. invalid pool/currencies)',
  '0x5d1d0f9f':
    'Custom error 0x5d1d0f9f — often from Position Manager (e.g. invalid tokenId or position)',
  '0x486aa307':
    'PoolNotInitialized() — no pool exists for this currency0/currency1/fee/tickSpacing (or placeholder 0x0). Use real pool addresses.',
};

/** Enriched execution payloads for simulation (params include v4 pool key, etc.) */
const SAMPLE_PAYLOADS = {
  swap: {
    proposalId: '00000000-0000-0000-0000-000000000001',
    forumId: '00000000-0000-0000-0000-000000000002',
    executorEnsName: 'creator.uniforum.eth',
    action: 'swap',
    params: {
      tokenIn: 'ETH',
      tokenOut: 'USDC',
      amount: '100000000000000000',
      slippage: 50,
      deadline: Math.floor(Date.now() / 1000) + 1800,
      currency0: UNICHAIN_SEPOLIA_ETH,
      currency1: UNICHAIN_SEPOLIA_USDC,
      fee: 500,
      tickSpacing: 10,
      amountOutMinimum: '0',
      zeroForOne: true,
    },
    chainId: 1301,
    forumGoal: 'Swap 0.1 ETH for USDC',
  },
  addLiquidity: {
    proposalId: '00000000-0000-0000-0000-000000000003',
    forumId: '00000000-0000-0000-0000-000000000004',
    executorEnsName: 'creator.uniforum.eth',
    action: 'addLiquidity',
    params: {
      pool: 'ETH-USDC',
      amount0: '100000000000000000',
      amount1: '200000000',
      tickLower: -887220,
      tickUpper: 887220,
      currency0: UNICHAIN_SEPOLIA_ETH,
      currency1: UNICHAIN_SEPOLIA_USDC,
      fee: 500,
      tickSpacing: 10,
      liquidity: '0',
      recipient: '0x0000000000000000000000000000000000000001',
    },
    hooks: { dynamicFee: { enabled: false, feeBps: 0 } },
    chainId: 1301,
  },
  removeLiquidity: {
    proposalId: '00000000-0000-0000-0000-000000000005',
    forumId: '00000000-0000-0000-0000-000000000006',
    executorEnsName: 'creator.uniforum.eth',
    action: 'removeLiquidity',
    params: {
      tokenId: '1',
      liquidityAmount: '1000000',
      currency0: UNICHAIN_SEPOLIA_ETH,
      currency1: UNICHAIN_SEPOLIA_USDC,
      recipient: '0x0000000000000000000000000000000000000001',
      amount0Min: '0',
      amount1Min: '0',
    },
    chainId: 1301,
  },
  limitOrder: {
    proposalId: '00000000-0000-0000-0000-000000000007',
    forumId: '00000000-0000-0000-0000-000000000008',
    executorEnsName: 'creator.uniforum.eth',
    action: 'limitOrder',
    params: {
      tokenIn: 'ETH',
      tokenOut: 'USDC',
      amount: '100000000000000000',
      targetTick: -100,
      zeroForOne: true,
      currency0: UNICHAIN_SEPOLIA_ETH,
      currency1: UNICHAIN_SEPOLIA_USDC,
      fee: 500,
      tickSpacing: 10,
      amountOutMinimum: '0',
      deadline: Math.floor(Date.now() / 1000) + 1800,
    },
    hooks: { limitOrder: { enabled: true, targetTick: -100, zeroForOne: true } },
    chainId: 1301,
  },
} as Record<string, ExecutionPayload>;

const PREP = `
=== What to prepare before simulating / executing ===

1) Environment
   - UNICHAIN_SEPOLIA_RPC_URL (or default https://sepolia.unichain.org)
   - For sending: TEST_EXECUTOR_PRIVATE_KEY (optional; simulation uses a dummy account if unset)

2) Swap
   - params: currency0, currency1, fee, tickSpacing (real pool on chain)
   - params: amount (wei/smallest unit), amountOutMinimum (e.g. from quoter with slippage)
   - params: zeroForOne
   - Optional: hooksAddress if pool uses a swap hook; hookData if hook requires it

3) Add liquidity
   - params: currency0, currency1, fee, tickSpacing (real pool)
   - params: amount0, amount1 (max amounts), tickLower, tickUpper
   - params: recipient
   - Optional: liquidity (or 0 to use amounts), hooksAddress, hookData via hooks.dynamicFee.hookData

4) Remove liquidity
   - params: tokenId (existing position NFT ID), liquidityAmount (amount to burn)
   - params: currency0, currency1, recipient
   - Optional: amount0Min, amount1Min (slippage)

5) Limit order
   - Same as swap plus: params.targetTick, params.zeroForOne (or hooks.limitOrder)
   - Pool must use LimitOrderHook: set params.hooksAddress to the hook contract
   - hookData is built from (targetTick, zeroForOne) automatically
`;

async function main() {
  console.log(
    '=== Simulate all four actions (swap, addLiquidity, removeLiquidity, limitOrder) ===\n'
  );
  console.log(PREP);

  const transport = http(RPC_URL);
  const publicClient = createPublicClient({ chain: unichainSepolia, transport });
  const privateKey = process.env.TEST_EXECUTOR_PRIVATE_KEY as `0x${string}` | undefined;
  const account = privateKey
    ? privateKeyToAccount(privateKey)
    : privateKeyToAccount(
        '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`
      );
  const isDummyAccount = !privateKey;
  if (privateKey) {
    console.log('Using executor account from TEST_EXECUTOR_PRIVATE_KEY for simulation.\n');
  } else {
    console.log(
      'Using dummy account (no TEST_EXECUTOR_PRIVATE_KEY). Swap/limitOrder simulated with value=0, so they may revert with "insufficient ETH" (0x486aa307) until you set TEST_EXECUTOR_PRIVATE_KEY.\n'
    );
  }

  for (const [name, payload] of Object.entries(SAMPLE_PAYLOADS)) {
    console.log(`--- ${name} ---`);
    const { data, to, action, value } = buildCalldataForPayload(payload);
    console.log(
      '  to:',
      to,
      '  data bytes:',
      (data.length - 2) / 2,
      value != null ? `  value: ${value}` : ''
    );

    const decoded = decodeFunctionData({ abi: UNIVERSAL_ROUTER_ABI, data });
    if (decoded.functionName !== 'execute') {
      console.log('  SKIP: not execute()');
      continue;
    }
    const args = decoded.args as [`0x${string}`, `0x${string}`[], bigint];

    const simValue = isDummyAccount ? 0n : (value ?? 0n);
    try {
      await publicClient.simulateContract({
        address: to as Address,
        abi: UNIVERSAL_ROUTER_ABI,
        functionName: 'execute',
        args,
        account,
        value: simValue,
      });
      console.log('  simulate: OK');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const selectorMatch = msg.match(/0x[a-fA-F0-9]{8}/);
      const knownName =
        selectorMatch && KNOWN_ERROR_SELECTORS[selectorMatch[0].toLowerCase()]
          ? KNOWN_ERROR_SELECTORS[selectorMatch[0].toLowerCase()]
          : '';
      console.log('  simulate: REVERT:', msg.slice(0, 120) + (msg.length > 120 ? '...' : ''));
      if (knownName) console.log('  Decoded:', knownName);
      console.log(
        '  (Expected with placeholder 0x0 addresses; use real pool/position data for success.)'
      );
    }
    console.log('');
  }

  console.log(
    'Done. Replace placeholder addresses in SAMPLE_PAYLOADS for live simulation success.'
  );
}

main();
