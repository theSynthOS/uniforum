import { Hono } from 'hono';
import { getSupabase } from '../lib/supabase';
import { authMiddleware, AuthUser } from '../lib/auth';

export const executionsRoutes = new Hono<{
  Variables: {
    user: AuthUser;
  };
}>();

// GET /executions - List executions
executionsRoutes.get('/', async (c) => {
  const supabase = getSupabase();

  const { forumId, proposalId, agentEns, status, limit, offset } = c.req.query();

  let query = supabase
    .from('executions')
    .select(
      `
      *,
      proposal:proposals(
        id,
        action,
        params
      )
    `,
      { count: 'exact' }
    );

  if (forumId) {
    query = query.eq('forum_id', forumId);
  }

  if (proposalId) {
    query = query.eq('proposal_id', proposalId);
  }

  if (agentEns) {
    query = query.eq('agent_ens', agentEns);
  }

  if (status) {
    query = query.eq('status', status);
  }

  const limitNum = Math.min(parseInt(limit || '20', 10), 100);
  const offsetNum = parseInt(offset || '0', 10);

  query = query.range(offsetNum, offsetNum + limitNum - 1);
  query = query.order('created_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    console.error('[executions] List error:', error);
    return c.json({ error: 'Failed to fetch executions' }, 500);
  }

  return c.json({
    executions: data || [],
    pagination: {
      limit: limitNum,
      offset: offsetNum,
      total: count,
    },
  });
});

// POST /executions - Trigger execution for approved proposal
executionsRoutes.post('/', authMiddleware, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { proposalId } = body;

  if (!proposalId) {
    return c.json({ error: 'proposalId is required' }, 400);
  }

  // Get proposal
  const { data: proposal } = await supabase
    .from('proposals')
    .select(
      `
      *,
      forum:forums(
        id,
        participants
      ),
      votes:votes(
        agent_ens,
        vote
      )
    `
    )
    .eq('id', proposalId)
    .single();

  if (!proposal) {
    return c.json({ error: 'Proposal not found' }, 404);
  }

  if (proposal.status !== 'approved') {
    return c.json({ error: 'Proposal is not approved' }, 400);
  }

  // Check if already executed
  const { data: existingExecution } = await supabase
    .from('executions')
    .select('id')
    .eq('proposal_id', proposalId)
    .limit(1);

  if (existingExecution && existingExecution.length > 0) {
    return c.json({ error: 'Execution already started' }, 400);
  }

  // Get agreeing agents
  const agreeingAgents =
    proposal.votes
      ?.filter((v: { vote: string }) => v.vote === 'agree')
      .map((v: { agent_ens: string }) => v.agent_ens) || [];

  if (agreeingAgents.length === 0) {
    return c.json({ error: 'No agreeing agents to execute' }, 400);
  }

  // Create execution records for each agreeing agent
  const executions = [];
  for (const agentEns of agreeingAgents) {
    const { data: execution, error } = await supabase
      .from('executions')
      .insert({
        proposal_id: proposalId,
        forum_id: proposal.forum_id,
        agent_ens: agentEns,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('[executions] Create error:', error);
      continue;
    }

    executions.push(execution);
  }

  // Update proposal status
  await supabase
    .from('proposals')
    .update({ status: 'executing' })
    .eq('id', proposalId);

  // Update forum status
  await supabase
    .from('forums')
    .update({ status: 'executing' })
    .eq('id', proposal.forum_id);

  // Create system message
  await supabase.from('messages').insert({
    forum_id: proposal.forum_id,
    agent_ens: 'system',
    content: `Execution started for ${agreeingAgents.length} agents`,
    type: 'result',
  });

  return c.json(
    {
      message: 'Execution started',
      proposalId,
      agentCount: agreeingAgents.length,
      executions: executions.map((e) => ({
        id: e.id,
        agentEns: e.agent_ens,
        status: e.status,
      })),
    },
    201
  );
});

// GET /executions/:executionId - Get execution details
executionsRoutes.get('/:executionId', async (c) => {
  const executionId = c.req.param('executionId');
  const supabase = getSupabase();

  const { data: execution, error } = await supabase
    .from('executions')
    .select(
      `
      *,
      proposal:proposals(
        id,
        action,
        params,
        hooks
      )
    `
    )
    .eq('id', executionId)
    .single();

  if (error || !execution) {
    return c.json({ error: 'Execution not found' }, 404);
  }

  return c.json({
    id: execution.id,
    proposalId: execution.proposal_id,
    forumId: execution.forum_id,
    agentEns: execution.agent_ens,
    status: execution.status,
    txHash: execution.tx_hash,
    error: execution.error_message,
    gasUsed: execution.gas_used,
    createdAt: execution.created_at,
    completedAt: execution.completed_at,
    proposal: execution.proposal,
  });
});

// PATCH /executions/:executionId - Update execution status (called by agents service)
executionsRoutes.patch('/:executionId', async (c) => {
  const executionId = c.req.param('executionId');
  const supabase = getSupabase();

  // Note: In production, this would require agent service authentication
  // For MVP, we trust internal calls

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { status, txHash, errorMessage, gasUsed } = body;

  const updates: Record<string, unknown> = {};

  if (status) updates.status = status;
  if (txHash) updates.tx_hash = txHash;
  if (errorMessage) updates.error_message = errorMessage;
  if (gasUsed) updates.gas_used = gasUsed;

  if (status === 'success' || status === 'failed') {
    updates.completed_at = new Date().toISOString();
  }

  const { data: execution, error } = await supabase
    .from('executions')
    .update(updates)
    .eq('id', executionId)
    .select()
    .single();

  if (error) {
    console.error('[executions] Update error:', error);
    return c.json({ error: 'Failed to update execution' }, 500);
  }

  // If execution completed, update agent metrics
  if (status === 'success') {
    const { data: agent } = await supabase
      .from('agents')
      .select('id')
      .eq('ens_name', execution.agent_ens)
      .single();

    if (agent) {
      await supabase.rpc('increment_executions_performed', { agent_id_param: agent.id });
    }

    // Create success message
    await supabase.from('messages').insert({
      forum_id: execution.forum_id,
      agent_ens: execution.agent_ens,
      content: `Execution successful! TX: ${txHash}`,
      type: 'result',
      metadata: { txHash },
    });
  } else if (status === 'failed') {
    // Create failure message
    await supabase.from('messages').insert({
      forum_id: execution.forum_id,
      agent_ens: execution.agent_ens,
      content: `Execution failed: ${errorMessage}`,
      type: 'result',
      metadata: { error: errorMessage },
    });
  }

  // Check if all executions for this proposal are complete
  const { data: allExecutions } = await supabase
    .from('executions')
    .select('status')
    .eq('proposal_id', execution.proposal_id);

  const allComplete = allExecutions?.every(
    (e) => e.status === 'success' || e.status === 'failed'
  );

  if (allComplete) {
    const allSuccess = allExecutions?.every((e) => e.status === 'success');

    // Update proposal status
    await supabase
      .from('proposals')
      .update({ status: allSuccess ? 'executed' : 'failed' })
      .eq('id', execution.proposal_id);

    // Update forum status
    await supabase
      .from('forums')
      .update({ status: 'executed' })
      .eq('id', execution.forum_id);
  }

  return c.json({
    id: execution.id,
    status: execution.status,
    txHash: execution.tx_hash,
    completedAt: execution.completed_at,
  });
});
