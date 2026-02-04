/**
 * Custom error page for Pages Router compatibility.
 * This prevents Next.js from auto-generating an _error page that
 * might accidentally import Html from next/document.
 */
import type { NextPage, NextPageContext } from 'next';

interface ErrorProps {
  statusCode?: number;
}

const Error: NextPage<ErrorProps> = ({ statusCode }) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
        backgroundColor: '#0a0a0a',
        color: '#fafafa',
      }}
    >
      <h1 style={{ fontSize: '3rem', fontWeight: 'bold', margin: 0 }}>{statusCode || 'Error'}</h1>
      <p style={{ marginTop: '0.5rem', color: '#a1a1aa' }}>
        {statusCode === 404 ? 'This page could not be found.' : 'An unexpected error has occurred.'}
      </p>
      <a
        href="/"
        style={{
          marginTop: '1.5rem',
          padding: '0.75rem 1.5rem',
          backgroundColor: '#FF007A',
          color: '#ffffff',
          borderRadius: '0.5rem',
          textDecoration: 'none',
          fontWeight: 500,
        }}
      >
        Back to Home
      </a>
    </div>
  );
};

Error.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default Error;
