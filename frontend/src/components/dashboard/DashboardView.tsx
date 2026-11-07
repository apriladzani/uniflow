import React from 'react';
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Scale,
  Award,
  ArrowUpRight,
  Calendar as CalendarIcon,
  PlayCircle,
  ExternalLink,
} from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { parseLocalDateTime } from '../../utils/date';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

export const DashboardView: React.FC = () => {
  const {
    contents,
    activeWorkspaceId,
    members,
    weeklyCreditHistory,
    totalTeamDebt,
    activityLogs,
    debtSummaries,
    setActiveTab,
    setSelectedContentId,
  } = useCMS();
  const workspaceContents = contents.filter((content) => content.workspaceId === activeWorkspaceId);
  const publishedContents = workspaceContents.filter((content) => content.status === 'Published');
  const totalPublishedCount = publishedContents.length;
  const totalInProductionCount = workspaceContents.filter((content) => content.status !== 'Published' && content.status !== 'Planning').length;
  const totalWaitingReviewCount = workspaceContents.filter((content) => content.status === 'Review' || content.status === 'Revision').length;
  const today = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
  const totalOverdueCount = workspaceContents.filter((content) => content.status !== 'Published' && content.targetPublishDate < today).length;
  const totalTeamPublishedCredits = members.reduce((total, member) => total + member.totalPublishedCredits, 0);

  // Weekly target for the entire team (sum of member targets)
  const totalWeeklyTarget = members.reduce((sum, m) => sum + (m.weeklyTarget || 2), 0);

  // Data for weekly publishing performance chart
  const currentWeekStart = new Date();
  currentWeekStart.setHours(0, 0, 0, 0);
  currentWeekStart.setDate(currentWeekStart.getDate() - ((currentWeekStart.getDay() + 6) % 7));
  const formatDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const creditsByWeek = new Map(weeklyCreditHistory.map((week) => [week.weekStart, week.credits]));
  const weeklyChartData = Array.from({ length: 4 }, (_, index) => {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(weekStart.getDate() - (3 - index) * 7);
    const nextWeekStart = new Date(weekStart);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    const weekContents = publishedContents.filter((content) => {
      if (!content.actualPublishDate) return false;
      const publishDate = parseLocalDateTime(content.actualPublishDate);
      return publishDate >= weekStart && publishDate < nextWeekStart;
    });
    return {
      week: `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${index === 3 ? ' (Current)' : ''}`,
      target: totalWeeklyTarget,
      published: weekContents.length,
      teamCredits: creditsByWeek.get(formatDateKey(weekStart)) || 0,
    };
  });

  // Upcoming contents (scheduled or in review with close deadlines)
  const upcomingContents = workspaceContents
    .filter((c) => c.status !== 'Published')
    .sort((a, b) => a.targetPublishDate.localeCompare(b.targetPublishDate))
    .slice(0, 5);

  const getPlatformBadge = (platform: string) => {
    switch (platform) {
      case 'Instagram':
        return 'text-rose-600 bg-rose-50 border-rose-200';
      case 'TikTok':
        return 'text-slate-900 bg-slate-100 border-slate-300';
      case 'YouTube':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'LinkedIn':
        return 'text-blue-700 bg-blue-50 border-blue-200';
      default:
        return 'text-sky-600 bg-sky-50 border-sky-200';
    }
  };

  const stageCounts: Record<string, number> = {
    Planning: workspaceContents.filter((c) => c.status === 'Planning').length,
    Scripting: workspaceContents.filter((c) => c.status === 'Scripting').length,
    Shooting: workspaceContents.filter((c) => c.status === 'Shooting').length,
    Editing: workspaceContents.filter((c) => c.status === 'Editing').length,
    Review: workspaceContents.filter((c) => c.status === 'Review' || c.status === 'Revision').length,
    Scheduled: workspaceContents.filter((c) => c.status === 'Scheduled' || c.status === 'Approved').length,
    Published: workspaceContents.filter((c) => c.status === 'Published').length,
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200/60 inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#F5C518]" />
            Active Production Cycle: Week 43 (October 2026)
          </span>
          <h2 className="text-xl font-bold text-slate-900 mt-2">
            Welcome to Uni Inside Media CMS
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Integrated content operating system for student editorial pipelines, multimedia assets, and contributor accountability.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setActiveTab('calendar')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <CalendarIcon className="w-4 h-4 text-slate-500" />
            <span>Open Calendar</span>
          </button>
        </div>
      </div>

      {/* 8 Primary KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* Total Content */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-medium">Total Content</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-bold text-slate-900 font-mono tabular-nums">
            {workspaceContents.length}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Across all stages</span>
        </div>

        {/* Published */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-600 mb-1">
            <span className="text-[11px] font-medium text-slate-600">Published</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-emerald-600 font-mono tabular-nums">
            {totalPublishedCount}
          </div>
          <span className="text-[10px] text-emerald-600 mt-0.5 block">Unique live releases</span>
        </div>

        {/* In Production */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-blue-600 mb-1">
            <span className="text-[11px] font-medium text-slate-600">In Production</span>
            <PlayCircle className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-bold text-blue-600 font-mono tabular-nums">
            {totalInProductionCount}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Scripting - Editing</span>
        </div>

        {/* Awaiting Review */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-amber-600 mb-1">
            <span className="text-[11px] font-medium text-slate-600">Review</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-amber-600 font-mono tabular-nums">
            {totalWaitingReviewCount}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Pending approval</span>
        </div>

        {/* Overdue */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-rose-600 mb-1">
            <span className="text-[11px] font-medium text-slate-600">Overdue</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl font-bold text-rose-600 font-mono tabular-nums">
            {totalOverdueCount}
          </div>
          <span className="text-[10px] text-rose-600 mt-0.5 block">Past deadline</span>
        </div>

        {/* Weekly Target */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-medium">Team Target</span>
            <Award className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-slate-900 font-mono tabular-nums">
            {totalWeeklyTarget}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">2 credits / member</span>
        </div>

        {/* Content Credits */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-[#F5C518] mb-1">
            <span className="text-[11px] font-medium text-slate-600">Credits Earned</span>
            <span className="text-xs font-bold text-[#F5C518] bg-[#111827] px-1.5 py-0.2 rounded">
              UIM
            </span>
          </div>
          <div className="text-xl font-bold text-slate-900 font-mono tabular-nums">
            {totalTeamPublishedCredits}
          </div>
          <span className="text-[10px] text-emerald-600 mt-0.5 block">Verified & distributed</span>
        </div>

        {/* Content Debt */}
        <div
          onClick={() => setActiveTab('performance')}
          className="bg-white p-3.5 rounded-xl border border-amber-200/90 shadow-2xs hover:border-amber-400 cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-amber-600 mb-1">
            <span className="text-[11px] font-semibold text-amber-900">Total Debt</span>
            <Scale className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-amber-600 font-mono tabular-nums">
            {totalTeamDebt}
          </div>
          <span className="text-[10px] text-amber-700 mt-0.5 block underline">
            View breakdown →
          </span>
        </div>
      </div>

      {/* Grid: Charts & Production Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Publishing Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Weekly Publishing & Contributor Performance
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Target quota vs unique published releases & earned member credits
              </p>
            </div>
            <button
              onClick={() => setActiveTab('performance')}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
            >
              <span>Detailed Analytics</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#111827',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                    border: 'none',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="target" name="Team Target" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="published" name="Unique Published" fill="#F5C518" radius={[4, 4, 0, 0]} />
                <Bar dataKey="teamCredits" name="Distributed Credits" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Production Stage Funnel */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Active Pipeline Stages</h3>
              <button
                onClick={() => setActiveTab('kanban')}
                className="text-xs text-slate-500 hover:text-slate-900 font-medium"
              >
                Kanban Board →
              </button>
            </div>

            <div className="space-y-2.5">
              {[
                { stage: 'Planning (Brief & Ideation)', count: stageCounts.Planning, color: 'bg-slate-400' },
                { stage: 'Scripting (Writing)', count: stageCounts.Scripting, color: 'bg-indigo-500' },
                { stage: 'Shooting (Principal Take)', count: stageCounts.Shooting, color: 'bg-purple-500' },
                { stage: 'Editing (Post Production)', count: stageCounts.Editing, color: 'bg-blue-500' },
                { stage: 'Review / Revision', count: stageCounts.Review, color: 'bg-amber-500' },
                { stage: 'Scheduled / Ready', count: stageCounts.Scheduled, color: 'bg-teal-500' },
                { stage: 'Published (Live)', count: stageCounts.Published, color: 'bg-emerald-500' },
              ].map((item) => (
                <div key={item.stage} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${item.color}`} />
                    <span className="text-slate-600">{item.stage}</span>
                  </div>
                  <span className="font-mono tabular-nums font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 mt-4">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Production Pipeline Velocity</span>
                  <span className="font-mono font-semibold text-slate-800">{workspaceContents.length ? Math.round((totalPublishedCount / workspaceContents.length) * 100) : 0}%</span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div className="bg-[#F5C518] h-2 rounded-full" style={{ width: `${workspaceContents.length ? Math.round((totalPublishedCount / workspaceContents.length) * 100) : 0}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Upcoming Releases & Live Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming Content */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Upcoming Content Deadlines</h3>
              <p className="text-xs text-slate-500 mt-0.5">Content currently in final production stages</p>
            </div>
            <button
              onClick={() => setActiveTab('calendar')}
              className="text-xs text-slate-600 hover:text-slate-900 font-semibold"
            >
              View Full Calendar
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {upcomingContents.map((content) => {
              const pic = members.find((m) => m.id === content.picId);
              return (
                <div
                  key={content.id}
                  onClick={() => {
                    setSelectedContentId(content.id);
                    setActiveTab('workspace');
                  }}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/80 px-2 rounded-lg cursor-pointer transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${getPlatformBadge(
                          content.platform
                        )}`}
                      >
                        {content.platform}
                      </span>
                      <span className="text-[11px] text-slate-400">·</span>
                      <span className="text-[11px] text-slate-500 truncate">{content.pillar}</span>
                      <span className="text-[11px] text-slate-400">·</span>
                      <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded">
                        {content.status}
                      </span>
                    </div>
                    <h4 className="text-xs font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                      {content.title}
                    </h4>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-xs">
                    <div className="text-right">
                      <span className="text-slate-500 text-[11px] block">Target Date:</span>
                      <span className="font-mono tabular-nums font-semibold text-slate-800">
                        {content.targetPublishDate}
                      </span>
                    </div>
                    <div className="w-7 h-7 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-[11px] font-bold text-slate-700" title={pic?.name}>
                      {pic ? pic.name[0] : 'U'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Activity Feed */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">Recent Team Activity</h3>
            <span className="text-[11px] text-slate-400 font-mono">Live Log</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 max-h-80">
            {activityLogs.slice(0, 6).map((log) => (
              <div key={log.id} className="flex items-start gap-3 text-xs">
                <div
                  className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    log.badgeType === 'success'
                      ? 'bg-emerald-500'
                      : log.badgeType === 'warning'
                      ? 'bg-amber-500'
                      : log.badgeType === 'alert'
                      ? 'bg-rose-500'
                      : 'bg-blue-500'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-0.5">
                    <span className="font-semibold text-slate-700">{log.actorName}</span>
                    <span className="font-mono">{log.timestamp}</span>
                  </div>
                  <p className="text-slate-600 text-xs leading-relaxed">{log.action}</p>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => setActiveTab('workspace')}
            className="w-full mt-3 pt-3 border-t border-slate-100 text-xs font-semibold text-slate-600 hover:text-slate-900 text-center"
          >
            Open Content Workspace →
          </button>
        </div>
      </div>

      {/* Team Performance Summary Quick Preview */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Team Performance & Content Debt Summary</h3>
            <p className="text-xs text-slate-500">
              Weekly quota: 2 credits per member · Deficits roll over as content debt at weekly closing
            </p>
          </div>
          <button
            onClick={() => setActiveTab('performance')}
            className="text-xs font-semibold text-[#111827] bg-[#F5C518] hover:bg-[#E5B510] px-3 py-1.5 rounded-lg transition-colors"
          >
            Open Performance & Debt Portal
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {debtSummaries.slice(0, 4).map((summary) => (
            <div
              key={summary.memberId}
              className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold text-xs text-slate-900 truncate">{summary.memberName}</div>
                  <span
                    className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${
                      summary.currentDebt > 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {summary.currentDebt > 0 ? `Debt: ${summary.currentDebt}` : 'Settled (0)'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mb-3 truncate">{summary.role}</div>

                <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                  <span>Quota Progress</span>
                  <span className="font-mono font-bold">{summary.eligibleCredits} / {summary.weeklyTarget} Credits</span>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-[#F5C518] h-1.5 rounded-full"
                    style={{ width: `${Math.min(100, (summary.eligibleCredits / summary.weeklyTarget) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
                <span>In Production:</span>
                <span className="font-mono font-medium text-slate-800">{summary.pendingPublicationCount} projects</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
