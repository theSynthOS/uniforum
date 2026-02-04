import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabase } from '../lib/supabase';
import { authMiddleware, optionalAuthMiddleware, AuthUser } from '../lib/auth';

export const agentsRoutes = new Hono<{
  Variables: {
    user: AuthUser;
  };
}>();

// Validation schemas
const createAgentSchema = z.object({
  name: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9-]+$/, 'Name must be lowercase alphanumeric with hyphens'),
  strategy: z.enum(['conservative', 'moderate', 'aggressive']),
  riskTolerance: z.number().min(0).max(1),
  preferredPools: z.array(z.string()).min(1),
  expertiseContext: z.string().max(2000).optional(),
});

const updateAgentSchema = z.object({
  strategy: z.enum(['conservative', 'moderate', 'aggressive']).optional(),
  riskTolerance: z.number().min(0).max(1).optional(),
  preferredPools: z.array(z.string()).min(1).optional(),
  expertiseContext: z.string().max(2000).optional(),
});

// GET /agents - List all agents
agentsRoutes.get('/', optionalAuthMiddleware, async (c) => {
  const supabase = getSupabase();

  const { strategy, pool, limit, offset } = c.req.query();

  let query = supabase
    .from('agents')
    .select(
      `
      id,
      ens_name,
      owner_address,
      strategy,
      risk_tolerance,
      preferred_pools,
      status,
      created_at,
      agent_metrics (
        forums_participated,
        proposals_made,
        votes_cast,
        executions_performed
      )
    `
    )
    .eq('status', 'active');

  if (strategy) {
    query = query.eq('strategy', strategy);
  }

  if (pool) {
    query = query.contains('preferred_pools', [pool]);
  }

  const limitNum = Math.min(parseInt(limit || '20', 10), 100);
  const offsetNum = parseInt(offset || '0', 10);

  query = query.range(offsetNum, offsetNum + limitNum - 1);
  query = query.order('created_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    console.error('[agents] List error:', error);
    return c.json({ error: 'Failed to fetch agents', message: error.message }, 500);
  }

  return c.json({
    agents: data || [],
    pagination: {
      limit: limitNum,
      offset: offsetNum,
      total: count,
    },
  });
});

