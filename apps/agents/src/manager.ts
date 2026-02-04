/**
 * Agent Manager
 *
 * Manages the lifecycle of all Eliza agent instances.
 * Handles loading, creating, and orchestrating agents.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@uniforum/shared/types/database';
import { createAgentCharacter } from './characters/template';
import type { AgentInstance } from './types';

export class AgentManager {
  private agents: Map<string, AgentInstance> = new Map();
  private supabase: SupabaseClient<Database>;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
  }

  /**
   * Load all active agents from the database
   */
  async loadAgents(): Promise<void> {
    console.log('📥 Loading agents from database...');

    const { data: agents, error } = await this.supabase
      .from('agents')
      .select('*, agent_wallets(*)')
      .in('status', ['active', 'idle']);

    if (error) {
      throw new Error(`Failed to load agents: ${error.message}`);
    }

    if (!agents || agents.length === 0) {
      console.log('ℹ️  No agents found in database');
      return;
    }

    for (const agent of agents) {
      await this.createAgentInstance(agent);
    }

    console.log(`✅ Loaded ${agents.length} agents`);
  }

  /**
   * Create an Eliza agent instance from database record
   */
  async createAgentInstance(agentData: any): Promise<void> {
    const ensName = agentData.full_ens_name;

    if (this.agents.has(ensName)) {
      console.log(`⚠️  Agent ${ensName} already exists, skipping`);
      return;
    }

    console.log(`🤖 Creating agent instance: ${ensName}`);

    // Create character config from database data
    const character = createAgentCharacter({
      name: agentData.ens_name,
      ownerAddress: agentData.owner_address,
      agentWallet: agentData.agent_wallets?.wallet_address || '',
      strategy: agentData.strategy,
      riskTolerance: parseFloat(agentData.risk_tolerance),
      preferredPools: agentData.preferred_pools || [],
      expertiseContext: agentData.expertise_context || '',
      uniswapHistory: agentData.uniswap_history,
    });

    // TODO: Initialize Eliza runtime with character
    // const runtime = await createAgentRuntime(character);

    const instance: AgentInstance = {
      id: agentData.id,
      ensName,
      character,
      runtime: null, // Will be initialized when Eliza is set up
      status: agentData.status,
    };

    this.agents.set(ensName, instance);
    console.log(`✅ Agent ${ensName} created`);
  }

  /**
   * Subscribe to new agent registrations via Supabase realtime
   */
  subscribeToNewAgents(): void {
    console.log('📡 Subscribing to new agent registrations...');

    this.supabase
      .channel('agents-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agents',
        },
        async (payload) => {
          console.log(`🆕 New agent registered: ${payload.new.ens_name}`);
          // Fetch full agent data with wallet
          const { data: agent } = await this.supabase
            .from('agents')
            .select('*, agent_wallets(*)')
            .eq('id', payload.new.id)
            .single();

          if (agent) {
            await this.createAgentInstance(agent);
          }
        }
      )
      .subscribe();
  }

  /**
   * Subscribe to forum events for agent participation
   */
  subscribeToForumEvents(): void {
    console.log('📡 Subscribing to forum events...');

    // Subscribe to new messages in forums
    this.supabase
      .channel('forum-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          await this.handleNewMessage(payload.new);
        }
      )
      .subscribe();

    // Subscribe to new proposals
    this.supabase
      .channel('proposals')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'proposals',
        },
        async (payload) => {
          await this.handleNewProposal(payload.new);
        }
      )
      .subscribe();
  }

  /**
   * Handle new message in a forum
   */
  private async handleNewMessage(message: any): Promise<void> {
    // Get agents participating in this forum
    const { data: participants } = await this.supabase
      .from('forum_participants')
      .select('agent_id, agents(full_ens_name)')
      .eq('forum_id', message.forum_id)
      .eq('is_active', true);

    if (!participants) return;

    for (const participant of participants) {
      const ensName = (participant.agents as any)?.full_ens_name;
      if (!ensName) continue;

      // Don't respond to own messages
      if (message.agent_id === participant.agent_id) continue;

      const agent = this.agents.get(ensName);
      if (agent) {
        // TODO: Have agent evaluate and potentially respond
        console.log(`📨 Agent ${ensName} received message in forum`);
      }
    }
  }

  /**
   * Handle new proposal for voting
   */
  private async handleNewProposal(proposal: any): Promise<void> {
    // Get agents participating in this forum
    const { data: participants } = await this.supabase
      .from('forum_participants')
      .select('agent_id, agents(full_ens_name)')
      .eq('forum_id', proposal.forum_id)
      .eq('is_active', true);

    if (!participants) return;

    for (const participant of participants) {
      const ensName = (participant.agents as any)?.full_ens_name;
      if (!ensName) continue;

      const agent = this.agents.get(ensName);
      if (agent) {
        // TODO: Have agent evaluate proposal and vote
        console.log(`🗳️  Agent ${ensName} evaluating proposal`);
      }
    }
  }

  /**
   * Get the number of managed agents
   */
  getAgentCount(): number {
    return this.agents.size;
  }

  /**
   * Get an agent by ENS name
   */
  getAgent(ensName: string): AgentInstance | undefined {
    return this.agents.get(ensName);
  }

  /**
   * Shutdown all agents gracefully
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down all agents...');

    for (const [ensName, agent] of this.agents) {
      console.log(`  Stopping ${ensName}...`);
      // TODO: Gracefully stop Eliza runtime
      // if (agent.runtime) {
      //   await agent.runtime.stop();
      // }
    }

    this.agents.clear();
    console.log('✅ All agents stopped');
  }
}
