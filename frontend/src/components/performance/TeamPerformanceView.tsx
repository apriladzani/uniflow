import React, { useState } from 'react';
import {
  BarChart3,
  Award,
  Scale,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Calendar,
  Filter,
  RotateCcw,
  HelpCircle,
} from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { localDateKey } from '../../utils/date';
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

export const TeamPerformanceView: React.FC = () => {
  const {
    members,
    debtSummaries,
    totalTeamPublishedCredits,
    totalTeamDebt,
    creditHistory,
    contents,
    closeWeeklyPeriod,
  } = useCMS();

  const [activeSubTab, setActiveSubTab] = useState<'analytics' | 'debt'>('analytics');
  const [selectedMemberId, setSelectedMemberId] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter'>('week');
  const [selectedAuditMember, setSelectedAuditMember] = useState<string | null>(null);

  // Member performance data for bar chart
  const memberChartData = debtSummaries.map((s) => ({
    name: s.memberName.split(' ')[0],
    target: s.weeklyTarget,
    credits: s.eligibleCredits,
    debt: s.currentDebt,
    achievement: s.achievementRate,
  }));

  // Platform distribution of published content
  const platformStats: Record<string, number> = {};
  contents.forEach((c) => {
    if (c.status === 'Published') {
      platformStats[c.platform] = (platformStats[c.platform] || 0) + 1;
    }
  });

  const platformData = Object.entries(platformStats).map(([name, count]) => ({
    name,
    count,
  }));

  // Tasks metrics
  let totalTasks = 0;
  let completedTasks = 0;
  contents.forEach((c) => {
    c.tasks.forEach((t) => {
      totalTasks++;
      if (t.completed) completedTasks++;
    });
  });

  const overdueTasks = contents.reduce(
    (acc, c) =>
      acc +
      c.tasks.filter(
        (t) => !t.completed && t.dueDate < localDateKey()
      ).length,
    0
  );

  const filteredSummaries =
    selectedMemberId === 'all'
      ? debtSummaries
      : debtSummaries.filter((s) => s.memberId === selectedMemberId);

  const selectedAudit = debtSummaries.find((s) => s.memberId === selectedAuditMember);

  return (
    <div className="space-y-5">
      {/* Top Banner & Sub-Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Management Intelligence
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-xs font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              Active Cycle: Week 43
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Team Performance & Content Debt
          </h2>
          <p className="text-xs text-slate-500">
            Weekly output analytics, contributor credit attribution, and debt carry-forward balance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sub-tab toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs">
            <button
              onClick={() => setActiveSubTab('analytics')}
              className={`px-3 py-1.5 font-bold rounded-lg transition-colors ${
                activeSubTab === 'analytics'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Performance Analytics
            </button>
            <button
              onClick={() => setActiveSubTab('debt')}
              className={`px-3 py-1.5 font-bold rounded-lg transition-colors ${
                activeSubTab === 'debt'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Content Debt Audit ({totalTeamDebt} Debt)
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 block mb-1">
            Verified Published Credits
          </span>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {totalTeamPublishedCredits}
          </div>
          <span className="text-[10px] text-emerald-600 mt-1 block">
            Across live verified posts
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 block mb-1">
            Weekly Quota Attainment
          </span>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-600">
            {Math.round((totalTeamPublishedCredits / (members.length * 2)) * 100)}%
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            Team Quota: {members.length * 2} credits
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 block mb-1">
            Cumulative Content Debt
          </span>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-600">
            {totalTeamDebt} Credits
          </div>
          <span className="text-[10px] text-amber-700 mt-1 block">
            Subject to weekly carry-forward
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 block mb-1">
            Production Tasks Completed
          </span>
          <div className="text-2xl font-bold font-mono tabular-nums text-blue-600">
            {completedTasks} / {totalTasks}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            {overdueTasks > 0 ? `${overdueTasks} tasks overdue` : 'All tasks on schedule'}
          </span>
        </div>
      </div>

      {/* SUB-TAB 1: ANALYTICS */}
      {activeSubTab === 'analytics' && (
        <div className="space-y-5">
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Content Credit History</h3>
                <p className="mt-0.5 text-xs text-slate-500">Award records from verified publications.</p>
              </div>
              <Award className="h-5 w-5 text-amber-500" />
            </div>
            {creditHistory.length ? <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-2.5">Contributor</th><th className="px-5 py-2.5">Content</th><th className="px-5 py-2.5">Published</th><th className="px-5 py-2.5 text-right">Credits</th><th className="px-5 py-2.5">Status</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {creditHistory.slice(0, 12).map((credit) => <tr key={credit.id}>
                    <td className="px-5 py-3 font-semibold text-slate-700">{credit.userName}</td>
                    <td className="max-w-[260px] truncate px-5 py-3 text-slate-600" title={credit.contentTitle}>{credit.publishedUrl ? <a href={credit.publishedUrl} target="_blank" rel="noreferrer" className="hover:text-indigo-700 hover:underline">{credit.contentTitle}</a> : credit.contentTitle}<span className="ml-1.5 text-[10px] text-slate-400">{credit.platform}</span></td>
                    <td className="whitespace-nowrap px-5 py-3 text-slate-500">{credit.awardedAt || '—'}</td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-emerald-700">{credit.status === 'awarded' ? `+${credit.credits}` : credit.credits}</td>
                    <td className="px-5 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${credit.status === 'awarded' ? 'bg-emerald-50 text-emerald-700' : credit.status === 'revoked' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{credit.status}</span></td>
                  </tr>)}
                </tbody>
              </table>
            </div> : <p className="px-5 py-8 text-center text-xs text-slate-400">No content credit records yet.</p>}
          </div>
          {/* Chart Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Main Bar Chart: Target vs Credits per Member */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  Target Quota vs Earned Credits by Member
                </h3>
                <span className="text-xs font-mono text-slate-400">Current Week</span>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={memberChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} />
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
                    <Bar dataKey="target" name="Target (2)" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="credits" name="Earned Credits" fill="#F5C518" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="debt" name="Outstanding Debt" fill="#F43F5E" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Platform Breakdown */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-3">Live Content by Platform</h3>
                <div className="space-y-3 text-xs">
                  {platformData.map((item) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">{item.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-[#F5C518] h-2 rounded-full"
                            style={{ width: `${(item.count / Math.max(1, contents.filter(c => c.status === 'Published').length)) * 100}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-slate-900 w-6 text-right">
                          {item.count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <button
                  onClick={() => setActiveSubTab('debt')}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl"
                >
                  Inspect Content Debt Audit →
                </button>
              </div>
            </div>
          </div>

          {/* Member Performance Detail Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Member Performance Roster</h3>
              <span className="text-xs text-slate-400 font-mono">Week 43 Active Standings</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Member Name</th>
                    <th className="py-3 px-3">Role</th>
                    <th className="py-3 px-3">Weekly Target</th>
                    <th className="py-3 px-3">Credits Earned</th>
                    <th className="py-3 px-3">Progress (%)</th>
                    <th className="py-3 px-3">Pending Projects</th>
                    <th className="py-3 px-4 text-right">Active Debt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSummaries.map((s) => (
                    <tr key={s.memberId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900 flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs">
                          {s.memberName[0]}
                        </div>
                        <span>{s.memberName}</span>
                      </td>
                      <td className="py-3 px-3 text-slate-600">{s.role}</td>
                      <td className="py-3 px-3 font-mono tabular-nums text-slate-800">{s.weeklyTarget}</td>
                      <td className="py-3 px-3 font-mono tabular-nums font-bold text-emerald-600">
                        {s.eligibleCredits}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums font-semibold text-slate-900">
                        {s.achievementRate}%
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-blue-600">
                        {s.pendingPublicationCount} projects
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            s.currentDebt > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {s.currentDebt} Credits
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: CONTENT DEBT AUDIT */}
      {activeSubTab === 'debt' && (
        <div className="space-y-4">
          {/* Formula banner */}
          <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-4 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-900 font-bold">
                <HelpCircle className="w-4 h-4 text-amber-600" />
                <span>Mathematical Content Debt Formula:</span>
              </div>
              <button
                onClick={() => {
                  if (confirm('Execute simulated Weekly Closing? Unfulfilled targets will convert to outstanding debt and carry forward.')) {
                    closeWeeklyPeriod();
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#111827] hover:bg-slate-800 text-white font-bold rounded-lg text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#F5C518]" />
                <span>Close Weekly Period</span>
              </button>
            </div>

            <div className="p-3 bg-white rounded-xl border border-amber-200 font-mono text-slate-800 text-xs">
              Outstanding Debt = MAX( 0, [Previous Debt] + [Weekly Target] - [Eligible Published Credits] )
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 text-[11px] text-slate-600">
              <div>• <strong>Live Credit Only:</strong> Credits require an official live post link and verified contributors.</div>
              <div>• <strong>No Duplicate Credits:</strong> Contributors receive exactly 1 credit per published item.</div>
              <div>• <strong>Carry-Forward:</strong> Unsettled debt rolls over continuously until compensated with releases.</div>
            </div>
          </div>

          {/* Debt Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Member Quota & Debt Ledgers (Week 43)
              </h3>
              <span className="text-xs text-slate-500 font-mono">{members.length} Registered Members</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Member Name & Role</th>
                    <th className="py-3 px-3">Weekly Quota</th>
                    <th className="py-3 px-3">Previous Debt</th>
                    <th className="py-3 px-3">Earned Credits</th>
                    <th className="py-3 px-3">Pending Projects</th>
                    <th className="py-3 px-3">Current Debt</th>
                    <th className="py-3 px-3">Fulfilled (%)</th>
                    <th className="py-3 px-4 text-right">Audit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {debtSummaries.map((summary) => (
                    <tr key={summary.memberId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs">
                            {summary.memberName[0]}
                          </div>
                          <div>
                            <span className="block font-bold text-slate-900">{summary.memberName}</span>
                            <span className="block text-[10px] text-slate-400 font-normal">{summary.role}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3 font-mono tabular-nums text-slate-700">
                        {summary.weeklyTarget} Credits
                      </td>

                      <td className="py-3 px-3 font-mono tabular-nums text-slate-500">
                        {summary.previousDebt > 0 ? `${summary.previousDebt} Credits` : '—'}
                      </td>

                      <td className="py-3 px-3 font-mono tabular-nums font-bold text-emerald-600">
                        +{summary.eligibleCredits} Credits
                      </td>

                      <td className="py-3 px-3 font-mono tabular-nums text-blue-600">
                        {summary.pendingPublicationCount} Projects
                      </td>

                      <td className="py-3 px-3 font-mono tabular-nums">
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            summary.currentDebt > 0
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {summary.currentDebt > 0 ? `${summary.currentDebt} Credits` : 'Settled (0)'}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-[#F5C518] h-1.5 rounded-full"
                              style={{ width: `${Math.min(100, summary.achievementRate)}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] font-semibold text-slate-800">
                            {summary.achievementRate}%
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedAuditMember(summary.memberId)}
                          className="px-2.5 py-1 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded font-semibold text-[11px]"
                        >
                          Audit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MEMBER DEBT DETAIL AUDIT MODAL */}
      {selectedAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Content Debt Audit: {selectedAudit.memberName}
                </h3>
                <p className="text-xs text-slate-500">{selectedAudit.role}</p>
              </div>
              <button
                onClick={() => setSelectedAuditMember(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
              <span className="font-bold text-slate-900 block">Calculation Breakdown for Current Cycle:</span>
              <div className="flex justify-between text-slate-600">
                <span>Previous Debt Carried Forward:</span>
                <span className="font-mono font-bold">{selectedAudit.previousDebt} Credits</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Current Weekly Target:</span>
                <span className="font-mono font-bold">+{selectedAudit.weeklyTarget} Credits</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Eligible Live Published Credits:</span>
                <span className="font-mono font-bold">-{selectedAudit.eligibleCredits} Credits</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900 text-sm">
                <span>Active Outstanding Debt:</span>
                <span className="font-mono text-amber-700">{selectedAudit.currentDebt} Credits</span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <span className="font-bold text-slate-800 block">3-Period Historical Audit Trail:</span>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                {selectedAudit.history.map((hist) => (
                  <div key={hist.week} className="p-2.5 flex items-center justify-between">
                    <span className="font-medium text-slate-700">{hist.week}</span>
                    <div className="flex items-center gap-4 text-slate-600 font-mono text-[11px]">
                      <span>Target: {hist.target}</span>
                      <span className="text-emerald-600 font-semibold">Earned: {hist.credits}</span>
                      <span className="text-amber-700 font-bold">Debt: {hist.debt}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedAuditMember(null)}
                className="px-4 py-2 bg-[#111827] text-white text-xs font-bold rounded-lg"
              >
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
