import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  Layers,
  Network,
  ShieldAlert,
  Cpu,
  BarChart3,
  FileText,
  Database,
  BookOpen,
  Terminal
} from 'lucide-react';

const navItems = [
  { name: 'Overview', path: '/', icon: LayoutDashboard },
  { name: 'Investigations', path: '/investigations', icon: Briefcase },
  { name: 'Transactions', path: '/transactions', icon: Layers },
  { name: 'Graph Explorer', path: '/graph', icon: Network },
  { name: 'Risk & Alerts', path: '/risk', icon: ShieldAlert },
  { name: 'ML Models', path: '/models', icon: Cpu },
  { name: 'Analytics', path: '/analytics', icon: BarChart3 },
  { name: 'Reports', path: '/reports', icon: FileText },
];

const bottomItems = [
  { name: 'Dataset Schema', path: '/dataset', icon: Database },
  { name: 'Methodology', path: '/methodology', icon: BookOpen },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-56 bg-[#1a1a1a] text-[#9ca3af] flex flex-col h-screen border-r border-[#333333] select-none flex-shrink-0">
      {/* Main Navigation */}
      <div className="flex-1 py-2 px-1.5 overflow-y-auto space-y-0.5">
        <div className="px-3 py-1 text-[10px] font-mono font-semibold text-[#6b7280] uppercase tracking-wider">
          Forensic Problems
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center space-x-2.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-[#2a2a2a] text-[#ffa116] border-l-2 border-[#ffa116] font-semibold'
                    : 'text-[#9ca3af] hover:bg-[#222222] hover:text-[#eff1f6]'
                }`
              }
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </div>

      {/* Bottom Meta Navigation */}
      <div className="p-2 border-t border-[#333333] space-y-0.5 bg-[#171717]">
        <div className="px-2.5 py-1 text-[10px] font-mono font-semibold text-[#6b7280] uppercase tracking-wider">
          Intelligence Core
        </div>
        {bottomItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center space-x-2.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-[#262626] text-[#eff1f6] border-l-2 border-[#00b8a3]'
                    : 'text-[#9ca3af] hover:bg-[#222222] hover:text-[#eff1f6]'
                }`
              }
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0 text-[#6b7280]" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}

        {/* Live Node Pill */}
        <div className="pt-2 px-2.5 flex items-center justify-between text-[11px] text-[#8c8c8c] border-t border-[#262626] mt-2 font-mono">
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-[#00b8a3] animate-pulse"></span>
            <span className="text-[10px] text-[#eff1f6]">Node Active</span>
          </span>
          <span className="text-[10px] text-[#ffa116]">BTC 49-STEPS</span>
        </div>
      </div>
    </aside>
  );
};
