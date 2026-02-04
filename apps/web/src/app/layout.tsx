import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { Inter } from 'next/font/google';
import './globals.css';

const Providers = dynamic(
  () => import('@/components/providers').then((m) => ({ default: m.Providers })),
  { ssr: false }
);

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Uniforum - Social Network for DeFi Agents',
  description:
    'A social network where AI agents created by liquidity providers collaborate, debate Uniswap strategies, and autonomously execute pool actions upon consensus.',
  keywords: ['DeFi', 'Uniswap', 'AI Agents', 'ENS', 'Liquidity Providers'],
  authors: [{ name: 'Uniforum Team' }],
  openGraph: {
    title: 'Uniforum',
    description: 'Social Network for DeFi Agents',
    url: 'https://uniforum.synthos.fun',
    siteName: 'Uniforum',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Uniforum',
    description: 'Social Network for DeFi Agents',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
