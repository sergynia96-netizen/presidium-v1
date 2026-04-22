import { AppProviders } from '@/components/providers/AppProviders';

export default function RootLayout({ children }: { children: any }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
