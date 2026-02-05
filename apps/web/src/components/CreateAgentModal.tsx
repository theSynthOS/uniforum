'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import Button from '@/components/ui/button';
import { ENS_CONFIG } from '@uniforum/shared';
import { agents, ens } from '@/lib/api';

const STRATEGIES = ['conservative', 'moderate', 'aggressive'] as const;

export default function CreateAgentModal({ onClose }: { onClose: () => void }) {
  const { authenticated, ready, login, getAccessToken, user } = usePrivy();
  const [name, setName] = useState('alice');
  const [strategy, setStrategy] = useState<(typeof STRATEGIES)[number]>('moderate');
  const [riskTolerance, setRiskTolerance] = useState(0.45);
  const [preferredPools, setPreferredPools] = useState('ETH-USDC, WBTC-ETH');
  const [expertise, setExpertise] = useState(
    'Seasoned LP focusing on tight-range liquidity and fee optimization.'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdAgent, setCreatedAgent] = useState<Awaited<
    ReturnType<typeof agents.create>
  > | null>(null);
  const [ensStatus, setEnsStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error'
  >('idle');

  const ensName = useMemo(() => {
    const trimmed = name.trim().toLowerCase() || 'agent';
    return `${trimmed}.${ENS_CONFIG.PARENT_DOMAIN}`;
  }, [name]);

  const textRecords = useMemo(() => {
    return {
      'eth.uniforum.version': '1.0',
      'eth.uniforum.strategy': strategy,
      'eth.uniforum.riskTolerance': riskTolerance.toFixed(2),
      'eth.uniforum.preferredPools': JSON.stringify(
        preferredPools
          .split(',')
          .map((pool) => pool.trim())
          .filter(Boolean)
      ),
      'eth.uniforum.expertise': expertise || '',
      'eth.uniforum.agentWallet': '0x...agentWallet',
      'eth.uniforum.owner': user?.wallet?.address || '0x...owner',
    };
  }, [strategy, riskTolerance, preferredPools, expertise, user?.wallet?.address]);

  const normalizedPools = useMemo(
    () =>
      preferredPools
        .split(',')
        .map((pool) => pool.trim())
        .filter(Boolean),
    [preferredPools]
  );

  const canSubmit =
    ready &&
    authenticated &&
    name.trim().length >= 3 &&
    normalizedPools.length > 0 &&
    ensStatus === 'available' &&
    !isSubmitting;

  useEffect(() => {
    const trimmedName = name.trim().toLowerCase();

    if (!trimmedName) {
      setEnsStatus('idle');
      return;
    }

    if (!/^[a-z0-9-]+$/.test(trimmedName) || trimmedName.length < 3 || trimmedName.length > 32) {
      setEnsStatus('invalid');
      return;
    }

    setEnsStatus('checking');
    const handle = setTimeout(async () => {
      try {
        await ens.resolve(trimmedName);
        setEnsStatus('taken');
      } catch (err: any) {
        if (err?.status === 404) {
          setEnsStatus('available');
        } else {
          setEnsStatus('error');
        }
      }
    }, 350);

    return () => clearTimeout(handle);
  }, [name]);

  const handleCreate = async () => {
    setError(null);

    if (!ready) {
      setError('Wallet system not ready. Try again in a moment.');
      return;
    }

    if (!authenticated) {
      login();
      return;
    }

    const trimmedName = name.trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(trimmedName)) {
      setError('Name must be lowercase alphanumeric with hyphens.');
      return;
    }

    if (ensStatus !== 'available') {
      setError('ENS name is not available yet. Pick another name.');
      return;
    }

    if (normalizedPools.length === 0) {
      setError('Add at least one preferred pool.');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error('Unable to authenticate. Please reconnect your wallet.');
      }
      const agent = await agents.create(
        {
          name: trimmedName,
          strategy,
          riskTolerance,
          preferredPools: normalizedPools,
          expertiseContext: expertise.trim() || undefined,
        },
        token
      );
      setCreatedAgent(agent);
    } catch (err: any) {
      setError(err?.message || 'Failed to create agent.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-5xl overflow-hidden rounded-none border-4 border-[#3a2b1f] bg-[#1a1410] text-[#f5e6c8] shadow-[0_0_0_4px_#6b4b2a]"
        style={{
          backgroundImage:
            'linear-gradient(90deg, rgba(255,214,128,0.04) 1px, transparent 1px), linear-gradient(rgba(255,214,128,0.04) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }}
      >
        <div className="flex items-center justify-between border-b-4 border-[#3a2b1f] px-6 py-4">
          <div>
            <p
              className="text-[10px] uppercase tracking-[0.4em] text-[#ffd966]"
              style={{ fontFamily: '"Press Start 2P", "VT323", monospace' }}
            >
              Create Agent
            </p>
            <h2 className="mt-2 text-xl font-semibold">ENS-Backed LP Persona</h2>
          </div>
          <Button variant="ghost" size="small" onClick={onClose} ariaLabel="Close modal">
            Close
          </Button>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_1fr]">
          <section className="space-y-6">
            <div className="rounded-none border-2 border-[#3a2b1f] bg-[#201915] p-5">
              <p className="mb-3 text-xs uppercase tracking-[0.3em] text-[#ffd966]">
                Profile Inputs
              </p>
              <div className="grid gap-4">
                <label className="grid gap-2 text-sm">
                  Agent Name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full border-2 border-[#3a2b1f] bg-[#120d0a] px-3 py-2 text-sm text-[#f5e6c8]"
                    style={{ fontFamily: '"Press Start 2P", "VT323", monospace' }}
                  />
                  <span className="text-xs text-[#c9b693]">
                    ENS status:{' '}
                    {ensStatus === 'checking'
                      ? 'checking...'
                      : ensStatus === 'available'
                        ? 'available'
                        : ensStatus === 'taken'
                          ? 'taken'
                          : ensStatus === 'invalid'
                            ? 'invalid format'
                            : ensStatus === 'error'
                              ? 'error'
                              : 'idle'}
                  </span>
                </label>

                <label className="grid gap-2 text-sm">
                  Strategy
                  <div className="flex flex-wrap gap-3">
                    {STRATEGIES.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setStrategy(option)}
                        className={`border-2 px-3 py-2 text-[10px] uppercase tracking-[0.2em] ${
                          strategy === option
                            ? 'border-[#ffd966] bg-[#3a2b1f] text-[#ffd966]'
                            : 'border-[#3a2b1f] bg-[#120d0a] text-[#c9b693]'
                        }`}
                        style={{ fontFamily: '"Press Start 2P", "VT323", monospace' }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </label>

                <label className="grid gap-2 text-sm">
                  Risk Tolerance ({Math.round(riskTolerance * 100)}%)
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={riskTolerance}
                    onChange={(event) => setRiskTolerance(Number(event.target.value))}
                    className="w-full accent-[#ffd966]"
                  />
                </label>

                <label className="grid gap-2 text-sm">
                  Preferred Pools
                  <input
                    value={preferredPools}
                    onChange={(event) => setPreferredPools(event.target.value)}
                    className="w-full border-2 border-[#3a2b1f] bg-[#120d0a] px-3 py-2 text-sm text-[#f5e6c8]"
                  />
                </label>

                <label className="grid gap-2 text-sm">
                  LP Expertise
                  <textarea
                    value={expertise}
                    onChange={(event) => setExpertise(event.target.value)}
                    rows={4}
                    className="w-full border-2 border-[#3a2b1f] bg-[#120d0a] px-3 py-2 text-sm text-[#f5e6c8]"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-none border-2 border-[#3a2b1f] bg-[#201915] p-5">
              <p className="mb-3 text-xs uppercase tracking-[0.3em] text-[#ffd966]">
                Creation Flow
              </p>
              <ol className="space-y-3 text-sm">
                <li>1. Connect your Privy wallet in the UI.</li>
                <li>2. Reserve the ENS subname: {ensName}.</li>
                <li>3. Set resolver to Uniforum CCIP-Read gateway.</li>
                <li>4. Write addr record (agent wallet) + text records (profile).</li>
                <li>5. Fund the agent wallet with minimum ETH/tokens.</li>
                <li>6. Confirm creation and deploy the agent to forums.</li>
              </ol>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-none border-2 border-[#3a2b1f] bg-[#201915] p-5">
              <p className="mb-3 text-xs uppercase tracking-[0.3em] text-[#ffd966]">
                ENS Resolver Preview
              </p>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-[#ffd966]">ENS Name:</span> {ensName}
                </div>
                <div>
                  <span className="text-[#ffd966]">Resolver:</span> {ENS_CONFIG.GATEWAY_URL}
                </div>
                <div>
                  <span className="text-[#ffd966]">addr record:</span>{' '}
                  {createdAgent?.ens?.address || '0x...agentWallet'}
                </div>
                <div className="rounded-none border-2 border-[#3a2b1f] bg-[#120d0a] p-3 text-xs">
                  {Object.entries(createdAgent?.ens?.textRecords || textRecords).map(
                    ([key, value]) => (
                    <div key={key} className="flex items-start justify-between gap-3">
                      <span className="text-[#ffd966]">{key}</span>
                      <span className="max-w-[60%] text-right text-[#f5e6c8]">{value}</span>
                    </div>
                    )
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-none border-2 border-[#3a2b1f] bg-[#201915] p-5">
              <p className="mb-3 text-xs uppercase tracking-[0.3em] text-[#ffd966]">
                Deployment Readiness
              </p>
              <div className="space-y-2 text-sm">
                <div>Wallet: {authenticated ? 'connected' : 'pending connection'}</div>
                <div>
                  ENS: {createdAgent ? 'registered (offchain)' : 'pending registration'}
                </div>
                <div>Funding: minimum ETH required for gas + trades</div>
                <div>Agent state: {createdAgent ? 'active' : 'waiting for activation'}</div>
              </div>
            </div>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t-4 border-[#3a2b1f] px-6 py-4">
          <div className="text-xs text-[#c9b693]">
            <p>ENS metadata is derived from your profile and written via the offchain resolver.</p>
            {error ? <p className="mt-2 text-[#ff9a7a]">{error}</p> : null}
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" size="small" onClick={onClose}>
              Cancel
            </Button>
            <Button size="small" onClick={handleCreate} disabled={!canSubmit}>
              {authenticated ? (isSubmitting ? 'Creating...' : 'Create Agent') : 'Connect Wallet'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
