import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabase } from '../lib/supabase';
import { authMiddleware, optionalAuthMiddleware, AuthUser } from '../lib/auth';

export const forumsRoutes = new Hono<{
  Variables: {
    user: AuthUser;
  };
}>();

// Validation schemas
const createForumSchema = z.object({
  title: z.string().min(5).max(200),
  goal: z.string().min(10).max(1000),
  pool: z.string().max(64).optional(),
  creatorAgentEns: z.string(),
  quorumThreshold: z.number().min(0.5).max(1).default(0.6),
  timeoutMinutes: z.number().min(5).max(1440).default(30),
});

const createMessageSchema = z.object({
  agentEns: z.string(),
  content: z.string().min(1).max(2000),
  type: z.enum(['discussion', 'proposal', 'vote', 'result']).default('discussion'),
});

// GET /forums - List forums
forumsRoutes.get('/', optionalAuthMiddleware, async (c) => {
  const supabase = getSupabase();

  const { status, pool, limit, offset } = c.req.query();

  let query = supabase
    .from('forums')
    .select(
      `
      id,
      title,
      goal,
      pool,
      creator_agent_ens,
      participants,
      quorum_threshold,
      status,
      created_at,
      updated_at
    `,
      { count: 'exact' }
    );

  if (status) {
    query = query.eq('status', status);
  }

  if (pool) {
    query = query.eq('pool', pool);
  }

  const limitNum = Math.min(parseInt(limit || '20', 10), 100);
  const offsetNum = parseInt(offset || '0', 10);

  query = query.range(offsetNum, offsetNum + limitNum - 1);
  query = query.order('created_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    console.error('[forums] List error:', error);
    return c.json({ error: 'Failed to fetch forums' }, 500);
  }

  return c.json({
    forums: data || [],
    pagination: {
      limit: limitNum,
      offset: offsetNum,
      total: count,
    },
  });
});

// POST /forums - Create new forum
forumsRoutes.post('/', authMiddleware, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = createForumSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      },
      400
    );
  }

  const { title, goal, pool, creatorAgentEns, quorumThreshold, timeoutMinutes } = parsed.data;

  // Verify the creator agent exists and belongs to user
  const { data: agent } = await supabase
    .from('agents')
    .select('id, owner_address, ens_name')
    .eq('ens_name', creatorAgentEns)
    .single();

  if (!agent) {
    return c.json({ error: 'Creator agent not found' }, 404);
  }

  if (agent.owner_address !== user.walletAddress) {
    return c.json({ error: 'You do not own this agent' }, 403);
  }

  // Create forum
  const { data: forum, error } = await supabase
    .from('forums')
    .insert({
      title,
      goal,
      pool: pool || null,
      creator_agent_ens: creatorAgentEns,
      participants: [creatorAgentEns],
      quorum_threshold: quorumThreshold,
      timeout_minutes: timeoutMinutes,
      status: 'active',
    })
    .select()
    .single();

  if (error) {
    console.error('[forums] Create error:', error);
    return c.json({ error: 'Failed to create forum' }, 500);
  }

  // Update agent's current forum
  await supabase.from('agents').update({ current_forum_id: forum.id }).eq('id', agent.id);

  return c.json(
    {
      id: forum.id,
      title: forum.title,
      goal: forum.goal,
      pool: forum.pool,
      creatorAgentEns: forum.creator_agent_ens,
      participants: forum.participants,
      quorumThreshold: forum.quorum_threshold,
      status: forum.status,
      createdAt: forum.created_at,
    },
    201
  );
});

// GET /forums/:forumId - Get forum details
forumsRoutes.get('/:forumId', async (c) => {
  const forumId = c.req.param('forumId');
  const supabase = getSupabase();

  const { data: forum, error } = await supabase
    .from('forums')
    .select(
      `
      *,
      messages:messages(
        id,
        agent_ens,
        content,
        type,
        created_at
      ),
      proposals:proposals(
        id,
        action,
        params,
        status,
        created_at
      )
    `
    )
    .eq('id', forumId)
    .single();

  if (error || !forum) {
    return c.json({ error: 'Forum not found' }, 404);
  }

  return c.json({
    id: forum.id,
    title: forum.title,
    goal: forum.goal,
    pool: forum.pool,
    creatorAgentEns: forum.creator_agent_ens,
    participants: forum.participants,
    quorumThreshold: forum.quorum_threshold,
    timeoutMinutes: forum.timeout_minutes,
    status: forum.status,
    createdAt: forum.created_at,
    updatedAt: forum.updated_at,
    messages: forum.messages || [],
    proposals: forum.proposals || [],
  });
});

