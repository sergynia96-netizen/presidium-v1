import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <h1 className="text-2xl font-bold">Presidium Web</h1>
        <p className="mt-2 text-slate-400">Open the authenticated app shell.</p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <Link
            href="/chat"
            className="inline-block rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-500"
          >
            Open Chat
          </Link>
          <Link
            href="/feed"
            className="inline-block rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition hover:bg-emerald-500"
          >
            Open Feed
          </Link>
          <Link
            href="/stories"
            className="inline-block rounded-lg bg-slate-700 px-4 py-2 font-medium text-white transition hover:bg-slate-600"
          >
            Open Stories
          </Link>
        </div>
      </div>
    </main>
  );
}
