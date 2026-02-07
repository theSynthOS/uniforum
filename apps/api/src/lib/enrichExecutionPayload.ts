/**
 * Enrich execution payload params so the agent gets execution-ready data.
 *
 * Ideal flow (see docs/CLAUDE.md):
 * - Proposal stores intent: tokenIn, tokenOut, amount, slippage, deadline.
 * - When returning GET /proposals/:id/execution-payload, we enrich with:
 *   - Token addresses (currency0, currency1) from chain token list
 *   - Pool key (fee, tickSpacing) from forum/pool config
 *   - amountOutMinimum from quote (here: placeholder; production should call Quoter or Routing API)
 */

/** Token symbol -> address for a chain. ETH typically maps to WETH for pool use. */
const TOKENS_BY_CHAIN: Record<
  number,
  Record<string, string>
> = {
  // Unichain Sepolia (1301) – replace with real addresses from explorer/token list
  1301: {
    ETH: '0x0000000000000000000000000000000000000000', // native; use WETH for pool
    WETH: '0x0000000000000000000000000000000000000000', // placeholder
    USDC: '0x0000000000000000000000000000000000000000', // placeholder
  },
  // Unichain Mainnet (130)
  130: {
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0x0000000000000000000000000000000000000000',
    USDC: '0x0000000000000000000000000000000000000000',
  },
};

/** Pool config per chain: pair key "TOKEN0-TOKEN1" (sorted) -> fee, tickSpacing. */
const POOLS_BY_CHAIN: Record<
  number,
  Record<string, { fee: number; tickSpacing: number }>
> = {
  1301: {
    'WETH-USDC': { fee: 500, tickSpacing: 10 },
    'ETH-USDC': { fee: 500, tickSpacing: 10 },
  },
  130: {
    'WETH-USDC': { fee: 500, tickSpacing: 10 },
    'ETH-USDC': { fee: 500, tickSpacing: 10 },
  },
};

function normalizeSymbol(s: string): string {
  return (s || '').toUpperCase().trim();
}

/** Resolve token symbol to address for chainId; ETH -> WETH for pool. */
function resolveToken(chainId: number, symbol: string): string | null {
  const tokens = TOKENS_BY_CHAIN[chainId];
  if (!tokens) return null;
  const n = normalizeSymbol(symbol);
  if (n === 'ETH') return tokens['WETH'] ?? tokens['ETH'] ?? null;
  return tokens[n] ?? null;
}

/** Get pool config for a pair; pairKey is sorted "SYMBOL0-SYMBOL1". */
function getPoolConfig(
  chainId: number,
  tokenIn: string,
  tokenOut: string
): { fee: number; tickSpacing: number } | null {
  const pools = POOLS_BY_CHAIN[chainId];
  if (!pools) return null;
  const a = normalizeSymbol(tokenIn);
  const b = normalizeSymbol(tokenOut);
  const pairKey = [a, b].sort().join('-');
  return pools[pairKey] ?? null;
}

/** Enrich swap params with currency0, currency1, fee, tickSpacing, amountOutMinimum for execution. */
export function enrichSwapParams(
  params: Record<string, unknown>,
  chainId: number,
  _forumGoal?: string
): Record<string, unknown> {
  const tokenIn = typeof params.tokenIn === 'string' ? params.tokenIn : '';
  const tokenOut = typeof params.tokenOut === 'string' ? params.tokenOut : '';
  const amount = typeof params.amount === 'string' ? params.amount : '0';
  const slippage = typeof params.slippage === 'number' ? params.slippage : 50;

  const addr0 = resolveToken(chainId, tokenIn);
  const addr1 = resolveToken(chainId, tokenOut);
  const pool = getPoolConfig(chainId, tokenIn, tokenOut);

  if (!addr0 || !addr1 || !pool) {
    return params;
  }

  // currency0 < currency1 by address (Uniswap convention)
  const [currency0, currency1] =
    BigInt(addr0) <= BigInt(addr1) ? [addr0, addr1] : [addr1, addr0];
  const zeroForOne = BigInt(addr0) <= BigInt(addr1);

  // Production: call Quoter or Routing API with amount + slippage to get amountOutMinimum.
  // Here we use a placeholder so the payload shape is valid; agent/worker can re-quote if needed.
  const amountOutMinimum = '0';

  return {
    ...params,
    currency0,
    currency1,
    fee: pool.fee,
    tickSpacing: pool.tickSpacing,
    amountOutMinimum,
    zeroForOne,
  };
}

/** Enrich execution payload params by action. */
export function enrichExecutionPayloadParams(
  action: string,
  params: Record<string, unknown>,
  chainId: number,
  forumGoal?: string
): Record<string, unknown> {
  if (action === 'swap') {
    return enrichSwapParams(params, chainId, forumGoal);
  }
  return params;
}
