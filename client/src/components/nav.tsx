/**
 * Unified Navigation Component
 * 
 * Shared navigation bar for TruthBench Simulation service.
 */

import { Link, useLocation } from 'wouter';
import {
  Activity,
  Trophy,
  Eye,
  Brain,
} from 'lucide-react';
import { ModeToggle } from '@/components/mode-toggle';
import { cn } from '@/lib/utils';

interface NavLinkProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}

function NavLink({ href, icon, label, active }: NavLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors',
        active
          ? 'text-emerald-400 bg-emerald-500/10'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

export function Nav() {
  const [location] = useLocation();

  return (
    <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/results" className="flex items-center gap-2 text-xl font-bold">
              <Brain className="w-6 h-6 text-emerald-400" />
              TruthBench Simulation
            </Link>
            <div className="flex items-center gap-1">
              <NavLink
                href="/results"
                icon={<Trophy className="w-4 h-4" />}
                label="Results"
                active={location === '/results' || location === '/'}
              />
              <NavLink
                href="/traces"
                icon={<Eye className="w-4 h-4" />}
                label="Traces"
                active={location === '/traces'}
              />
              <NavLink
                href="/truthbench"
                icon={<Activity className="w-4 h-4" />}
                label="Run Simulation"
                active={location === '/truthbench'}
              />
            </div>
          </div>
          <ModeToggle />
        </div>
      </div>
    </nav>
  );
}

