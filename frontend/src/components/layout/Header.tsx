import React from 'react';
import { Menu, Plus, Bell, Search } from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { apiUrl } from '../../api/client';

interface HeaderProps {
  onOpenCreateModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenCreateModal }) => {
  const { activeTab, setActiveTab, setSidebarOpen, showToast, currentWorkspace, userProfile } = useCMS();
  const userInitials = userProfile.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || '?';

  const getPageTitle = (tab: string) => {
    switch (tab) {
      case 'dashboard':
        return 'Dashboard';
      case 'calendar':
        return 'Content Calendar';
      case 'kanban':
        return 'Production Board';
      case 'workspace':
        return 'Content Workspace';
      case 'workspace-management':
        return 'Manage Workspace';
      case 'storyboard':
        return 'Content Workspace';
      case 'media':
        return 'Media Library';
      case 'ai':
        return 'AI Content Assistant';
      case 'performance':
        return 'Team Performance & Content Debt';
      case 'debt':
        return 'Content Debt Review';
      case 'team':
        return 'Team Management';
      case 'settings':
        return 'System Settings';
      case 'profile':
        return 'Profile';
      default:
        return 'Workspace CMS';
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-4 lg:px-6 flex items-center justify-between gap-4 sticky top-0 z-30 shadow-2xs">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-md hover:bg-slate-100"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-sm">
          <span className="font-bold text-slate-900">{currentWorkspace?.name ?? 'UniFlow'}</span>
          <span className="text-slate-300 font-light">/</span>
          <h1 className="text-sm font-medium text-slate-600 whitespace-nowrap">{getPageTitle(activeTab)}</h1>
        </div>
      </div>

      <div className="hidden md:flex items-center flex-1 max-w-md mx-4">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search content, scripts, materials, or team..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F5C518]/50 focus:border-[#F5C518] transition-all"
            onChange={(event) => {
              if (event.target.value.length > 2) {
                showToast('info', 'Search filter active', `Filtering data for "${event.target.value}"`);
              }
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={() => showToast('info', 'System status', 'The publishing pipeline and CDN connection are operating normally.')}
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors relative"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#F5C518]" />
        </button>

        <button
          onClick={onOpenCreateModal}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#111827] bg-[#F5C518] hover:bg-[#E5B510] active:scale-98 rounded-lg shadow-xs transition-all whitespace-nowrap"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>New content</span>
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          className="h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-line transition hover:ring-2 hover:ring-primary"
          aria-label={`Profile: ${userProfile.name}`}
          title={userProfile.name}
        >
          {userProfile.avatarUrl ? (
            <img
              src={userProfile.avatarUrl.startsWith('/api/') ? apiUrl(userProfile.avatarUrl.slice(4)) : userProfile.avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-primary text-xs font-bold text-ink">{userInitials}</span>
          )}
        </button>
      </div>
    </header>
  );
};
