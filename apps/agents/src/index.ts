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
import sqlPlugin, { createDatabaseAdapter } from '@elizaos/plugin-sql';

async function ensureElizaDatabase() {
  const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL || undefined;
  const dataDir =
    process.env.PGLITE_DATA_DIR ||
    process.env.ELIZA_DATABASE_DIR ||
    process.env.ELIZA_DATA_DIR ||
    undefined;

  const adapter = createDatabaseAdapter(
    {
      postgresUrl,
      dataDir,
    },
    '00000000-0000-0000-0000-000000000000'
  );

  if (!(await adapter.isReady())) {
    await adapter.init();
  }

  await adapter.runPluginMigrations([sqlPlugin], {
    verbose: true,
    force: process.env.ELIZA_ALLOW_DESTRUCTIVE_MIGRATIONS === 'true',
  });

  // Do not close here: plugin-sql uses a global singleton for PGlite.
  // Closing it here marks the DB as shutting down and breaks runtime init.
}

async function main() {
  console.log('[agents] Starting Uniforum Agents Service...');
  await ensureElizaDatabase();

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
