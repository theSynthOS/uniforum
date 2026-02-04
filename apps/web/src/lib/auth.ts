/**
 * Server-side Auth Utilities
 *
 * Verify Privy tokens in API routes.
 */

import { PrivyClient } from '@privy-io/server-auth';

let privyClient: PrivyClient | null = null;

/**
 * Get the Privy server client
 */
function getPrivyClient(): PrivyClient {
  if (privyClient) return privyClient;

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('Missing Privy environment variables');
  }

  privyClient = new PrivyClient(appId, appSecret);
  return privyClient;
}

/**
 * Verify a Privy access token from request headers
 */
export async function verifyPrivyToken(
  authHeader: string | null
): Promise<{ userId: string; walletAddress?: string } | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const client = getPrivyClient();
    const verifiedClaims = await client.verifyAuthToken(token);

    return {
      userId: verifiedClaims.userId,
      // Wallet address may be in app metadata or linked accounts
    };
  } catch (error) {
    console.error('Privy token verification failed:', error);
    return null;
  }
}

/**
 * Get user details from Privy by user ID
 */
export async function getPrivyUser(userId: string) {
  try {
    const client = getPrivyClient();
    const user = await client.getUser(userId);

    // Find wallet address from linked accounts
    const walletAccount = user.linkedAccounts.find((account) => account.type === 'wallet');

    return {
      id: user.id,
      email: user.email?.address,
      walletAddress: walletAccount?.address,
      linkedAccounts: user.linkedAccounts,
    };
  } catch (error) {
    console.error('Failed to get Privy user:', error);
    return null;
  }
}

/**
 * Middleware helper to require authentication
 */
export async function requireAuth(request: Request) {
  const authHeader = request.headers.get('Authorization');
  const verified = await verifyPrivyToken(authHeader);

  if (!verified) {
    return {
      authenticated: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    };
  }

  const user = await getPrivyUser(verified.userId);

  return {
    authenticated: true,
    userId: verified.userId,
    user,
  };
}