// POST /agents - Create new agent
agentsRoutes.post('/', authMiddleware, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();

  // Parse and validate body
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = createAgentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      },
      400
    );
  }

  const { name, strategy, riskTolerance, preferredPools, expertiseContext } = parsed.data;
  const ensName = `${name}.uniforum.eth`;

  // Check if agent name already exists
  const { data: existing } = await supabase
    .from('agents')
    .select('id')
    .eq('ens_name', ensName)
    .single();

  if (existing) {
    return c.json({ error: 'Agent name already taken' }, 409);
  }

  // Create agent wallet (in production, this would generate a real wallet)
  const agentWalletAddress = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(20))).toString('hex')}`;

  // Insert agent
  const { data: agent, error: insertError } = await supabase
    .from('agents')
    .insert({
      ens_name: ensName,
      owner_address: user.walletAddress,
      strategy,
      risk_tolerance: riskTolerance,
      preferred_pools: preferredPools,
      expertise_context: expertiseContext || '',
      status: 'active',
    })
    .select()
    .single();

  if (insertError) {
    console.error('[agents] Create error:', insertError);
    return c.json({ error: 'Failed to create agent', message: insertError.message }, 500);
  }

  // Create agent wallet record
  await supabase.from('agent_wallets').insert({
    agent_id: agent.id,
    address: agentWalletAddress,
    // In production, encrypted_private_key would be set here
  });

  // Initialize metrics
  await supabase.from('agent_metrics').insert({
    agent_id: agent.id,
  });

  return c.json(
    {
      id: agent.id,
      ensName: agent.ens_name,
      ownerAddress: agent.owner_address,
      agentWallet: agentWalletAddress,
      strategy: agent.strategy,
      riskTolerance: agent.risk_tolerance,
      preferredPools: agent.preferred_pools,
      status: agent.status,
      createdAt: agent.created_at,
    },
    201
  );
});

// GET /agents/:ensName - Get agent by ENS name
agentsRoutes.get('/:ensName', optionalAuthMiddleware, async (c) => {
  const ensName = c.req.param('ensName');
  const supabase = getSupabase();

  // Normalize ENS name
  const normalizedName = ensName.endsWith('.uniforum.eth')
    ? ensName
    : `${ensName}.uniforum.eth`;

  const { data: agent, error } = await supabase
    .from('agents')
    .select(
      `
      *,
      agent_wallets (address, balance_eth, balance_usdc),
      agent_metrics (*)
    `
    )
    .eq('ens_name', normalizedName)
    .single();

  if (error || !agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  return c.json({
    id: agent.id,
    ensName: agent.ens_name,
    ownerAddress: agent.owner_address,
    agentWallet: agent.agent_wallets?.[0]?.address,
    strategy: agent.strategy,
    riskTolerance: agent.risk_tolerance,
    preferredPools: agent.preferred_pools,
    expertiseContext: agent.expertise_context,
    status: agent.status,
    createdAt: agent.created_at,
    updatedAt: agent.updated_at,
    metrics: agent.agent_metrics?.[0],
    wallet: agent.agent_wallets?.[0],
  });
});

// PUT /agents/:ensName - Update agent
agentsRoutes.put('/:ensName', authMiddleware, async (c) => {
  const user = c.get('user');
  const ensName = c.req.param('ensName');
  const supabase = getSupabase();

  const normalizedName = ensName.endsWith('.uniforum.eth')
    ? ensName
    : `${ensName}.uniforum.eth`;

  // Check ownership
  const { data: agent } = await supabase
    .from('agents')
    .select('id, owner_address')
    .eq('ens_name', normalizedName)
    .single();

  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  if (agent.owner_address !== user.walletAddress) {
    return c.json({ error: 'Not authorized to update this agent' }, 403);
  }

  // Parse and validate body
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = updateAgentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      },
      400
    );
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.strategy) updates.strategy = parsed.data.strategy;
  if (parsed.data.riskTolerance !== undefined) updates.risk_tolerance = parsed.data.riskTolerance;
  if (parsed.data.preferredPools) updates.preferred_pools = parsed.data.preferredPools;
  if (parsed.data.expertiseContext !== undefined) updates.expertise_context = parsed.data.expertiseContext;

  const { data: updated, error } = await supabase
    .from('agents')
    .update(updates)
    .eq('id', agent.id)
    .select()
    .single();

  if (error) {
    console.error('[agents] Update error:', error);
    return c.json({ error: 'Failed to update agent' }, 500);
  }

  return c.json({
    id: updated.id,
    ensName: updated.ens_name,
    strategy: updated.strategy,
    riskTolerance: updated.risk_tolerance,
    preferredPools: updated.preferred_pools,
    updatedAt: updated.updated_at,
  });
});

// DELETE /agents/:ensName - Deactivate agent
agentsRoutes.delete('/:ensName', authMiddleware, async (c) => {
  const user = c.get('user');
  const ensName = c.req.param('ensName');
  const supabase = getSupabase();

  const normalizedName = ensName.endsWith('.uniforum.eth')
    ? ensName
    : `${ensName}.uniforum.eth`;

  // Check ownership
  const { data: agent } = await supabase
    .from('agents')
    .select('id, owner_address')
    .eq('ens_name', normalizedName)
    .single();

  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  if (agent.owner_address !== user.walletAddress) {
    return c.json({ error: 'Not authorized to delete this agent' }, 403);
  }

  // Soft delete - set status to inactive
  await supabase.from('agents').update({ status: 'inactive' }).eq('id', agent.id);

  return c.json({ success: true, message: 'Agent deactivated' });
});

// GET /agents/:ensName/metrics - Get agent metrics
agentsRoutes.get('/:ensName/metrics', async (c) => {
  const ensName = c.req.param('ensName');
  const supabase = getSupabase();

  const normalizedName = ensName.endsWith('.uniforum.eth')
    ? ensName
    : `${ensName}.uniforum.eth`;

  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('ens_name', normalizedName)
    .single();

  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  const { data: metrics, error } = await supabase
    .from('agent_metrics')
    .select('*')
    .eq('agent_id', agent.id)
    .single();

  if (error) {
    return c.json({ error: 'Metrics not found' }, 404);
  }

  return c.json({
    forumsParticipated: metrics.forums_participated,
    proposalsMade: metrics.proposals_made,
    votesCast: metrics.votes_cast,
    executionsPerformed: metrics.executions_performed,
    totalVolumeTraded: metrics.total_volume_traded,
    successRate: metrics.success_rate,
    updatedAt: metrics.updated_at,
  });
});

// GET /agents/:ensName/forums - Get forums agent is participating in
agentsRoutes.get('/:ensName/forums', async (c) => {
  const ensName = c.req.param('ensName');
  const supabase = getSupabase();

  const normalizedName = ensName.endsWith('.uniforum.eth')
    ? ensName
    : `${ensName}.uniforum.eth`;

  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('ens_name', normalizedName)
    .single();

  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  // Get forums where this agent is a participant
  const { data: forums, error } = await supabase
    .from('forums')
    .select('*')
    .contains('participants', [normalizedName])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[agents] Forums error:', error);
    return c.json({ error: 'Failed to fetch forums' }, 500);
  }

  return c.json({
    forums: forums || [],
  });
});
