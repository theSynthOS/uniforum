import { Hono } from 'hono';
import { getSupabase } from '../lib/supabase';
import { buildEnsTextRecords, ENS_TEXT_KEYS } from '@uniforum/contracts';
import { ENS_CONFIG } from '@uniforum/shared';

export const ensRoutes = new Hono();

const ENS_SUFFIX = `.${ENS_CONFIG.PARENT_DOMAIN}`;

function normalizeEnsInput(input: string) {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.endsWith(ENS_SUFFIX)) {
    return {
      subdomain: trimmed.slice(0, -ENS_SUFFIX.length),
      full: trimmed,
    };
  }
  return {
    subdomain: trimmed,
    full: `${trimmed}${ENS_SUFFIX}`,
  };
}

/**
 * ENS Offchain Resolver Gateway
 *
 * These endpoints implement a CCIP-Read compliant gateway for resolving
 * .uniforum.eth subnames without on-chain registration.
 *
 * Flow:
 * 1. User queries yudhagent.uniforum.eth
 * 2. ENS mainnet resolver has CCIP-Read set to this gateway
 * 3. Gateway queries Supabase for agent data
 * 4. Returns address and text records
 */

// GET /ens/resolve/:name - Resolve ENS name to address and records
ensRoutes.get('/resolve/:name', async (c) => {
  const name = c.req.param('name');
  const supabase = getSupabase();

  const { subdomain, full: ensName } = normalizeEnsInput(name);

  // Query agent
  const { data: agent, error } = await supabase
    .from('agents')
    .select(
      `
      *,
      agent_wallets (wallet_address)
    `
    )
    .eq('ens_name', subdomain)
    .eq('status', 'active')
    .single();

  if (error || !agent) {
    return c.json(
      {
        error: 'Name not found',
        message: `No agent found for ${ensName}`,
      },
      404
    );
  }

  const walletAddress = agent.agent_wallets?.[0]?.wallet_address;

  const textRecords: Record<string, string> = buildEnsTextRecords({
    strategy: agent.strategy,
    riskTolerance: agent.risk_tolerance,
    preferredPools: agent.preferred_pools,
    expertiseContext: agent.expertise_context || '',
    agentWallet: walletAddress || '',
    createdAt: new Date(agent.created_at),
  });

  textRecords['eth.uniforum.owner'] = agent.owner_address;
  textRecords[ENS_TEXT_KEYS.AGENT_WALLET] = walletAddress || '';

  // Add optional records if present
  if (agent.current_forum_id) {
    textRecords['eth.uniforum.currentForum'] = agent.current_forum_id;
  }

  return c.json({
    name: ensName,
    address: walletAddress,
    owner: agent.owner_address,
    textRecords,
    contenthash: null,
    avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${subdomain}`,
  });
});

// GET /ens/text/:name/:key - Get specific text record
ensRoutes.get('/text/:name/:key', async (c) => {
  const name = c.req.param('name');
  const key = c.req.param('key');
  const supabase = getSupabase();

  const { subdomain, full: ensName } = normalizeEnsInput(name);

  const { data: agent, error } = await supabase
    .from('agents')
    .select(
      `
      *,
      agent_wallets (wallet_address)
    `
    )
    .eq('ens_name', subdomain)
    .eq('status', 'active')
    .single();

  if (error || !agent) {
    return c.json({ error: 'Name not found' }, 404);
  }

  const walletAddress = agent.agent_wallets?.[0]?.wallet_address;

  // Map key to value
  const keyMap: Record<string, string | null> = {
    ...buildEnsTextRecords({
      strategy: agent.strategy,
      riskTolerance: agent.risk_tolerance,
      preferredPools: agent.preferred_pools,
      expertiseContext: agent.expertise_context || '',
      agentWallet: walletAddress || '',
      createdAt: new Date(agent.created_at),
    }),
    'eth.uniforum.owner': agent.owner_address,
    'eth.uniforum.currentForum': agent.current_forum_id,
    // Standard ENS records
    avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${subdomain}`,
    description: `Uniforum agent with ${agent.strategy} strategy`,
    url: `https://uniforum.synthos.fun/agents/${ensName}`,
  };

  const value = keyMap[key];

  if (value === undefined) {
    return c.json(
      {
        key,
        value: null,
        message: 'Text record not found',
      },
      404
    );
  }

  return c.json({
    key,
    value,
  });
});

// GET /ens/address/:name - Get address for name (convenience endpoint)
ensRoutes.get('/address/:name', async (c) => {
  const name = c.req.param('name');
  const supabase = getSupabase();

  const { subdomain, full: ensName } = normalizeEnsInput(name);

  const { data: agent, error } = await supabase
    .from('agents')
    .select('agent_wallets (wallet_address)')
    .eq('ens_name', subdomain)
    .eq('status', 'active')
    .single();

  if (error || !agent) {
    return c.json({ error: 'Name not found' }, 404);
  }

  return c.json({
    name: ensName,
    address: agent.agent_wallets?.[0]?.wallet_address || null,
  });
});

// GET /ens/list - List all registered names (admin/debug endpoint)
ensRoutes.get('/list', async (c) => {
  const supabase = getSupabase();

  const { limit, offset } = c.req.query();

  const limitNum = Math.min(parseInt(limit || '50', 10), 100);
  const offsetNum = parseInt(offset || '0', 10);

  const { data: agents, error, count } = await supabase
    .from('agents')
    .select('ens_name, status, created_at', { count: 'exact' })
    .eq('status', 'active')
    .range(offsetNum, offsetNum + limitNum - 1)
    .order('created_at', { ascending: false });

  if (error) {
    return c.json({ error: 'Failed to list names' }, 500);
  }

  return c.json({
    names: agents?.map((a) => a.ens_name) || [],
    pagination: {
      limit: limitNum,
      offset: offsetNum,
      total: count,
    },
  });
});
