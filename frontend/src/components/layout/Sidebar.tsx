import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutGrid,
  Calendar,
  FileEdit,
  BarChart3,
  Sparkles,
  Image,
  TrendingUp,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clapperboard,
  Scale,
  X,
  FolderKanban,
  Check,
  LogOut,
} from 'lucide-react';
import { useCMS } from '../../context/CMSContext';

export const Sidebar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar,
    totalTeamDebt,
    currentWorkspace,
    workspaces,
    activeWorkspaceId,
    selectWorkspace,
    logout,
    setShowWorkspacePicker,
  } = useCMS();

  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const workspaceSwitcherRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isWorkspaceMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (workspaceSwitcherRef.current && !workspaceSwitcherRef.current.contains(event.target as Node)) {
        setIsWorkspaceMenuOpen(false);
      }
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsWorkspaceMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isWorkspaceMenuOpen]);

  const navigationGroups = [
    {
      groupTitle: 'WORKSPACE',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
        { id: 'calendar', label: 'Calendar', icon: Calendar },
        { id: 'workspace', label: 'Workspace', icon: FileEdit },
        { id: 'kanban', label: 'Production', icon: BarChart3 },
      ],
    },
    {
      groupTitle: 'CREATIVE TOOLS',
      items: [
        { id: 'ai', label: 'AI Assistant', icon: Sparkles },
        { id: 'media', label: 'Media', icon: Image },
      ],
    },
    {
      groupTitle: 'MANAGEMENT',
      items: [
        { id: 'performance', label: 'Performance', icon: TrendingUp },
        { id: 'debt', label: 'Content Debt', icon: Scale, badge: totalTeamDebt > 0 ? `${totalTeamDebt} Debt` : undefined },
        { id: 'team', label: 'Team', icon: Users },
        { id: 'workspace-management', label: 'Workspaces', icon: FolderKanban },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ];

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/20 z-40 lg:hidden backdrop-blur-[1px]"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-50 flex flex-col bg-white text-slate-700 transition-all duration-300 ease-in-out border-r border-slate-200 overflow-visible max-w-[calc(100vw-1rem)] ${
          sidebarOpen ? 'w-[232px] translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-[76px]'
        }`}
      >
        <div className={`h-20 flex items-center border-b border-slate-200 shrink-0 bg-white ${sidebarOpen ? 'justify-between px-3 sm:px-5' : 'justify-center px-0'}`}>
          <div className={`flex items-center overflow-hidden ${sidebarOpen ? 'gap-3.5' : 'justify-center'}`}>
            <div className="w-10 h-10 rounded-xl bg-[#F5C518] text-[#111827] flex items-center justify-center shrink-0 shadow-sm">
              <Clapperboard className="w-5 h-5 stroke-[2.2]" />
            </div>

            {sidebarOpen && (
              <div className="flex flex-col truncate">
                <span className="font-bold text-slate-900 text-[15px] tracking-tight leading-snug">
                  {currentWorkspace?.name ?? 'UniFlow'}
                </span>
                <span className="text-[12px] text-slate-500 font-normal truncate">
                  CMS Workspace
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 text-slate-500 hover:text-slate-700 rounded-md hover:bg-slate-100"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div ref={workspaceSwitcherRef} className="px-3 pt-3 shrink-0 relative">
          <button
            type="button"
            onClick={() => setIsWorkspaceMenuOpen((prev) => !prev)}
            className={`workspace-switcher-trigger group relative flex items-center border border-[#CBD5E1] bg-white text-left transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 ${
              sidebarOpen ? 'justify-between gap-2 px-2 w-full' : 'justify-center px-2 w-full'
            }`}
            aria-label="Switch workspace"
            aria-expanded={isWorkspaceMenuOpen}
          >
            <span className="flex min-w-0 items-center gap-2.5 max-w-full">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F5C518]/20 text-slate-800">
                <Clapperboard className="h-3.5 w-3.5 stroke-[2.2]" />
              </span>

              {sidebarOpen && (
                <span className="min-w-0 truncate text-xs font-medium text-slate-800">
                  {currentWorkspace?.name ?? 'Workspace'}
                </span>
              )}
            </span>

            {sidebarOpen && (
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
                  isWorkspaceMenuOpen ? 'rotate-180' : ''
                }`}
              />
            )}
          </button>

          {isWorkspaceMenuOpen && (
            <div className={`workspace-switcher-menu absolute ${sidebarOpen ? 'left-0 right-0' : 'left-0 w-[220px]'} top-[calc(100%+6px)] z-[60] max-h-[min(60vh,360px)] overflow-y-auto border shadow-[0_12px_24px_rgba(15,23,42,0.14)]`}>
              {workspaces.map((workspace) => {
                const isActive = workspace.id === activeWorkspaceId;

                return (
                  <button
                    key={workspace.id}
                    type="button"
                    onClick={() => {
                      selectWorkspace(workspace.id);
                      setIsWorkspaceMenuOpen(false);
                    }}
                    className={`workspace-switcher-option flex w-full items-center gap-2.5 text-left transition-colors duration-200 ${
                      isActive ? 'bg-amber-50 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isActive ? 'bg-[#F5C518]/25 text-slate-900' : 'bg-slate-100 text-slate-500'}`}>
                      <Clapperboard className="h-3.5 w-3.5 stroke-[2.1]" />
                    </span>

                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {workspace.name}
                    </span>

                    {isActive && <Check className="h-4 w-4 shrink-0 text-[#F5C518]" />}
                  </button>
                );
              })}
              <div className="my-1 border-t border-slate-100" />
              <button
                type="button"
                onClick={() => {
                  setShowWorkspacePicker(true);
                  setIsWorkspaceMenuOpen(false);
                }}
                className="workspace-switcher-option flex w-full items-center gap-2.5 text-left text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  <LayoutGrid className="h-3.5 w-3.5" />
                </span>
                <span className="truncate">All Workspaces</span>
              </button>
            </div>
          )}
        </div>

          <nav className="flex-1 overflow-y-auto px-3.5 py-3 space-y-5 no-scrollbar">
          {navigationGroups.map((group) => (
            <div key={group.groupTitle} className="space-y-1">
              {sidebarOpen && (
                <div className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  {group.groupTitle}
                </div>
              )}

              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id || (item.id === 'workspace' && activeTab === 'storyboard');
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      if (window.innerWidth < 1024) setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all group relative ${
                      isActive
                        ? 'bg-slate-100 text-slate-900 font-semibold'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                    title={!sidebarOpen ? item.label : undefined}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-transform ${
                        isActive ? 'text-[#F5C518]' : 'text-slate-500 group-hover:text-slate-700'
                      }`}
                    />
                    {sidebarOpen && <span className="truncate">{item.label}</span>}

                    {item.badge && sidebarOpen && (
                      <span className="ml-auto text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-[#F5C518]/15 text-slate-700 border border-[#F5C518]/20">
                        {item.badge}
                      </span>
                    )}

                    {item.badge && !sidebarOpen && (
                      <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#F5C518]" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2 px-2.5 py-2 border-t border-slate-200 bg-slate-50">
          <button
            onClick={logout}
            className={`flex min-w-0 items-center gap-2 rounded-lg p-2 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 ${sidebarOpen ? 'flex-1' : 'w-full justify-center'}`}
            aria-label="Log out"
            title="Log out"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {sidebarOpen && <span className="truncate text-[11px] font-medium">Log out</span>}
          </button>

          <button
            onClick={toggleSidebar}
            className="hidden p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-md transition-colors lg:block"
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </aside>
    </>
  );
};
