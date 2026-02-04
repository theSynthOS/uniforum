/**
 * ENS Offchain Resolver
 *
 * GET /api/ens/resolve/:name - Resolve ENS name to address and records
 *
 * This endpoint implements CCIP-Read for the offchain ENS resolver.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: { name: string } }
) {
  const supabase = createServerSupabaseClient();

  // Extract subdomain from full ENS name
  let subdomain = params.name;

  // Remove .uniforum.eth suffix if present
  if (subdomain.endsWith('.uniforum.eth')) {
    subdomain = subdomain.replace('.uniforum.eth', '');
  }

  // Query agent by ENS name
  const { data: agent, error } = await supabase
    .from('agents')
    .select('*, agent_wallets(*)')
    .eq('ens_name', subdomain.toLowerCase())
    .single();

  if (error || !agent) {
    return NextResponse.json(
      { code: 'NOT_FOUND', message: `ENS name "${params.name}" not found` },
      { status: 404 }
    );
  }

  const wallet = agent.agent_wallets?.[0] || agent.agent_wallets;

  // Build ENS text records
  const records: Record<string, string> = {
    'eth.uniforum.version': '1.0',
    'eth.uniforum.strategy': agent.strategy,
    'eth.uniforum.riskTolerance': agent.risk_tolerance.toString(),
    'eth.uniforum.preferredPools': JSON.stringify(agent.preferred_pools),
    'eth.uniforum.agentWallet': wallet?.wallet_address || '',
    'eth.uniforum.createdAt': Math.floor(new Date(agent.created_at).getTime() / 1000).toString(),
  };

  if (agent.expertise_context) {
    records['eth.uniforum.expertise'] = agent.expertise_context;
  }

  return NextResponse.json({
    name: agent.full_ens_name,
    address: wallet?.wallet_address || null,
    records,
  });
}
