/**
 * Forums API Routes
 *
 * POST /api/forums - Create a new forum
 * GET /api/forums - List all forums
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createForumSchema, CONSENSUS_CONFIG } from '@uniforum/shared';

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status');
  const pool = searchParams.get('pool');
  const limit = parseInt(searchParams.get('limit') || '20');
  const offset = parseInt(searchParams.get('offset') || '0');

  let query = supabase
    .from('forums')
    .select(
      `
      *,
      creator:agents!creator_agent_id(ens_name, full_ens_name, avatar_url),
      participants:forum_participants(count)
    `,
      { count: 'exact' }
    )
    .order('last_activity_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  if (pool) {
    query = query.eq('pool', pool);
  }

  const { data: forums, error, count } = await query;

  if (error) {
    return NextResponse.json(
      { code: 'DATABASE_ERROR', message: error.message },
      { status: 500 }
    );
  }

  // Transform response
  const transformedForums = forums?.map((forum) => ({
    id: forum.id,
    title: forum.title,
    goal: forum.goal,
    pool: forum.pool,
    creatorAgent: (forum.creator as any)?.full_ens_name,
    participantCount: (forum.participants as any)?.[0]?.count || 0,
    quorumThreshold: forum.quorum_threshold,
    status: forum.status,
    createdAt: forum.created_at,
    lastActivityAt: forum.last_activity_at,
  }));

  return NextResponse.json({
    forums: transformedForums,
    total: count,
    limit,
    offset,
  });
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  // Parse and validate request body
  const body = await request.json();
  const parsed = createForumSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.errors },
      { status: 400 }
    );
  }

  const { title, goal, pool, quorumThreshold, timeoutMinutes } = parsed.data;

  // Get creator agent ID from header (simplified for hackathon)
  const creatorAgentId = request.headers.get('x-agent-id');

  if (!creatorAgentId) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', message: 'Agent ID required' },
      { status: 401 }
    );
  }

  // Verify agent exists
  const { data: agent } = await supabase
    .from('agents')
    .select('id, full_ens_name')
    .eq('id', creatorAgentId)
    .single();

  if (!agent) {
    return NextResponse.json(
      { code: 'AGENT_NOT_FOUND', message: 'Agent not found' },
      { status: 404 }
    );
  }

  // Calculate expiry time
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + (timeoutMinutes || CONSENSUS_CONFIG.DEFAULT_TIMEOUT_MINUTES));

  // Create forum
  const { data: forum, error } = await supabase
    .from('forums')
    .insert({
      title,
      goal,
      pool,
      creator_agent_id: creatorAgentId,
      quorum_threshold: quorumThreshold || CONSENSUS_CONFIG.DEFAULT_QUORUM_THRESHOLD,
      min_participants: CONSENSUS_CONFIG.MIN_PARTICIPANTS,
      timeout_minutes: timeoutMinutes || CONSENSUS_CONFIG.DEFAULT_TIMEOUT_MINUTES,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { code: 'DATABASE_ERROR', message: error.message },
      { status: 500 }
    );
  }

  // Auto-join creator as first participant
  await supabase.from('forum_participants').insert({
    forum_id: forum.id,
    agent_id: creatorAgentId,
  });

  return NextResponse.json(
    {
      id: forum.id,
      title: forum.title,
      goal: forum.goal,
      pool: forum.pool,
      creatorAgent: agent.full_ens_name,
      participantCount: 1,
      quorumThreshold: forum.quorum_threshold,
      status: forum.status,
      createdAt: forum.created_at,
      expiresAt: forum.expires_at,
    },
    { status: 201 }
  );
}
