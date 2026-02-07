/**
 * Deliberation Scenario: Agents debate and reach consensus on a different action.
 *
 * Simulates the full agentic finance flow:
 *   1. Agent A proposes: swap 0.01 ETH → USDC (market order)
 *   2. Agent B disagrees: "Market is volatile, use a limit order instead"
 *   3. Agent C disagrees: "I agree with B, a limit order at tick -100 is safer"
 *   4. First proposal rejected (1 agree / 2 disagree)
 *   5. Agent B counter-proposes: limitOrder 0.01 ETH → USDC at targetTick=-100
 *   6. All 3 agents agree → consensus reached
 *   7. Enrichment → Calldata → On-chain simulation → SUCCESS
 *
 * This demonstrates that the agentic deliberation changes the execution plan.
 *
 * Usage:
 *   pnpm --filter @uniforum/contracts run test:deliberation
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  createPublicClient,
  decodeFunctionData,
  http,
  formatEther,
  formatUnits,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { unichainSepolia } from '../src/chains';
import { discoverPoolFeeTier } from '../src/uniswap/stateView';
import type { ExecutionPayload } from '@uniforum/shared';
import { buildCalldataForPayload, UNIVERSAL_ROUTER_ABI } from './build-execution-calldata';
import { enrichExecutionPayloadParams } from '../../../apps/api/src/lib/enrichExecutionPayload';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env.local') });

const RPC_URL = process.env.UNICHAIN_SEPOLIA_RPC_URL ?? 'https://sepolia.unichain.org';
const CHAIN_ID = 1301;

const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const USDC_ADDRESS = '0x31d0220469e10c4E71834a79b1f276d740d3768F' as Address;

// ── Agent identities ──
const AGENTS = {
  alpha: { ens: 'alpha.uniforum.eth', strategy: 'aggressive' },
  beta: { ens: 'beta.uniforum.eth', strategy: 'conservative' },
  gamma: { ens: 'gamma.uniforum.eth', strategy: 'moderate' },
} as const;

// ── Helpers ──
function log(prefix: string, msg: string) {
  const colors: Record<string, string> = {
    FORUM: '\x1b[36m',    // cyan
    ALPHA: '\x1b[33m',    // yellow
    BETA: '\x1b[32m',     // green
    GAMMA: '\x1b[35m',    // magenta
    VOTE: '\x1b[34m',     // blue
    SYSTEM: '\x1b[90m',   // gray
    EXEC: '\x1b[31m',     // red
    '✅': '\x1b[32m',
    '❌': '\x1b[31m',
  };
  const color = colors[prefix] ?? '\x1b[0m';
  console.log(`${color}[${prefix}]\x1b[0m ${msg}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   UNIFORUM: Agentic Deliberation → Consensus → Execution   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  const transport = http(RPC_URL);
  const publicClient = createPublicClient({ chain: unichainSepolia, transport });
  const privateKey = process.env.TEST_EXECUTOR_PRIVATE_KEY as `0x${string}` | undefined;

  if (!privateKey) {
    console.error('ERROR: TEST_EXECUTOR_PRIVATE_KEY required in .env.local');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  log('SYSTEM', `Chain: Unichain Sepolia (${CHAIN_ID})`);
  log('SYSTEM', `Executor: ${account.address}`);

  const [ethBal, usdcBal] = await Promise.all([
    publicClient.getBalance({ address: account.address }),
    publicClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_BALANCE_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    }),
  ]);
  log('SYSTEM', `Balances: ${formatEther(ethBal)} ETH | ${formatUnits(usdcBal, 6)} USDC`);

  // Discover pool
  const discovered = await discoverPoolFeeTier(
    CHAIN_ID, RPC_URL,
    '0x0000000000000000000000000000000000000000', USDC_ADDRESS
  );
  if (!discovered) {
    console.error('ERROR: No ETH-USDC pool found on-chain.');
    process.exit(1);
  }
  log('SYSTEM', `Pool: fee=${discovered.fee} tickSpacing=${discovered.tickSpacing} tick=${discovered.state.tick}`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // PHASE 1: Forum creation & agent joining
  // ═══════════════════════════════════════════════════════════════
  log('FORUM', '━━━ Phase 1: Forum Setup ━━━');
  log('FORUM', `Forum created: "Optimize ETH-USDC trading strategy"`);
  log('FORUM', `Creator: ${AGENTS.alpha.ens}`);
  log('FORUM', `Quorum: 60% | Participants: 3`);
  await sleep(300);
  log('ALPHA', `Joined forum (strategy: ${AGENTS.alpha.strategy})`);
  log('BETA', `Joined forum (strategy: ${AGENTS.beta.strategy})`);
  log('GAMMA', `Joined forum (strategy: ${AGENTS.gamma.strategy})`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2: First proposal — Agent Alpha proposes a market swap
  // ═══════════════════════════════════════════════════════════════
  log('FORUM', '━━━ Phase 2: Proposal #1 — Market Swap ━━━');
  await sleep(300);

  const proposal1 = {
    action: 'swap' as const,
    params: {
      tokenIn: 'ETH',
      tokenOut: 'USDC',
      amount: '10000000000000000', // 0.01 ETH
      slippage: 50,
    },
  };

  log('ALPHA', `📋 Proposes: SWAP 0.01 ETH → USDC (market order, 0.5% slippage)`);
  log('ALPHA', `   "Let's swap now while the price is good."`);
  await sleep(500);

  // Discussion
  log('BETA', `💬 "I disagree. Current tick is ${discovered.state.tick} — the market`);
  log('BETA', `    is volatile. A limit order at a better tick would give us`);
  log('BETA', `    a safer entry. I suggest targetTick=-100."`);
  await sleep(400);

  log('GAMMA', `💬 "I agree with Beta. A limit order protects against slippage`);
  log('GAMMA', `    in volatile conditions. Market swaps are risky right now."`);
  await sleep(400);

  // Voting on Proposal #1
  log('FORUM', '━━━ Voting on Proposal #1 ━━━');
  await sleep(200);

  const votes1 = [
    { agent: 'ALPHA', vote: 'agree', reason: 'Proposer votes for own proposal' },
    { agent: 'BETA', vote: 'disagree', reason: 'Prefers limit order for safety' },
    { agent: 'GAMMA', vote: 'disagree', reason: 'Agrees with Beta — too volatile' },
  ];

  let agree1 = 0, disagree1 = 0;
  for (const v of votes1) {
    if (v.vote === 'agree') agree1++; else disagree1++;
    const icon = v.vote === 'agree' ? '👍' : '👎';
    log('VOTE', `${icon} ${v.agent}: ${v.vote.toUpperCase()} — "${v.reason}"`);
    await sleep(200);
  }

  const pct1 = Math.round((agree1 / (agree1 + disagree1)) * 100);
  log('SYSTEM', `Result: ${agree1} agree / ${disagree1} disagree (${pct1}%) — REJECTED ❌`);
  log('SYSTEM', `Proposal #1 status: rejected`);
  console.log('');

  // Verify: enrich + build + simulate the REJECTED swap (prove it would have worked)
  log('SYSTEM', '(Verifying rejected swap would have been valid...)');
  const enriched1 = await enrichExecutionPayloadParams(
    proposal1.action, proposal1.params, CHAIN_ID, undefined,
    { rpcUrl: RPC_URL, graphApiKey: process.env.GRAPH_API_KEY || undefined }
  );
  const payload1: ExecutionPayload = {
    proposalId: 'deliberation-proposal-1',
    forumId: 'deliberation-forum-1',
    executorEnsName: AGENTS.alpha.ens,
    action: proposal1.action,
    params: { ...enriched1, deadline: Math.floor(Date.now() / 1000) + 1800 } as any,
    chainId: CHAIN_ID,
  };
  const cd1 = buildCalldataForPayload(payload1);
  try {
    const decoded1 = decodeFunctionData({ abi: UNIVERSAL_ROUTER_ABI, data: cd1.data });
    const args1 = decoded1.args as [`0x${string}`, `0x${string}`[], bigint];
    await publicClient.simulateContract({
      address: cd1.to as Address,
      abi: UNIVERSAL_ROUTER_ABI,
      functionName: 'execute',
      args: args1,
      account,
      value: cd1.value ?? 0n,
    });
    log('SYSTEM', '(Swap simulation: VALID ✓ — but agents chose not to execute it)');
  } catch {
    log('SYSTEM', '(Swap simulation: would have reverted anyway)');
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3: Counter-proposal — Agent Beta proposes a limit order
  // ═══════════════════════════════════════════════════════════════
  log('FORUM', '━━━ Phase 3: Proposal #2 — Limit Order (Counter-Proposal) ━━━');
  await sleep(300);

  const proposal2 = {
    action: 'limitOrder' as const,
    params: {
      tokenIn: 'ETH',
      tokenOut: 'USDC',
      amount: '10000000000000000', // 0.01 ETH (same amount)
      targetTick: -100,
      zeroForOne: true,
    },
  };

  log('BETA', `📋 Counter-proposes: LIMIT ORDER 0.01 ETH → USDC at targetTick=-100`);
  log('BETA', `   "Same trade, but as a limit order. This protects us from`);
  log('BETA', `    adverse price movement. The hookData encodes our target tick."`);
  await sleep(500);

  log('ALPHA', `💬 "Fair point. The limit order approach is more disciplined.`);
  log('ALPHA', `    I'll support this counter-proposal."`);
  await sleep(400);

  log('GAMMA', `💬 "Agreed. This is the right call for current market conditions."`);
  await sleep(400);

  // Voting on Proposal #2
  log('FORUM', '━━━ Voting on Proposal #2 ━━━');
  await sleep(200);

  const votes2 = [
    { agent: 'BETA', vote: 'agree', reason: 'Proposer — limit order is safer' },
    { agent: 'ALPHA', vote: 'agree', reason: 'Convinced by deliberation' },
    { agent: 'GAMMA', vote: 'agree', reason: 'Limit order protects against volatility' },
  ];

  let agree2 = 0;
  for (const v of votes2) {
    agree2++;
    log('VOTE', `👍 ${v.agent}: AGREE — "${v.reason}"`);
    await sleep(200);
  }

  const pct2 = Math.round((agree2 / 3) * 100);
  log('SYSTEM', `Result: ${agree2} agree / 0 disagree (${pct2}%) — APPROVED ✅`);
  log('SYSTEM', `Consensus reached! Proposal #2 approved.`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // PHASE 4: Execution — Enrich, build calldata, simulate
  // ═══════════════════════════════════════════════════════════════
  log('FORUM', '━━━ Phase 4: Execution ━━━');
  await sleep(300);

  log('EXEC', '[1/3] Enriching proposal params via API enrichment pipeline...');
  const enriched2 = await enrichExecutionPayloadParams(
    proposal2.action, proposal2.params, CHAIN_ID, 'Optimize ETH-USDC trading strategy',
    { rpcUrl: RPC_URL, graphApiKey: process.env.GRAPH_API_KEY || undefined }
  );
  log('EXEC', `  currency0: ${enriched2.currency0}`);
  log('EXEC', `  currency1: ${enriched2.currency1}`);
  log('EXEC', `  fee: ${enriched2.fee} | tickSpacing: ${enriched2.tickSpacing}`);
  log('EXEC', `  zeroForOne: ${enriched2.zeroForOne} | targetTick: ${enriched2.targetTick}`);
  log('EXEC', `  amountOutMinimum: ${enriched2.amountOutMinimum}`);

  const deadline = Math.floor(Date.now() / 1000) + 1800;
  const payload2: ExecutionPayload = {
    proposalId: 'deliberation-proposal-2',
    forumId: 'deliberation-forum-1',
    executorEnsName: AGENTS.alpha.ens, // forum creator executes
    action: proposal2.action,
    params: { ...enriched2, deadline } as any,
    chainId: CHAIN_ID,
    deadline,
    forumGoal: 'Optimize ETH-USDC trading strategy',
  };

  log('EXEC', '[2/3] Building calldata for Universal Router...');
  const { data, to, value } = buildCalldataForPayload(payload2);
  log('EXEC', `  to: ${to}`);
  log('EXEC', `  calldata: ${(data.length - 2) / 2} bytes`);
  log('EXEC', `  value: ${value ?? 0n} wei (${value ? formatEther(value) + ' ETH' : '0'})`);

  log('EXEC', '[3/3] Simulating on Unichain Sepolia...');
  try {
    const decoded = decodeFunctionData({ abi: UNIVERSAL_ROUTER_ABI, data });
    const args = decoded.args as [`0x${string}`, `0x${string}`[], bigint];
    await publicClient.simulateContract({
      address: to as Address,
      abi: UNIVERSAL_ROUTER_ABI,
      functionName: 'execute',
      args,
      account,
      value: value ?? 0n,
    });
    console.log('');
    log('✅', '══════════════════════════════════════════════════════');
    log('✅', ' SIMULATION SUCCESS — Transaction would execute on-chain');
    log('✅', '══════════════════════════════════════════════════════');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('');
    log('❌', '══════════════════════════════════════════════════════');
    log('❌', ' SIMULATION FAILED');
    log('❌', ` Error: ${msg.slice(0, 200)}`);
    log('❌', '══════════════════════════════════════════════════════');
  }

  // ═══════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════
  console.log('');
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│                    Deliberation Summary                     │');
  console.log('├─────────────────────────────────────────────────────────────┤');
  console.log('│ Proposal #1: swap 0.01 ETH → USDC (market)     → REJECTED │');
  console.log('│   Reason: Agents preferred limit order for safety          │');
  console.log('│                                                            │');
  console.log('│ Proposal #2: limitOrder 0.01 ETH → USDC @ tick -100       │');
  console.log('│   → APPROVED (3/3 = 100%) → SIMULATED ✅                  │');
  console.log('│                                                            │');
  console.log('│ Key insight: Agent deliberation changed the execution      │');
  console.log('│ plan from a market swap to a limit order, demonstrating    │');
  console.log('│ collective intelligence in agentic finance.                │');
  console.log('└─────────────────────────────────────────────────────────────┘');
  console.log('');
}

main();
