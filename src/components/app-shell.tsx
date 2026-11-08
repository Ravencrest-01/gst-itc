'use client';

import { FileUp, LayoutDashboard, ListChecks, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, ready: false },
  { href: '/upload', label: 'Upload data', icon: FileUp, ready: true },
  { href: '/reconciliation', label: 'Reconciliation', icon: ListChecks, ready: true },
  { href: '/vendors', label: 'Vendor recovery', icon: Users, ready: false },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_1fr]">
      <aside className="border-b border-border bg-surface md:sticky md:top-0 md:h-screen md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-4 py-4 md:px-5 md:py-5">
          <div className="grid size-8 place-items-center rounded-lg bg-accent text-sm font-bold text-accent-fg" aria-hidden>
            ₹
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">ITC Recovery</div>
            <div className="text-xs text-muted">GST reconciliation</div>
          </div>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:px-3">
          {NAV.map(({ href, label, icon: Icon, ready }) => {
            const active = isActive(href);
            const base = 'flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors';
            if (!ready) {
              return (
                <span key={href} className={`${base} cursor-not-allowed text-subtle`} title="Coming in a later milestone">
                  <Icon className="size-4" aria-hidden />
                  {label}
                  <span className="ml-auto rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">Soon</span>
                </span>
              );
            }
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`${base} ${active ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg'}`}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-0 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
