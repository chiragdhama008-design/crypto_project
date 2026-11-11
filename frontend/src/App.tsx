import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { PageSkeleton } from './components/common/LoadingSkeleton';
import { api } from './services/api';
import type { SystemHealth } from './types/api';

const Overview = lazy(() => import('./pages/Overview').then((module) => ({ default: module.Overview })));
const Investigations = lazy(() => import('./pages/Investigations').then((module) => ({ default: module.Investigations })));
const CaseDetail = lazy(() => import('./pages/CaseDetail').then((module) => ({ default: module.CaseDetail })));
const Transactions = lazy(() => import('./pages/Transactions').then((module) => ({ default: module.Transactions })));
const TransactionInvestigation = lazy(() => import('./pages/TransactionInvestigation').then((module) => ({ default: module.TransactionInvestigation })));
const GraphExplorer = lazy(() => import('./pages/GraphExplorer').then((module) => ({ default: module.GraphExplorer })));
const RiskAlerts = lazy(() => import('./pages/RiskAlerts').then((module) => ({ default: module.RiskAlerts })));
const ModelPerformance = lazy(() => import('./pages/ModelPerformance').then((module) => ({ default: module.ModelPerformance })));
const Analytics = lazy(() => import('./pages/Analytics').then((module) => ({ default: module.Analytics })));
const Reports = lazy(() => import('./pages/Reports').then((module) => ({ default: module.Reports })));
const Dataset = lazy(() => import('./pages/Dataset').then((module) => ({ default: module.Dataset })));
const Methodology = lazy(() => import('./pages/Methodology').then((module) => ({ default: module.Methodology })));

function Workspace() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('tracex-sidebar') === 'collapsed'; } catch { return false; }
  });
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const firstRoute = useRef(true);

  useEffect(() => {
    let active = true;
    api.getHealth().then((result) => { if (active) setHealth(result); }).catch(() => { if (active) setHealth(null); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
    if (!firstRoute.current) mainRef.current?.focus({ preventScroll: true });
    firstRoute.current = false;
  }, [location.pathname]);

  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try { localStorage.setItem('tracex-sidebar', next ? 'collapsed' : 'expanded'); } catch { /* Storage is optional. */ }
  }

  return (
    <div className="app-shell-root flex h-dvh w-full overflow-hidden bg-canvas text-ink font-sans">
      <a href="#main-content" className="skip-link">Skip to workspace</a>
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        health={health}
      />
      <div className="flex-1 min-w-0 flex flex-col h-dvh overflow-hidden">
        <TopBar onOpenMobileMenu={() => setMobileMenuOpen(true)} health={health} />
        <main id="main-content" ref={mainRef} tabIndex={-1} className="app-shell-main flex-1 min-h-0 overflow-y-auto forensic-canvas-bg outline-none">
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/investigations" element={<Investigations />} />
              <Route path="/cases/:caseId" element={<CaseDetail />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/transactions/:transactionId" element={<TransactionInvestigation />} />
              <Route path="/graph" element={<GraphExplorer />} />
              <Route path="/risk" element={<RiskAlerts />} />
              <Route path="/models" element={<ModelPerformance />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/dataset" element={<Dataset />} />
              <Route path="/methodology" element={<Methodology />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export function App() {
  return <BrowserRouter><Workspace /></BrowserRouter>;
}

export default App;