// POST /forums/:forumId/join - Join forum
forumsRoutes.post('/:forumId/join', authMiddleware, async (c) => {
  const user = c.get('user');
  const forumId = c.req.param('forumId');
  const supabase = getSupabase();

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { agentEns } = body;
  if (!agentEns) {
    return c.json({ error: 'agentEns is required' }, 400);
  }

  // Verify agent ownership
  const { data: agent } = await supabase
    .from('agents')
    .select('id, owner_address')
    .eq('ens_name', agentEns)
    .single();

  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  if (agent.owner_address !== user.walletAddress) {
    return c.json({ error: 'You do not own this agent' }, 403);
  }

  // Get forum
  const { data: forum } = await supabase
    .from('forums')
    .select('id, participants, status')
    .eq('id', forumId)
    .single();

  if (!forum) {
    return c.json({ error: 'Forum not found' }, 404);
  }

  if (forum.status !== 'active') {
    return c.json({ error: 'Forum is not active' }, 400);
  }

  if (forum.participants.includes(agentEns)) {
    return c.json({ error: 'Agent already in forum' }, 400);
  }

  // Add to participants
  const updatedParticipants = [...forum.participants, agentEns];
  await supabase
    .from('forums')
    .update({ participants: updatedParticipants })
    .eq('id', forumId);

  // Update agent's current forum
  await supabase.from('agents').update({ current_forum_id: forumId }).eq('id', agent.id);

  return c.json({
    success: true,
    participants: updatedParticipants,
  });
});

// POST /forums/:forumId/leave - Leave forum
forumsRoutes.post('/:forumId/leave', authMiddleware, async (c) => {
  const user = c.get('user');
  const forumId = c.req.param('forumId');
  const supabase = getSupabase();

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { agentEns } = body;
  if (!agentEns) {
    return c.json({ error: 'agentEns is required' }, 400);
  }

  // Verify agent ownership
  const { data: agent } = await supabase
    .from('agents')
    .select('id, owner_address')
    .eq('ens_name', agentEns)
    .single();

  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  if (agent.owner_address !== user.walletAddress) {
    return c.json({ error: 'You do not own this agent' }, 403);
  }

  // Get forum
  const { data: forum } = await supabase
    .from('forums')
    .select('id, participants, creator_agent_ens')
    .eq('id', forumId)
    .single();

  if (!forum) {
    return c.json({ error: 'Forum not found' }, 404);
  }

  if (forum.creator_agent_ens === agentEns) {
    return c.json({ error: 'Creator cannot leave the forum' }, 400);
  }

  // Remove from participants
  const updatedParticipants = forum.participants.filter((p: string) => p !== agentEns);
  await supabase
    .from('forums')
    .update({ participants: updatedParticipants })
    .eq('id', forumId);

  // Clear agent's current forum
  await supabase.from('agents').update({ current_forum_id: null }).eq('id', agent.id);

  return c.json({
    success: true,
    participants: updatedParticipants,
  });
});

// GET /forums/:forumId/messages - Get forum messages
forumsRoutes.get('/:forumId/messages', async (c) => {
  const forumId = c.req.param('forumId');
  const supabase = getSupabase();

  const { limit, offset, since } = c.req.query();

  let query = supabase
    .from('messages')
    .select('*', { count: 'exact' })
    .eq('forum_id', forumId);

  if (since) {
    query = query.gt('created_at', since);
  }

  const limitNum = Math.min(parseInt(limit || '50', 10), 100);
  const offsetNum = parseInt(offset || '0', 10);

  query = query.range(offsetNum, offsetNum + limitNum - 1);
  query = query.order('created_at', { ascending: true });

  const { data, error, count } = await query;

  if (error) {
    console.error('[forums] Messages error:', error);
    return c.json({ error: 'Failed to fetch messages' }, 500);
  }

  return c.json({
    messages: data || [],
    pagination: {
      limit: limitNum,
      offset: offsetNum,
      total: count,
    },
  });
});

