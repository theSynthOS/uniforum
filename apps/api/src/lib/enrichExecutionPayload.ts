/**
 * Enrich execution payload params so the agent gets execution-ready data.
 *
 * Integrations (optional env):
 * - TOKEN_LIST_URL or TOKEN_LIST_URL_<chainId>: JSON token list (Uniswap format: { tokens: [{ address, symbol, chainId }] }) → token addresses
 * - GRAPH_API_KEY or UNISWAP_V4_SUBGRAPH_URL: Uniswap v4 subgraph → pool fee/tickSpacing by token pair
 * - UNICHAIN_SEPOLIA_RPC_URL (or chain-specific RPC): Quoter contract call → amountOutMinimum for swap
 */

import { getQuoteExactInputSingle } from '@uniforum/contracts';

/** Uniswap v4 subgraph id (Unichain) – used when only GRAPH_API_KEY is set */
const UNISWAP_V4_SUBGRAPH_ID_UNICHAIN = 'EoCvJ5tyMLMJcTnLQwWpjAtPdn74PcrZgzfcT5bYxNBH';

/** Token list cache: chainId -> { symbol -> address } */
let tokenListCache: Record<number, Record<string, string>> = {};

/** Fallback when no token list URL is set */
const TOKENS_BY_CHAIN: Record<number, Record<string, string>> = {
  1301: {
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0x0000000000000000000000000000000000000000',
    USDC: '0x0000000000000000000000000000000000000000',
  },
  130: {
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0x0000000000000000000000000000000000000000',
    USDC: '0x0000000000000000000000000000000000000000',
  },
};

/** Fallback when no subgraph: pair key -> fee, tickSpacing */
const POOLS_BY_CHAIN: Record<number, Record<string, { fee: number; tickSpacing: number }>> = {
  1301: { 'WETH-USDC': { fee: 500, tickSpacing: 10 }, 'ETH-USDC': { fee: 500, tickSpacing: 10 } },
  130: { 'WETH-USDC': { fee: 500, tickSpacing: 10 }, 'ETH-USDC': { fee: 500, tickSpacing: 10 } },
};

/** Common fee -> tickSpacing (v4) when subgraph only returns feeTier */
const FEE_TO_TICK_SPACING: Record<number, number> = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
};

function normalizeSymbol(s: string): string {
  return (s || '').toUpperCase().trim();
}

/**
 * Load token list from URL (env TOKEN_LIST_URL or TOKEN_LIST_URL_<chainId>).
 * Caches per chainId. Uniswap list format: { tokens: [ { address, symbol, chainId } ] }.
 */
async function getTokenListForChain(
  chainId: number,
  options?: { tokenListUrl?: string; tokenListUrlByChain?: Record<number, string> }
): Promise<Record<string, string>> {
  if (tokenListCache[chainId]) return tokenListCache[chainId];
  const url = options?.tokenListUrlByChain?.[chainId] ?? options?.tokenListUrl;
  if (!url) {
    tokenListCache[chainId] = TOKENS_BY_CHAIN[chainId] ?? {};
    return tokenListCache[chainId];
  }
  try {
    const res = await fetch(url);
    const json = (await res.json()) as { tokens?: Array<{ address: string; symbol: string; chainId?: number }> };
    const tokens = json.tokens ?? [];
    const bySymbol: Record<string, string> = {};
    for (const t of tokens) {
      if (t.chainId != null && Number(t.chainId) !== chainId) continue;
      const sym = normalizeSymbol(t.symbol);
      if (sym) bySymbol[sym] = t.address;
    }
    if (!bySymbol['ETH']) bySymbol['ETH'] = bySymbol['WETH'] ?? '';
    tokenListCache[chainId] = bySymbol;
    return bySymbol;
  } catch {
    tokenListCache[chainId] = TOKENS_BY_CHAIN[chainId] ?? {};
    return tokenListCache[chainId];
  }
}

function resolveTokenFromMap(tokens: Record<string, string>, symbol: string): string | null {
  const n = normalizeSymbol(symbol);
  if (n === 'ETH') return tokens['WETH'] ?? tokens['ETH'] ?? null;
  return tokens[n] ?? null;
}

/**
 * Fetch pool (fee, tickSpacing) from Uniswap v4 subgraph by token pair.
 * Env: GRAPH_API_KEY (then URL = https://gateway.thegraph.com/api/<key>/subgraphs/id/<id>) or UNISWAP_V4_SUBGRAPH_URL.
 */
