import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Database, ArrowUpRight, Menu, Sun, Moon, ChevronRight, Pause, Play, Command, CornerDownLeft, Network, Layers, ShieldAlert, Briefcase, Cpu, BarChart3, FileText, BookOpen, LayoutDashboard } from 'lucide-react';
import { api } from '../../services/api';
import type { SystemHealth } from '../../types/api';
import { useTheme } from '../../context/ThemeContext';
import { useMotion } from '../../context/MotionContext';
import { Modal } from '../common/Modal';

interface TopBarProps { onOpenMobileMenu: () => void; health: SystemHealth | null }

const destinations = [
  { path: '/', label: 'Overview', section: 'Workspace', icon: LayoutDashboard },
  { path: '/risk', label: 'Risk & alerts', section: 'Workspace', icon: ShieldAlert },
  { path: '/transactions', label: 'Transactions', section: 'Workspace', icon: Layers },
  { path: '/graph', label: 'Graph explorer', section: 'Workspace', icon: Network },
  { path: '/investigations', label: 'Investigations', section: 'Workspace', icon: Briefcase },
  { path: '/models', label: 'Model evaluation', section: 'Intelligence', icon: Cpu },
  { path: '/analytics', label: 'Analytics', section: 'Intelligence', icon: BarChart3 },
  { path: '/reports', label: 'Reports', section: 'Intelligence', icon: FileText },
  { path: '/dataset', label: 'Dataset', section: 'Resources', icon: Database },
  { path: '/methodology', label: 'Methodology', section: 'Resources', icon: BookOpen },
];

type SearchResult = Awaited<ReturnType<typeof api.searchTransactions>>[number];