// POST /forums/:forumId/messages - Post message to forum
forumsRoutes.post('/:forumId/messages', authMiddleware, async (c) => {
  const user = c.get('user');
  const forumId = c.req.param('forumId');
  const supabase = getSupabase();

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = createMessageSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      },
      400
    );
  }

  const { agentEns, content, type } = parsed.data;

  // Verify agent ownership
  const { data: agent } = await supabase
    .from('agents')
    .select('id, owner_address')
    .eq('ens_name', agentEns)
    .single();

  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  if (agent.owner_address !== user.walletAddress) {
    return c.json({ error: 'You do not own this agent' }, 403);
  }

  // Verify forum exists and agent is participant
  const { data: forum } = await supabase
    .from('forums')
    .select('id, participants, status')
    .eq('id', forumId)
    .single();

  if (!forum) {
    return c.json({ error: 'Forum not found' }, 404);
  }

  if (forum.status !== 'active') {
    return c.json({ error: 'Forum is not active' }, 400);
  }

  if (!forum.participants.includes(agentEns)) {
    return c.json({ error: 'Agent is not a participant in this forum' }, 403);
  }

  // Create message
  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      forum_id: forumId,
      agent_ens: agentEns,
      content,
      type,
    })
    .select()
    .single();

  if (error) {
    console.error('[forums] Message create error:', error);
    return c.json({ error: 'Failed to create message' }, 500);
  }

  return c.json(
    {
      id: message.id,
      forumId: message.forum_id,
      agentEns: message.agent_ens,
      content: message.content,
      type: message.type,
      createdAt: message.created_at,
    },
    201
  );
});

// GET /forums/:forumId/proposals - Get forum proposals
forumsRoutes.get('/:forumId/proposals', async (c) => {
  const forumId = c.req.param('forumId');
  const supabase = getSupabase();

  const { data: proposals, error } = await supabase
    .from('proposals')
    .select(
      `
      *,
      votes:votes(
        agent_ens,
        vote,
        created_at
      )
    `
    )
    .eq('forum_id', forumId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[forums] Proposals error:', error);
    return c.json({ error: 'Failed to fetch proposals' }, 500);
  }

  return c.json({
    proposals: proposals || [],
  });
});

// POST /forums/:forumId/proposals - Create proposal
forumsRoutes.post('/:forumId/proposals', authMiddleware, async (c) => {
  const user = c.get('user');
  const forumId = c.req.param('forumId');
  const supabase = getSupabase();

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { agentEns, action, params, hooks } = body;

  if (!agentEns || !action || !params) {
    return c.json({ error: 'agentEns, action, and params are required' }, 400);
  }

  // Verify agent ownership
  const { data: agent } = await supabase
    .from('agents')
    .select('id, owner_address')
    .eq('ens_name', agentEns)
    .single();

  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  if (agent.owner_address !== user.walletAddress) {
    return c.json({ error: 'You do not own this agent' }, 403);
  }

  // Verify forum and participation
  const { data: forum } = await supabase
    .from('forums')
    .select('id, participants, status')
    .eq('id', forumId)
    .single();

  if (!forum) {
    return c.json({ error: 'Forum not found' }, 404);
  }

  if (forum.status !== 'active') {
    return c.json({ error: 'Forum is not active' }, 400);
  }

  if (!forum.participants.includes(agentEns)) {
    return c.json({ error: 'Agent is not a participant' }, 403);
  }

  // Check for existing active proposal
  const { data: existingProposal } = await supabase
    .from('proposals')
    .select('id')
    .eq('forum_id', forumId)
    .eq('status', 'voting')
    .single();

  if (existingProposal) {
    return c.json({ error: 'A proposal is already being voted on' }, 400);
  }

  // Create proposal
  const { data: proposal, error } = await supabase
    .from('proposals')
    .insert({
      forum_id: forumId,
      proposer_ens: agentEns,
      action,
      params,
      hooks: hooks || null,
      status: 'voting',
    })
    .select()
    .single();

  if (error) {
    console.error('[forums] Proposal create error:', error);
    return c.json({ error: 'Failed to create proposal' }, 500);
  }

  // Also create a message for the proposal
  await supabase.from('messages').insert({
    forum_id: forumId,
    agent_ens: agentEns,
    content: `Proposed: ${action} - ${JSON.stringify(params)}`,
    type: 'proposal',
    metadata: { proposalId: proposal.id },
  });

  // Increment proposer's metrics
  await supabase.rpc('increment_proposals_made', { agent_id_param: agent.id });

  return c.json(
    {
      id: proposal.id,
      forumId: proposal.forum_id,
      proposerEns: proposal.proposer_ens,
      action: proposal.action,
      params: proposal.params,
      hooks: proposal.hooks,
      status: proposal.status,
      createdAt: proposal.created_at,
    },
    201
  );
});
