import { Hono } from 'hono';
import { getSupabase } from '../lib/supabase';

export const ensRoutes = new Hono();

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

  // Normalize name - handle both "agentname" and "agentname.uniforum.eth"
  let ensName = name;
  if (!name.endsWith('.uniforum.eth')) {
    ensName = `${name}.uniforum.eth`;
  }

  // Extract subdomain
  const subdomain = ensName.replace('.uniforum.eth', '');

  // Query agent
  const { data: agent, error } = await supabase
    .from('agents')
    .select(
      `
      *,
      agent_wallets (address)
    `
    )
    .eq('ens_name', ensName)
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

  const walletAddress = agent.agent_wallets?.[0]?.address;

  // Build text records
  const textRecords: Record<string, string> = {
    'eth.uniforum.version': '1.0',
    'eth.uniforum.strategy': agent.strategy,
    'eth.uniforum.riskTolerance': agent.risk_tolerance.toString(),
    'eth.uniforum.preferredPools': JSON.stringify(agent.preferred_pools),
    'eth.uniforum.expertise': agent.expertise_context || '',
    'eth.uniforum.agentWallet': walletAddress || '',
    'eth.uniforum.createdAt': new Date(agent.created_at).getTime().toString(),
    'eth.uniforum.owner': agent.owner_address,
  };

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

  let ensName = name;
  if (!name.endsWith('.uniforum.eth')) {
    ensName = `${name}.uniforum.eth`;
  }

  const { data: agent, error } = await supabase
    .from('agents')
    .select(
      `
      *,
      agent_wallets (address)
    `
    )
    .eq('ens_name', ensName)
    .eq('status', 'active')
    .single();

  if (error || !agent) {
    return c.json({ error: 'Name not found' }, 404);
  }

  const walletAddress = agent.agent_wallets?.[0]?.address;

  // Map key to value
  const keyMap: Record<string, string | null> = {
    'eth.uniforum.version': '1.0',
    'eth.uniforum.strategy': agent.strategy,
    'eth.uniforum.riskTolerance': agent.risk_tolerance.toString(),
    'eth.uniforum.preferredPools': JSON.stringify(agent.preferred_pools),
    'eth.uniforum.expertise': agent.expertise_context,
    'eth.uniforum.agentWallet': walletAddress,
    'eth.uniforum.createdAt': new Date(agent.created_at).getTime().toString(),
    'eth.uniforum.owner': agent.owner_address,
    'eth.uniforum.currentForum': agent.current_forum_id,
    // Standard ENS records
    avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${ensName.replace('.uniforum.eth', '')}`,
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

  let ensName = name;
  if (!name.endsWith('.uniforum.eth')) {
    ensName = `${name}.uniforum.eth`;
  }

  const { data: agent, error } = await supabase
    .from('agents')
    .select('agent_wallets (address)')
    .eq('ens_name', ensName)
    .eq('status', 'active')
    .single();

  if (error || !agent) {
    return c.json({ error: 'Name not found' }, 404);
  }

  return c.json({
    name: ensName,
    address: agent.agent_wallets?.[0]?.address || null,
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
