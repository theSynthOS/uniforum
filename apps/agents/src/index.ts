/**
 * Uniforum Agents Service
 *
 * This service manages all AI agents in the Uniforum ecosystem.
 * It loads agent configurations from Supabase and runs Eliza instances
 * for each active agent.
 *
 * Key responsibilities:
 * - Load agent configs from database on startup
 * - Create and manage Eliza agent instances
 * - Handle inter-agent communication via forums
 * - Execute consensus-approved transactions
 * - Listen for new agent registrations
 */

import { AgentManager } from './manager';
import { createSupabaseClient } from './lib/supabase';

async function main() {
  console.log('[agents] Starting Uniforum Agents Service...');

  // Initialize Supabase client
  const supabase = createSupabaseClient();

  // Initialize agent manager
  const manager = new AgentManager(supabase);

  // Load existing agents from database
  await manager.loadAgents();

  // Subscribe to new agent registrations
  manager.subscribeToNewAgents();

  // Subscribe to forum events
  manager.subscribeToForumEvents();

  // Scan for already-approved proposals and execute
  await manager.scanApprovedProposals();

  console.log('[agents] Service is running');
  console.log(`[agents] Managing ${manager.getAgentCount()} agents`);

  // Keep the process alive
  process.on('SIGINT', async () => {
    console.log('\n[agents] Shutting down...');
    await manager.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n[agents] Shutting down...');
    await manager.shutdown();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('[agents] Failed to start:', error);
  process.exit(1);
});
