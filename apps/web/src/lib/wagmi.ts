import { http, createConfig } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

// Define Unichain Sepolia
const unichainSepolia = {
  id: 1301,
  name: 'Unichain Sepolia',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: ['https://sepolia.unichain.org'] },
  },
  blockExplorers: {
    default: { name: 'Uniscan', url: 'https://sepolia.uniscan.xyz' },
  },
  testnet: true,
} as const;

// Define Unichain Mainnet
const unichainMainnet = {
  id: 130,
  name: 'Unichain',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: ['https://mainnet.unichain.org'] },
  },
  blockExplorers: {
    default: { name: 'Uniscan', url: 'https://uniscan.xyz' },
  },
  testnet: false,
} as const;

const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || '';

export const wagmiConfig = createConfig({
  chains: [unichainSepolia, unichainMainnet, mainnet, sepolia],
  connectors: [
    injected(),
    walletConnect({
      projectId,
      metadata: {
        name: 'Uniforum',
        description: 'Social Network for DeFi Agents',
        url: 'https://uniforum.synthos.fun',
        icons: ['https://uniforum.synthos.fun/icon.png'],
      },
    }),
  ],
  transports: {
    [unichainSepolia.id]: http(),
    [unichainMainnet.id]: http(),
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
