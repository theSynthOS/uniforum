/**
 * Agents API Routes
 *
 * POST /api/agents - Create a new agent
 * GET /api/agents - List all agents
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createAgentSchema } from '@uniforum/shared';
import { generateAgentWallet, encryptPrivateKey, buildEnsTextRecords } from '@uniforum/contracts';

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  const searchParams = request.nextUrl.searchParams;
  const strategy = searchParams.get('strategy');
  const pool = searchParams.get('pool');
  const status = searchParams.get('status');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  let query = supabase
    .from('agents')
    .select('*, agent_metrics(*)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (strategy) {
    query = query.eq('strategy', strategy);
  }

  if (status) {
    query = query.eq('status', status);
  }

  if (pool) {
    query = query.contains('preferred_pools', [pool]);
  }

  const { data: agents, error, count } = await query;

  if (error) {
    return NextResponse.json(
      { code: 'DATABASE_ERROR', message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    agents,
    total: count,
    limit,
    offset,
  });
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  // Parse and validate request body
  const body = await request.json();
  const parsed = createAgentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.errors },
      { status: 400 }
    );
  }

  const { name, strategy, riskTolerance, preferredPools, expertiseContext, avatarUrl } = parsed.data;

  // Get owner address from auth header (simplified for hackathon)
  const ownerAddress = request.headers.get('x-wallet-address');

  if (!ownerAddress) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', message: 'Wallet address required' },
      { status: 401 }
    );
  }

  // Check if name is available
  const { data: existing } = await supabase
    .from('agents')
    .select('id')
    .eq('ens_name', name.toLowerCase())
    .single();

  if (existing) {
    return NextResponse.json(
      { code: 'NAME_TAKEN', message: `Agent name "${name}" is already taken` },
      { status: 400 }
    );
  }

  // Generate agent wallet
  const wallet = generateAgentWallet();

  // Encrypt private key for storage
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    return NextResponse.json(
      { code: 'CONFIG_ERROR', message: 'Encryption key not configured' },
      { status: 500 }
    );
  }

  const encryptedPrivateKey = encryptPrivateKey(wallet.privateKey, encryptionKey);

  // Insert agent
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .insert({
      ens_name: name.toLowerCase(),
      owner_address: ownerAddress,
      strategy,
      risk_tolerance: riskTolerance,
      preferred_pools: preferredPools,
      expertise_context: expertiseContext,
      avatar_url: avatarUrl,
      status: 'idle',
    })
    .select()
    .single();

  if (agentError) {
    return NextResponse.json(
      { code: 'DATABASE_ERROR', message: agentError.message },
      { status: 500 }
    );
  }

  // Insert wallet
  const { error: walletError } = await supabase.from('agent_wallets').insert({
    agent_id: agent.id,
    wallet_address: wallet.address,
    encrypted_private_key: encryptedPrivateKey,
  });

  if (walletError) {
    // Rollback agent creation
    await supabase.from('agents').delete().eq('id', agent.id);

    return NextResponse.json(
      { code: 'DATABASE_ERROR', message: walletError.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      id: agent.id,
      ensName: agent.ens_name,
      fullEnsName: agent.full_ens_name,
      ownerAddress: agent.owner_address,
      agentWallet: wallet.address,
      strategy: agent.strategy,
      riskTolerance: agent.risk_tolerance,
      preferredPools: agent.preferred_pools,
      status: agent.status,
      createdAt: agent.created_at,
    },
    { status: 201 }
  );
}
