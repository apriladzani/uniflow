import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  Plus,
  Eye,
  Edit2,
  Trash2,
  Calendar as CalendarIcon,
  List,
  Columns,
} from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { ContentItem } from '../../types/cms';

interface CalendarViewProps {
  onOpenCreateWithDate: (date: string) => void;
  onOpenEditModal: (content: ContentItem) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  onOpenCreateWithDate,
  onOpenEditModal,
}) => {
  const {
    contents,
    activeWorkspaceId,
    members,
    settings,
    deleteContent,
    setSelectedContentId,
    setActiveTab,
  } = useCMS();

  // Calendar UI state
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'list'>('month');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [selectedMember, setSelectedMember] = useState<string>('all');
  const [selectedPillar, setSelectedPillar] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Start on the current month, while keeping the existing month navigation.
  const [currentYear, setCurrentYear] = useState<number>(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(() => new Date().getMonth());

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  // Published items belong on their actual publication date; all other content
  // remains scheduled on its target date.
  const calendarDate = (content: ContentItem) => content.status === 'Published' && content.actualPublishDate
    ? content.actualPublishDate.slice(0, 10)
    : content.targetPublishDate;
  const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  // The API is workspace scoped; apply the active workspace key at the view boundary too.
  const filteredContents = contents.filter((c) => {
    if (c.workspaceId !== activeWorkspaceId) return false;
    if (selectedPlatform !== 'all' && c.platform !== selectedPlatform) return false;
    if (selectedMember !== 'all' && c.picId !== selectedMember && !c.contributorIds.includes(selectedMember)) return false;
    if (selectedPillar !== 'all' && c.pillar !== selectedPillar) return false;
    if (searchQuery.trim() && !c.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Calculate calendar days for month view
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sunday

  // Days array (adjusted for Monday start: 0 = Mon, 6 = Sun)
  const startOffset = (firstDayOfWeek + 6) % 7;
  const calendarCells: { dayNumber: number | null; dateString: string }[] = [];

  for (let i = 0; i < startOffset; i++) {
    calendarCells.push({ dayNumber: null, dateString: '' });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(currentMonth + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const dateString = `${currentYear}-${mm}-${dd}`;
    calendarCells.push({ dayNumber: d, dateString });
  }

  const getPlatformStyle = (p: string) => {
    switch (p) {
      case 'Instagram':
        return 'border-rose-400 bg-rose-50/90 text-rose-900';
      case 'TikTok':
        return 'border-slate-800 bg-slate-900 text-white';
      case 'YouTube':
        return 'border-red-500 bg-red-50 text-red-900';
      case 'LinkedIn':
        return 'border-blue-500 bg-blue-50 text-blue-900';
      default:
        return 'border-sky-500 bg-sky-50 text-sky-900';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Published':
        return 'bg-emerald-100 text-emerald-800';
      case 'Scheduled':
        return 'bg-teal-100 text-teal-800';
      case 'Review':
      case 'Revision':
        return 'bg-amber-100 text-amber-800';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Filter & View Controls */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Navigation month/year */}
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-slate-900 font-mono">
              {monthNames[currentMonth]} {currentYear}
            </h2>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={handlePrevMonth}
                className="p-1 hover:bg-white rounded text-slate-600 hover:text-slate-900 transition-colors"
                aria-label="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setCurrentMonth(9);
                  setCurrentYear(2026);
                }}
                className="px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-white rounded transition-colors"
              >
                Today
              </button>
              <button
                onClick={handleNextMonth}
                className="p-1 hover:bg-white rounded text-slate-600 hover:text-slate-900 transition-colors"
                aria-label="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* View mode segmented controls */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('month')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                viewMode === 'month' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Month</span>
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                viewMode === 'week' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Week</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                viewMode === 'list' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100 text-xs">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search content title..."
              className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#F5C518]"
            />
          </div>

          {/* Platform filter */}
          <select
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#F5C518]"
          >
            <option value="all">All Platforms</option>
            {settings.platforms.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          {/* Member filter */}
          <select
            value={selectedMember}
            onChange={(e) => setSelectedMember(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#F5C518]"
          >
            <option value="all">All Members (PIC & Contributors)</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          {/* Pillar filter */}
          <select
            value={selectedPillar}
            onChange={(e) => setSelectedPillar(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#F5C518]"
          >
            <option value="all">All Content Pillars</option>
            {settings.contentPillars.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      {/* MONTH VIEW */}
      {viewMode === 'month' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          {/* Day of week headers */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center py-2.5 text-xs font-bold text-slate-600">
            <div>Monday</div>
            <div>Tuesday</div>
            <div>Wednesday</div>
            <div>Thursday</div>
            <div>Friday</div>
            <div className="text-amber-700">Saturday</div>
            <div className="text-rose-600">Sunday</div>
          </div>

          {/* Month grid cells */}
          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-100 min-h-[580px]">
            {calendarCells.map((cell, idx) => {
              if (!cell.dayNumber) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="bg-slate-50/40 p-2 min-h-[95px] text-slate-300"
                  />
                );
              }

              const dayContents = filteredContents.filter((c) => calendarDate(c) === cell.dateString);

              const isToday = cell.dateString === dateKey(new Date());

              return (
                <div
                  key={cell.dateString}
                  className={`p-2 min-h-[105px] flex flex-col justify-between hover:bg-slate-50/70 transition-colors group relative ${
                    isToday ? 'bg-amber-50/30' : 'bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`text-xs font-mono font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                        isToday
                          ? 'bg-[#F5C518] text-[#111827] shadow-xs'
                          : 'text-slate-700 group-hover:text-black'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>

                    {/* Quick add button */}
                    <button
                      onClick={() => onOpenCreateWithDate(cell.dateString)}
                      title={`Schedule content on ${cell.dateString}`}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-200 rounded transition-opacity"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Day items */}
                  <div className="space-y-1 flex-1 overflow-y-auto max-h-24">
                    {dayContents.map((content) => (
                      <div
                        key={content.id}
                        onClick={() => {
                          setSelectedContentId(content.id);
                          setActiveTab('workspace');
                        }}
                        className={`p-1.5 rounded-md text-[11px] border cursor-pointer transition-all hover:scale-[1.01] shadow-2xs ${getPlatformStyle(
                          content.platform
                        )}`}
                        title={`${content.title} (${content.status})`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="font-bold text-[9px] uppercase tracking-wide opacity-80">
                            {content.platform}
                          </span>
                          <span className="text-[9px] font-mono px-1 rounded bg-black/10">
                            {content.status}
                          </span>
                        </div>
                        <p className="line-clamp-2 font-semibold leading-tight">
                          {content.title}
                        </p>
                      </div>
                    ))}
                  </div>

                  {dayContents.length === 0 && (
                    <div className="text-[10px] text-slate-300 italic self-end opacity-0 group-hover:opacity-100">
                      Empty
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* WEEK VIEW */}
      {viewMode === 'week' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
          {(() => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const monday = new Date(today);
            monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
            const days = Array.from({ length: 7 }, (_, index) => {
              const date = new Date(monday);
              date.setDate(monday.getDate() + index);
              const dateString = dateKey(date);
              return { date: dateString, label: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), highlight: dateString === dateKey(today) };
            });
            const weekEnd = new Date(monday);
            weekEnd.setDate(weekEnd.getDate() + 6);
            const weeklyItems = filteredContents.filter((content) => days.some((day) => day.date === calendarDate(content)));
            return <>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              Production Schedule: {monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </h3>
            <span className="text-xs text-slate-500 font-mono">Scheduled Items: {weeklyItems.length}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {days.map((day) => {
              const dayItems = filteredContents.filter((c) => calendarDate(c) === day.date);
              return (
                <div
                  key={day.date}
                  className={`rounded-xl border p-3 flex flex-col justify-between min-h-[300px] ${
                    day.highlight
                      ? 'border-[#F5C518] bg-amber-50/30'
                      : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800">{day.label}</span>
                    <button
                      onClick={() => onOpenCreateWithDate(day.date)}
                      className="p-1 hover:bg-slate-200 rounded text-slate-500"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2 flex-1 overflow-y-auto">
                    {dayItems.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          setSelectedContentId(item.id);
                          setActiveTab('workspace');
                        }}
                        className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs cursor-pointer hover:border-slate-400 text-xs transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-slate-700">{item.platform}</span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-medium ${getStatusBadge(item.status)}`}>
                            {item.status}
                          </span>
                        </div>
                        <p className="font-semibold text-slate-900 line-clamp-2">{item.title}</p>
                        <div className="text-[10px] text-slate-400 mt-1">PIC: {members.find(m => m.id === item.picId)?.name}</div>
                      </div>
                    ))}

                    {dayItems.length === 0 && (
                      <div className="text-center py-8 text-xs text-slate-400">
                        No releases
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
            </>;
          })()}
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Content Title</th>
                  <th className="py-3 px-3">Platform</th>
                  <th className="py-3 px-3">Pillar</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">PIC & Contributors</th>
                  <th className="py-3 px-3">Target Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredContents.map((content) => {
                  const pic = members.find((m) => m.id === content.picId);
                  return (
                    <tr key={content.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900 max-w-xs truncate">
                        <button
                          onClick={() => {
                            setSelectedContentId(content.id);
                            setActiveTab('workspace');
                          }}
                          className="hover:underline text-left text-slate-900 truncate block w-full"
                        >
                          {content.title}
                        </button>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-medium text-slate-700">{content.platform}</span>
                        <span className="text-[10px] text-slate-400 block">{content.format}</span>
                      </td>
                      <td className="py-3 px-3 text-slate-600 whitespace-nowrap">{content.pillar}</td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${getStatusBadge(content.status)}`}>
                          {content.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-semibold text-slate-800">{pic?.name || 'UIM Crew'}</span>
                        <span className="text-[10px] text-slate-400 block">
                          +{content.contributorIds.length} eligible credits
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-slate-800 whitespace-nowrap">
                        {content.targetPublishDate}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedContentId(content.id);
                              setActiveTab('workspace');
                            }}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                            title="Open Workspace"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onOpenEditModal(content)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                            title="Edit Content"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete content "${content.title}"?`)) {
                                deleteContent(content.id);
                              }
                            }}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
