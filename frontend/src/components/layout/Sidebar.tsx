import { useEffect, useRef } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import { LayoutDashboard, Briefcase, Layers, Network, ShieldAlert, Cpu, BarChart3, FileText, Database, BookOpen, X, PanelLeftClose, PanelLeftOpen, ChevronDown } from 'lucide-react';
import { TraceXLogo } from '../common/TraceXLogo';
import type { SystemHealth } from '../../types/api';

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  health: SystemHealth | null;
}

const navGroups = [
  { label: 'Workspace', items: [
    { name: 'Overview', path: '/', icon: LayoutDashboard },
    { name: 'Risk & alerts', path: '/risk', icon: ShieldAlert },
    { name: 'Transactions', path: '/transactions', icon: Layers },
    { name: 'Graph explorer', path: '/graph', icon: Network },
    { name: 'Investigations', path: '/investigations', icon: Briefcase },
  ] },
  { label: 'Intelligence', items: [
    { name: 'Model evaluation', path: '/models', icon: Cpu },
    { name: 'Analytics', path: '/analytics', icon: BarChart3 },
    { name: 'Reports', path: '/reports', icon: FileText },
  ] },
  { label: 'Resources', items: [
    { name: 'Dataset', path: '/dataset', icon: Database },
    { name: 'Methodology', path: '/methodology', icon: BookOpen },
  ] },
];

export function Sidebar({ mobileOpen, onCloseMobile, collapsed, onToggleCollapse, health }: SidebarProps) {
  const location = useLocation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (mobileOpen && !dialog?.open) dialog?.showModal();
    if (!mobileOpen && dialog?.open) dialog.close();
  }, [mobileOpen]);

  useEffect(() => {
    if (dialogRef.current?.open) dialogRef.current.close();
  }, [location.pathname]);

  useEffect(() => {
    const breakpoint = window.matchMedia('(min-width: 1024px)');
    const closeIfDesktop = () => { if (breakpoint.matches && dialogRef.current?.open) onCloseMobile(); };
    breakpoint.addEventListener('change', closeIfDesktop);
    return () => breakpoint.removeEventListener('change', closeIfDesktop);
  }, [onCloseMobile]);

  function content(compact: boolean, mobile: boolean) {
    return (
      <div className={`sidebar-shell ${compact ? 'sidebar-collapsed' : ''}`}>
        <div className="sidebar-brand">
          <Link to="/" aria-label="ChainGuard overview" onClick={mobile ? onCloseMobile : undefined}><TraceXLogo compact={compact} /></Link>
          {mobile && <button type="button" onClick={onCloseMobile} className="icon-button" aria-label="Close navigation menu"><X size={18} /></button>}
        </div>
        {!compact && <Link to="/dataset" className="sidebar-workspace" onClick={mobile ? onCloseMobile : undefined}>
          <span className="workspace-monogram">B</span>
          <span className="min-w-0 flex-1"><span className="block text-ink">Bitcoin workspace</span><span className="block text-[9px] text-ink-muted mt-0.5">Elliptic dataset</span></span>
          <ChevronDown size={13} className="text-ink-muted" />
        </Link>}
        <nav aria-label={mobile ? 'Mobile navigation' : 'Primary navigation'} className="sidebar-navigation">
          {navGroups.map((group) => <div key={group.label}>
            {!compact && <div className="nav-group-label">{group.label}</div>}
            {group.items.map((item) => <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={mobile ? onCloseMobile : undefined}
              title={compact ? item.name : undefined}
              aria-label={compact ? item.name : undefined}
              className={({ isActive }) => `sidebar-link ${isActive || (item.path === '/investigations' && location.pathname.startsWith('/cases/')) ? 'is-current' : ''}`}
            >
              <item.icon size={17} strokeWidth={1.65} />
              {!compact && <span>{item.name}</span>}
            </NavLink>)}
          </div>)}
        </nav>
        <div className="sidebar-footer">
          {!compact && <>
            <div className="sidebar-footer-title"><span className={`status-dot ${health?.database.connected ? 'text-signal-licit' : 'text-ink-muted'}`} />{health?.database.connected ? 'API connected' : 'Connection unverified'}</div>
            <div className="sidebar-footer-detail">{health?.database.provider === 'Local Developer Storage' ? 'Local SQLite storage' : health?.database.provider || 'Waiting for backend'}</div>
          </>}
          {!mobile && <button type="button" className="btn-ghost sidebar-collapse" onClick={onToggleCollapse} aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'} title={compact ? 'Expand sidebar' : undefined}>
            {compact ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}{!compact && <span>Collapse sidebar</span>}
          </button>}
        </div>
      </div>
    );
  }

  return <>
    <aside className={`hidden lg:block flex-shrink-0 h-dvh print:hidden transition-[width] duration-200 ${collapsed ? 'w-[72px]' : 'w-[236px]'}`}>
      {content(collapsed, false)}
    </aside>
    <dialog ref={dialogRef} className="mobile-nav-dialog print:hidden" aria-label="Workspace navigation" onClose={onCloseMobile} onCancel={(event) => { event.preventDefault(); onCloseMobile(); }} onClick={(event) => { if (event.target === event.currentTarget) onCloseMobile(); }}>
      {content(false, true)}
    </dialog>
  </>;
}
