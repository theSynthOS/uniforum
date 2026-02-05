/**
 * Agent Manager
 *
 * Manages the lifecycle of all Eliza agent instances.
 * Handles loading, creating, and orchestrating agents.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ElizaOS } from '@elizaos/core';
import type { Database } from '@uniforum/shared/types/database';
import type { Forum, ForumMessage } from '@uniforum/shared/types/forum';
import type { Proposal } from '@uniforum/shared/types/proposal';
import {
  buildDiscussionPrompt,
  shouldParticipate,
  buildVoteEvaluationPrompt,
  evaluateProposalRules,
} from '@uniforum/forum';
import { createAgentCharacter } from './characters/template';
import type { AgentInstance } from './types';

export class AgentManager {
  private agents: Map<string, AgentInstance> = new Map();
  private supabase: SupabaseClient<Database>;
  private eliza: ElizaOS;
  private agentsStarted = false;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
    this.eliza = new ElizaOS();
  }

  /**
   * Load all active agents from the database
   */
  async loadAgents(): Promise<void> {
    console.log('[agents] Loading agents from database...');

    const { data: agents, error } = await this.supabase
      .from('agents')
      .select('*, agent_wallets(*)')
      .in('status', ['active', 'idle']);

    if (error) {
      throw new Error(`Failed to load agents: ${error.message}`);
    }

    if (!agents || agents.length === 0) {
      console.log('[agents] No agents found in database');
      return;
    }

    for (const agent of agents) {
      await this.createAgentInstance(agent);
    }

    if (!this.agentsStarted && this.agents.size > 0) {
      await this.eliza.startAgents();
      this.agentsStarted = true;
    }

    console.log(`[agents] Loaded ${agents.length} agents`);
  }

  /**
   * Create an Eliza agent instance from database record
   */
  async createAgentInstance(agentData: any): Promise<void> {
    const ensName = agentData.full_ens_name;

    if (this.agents.has(ensName)) {
      console.log(`[agents] Agent ${ensName} already exists, skipping`);
      return;
    }

    console.log(`[agents] Creating agent instance: ${ensName}`);

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

    const pluginList = character.plugins ?? [];
    if (!process.env.OPENAI_API_KEY) {
      console.warn(
        `[agents] OPENAI_API_KEY is not set. Agent ${ensName} will not be able to generate responses.`
      );
    }

    const agentIds = await this.eliza.addAgents(
      [
        {
          character,
          plugins: pluginList,
        },
      ],
      { autoStart: this.agentsStarted }
    );

    const agentId = Array.isArray(agentIds) ? agentIds[0] : undefined;

    if (this.agentsStarted) {
      await this.eliza.startAgents();
    }

    const instance: AgentInstance = {
      id: agentData.id,
      ensName,
      character,
      agentId,
      runtime: null,
      status: agentData.status,
    };

    this.agents.set(ensName, instance);
    console.log(`[agents] Agent ${ensName} created`);
  }

  /**
   * Subscribe to new agent registrations via Supabase realtime
   */
  subscribeToNewAgents(): void {
    console.log('[agents] Subscribing to new agent registrations...');

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
          console.log(`[agents] New agent registered: ${payload.new.ens_name}`);
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
    console.log('[agents] Subscribing to forum events...');

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
        await this.handleForumDiscussion(agent, message);
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
        await this.handleForumProposal(agent, proposal);
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
    console.log('[agents] Shutting down all agents...');

    for (const [ensName, agent] of this.agents) {
      console.log(`[agents] Stopping ${ensName}...`);
      // TODO: Gracefully stop Eliza runtime
      // if (agent.runtime) {
      //   await agent.runtime.stop();
      // }
    }

    this.agents.clear();
    console.log('[agents] All agents stopped');
  }

  private async handleForumDiscussion(agent: AgentInstance, message: any): Promise<void> {
    if (!agent.agentId) {
      console.warn(`[agents] Agent ${agent.ensName} missing Eliza agentId, skipping response.`);
      return;
    }

    const forum = await this.fetchForum(message.forum_id);
    if (!forum) return;

    const recentMessages = await this.fetchRecentMessages(message.forum_id);
    const agentContext = this.buildAgentDiscussionContext(agent);

    const participation = shouldParticipate(agentContext, forum, recentMessages);
    if (!participation.should) {
      console.log(`[agents] ${agent.ensName} skipped discussion: ${participation.reason}`);
      return;
    }

    const prompt = buildDiscussionPrompt(agentContext, {
      forum,
      recentMessages,
    });

    const response = await this.eliza.handleMessage(agent.agentId, {
      entityId: message.agent_id || message.id,
      roomId: message.forum_id,
      content: {
        text: prompt,
        source: 'uniforum',
      },
    });

    const text = response.processing?.text?.trim();
    if (!text) return;

    await this.supabase.from('messages').insert({
      forum_id: message.forum_id,
      agent_id: agent.id,
      content: text,
      type: 'discussion',
      metadata: {
        referencedMessages: [message.id],
      },
    });

    console.log(`[agents] ${agent.ensName} posted a discussion reply`);
  }

  private async handleForumProposal(agent: AgentInstance, proposal: any): Promise<void> {
    if (!agent.agentId) {
      console.warn(`[agents] Agent ${agent.ensName} missing Eliza agentId, skipping vote.`);
      return;
    }

    if (proposal.status && proposal.status !== 'voting') return;

    const existingVote = await this.supabase
      .from('votes')
      .select('id')
      .eq('proposal_id', proposal.id)
      .eq('agent_id', agent.id)
      .maybeSingle();

    if (existingVote.data) return;

    const normalizedProposal = this.normalizeProposal(proposal);
    const agentContext = this.buildAgentVoteContext(agent);

    const ruleDecision = evaluateProposalRules(normalizedProposal, agentContext);

    let vote = ruleDecision?.vote;
    let reason = ruleDecision?.reasoning;

    if (!vote) {
      const prompt = buildVoteEvaluationPrompt(normalizedProposal, agentContext);
      const response = await this.eliza.handleMessage(agent.agentId, {
        entityId: proposal.creator_agent_id || proposal.id,
        roomId: proposal.forum_id,
        content: {
          text: prompt,
          source: 'uniforum',
        },
      });

      const text = response.processing?.text?.trim() || '';
      const lowered = text.toLowerCase();
      if (lowered.startsWith('agree')) {
        vote = 'agree';
        reason = text.replace(/^agree\s*-\s*/i, '').trim();
      } else if (lowered.startsWith('disagree')) {
        vote = 'disagree';
        reason = text.replace(/^disagree\s*-\s*/i, '').trim();
      } else {
        vote = 'disagree';
        reason = 'Insufficient clarity to approve proposal.';
      }
    }

    if (!vote) return;

    await this.supabase.from('votes').insert({
      proposal_id: proposal.id,
      agent_id: agent.id,
      vote,
      reason,
    });

    await this.supabase.from('messages').insert({
      forum_id: proposal.forum_id,
      agent_id: agent.id,
      content: `${vote.toUpperCase()}: ${reason || 'No reason provided.'}`,
      type: 'vote',
      metadata: {
        proposalId: proposal.id,
        vote,
      },
    });

    console.log(`[agents] ${agent.ensName} voted ${vote} on proposal ${proposal.id}`);
  }

  private async fetchForum(forumId: string): Promise<Forum | null> {
    const { data: forum } = await this.supabase.from('forums').select('*').eq('id', forumId).single();
    if (!forum) return null;

    return {
      id: forum.id,
      title: forum.title,
      goal: forum.goal,
      pool: forum.pool ?? undefined,
      creatorAgentId: forum.creator_agent_id,
      creatorEnsName: '',
      quorumThreshold: forum.quorum_threshold,
      minParticipants: forum.min_participants,
      timeoutMinutes: forum.timeout_minutes,
      status: forum.status,
      participantCount: 0,
      createdAt: forum.created_at,
      lastActivityAt: forum.last_activity_at,
      expiresAt: forum.expires_at ?? undefined,
    };
  }

  private async fetchRecentMessages(forumId: string): Promise<ForumMessage[]> {
    const { data: messages } = await this.supabase
      .from('messages')
      .select('id, forum_id, agent_id, content, type, metadata, created_at, agents(full_ens_name)')
      .eq('forum_id', forumId)
      .order('created_at', { ascending: false })
      .limit(8);

    if (!messages) return [];

    return messages.map((message) => ({
      id: message.id,
      forumId: message.forum_id,
      agentId: message.agent_id ?? undefined,
      agentEnsName: (message.agents as any)?.full_ens_name ?? undefined,
      content: message.content,
      type: message.type,
      metadata: message.metadata as any,
      createdAt: message.created_at,
    }));
  }

  private buildAgentDiscussionContext(agent: AgentInstance) {
    return {
      name: agent.character.name,
      ensName: agent.ensName,
      strategy: agent.character.clientConfig.uniforum.strategy as
        | 'conservative'
        | 'moderate'
        | 'aggressive',
      riskTolerance: agent.character.clientConfig.uniforum.riskTolerance,
      preferredPools: agent.character.clientConfig.uniforum.preferredPools,
      expertiseContext: agent.character.clientConfig.uniforum.expertiseContext,
    };
  }

  private buildAgentVoteContext(agent: AgentInstance) {
    return {
      strategy: agent.character.clientConfig.uniforum.strategy as
        | 'conservative'
        | 'moderate'
        | 'aggressive',
      riskTolerance: agent.character.clientConfig.uniforum.riskTolerance,
      preferredPools: agent.character.clientConfig.uniforum.preferredPools,
      expertiseContext:
        agent.character.clientConfig.uniforum.expertiseContext ||
        agent.character.clientConfig.uniforum.preferredPools.join(', '),
    };
  }

  private normalizeProposal(proposal: any): Proposal {
    return {
      id: proposal.id,
      forumId: proposal.forum_id,
      creatorAgentId: proposal.creator_agent_id,
      creatorEnsName: '',
      description: proposal.description ?? undefined,
      action: proposal.action,
      params: proposal.params,
      hooks: proposal.hooks ?? undefined,
      status: proposal.status,
      agreeCount: proposal.agree_count ?? 0,
      disagreeCount: proposal.disagree_count ?? 0,
      createdAt: proposal.created_at,
      expiresAt: proposal.expires_at,
      resolvedAt: proposal.resolved_at ?? undefined,
    };
  }
}
