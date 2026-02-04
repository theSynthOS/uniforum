/**
 * Post-Consensus Execution
 *
 * Execute approved proposals for agreeing agents.
 */

import type { Proposal, Execution, ExecutionStatus } from '@uniforum/shared';
import { executeSwap, addLiquidity, removeLiquidity } from '@uniforum/contracts';
import { sleep, retryWithBackoff } from '@uniforum/shared';

export interface ExecutionContext {
  proposal: Proposal;
  agentEnsName: string;
  agentPrivateKey: `0x${string}`;
  chainId?: number;
}

export interface ExecutionResult {
  agentEnsName: string;
  status: ExecutionStatus;
  txHash?: string;
  error?: string;
  gasUsed?: string;
}

/**
 * Execute a proposal for a single agent
 */
export async function executeForAgent(context: ExecutionContext): Promise<ExecutionResult> {
  const { proposal, agentEnsName, agentPrivateKey, chainId = 1301 } = context;

  try {
    let result;

    switch (proposal.action) {
      case 'swap':
        result = await executeSwap({
          privateKey: agentPrivateKey,
          params: proposal.params as any,
          chainId,
        });
        break;

      case 'addLiquidity':
        result = await addLiquidity({
          privateKey: agentPrivateKey,
          params: proposal.params as any,
          chainId,
        });
        break;

      case 'removeLiquidity':
        // Need tokenId for removal
        const tokenId = (proposal.params as any).tokenId;
        const liquidityAmount = (proposal.params as any).liquidityAmount;

        result = await removeLiquidity({
          privateKey: agentPrivateKey,
          tokenId: BigInt(tokenId),
          liquidityToRemove: BigInt(liquidityAmount),
          chainId,
        });
        break;

      case 'limitOrder':
        // TODO: Implement limit order execution
        throw new Error('Limit order execution not yet implemented');

      default:
        throw new Error(`Unknown action: ${proposal.action}`);
    }

    if (result.success) {
      return {
        agentEnsName,
        status: 'success',
        txHash: result.txHash,
      };
    } else {
      return {
        agentEnsName,
        status: 'failed',
        error: result.error,
      };
    }
  } catch (error) {
    return {
      agentEnsName,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Execute a proposal for all agreeing agents
 */
export async function executeConsensus(
  proposal: Proposal,
  agreeingAgents: Array<{
    ensName: string;
    privateKey: `0x${string}`;
  }>,
  options: {
    chainId?: number;
    parallel?: boolean;
    delayBetweenMs?: number;
  } = {}
): Promise<ExecutionResult[]> {
  const { chainId = 1301, parallel = false, delayBetweenMs = 1000 } = options;

  const results: ExecutionResult[] = [];

  if (parallel) {
    // Execute all in parallel
    const promises = agreeingAgents.map((agent) =>
      retryWithBackoff(
        () =>
          executeForAgent({
            proposal,
            agentEnsName: agent.ensName,
            agentPrivateKey: agent.privateKey,
            chainId,
          }),
        3,
        1000
      )
    );

    const parallelResults = await Promise.allSettled(promises);

    for (let i = 0; i < parallelResults.length; i++) {
      const result = parallelResults[i];
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          agentEnsName: agreeingAgents[i].ensName,
          status: 'failed',
          error: result.reason?.message || 'Execution failed',
        });
      }
    }
  } else {
    // Execute sequentially with delay
    for (const agent of agreeingAgents) {
      const result = await retryWithBackoff(
        () =>
          executeForAgent({
            proposal,
            agentEnsName: agent.ensName,
            agentPrivateKey: agent.privateKey,
            chainId,
          }),
        3,
        1000
      );

      results.push(result);

      // Delay between executions to avoid nonce issues
      if (delayBetweenMs > 0) {
        await sleep(delayBetweenMs);
      }
    }
  }

  return results;
}

/**
 * Summarize execution results
 */
export function summarizeExecutionResults(results: ExecutionResult[]): {
  total: number;
  successful: number;
  failed: number;
  txHashes: string[];
  errors: string[];
} {
  const successful = results.filter((r) => r.status === 'success');
  const failed = results.filter((r) => r.status === 'failed');

  return {
    total: results.length,
    successful: successful.length,
    failed: failed.length,
    txHashes: successful.map((r) => r.txHash!).filter(Boolean),
    errors: failed.map((r) => `${r.agentEnsName}: ${r.error}`),
  };
}