async function getPoolFromSubgraph(
  chainId: number,
  currency0: string,
  currency1: string,
  options?: { graphApiKey?: string; subgraphUrl?: string }
): Promise<{ fee: number; tickSpacing: number } | null> {
  const key = options?.graphApiKey;
  const baseUrl = options?.subgraphUrl;
  const url = baseUrl
    ? baseUrl
    : key
      ? `https://gateway.thegraph.com/api/${key}/subgraphs/id/${UNISWAP_V4_SUBGRAPH_ID_UNICHAIN}`
      : null;
  if (!url) return null;
  const id0 = currency0.toLowerCase();
  const id1 = currency1.toLowerCase();
  const query = `
    query($id0: String!, $id1: String!) {
      pools(first: 1, where: { token0: $id0, token1: $id1 }) {
        id
        feeTier
      }
    }
  `;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { id0, id1 } }),
    });
    const json = (await res.json()) as { data?: { pools?: Array<{ feeTier?: number }> } };
    const pools = json.data?.pools ?? [];
    const pool = pools[0];
    if (!pool?.feeTier) return null;
    const fee = Number(pool.feeTier);
    const tickSpacing = FEE_TO_TICK_SPACING[fee] ?? 10;
    return { fee, tickSpacing };
  } catch {
    return null;
  }
}

function getPoolConfigFallback(
  chainId: number,
  tokenIn: string,
  tokenOut: string
): { fee: number; tickSpacing: number } | null {
  const pools = POOLS_BY_CHAIN[chainId];
  if (!pools) return null;
  const pairKey = [normalizeSymbol(tokenIn), normalizeSymbol(tokenOut)].sort().join('-');
  return pools[pairKey] ?? null;
}

export interface EnrichOptions {
  rpcUrl?: string;
  tokenListUrl?: string;
  tokenListUrlByChain?: Record<number, string>;
  graphApiKey?: string;
  subgraphUrl?: string;
}

/**
 * Enrich swap params: token list (1), subgraph pool (2), Quoter for amountOutMinimum (2).
 */
export async function enrichSwapParams(
  params: Record<string, unknown>,
  chainId: number,
  _forumGoal?: string,
  options?: EnrichOptions
): Promise<Record<string, unknown>> {
  const tokenIn = typeof params.tokenIn === 'string' ? params.tokenIn : '';
  const tokenOut = typeof params.tokenOut === 'string' ? params.tokenOut : '';
  const amount = typeof params.amount === 'string' ? params.amount : '0';
  const slippage = typeof params.slippage === 'number' ? params.slippage : 50;

  const tokens = await getTokenListForChain(chainId, options);
  const addr0 = resolveTokenFromMap(tokens, tokenIn);
  const addr1 = resolveTokenFromMap(tokens, tokenOut);
  if (!addr0 || !addr1) return params;

  const [currency0, currency1] = BigInt(addr0) <= BigInt(addr1) ? [addr0, addr1] : [addr1, addr0];
  const zeroForOne = BigInt(addr0) <= BigInt(addr1);

  let pool = await getPoolFromSubgraph(chainId, currency0, currency1, options);
  if (!pool) pool = getPoolConfigFallback(chainId, tokenIn, tokenOut);
  if (!pool) return { ...params, currency0, currency1, zeroForOne };

  let amountOutMinimum = '0';
  const rpcUrl = options?.rpcUrl;
  if (rpcUrl && amount !== '0') {
    const quote = await getQuoteExactInputSingle(
      chainId,
      rpcUrl,
      { currency0, currency1, fee: pool.fee, tickSpacing: pool.tickSpacing },
      zeroForOne,
      amount
    );
    if (quote) {
      const min = (BigInt(quote) * BigInt(10000 - slippage)) / 10000n;
      amountOutMinimum = String(min);
    }
  }

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

/** Enrich execution payload params by action (async when swap + quoter/subgraph). */
export async function enrichExecutionPayloadParams(
  action: string,
  params: Record<string, unknown>,
  chainId: number,
  forumGoal?: string,
  options?: EnrichOptions
): Promise<Record<string, unknown>> {
  if (action === 'swap') {
    return enrichSwapParams(params, chainId, forumGoal, options);
  }
  return params;
}
