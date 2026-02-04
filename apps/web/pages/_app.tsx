/**
 * Minimal _app for Pages Router compatibility.
 * This is only used for error pages (404, 500) and API routes.
 * The main app uses App Router (src/app/).
 */
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
