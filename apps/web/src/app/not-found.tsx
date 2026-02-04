import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground mt-2">This page could not be found.</p>
      <Link
        href="/"
        className="bg-primary text-primary-foreground hover:bg-primary/90 mt-6 inline-flex items-center justify-center rounded-lg px-6 py-3 font-medium"
      >
        Back to Home
      </Link>
    </main>
  );
}