export function TopBar({ onOpenMobileMenu, health }: TopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { motionEnabled, toggleMotion } = useMotion();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState<{ query: string; results: SearchResult[]; error: string | null }>({ query: '', results: [], error: null });
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmedQuery = query.trim();
  const results = searchState.query === trimmedQuery ? searchState.results : [];
  const searching = open && !!trimmedQuery && searchState.query !== trimmedQuery;
  const searchError = searchState.query === trimmedQuery ? searchState.error : null;

  const current = destinations.find((item) => item.path === location.pathname) || (location.pathname.startsWith('/cases/') ? { section: 'Workspace', label: 'Investigation' } : { section: 'Workspace', label: 'Transaction detail' });
  const matches = destinations.filter((item) => !query.trim() || item.label.toLowerCase().includes(query.trim().toLowerCase()));
  const options = [...matches.map((item) => ({ ...item, description: item.section })), ...results.map((tx) => ({ path: `/transactions/${tx.transaction_id}`, label: `Transaction #${tx.transaction_id}`, icon: Layers, description: `Step ${tx.time_step} / ${tx.known_label.toLowerCase()}` }))];

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      if (((event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) || (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey)) && !document.querySelector('dialog[open]')) {
        event.preventDefault();
        setQuery('');
        setSelected(0);
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || !trimmedQuery) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.searchTransactions(trimmedQuery, controller.signal)
        .then((data) => { if (!controller.signal.aborted) setSearchState({ query: trimmedQuery, results: data, error: null }); })
        .catch((error: Error) => { if (!controller.signal.aborted) setSearchState({ query: trimmedQuery, results: [], error: error.message || 'Transaction search is unavailable.' }); });
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [trimmedQuery, open]);

  useEffect(() => {
    if (open) document.getElementById(`command-option-${selected}`)?.scrollIntoView({ block: 'nearest' });
  }, [selected, open]);

  useEffect(() => { document.title = `${current.label} | TRACE-X`; }, [current.label]);

  function closeSearch() { setOpen(false); setQuery(''); setSelected(0); }
  function openSearch() { setOpen(true); setQuery(''); setSelected(0); }
  function choose(path: string) { closeSearch(); navigate(path); }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (options[selected]) choose(options[selected].path);
    else if (query.trim()) choose(`/transactions?search=${encodeURIComponent(query.trim())}`);
  }

  return <>
    <header className="workspace-topbar print:hidden">
      <div className="flex items-center gap-3 min-w-0">
        <button type="button" className="icon-button lg:hidden" onClick={onOpenMobileMenu} aria-label="Open navigation menu"><Menu size={20} /></button>
        <div className="workspace-breadcrumb">
          <span className="hidden sm:inline">{current.section}</span><ChevronRight size={12} className="hidden sm:block opacity-50" /><strong className="truncate">{current.label}</strong>
        </div>
      </div>
      <div className="topbar-tools">
        <button type="button" className="command-trigger" onClick={openSearch} aria-label="Search workspace and transactions" aria-haspopup="dialog"><Search size={14} /><span>Search workspace...</span><kbd>Ctrl K</kbd></button>
        <button type="button" className="storage-status hidden xl:flex" onClick={() => navigate('/dataset')} title="View dataset and storage status"><span className={`status-dot ${health?.database.connected ? 'text-signal-licit' : ''}`} /><span>{health?.database.provider === 'Local Developer Storage' ? 'Local workspace' : health?.database.provider || 'Unverified connection'}</span></button>
        <button type="button" className="icon-button" onClick={toggleMotion} title={motionEnabled ? 'Pause animations' : 'Enable animations'} aria-label={motionEnabled ? 'Pause animations' : 'Enable animations'} aria-pressed={!motionEnabled}>{motionEnabled ? <Pause size={15} /> : <Play size={15} />}</button>
        <button type="button" className="icon-button" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
      </div>
    </header>
    <Modal open={open} onClose={closeSearch} title="Search workspace" description="Find an indexed transaction or jump to a page." className="command-modal">
      <form onSubmit={submit}>
        <label className="sr-only" htmlFor="workspace-search">Transaction ID or page name</label>
        <div className="relative">
          <Search size={18} className="absolute left-3 top-3.5 text-ink-muted" />
          <input ref={inputRef} id="workspace-search" autoComplete="off" autoFocus className="field-input pl-10" placeholder="Try a transaction ID, graph, or models..." value={query} onChange={(event) => { setQuery(event.target.value); setSelected(0); }} role="combobox" aria-expanded="true" aria-controls="workspace-search-results" aria-autocomplete="list" aria-activedescendant={options[selected] ? `command-option-${selected}` : undefined} onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && options.length) { event.preventDefault(); setSelected((index) => (index + 1) % options.length); }
            if (event.key === 'ArrowUp' && options.length) { event.preventDefault(); setSelected((index) => (index - 1 + options.length) % options.length); }
          }} />
        </div>
        <div className="command-results" id="workspace-search-results" role="listbox" aria-label="Search results">
          {options.map((item, index) => <button key={item.path} id={`command-option-${index}`} type="button" role="option" aria-selected={selected === index} className="command-option" onMouseEnter={() => setSelected(index)} onClick={() => choose(item.path)}>
            <item.icon size={18} strokeWidth={1.6} /><span className="flex-1 min-w-0"><span className="block text-[12px]">{item.label}</span><small>{item.description}</small></span><CornerDownLeft size={14} className="opacity-40" />
          </button>)}
        </div>
        <div role="status" className="text-[11px] text-ink-muted mt-2">
          {searching ? 'Searching indexed transactions...' : searchError || (query.trim() && results.length === 0 ? 'No indexed transaction matches. Dataset reference records are not searchable until indexed.' : '')}
        </div>
        {query.trim() && !searching && <button type="button" className="text-link w-full" onClick={() => choose(`/transactions?search=${encodeURIComponent(query.trim())}`)}>Search the transaction ledger<ArrowUpRight size={14} /></button>}
        <div className="command-footer"><span><kbd>Up / Down</kbd> Navigate</span><span><kbd>Enter</kbd> Open</span><span className="ml-auto"><Command size={12} className="inline mr-1" />Esc to close</span></div>
      </form>
    </Modal>
  </>;
}
