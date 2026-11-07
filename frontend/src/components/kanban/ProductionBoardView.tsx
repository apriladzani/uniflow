import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  Lock,
} from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { ProductionStage, ContentItem } from '../../types/cms';
import { localDateKey } from '../../utils/date';

interface ProductionBoardViewProps {
  onOpenPublishModal: (content: ContentItem) => void;
}

export const ProductionBoardView: React.FC<ProductionBoardViewProps> = ({
  onOpenPublishModal,
}) => {
  const {
    contents,
    activeWorkspaceId,
    members,
    settings,
    changeContentStatus,
    setSelectedContentId,
    setActiveTab,
    showToast,
  } = useCMS();

  const [platformFilter, setPlatformFilter] = useState('all');
  const [memberFilter, setMemberFilter] = useState('all');

  const STAGES: { id: ProductionStage; label: string; desc: string; color: string }[] = [
    { id: 'Planning', label: 'Planning', desc: 'Brief & research', color: 'border-slate-300' },
    { id: 'Scripting', label: 'Scripting', desc: 'Script drafting', color: 'border-indigo-400' },
    { id: 'Shooting', label: 'Shooting', desc: 'Principal footage take', color: 'border-purple-400' },
    { id: 'Editing', label: 'Editing', desc: 'Post-production cut', color: 'border-blue-400' },
    { id: 'Review', label: 'Review', desc: 'Editorial review', color: 'border-amber-400' },
    { id: 'Revision', label: 'Revision', desc: 'Revision adjustments', color: 'border-rose-400' },
    { id: 'Approved', label: 'Approved', desc: 'Signed off for release', color: 'border-teal-400' },
    { id: 'Scheduled', label: 'Scheduled', desc: 'Queued for time slot', color: 'border-cyan-400' },
    { id: 'Published', label: 'Published', desc: 'Live & credited', color: 'border-emerald-500' },
  ];

  const filteredContents = contents.filter((c) => {
    if (c.workspaceId !== activeWorkspaceId) return false;
    if (platformFilter !== 'all' && c.platform !== platformFilter) return false;
    if (memberFilter !== 'all' && c.picId !== memberFilter && !c.contributorIds.includes(memberFilter)) return false;
    return true;
  });

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'High':
        return 'text-rose-700 bg-rose-50 border-rose-200';
      case 'Medium':
        return 'text-amber-700 bg-amber-50 border-amber-200';
      default:
        return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  const getPlatformBadge = (platform: string) => {
    switch (platform) {
      case 'Instagram':
        return 'text-rose-700 bg-rose-50';
      case 'TikTok':
        return 'text-slate-900 bg-slate-100';
      case 'YouTube':
        return 'text-red-700 bg-red-50';
      case 'LinkedIn':
        return 'text-blue-700 bg-blue-50';
      default:
        return 'text-sky-700 bg-sky-50';
    }
  };

  const handleMoveStage = async (content: ContentItem, direction: 'next' | 'prev') => {
    const currentIndex = STAGES.findIndex((s) => s.id === content.status);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (targetIndex < 0 || targetIndex >= STAGES.length) return;

    const targetStage = STAGES[targetIndex].id;

    // Check if moving to Published
    if (targetStage === 'Published') {
      if (!content.publishedUrl || !content.actualPublishDate || !content.verifiedAt || content.contributorIds.length === 0) {
        onOpenPublishModal(content);
        return;
      }
    }

    await changeContentStatus(content.id, targetStage);
  };

  return (
    <div className="space-y-4">
      {/* Board Header & Filters */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Production Board (9-Stage Kanban Pipeline)
          </h2>
          <p className="text-xs text-slate-500">
            Track and progress content deliverables from planning brief to verified publication
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Platform Filter */}
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
          >
            <option value="all">All Platforms</option>
            {settings.platforms.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          {/* Member Filter */}
          <select
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
          >
            <option value="all">All Members</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

        </div>
      </div>

      {/* Horizontal Kanban Scroll Area */}
      <div className="overflow-x-auto pb-4">
        <div className="flex items-start gap-3.5 min-w-[1950px]">
          {STAGES.map((stage, stageIndex) => {
            const columnContents = filteredContents.filter((c) => c.status === stage.id);
            return (
              <div
                key={stage.id}
                className={`w-72 bg-slate-100/70 rounded-2xl border-t-4 ${stage.color} border-x border-b border-slate-200/80 p-3 flex flex-col max-h-[calc(100vh-210px)]`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between mb-1 pb-2 border-b border-slate-200/80">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">{stage.label}</span>
                    <span className="text-[10px] text-slate-500 block truncate">{stage.desc}</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-800 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    {columnContents.length}
                  </span>
                </div>

                {/* Cards List */}
                <div className="flex-1 overflow-y-auto space-y-2.5 pt-2 pr-0.5">
                  {columnContents.map((content) => {
                    const pic = members.find((m) => m.id === content.picId);
                    const isOverdue =
                      content.status !== 'Published' &&
                      content.targetPublishDate < localDateKey();

                    return (
                      <div
                        key={content.id}
                        className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs hover:shadow-sm hover:border-slate-300 transition-all flex flex-col justify-between space-y-2 group"
                      >
                        {/* Platform & Priority */}
                        <div className="flex items-center justify-between gap-1 text-[10px]">
                          <span className={`font-bold px-1.5 py-0.2 rounded ${getPlatformBadge(content.platform)}`}>
                            {content.platform}
                          </span>
                          <span className={`px-1.5 py-0.2 rounded border font-semibold ${getPriorityStyle(content.priority)}`}>
                            {content.priority}
                          </span>
                        </div>

                        {/* Title */}
                        <button
                          onClick={() => {
                            setSelectedContentId(content.id);
                            setActiveTab('workspace');
                          }}
                          className="text-left font-semibold text-xs text-slate-900 group-hover:text-blue-600 line-clamp-2 leading-snug"
                        >
                          {content.title}
                        </button>

                        {/* Pillar */}
                        <div className="text-[10px] text-slate-500 truncate">
                          {content.pillar}
                        </div>

                        {/* Deadlines & Overdue Flag */}
                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 text-slate-500">
                          <span className="flex items-center gap-1 font-mono tabular-nums">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {content.targetPublishDate}
                          </span>
                          {isOverdue && (
                            <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1 rounded flex items-center gap-0.5">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              Overdue
                            </span>
                          )}
                        </div>

                        {/* Contributors & PIC */}
                        <div className="flex items-center justify-between pt-1 text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px]" title={pic?.name}>
                              {pic ? pic.name[0] : 'U'}
                            </div>
                            <span className="text-slate-700 truncate max-w-[100px] text-[11px] font-medium">
                              {pic?.name.split(' ')[0]}
                            </span>
                          </div>

                          <span className="text-[10px] text-slate-400 font-mono">
                            +{content.contributorIds.length} credits
                          </span>
                        </div>

                        {/* Stage transition controls */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                          <button
                            disabled={stageIndex === 0}
                            onClick={() => handleMoveStage(content, 'prev')}
                            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-800 disabled:opacity-20 transition-colors"
                            title="Move to previous stage"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              setSelectedContentId(content.id);
                              setActiveTab('workspace');
                            }}
                            className="text-[10px] font-semibold text-slate-600 hover:text-slate-900"
                          >
                            Workspace
                          </button>

                          <button
                            disabled={stageIndex === STAGES.length - 1}
                            onClick={() => handleMoveStage(content, 'next')}
                            className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 disabled:opacity-20 transition-colors"
                            title="Move to next stage"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {columnContents.length === 0 && (
                    <div className="py-12 text-center text-[11px] text-slate-400 italic">
                      No items
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
