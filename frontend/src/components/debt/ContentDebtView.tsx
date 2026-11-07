import React, { useState } from 'react';
import {
  Scale,
  Award,
  Calendar,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  RotateCcw,
  Clock,
  ArrowRight,
  TrendingDown,
} from 'lucide-react';
import { useCMS } from '../../context/CMSContext';

export const ContentDebtView: React.FC = () => {
  const {
    debtSummaries,
    totalTeamDebt,
    totalTeamPublishedCredits,
    closeWeeklyPeriod,
    members,
    showToast,
  } = useCMS();

  const [selectedMemberModal, setSelectedMemberModal] = useState<string | null>(null);

  const selectedMemberSummary = debtSummaries.find((s) => s.memberId === selectedMemberModal);

  return (
    <div className="space-y-5">
      {/* Top Banner explaining the System */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Credit Evaluation & Team Accountability System
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-xs font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              Total Team Debt: {totalTeamDebt} Credits
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Content Debt Management
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Uni Inside Media accountability mechanism: Each member has a weekly quota of 2 content credits. Published content automatically satisfies member obligations when verified as contributors.
          </p>
        </div>

        {/* Action Button: Close Weekly Period */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => {
              if (
                confirm(
                  'Execute simulated Weekly Closing? Unfulfilled targets will convert to outstanding debt and carry forward to the next period.'
                )
              ) {
                closeWeeklyPeriod();
              }
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#111827] hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow-xs transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#F5C518]" />
            <span>Close Weekly Period</span>
          </button>
        </div>
      </div>

      {/* Formula & Business Rule Card */}
      <div className="bg-amber-50/50 border border-amber-200/80 rounded-2xl p-4 text-xs space-y-2">
        <div className="flex items-center gap-2 text-amber-900 font-bold">
          <HelpCircle className="w-4 h-4 text-amber-600" />
          <span>Mathematical Content Debt Formula:</span>
        </div>
        <div className="p-3 bg-white rounded-xl border border-amber-200 font-mono text-slate-800 text-xs">
          Outstanding Debt = MAX( 0, [Previous Debt] + [Weekly Target] - [Eligible Published Credits] )
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 text-[11px] text-slate-600">
          <div>• <strong>Live Published Only:</strong> Credits require an official live URL and verified contributors.</div>
          <div>• <strong>Multi-Contributor:</strong> 1 piece of content credits multiple team members with no duplicates.</div>
          <div>• <strong>Carry-Forward:</strong> Unfulfilled debts carry forward to subsequent cycles until compensated.</div>
        </div>
      </div>

      {/* Debt Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            Member Quota & Debt Ledgers (Cycle: Week 43)
          </h3>
          <span className="text-xs text-slate-500 font-mono">
            {members.length} Registered Members
          </span>
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
                <th className="py-3 px-3">Outstanding Debt</th>
                <th className="py-3 px-3">Attainment</th>
                <th className="py-3 px-4 text-right">Audit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {debtSummaries.map((summary) => (
                <tr key={summary.memberId} className="hover:bg-slate-50/80 transition-colors">
                  {/* Name */}
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

                  {/* Weekly target */}
                  <td className="py-3 px-3 font-mono tabular-nums text-slate-700">
                    {summary.weeklyTarget} Credits
                  </td>

                  {/* Previous Debt */}
                  <td className="py-3 px-3 font-mono tabular-nums text-slate-500">
                    {summary.previousDebt > 0 ? `${summary.previousDebt} Credits` : '—'}
                  </td>

                  {/* Eligible credits earned */}
                  <td className="py-3 px-3 font-mono tabular-nums font-bold text-emerald-600">
                    +{summary.eligibleCredits} Credits
                  </td>

                  {/* Pending publication count */}
                  <td className="py-3 px-3 font-mono tabular-nums text-blue-600">
                    {summary.pendingPublicationCount} Projects
                  </td>

                  {/* Current Debt (Outstanding) */}
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

                  {/* Achievement rate */}
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

                  {/* Detail modal trigger */}
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => setSelectedMemberModal(summary.memberId)}
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

      {/* MEMBER DEBT DETAIL AUDIT MODAL */}
      {selectedMemberSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Content Debt Audit: {selectedMemberSummary.memberName}
                </h3>
                <p className="text-xs text-slate-500">{selectedMemberSummary.role}</p>
              </div>
              <button
                onClick={() => setSelectedMemberModal(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            {/* Calculations breakdown */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
              <span className="font-bold text-slate-900 block">Calculation Breakdown for Current Cycle:</span>
              <div className="flex justify-between text-slate-600">
                <span>Previous Debt Carried Forward:</span>
                <span className="font-mono font-bold">{selectedMemberSummary.previousDebt} Credits</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Current Weekly Target:</span>
                <span className="font-mono font-bold">+{selectedMemberSummary.weeklyTarget} Credits</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Eligible Live Published Credits:</span>
                <span className="font-mono font-bold">-{selectedMemberSummary.eligibleCredits} Credits</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900 text-sm">
                <span>Active Outstanding Debt:</span>
                <span className="font-mono text-amber-700">{selectedMemberSummary.currentDebt} Credits</span>
              </div>
            </div>

            {/* Historical weeks breakdown */}
            <div className="space-y-2 text-xs">
              <span className="font-bold text-slate-800 block">3-Period Historical Audit Trail:</span>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                {selectedMemberSummary.history.map((hist) => (
                  <div key={hist.week} className="p-2.5 flex items-center justify-between">
                    <span className="font-medium text-slate-700">{hist.week}</span>
                    <div className="flex items-center gap-4 text-slate-600 font-mono text-[11px]">
                      <span>Target: {hist.target}</span>
                      <span className="text-emerald-600 font-semibold">Credits: {hist.credits}</span>
                      <span className="text-amber-700 font-bold">Debt: {hist.debt}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedMemberModal(null)}
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
