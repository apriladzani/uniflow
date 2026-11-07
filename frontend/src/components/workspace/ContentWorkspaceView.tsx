import React, { useState } from 'react';
import {
  FileText,
  Clapperboard,
  Film,
  CheckSquare,
  MessageSquare,
  Share2,
  History,
  Info,
  Calendar,
  ExternalLink,
  Plus,
  Trash2,
  CheckCircle,
  AlertCircle,
  Copy,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { Scene, ProductionStage } from '../../types/cms';
import { StoryboardEditorView } from '../storyboard/StoryboardEditorView';
import { localDateKey } from '../../utils/date';

interface ContentWorkspaceViewProps {
  onOpenPublishModal: () => void;
  onOpenEditModal: () => void;
}

export const ContentWorkspaceView: React.FC<ContentWorkspaceViewProps> = ({
  onOpenPublishModal,
  onOpenEditModal,
}) => {
  const {
    contents,
    selectedContentId,
    setSelectedContentId,
    members,
    mediaAssets,
    updateContent,
    deleteContent,
    addScene,
    deleteScene,
    addTask,
    toggleTask,
    deleteTask,
    addReviewComment,
    attachAssetToContent,
    detachAssetFromContent,
    showToast,
  } = useCMS();

  const [activeTab, setActiveTab] = useState<string>('storyboard');
  const [deletingContent, setDeletingContent] = useState(false);

  // Script new block state
  const [newVisual, setNewVisual] = useState('');
  const [newAudio, setNewAudio] = useState('');
  const [newCue, setNewCue] = useState('');
  const [newDuration, setNewDuration] = useState(5);

  // Task form state
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState(members[0]?.id || '');
  const [newTaskDueDate, setNewTaskDueDate] = useState(localDateKey());

  // Review comment form state
  const [reviewText, setReviewText] = useState('');
  const [reviewStatus, setReviewStatus] = useState<'Comment' | 'Needs Revision' | 'Approved'>('Comment');
  const [reviewerId, setReviewerId] = useState(members[0]?.id || '');

  // Scene quick add state
  const [showAddSceneModal, setShowAddSceneModal] = useState(false);
  const [sceneTitle, setSceneTitle] = useState('');
  const [sceneDuration, setSceneDuration] = useState(5);
  const [sceneVisual, setSceneVisual] = useState('');
  const [sceneVo, setSceneVo] = useState('');
  const [sceneAngle, setSceneAngle] = useState<Scene['cameraAngle']>('Medium Shot');
  const [sceneTransition, setSceneTransition] = useState<Scene['transition']>('Cut');

  // Get active content
  const activeContent = contents.find((c) => c.id === selectedContentId) || contents[0];

  if (!activeContent) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <p className="text-sm text-slate-500">No content selected.</p>
      </div>
    );
  }

  const pic = members.find((m) => m.id === activeContent.picId);
  const contributors = members.filter((m) => activeContent.contributorIds.includes(m.id));

  const totalStoryboardDuration = activeContent.scenes.reduce(
    (sum, sc) => sum + (sc.durationSeconds || 0),
    0
  );

  const tabs = [
    { id: 'storyboard', label: 'Storyboard', icon: Clapperboard, count: activeContent.scenes.length },
    { id: 'footage', label: 'Footage', icon: Film, count: activeContent.attachedAssetIds.length },
    { id: 'review', label: 'Review', icon: MessageSquare, count: activeContent.reviewComments.length },
  ];

  const handleAddScriptBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVisual && !newAudio) return;
    const newBlock = {
      id: 'sb-' + Date.now(),
      cue: newCue || `Scene 00:${String(activeContent.scriptBlocks.length * 5).padStart(2, '0')}`,
      visual: newVisual,
      audio: newAudio,
      durationSec: Number(newDuration),
    };
    const saved = await updateContent(activeContent.id, {
      scriptBlocks: [...activeContent.scriptBlocks, newBlock],
    });
    if (!saved) return;
    setNewVisual('');
    setNewAudio('');
    setNewCue('');
    showToast('success', 'Script Block Added', 'Audio and visual cues saved to script.');
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    if (await addTask(activeContent.id, newTaskTitle, newTaskAssignee, newTaskDueDate)) setNewTaskTitle('');
  };

  const handleAddReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewText.trim()) return;
    if (await addReviewComment(activeContent.id, reviewText, reviewStatus, reviewerId)) setReviewText('');
  };

  const handleDeleteContent = async () => {
    const warning = activeContent.status === 'Published'
      ? `Delete "${activeContent.title}"? Published content with publication or credit history may be protected from deletion.`
      : `Delete "${activeContent.title}"? This action cannot be undone.`;
    if (deletingContent || !window.confirm(warning)) return;
    setDeletingContent(true);
    try {
      await deleteContent(activeContent.id);
    } finally {
      setDeletingContent(false);
    }
  };

  const handleAddSceneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sceneTitle.trim()) return;
    const saved = await addScene(activeContent.id, {
      title: sceneTitle,
      durationSeconds: Number(sceneDuration),
      visualDirection: sceneVisual,
      voiceOver: sceneVo,
      onScreenText: '',
      cameraAngle: sceneAngle,
      transition: sceneTransition,
    });
    if (saved) {
      setSceneTitle('');
      setSceneVisual('');
      setSceneVo('');
      setShowAddSceneModal(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Content Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 flex-1 min-w-0">
            {/* Badges */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                {activeContent.platform}
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-600 font-medium">{activeContent.format}</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-600">{activeContent.pillar}</span>
              <span className="text-slate-400">·</span>
              <span
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                  activeContent.status === 'Published'
                    ? 'bg-emerald-100 text-emerald-800'
                    : activeContent.status === 'Review'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {activeContent.status}
              </span>
            </div>

            {/* Title & Selector */}
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-slate-900 truncate">
                {activeContent.title}
              </h2>
              {/* Dropdown switch content */}
              <select
                value={activeContent.id}
                onChange={(e) => setSelectedContentId(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 max-w-xs truncate"
              >
                {contents.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.status})
                  </option>
                ))}
              </select>
            </div>

            <p className="text-xs text-slate-500 line-clamp-1">
              {activeContent.description || 'No premise or description provided.'}
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => void handleDeleteContent()}
              disabled={deletingContent}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 rounded-lg transition-colors"
              title="Delete this content"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{deletingContent ? 'Deleting…' : 'Delete Content'}</span>
            </button>
            <button
              onClick={onOpenEditModal}
              className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Edit Metadata
            </button>
            {activeContent.status !== 'Published' ? (
              <button
                onClick={onOpenPublishModal}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[#111827] bg-[#F5C518] hover:bg-[#E5B510] active:scale-98 rounded-lg shadow-xs transition-all"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Verify & Publish</span>
              </button>
            ) : (
              <a
                href={activeContent.publishedUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>View on {activeContent.platform}</span>
              </a>
            )}
          </div>
        </div>

        {/* Production workflow: Storyboard → Footage → Review */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-4 mt-4 border-t border-slate-100 text-xs no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#F5C518]' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                      isActive ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Content Specifications & Logistics</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-400 text-[11px] block">Person In Charge (PIC)</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block">{pic?.name}</span>
                  <span className="text-[10px] text-slate-400">{pic?.role}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-400 text-[11px] block">Target Release Date</span>
                  <span className="font-semibold text-slate-800 font-mono mt-0.5 block">
                    {activeContent.targetPublishDate}
                  </span>
                  <span className="text-[10px] text-slate-400">Calendar Schedule</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-400 text-[11px] block">Production Priority</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block">
                    {activeContent.priority} Priority
                  </span>
                  <span className="text-[10px] text-slate-400">Urgency Level</span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-700 mb-1.5">Editorial Description</h4>
                <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {activeContent.description}
                </p>
              </div>

              {/* Verified Contributors */}
              <div>
                <h4 className="text-xs font-semibold text-slate-700 mb-1.5">
                  Verified Contributors ({contributors.length} Credited Members)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {contributors.map((contrib) => (
                    <div
                      key={contrib.id}
                      className="flex items-center gap-2.5 p-2 bg-slate-50 rounded-lg border border-slate-200 text-xs"
                    >
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs">
                        {contrib.name[0]}
                      </div>
                      <div className="truncate">
                        <span className="font-semibold text-slate-800 block truncate">{contrib.name}</span>
                        <span className="text-[10px] text-slate-400 block truncate">{contrib.role}</span>
                      </div>
                      <span className="ml-auto text-[10px] font-mono font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                        1 Credit
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Publishing Checklist Sidebar */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900">Publishing Readiness</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                  <span>Script & Storyboard</span>
                  <span className="font-mono text-emerald-600 font-semibold">Complete</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                  <span>Footage & Audio B-Roll</span>
                  <span className="font-mono text-slate-600 font-semibold">
                    {activeContent.attachedAssetIds.length} Attached
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                  <span>Editorial Review</span>
                  <span
                    className={`font-mono font-semibold ${
                      activeContent.status === 'Approved' || activeContent.status === 'Published'
                        ? 'text-emerald-600'
                        : 'text-amber-600'
                    }`}
                  >
                    {activeContent.status === 'Published' ? 'Verified' : activeContent.status}
                  </span>
                </div>
              </div>

              {activeContent.status === 'Published' ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1">
                  <span className="font-bold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4" />
                    Officially Live & Verified
                  </span>
                  <p className="text-[11px] text-emerald-700 font-mono">
                    Time: {activeContent.actualPublishDate}
                  </p>
                  <a
                    href={activeContent.publishedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline block truncate font-mono mt-1"
                  >
                    {activeContent.publishedUrl}
                  </a>
                </div>
              ) : (
                <button
                  onClick={onOpenPublishModal}
                  className="w-full py-2.5 bg-[#F5C518] hover:bg-[#E5B510] font-bold text-[#111827] rounded-xl text-xs shadow-xs transition-colors"
                >
                  Open Publishing Portal
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SCRIPT EDITOR */}
      {activeTab === 'script' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Audio-Visual Script Editor</h3>
              <p className="text-xs text-slate-500">
                Structured two-column breakdown for visuals, voice-over audio narration, and timing cues
              </p>
            </div>
            <button
              onClick={() => {
                showToast('info', 'Script Formatted', 'Teleprompter text ready for copy.');
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy for Teleprompter</span>
            </button>
          </div>

          {/* Script Blocks Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <div className="grid grid-cols-12 bg-slate-50 p-3 font-bold text-slate-600 border-b border-slate-200">
              <div className="col-span-2">Scene Cue / Time</div>
              <div className="col-span-5">Visual Direction & Blocking</div>
              <div className="col-span-4">Audio / Voice-Over (Narration)</div>
              <div className="col-span-1 text-right">Duration</div>
            </div>

            <div className="divide-y divide-slate-100">
              {activeContent.scriptBlocks.map((block) => (
                <div key={block.id} className="grid grid-cols-12 p-3 hover:bg-slate-50/60 items-start gap-2">
                  <div className="col-span-2 font-mono font-bold text-slate-700">{block.cue}</div>
                  <div className="col-span-5 text-slate-800 leading-relaxed">{block.visual}</div>
                  <div className="col-span-4 text-slate-700 font-serif italic leading-relaxed">{block.audio}</div>
                  <div className="col-span-1 text-right font-mono tabular-nums text-slate-600">
                    {block.durationSec}s
                  </div>
                </div>
              ))}

              {activeContent.scriptBlocks.length === 0 && (
                <div className="p-6 text-center text-slate-400 text-xs">
                  No script entries recorded yet. Add the opening scene cue below.
                </div>
              )}
            </div>
          </div>

          {/* Add Script Form */}
          <form onSubmit={handleAddScriptBlock} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-800">Add New Script Segment</h4>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Time Cue / Scene Name</label>
                <input
                  type="text"
                  value={newCue}
                  onChange={(e) => setNewCue(e.target.value)}
                  placeholder="e.g., Hook 00:00-00:05"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Visual Direction</label>
                <input
                  type="text"
                  value={newVisual}
                  onChange={(e) => setNewVisual(e.target.value)}
                  placeholder="e.g., Host holds microphone in campus library"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Narration (Voice-Over)</label>
                <input
                  type="text"
                  value={newAudio}
                  onChange={(e) => setNewAudio(e.target.value)}
                  placeholder='e.g., "Most students never realize this secret..."'
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Duration (s)</label>
                <input
                  type="number"
                  min="1"
                  max="300"
                  value={newDuration}
                  onChange={(e) => setNewDuration(Number(e.target.value))}
                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-center text-slate-900"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 bg-[#F5C518] hover:bg-[#E5B510] text-[#111827] text-xs font-bold rounded-lg shadow-xs"
              >
                + Add Script Segment
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'storyboard' && <StoryboardEditorView />}

      {/* TAB 4: FOOTAGE & ASSETS */}
      {activeTab === 'footage' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Linked B-Roll & Footage Assets</h3>
              <p className="text-xs text-slate-500">
                Media repository synchronized with Kroombox CDN for this content item
              </p>
            </div>
            <button
              onClick={() => showToast('info', 'DAM Sync', 'Kroombox CDN index updated.')}
              className="text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg"
            >
              Sync Kroombox CDN
            </button>
          </div>

          {/* Attached Assets List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {mediaAssets
              .filter((a) => activeContent.attachedAssetIds.includes(a.id))
              .map((asset) => (
                <div
                  key={asset.id}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs shrink-0">
                      {asset.type.toUpperCase()}
                    </div>
                    <div className="truncate">
                      <span className="font-semibold text-slate-900 block truncate">{asset.name}</span>
                      <span className="text-[11px] text-slate-400 block font-mono">
                        {asset.folder} · {asset.fileSizeMb} MB · {asset.duration || asset.resolution}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => detachAssetFromContent(activeContent.id, asset.id)}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg shrink-0"
                    title="Detach footage"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
          </div>

          {/* Attach from existing Media Library */}
          <div className="pt-3 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-800 mb-2">Attach Footage from DAM Library</h4>
            <div className="flex flex-wrap gap-2">
              {mediaAssets
                .filter((a) => !activeContent.attachedAssetIds.includes(a.id))
                .map((asset) => (
                  <button
                    key={asset.id}
                    onClick={() => attachAssetToContent(activeContent.id, asset.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-slate-600" />
                    <span>{asset.name}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: TASKS */}
      {activeTab === 'tasks' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Production Tasks & Delegations</h3>
              <p className="text-xs text-slate-500">Track assignment checklists and sub-deadlines across divisions</p>
            </div>
            <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
              {activeContent.tasks.filter((t) => t.completed).length} / {activeContent.tasks.length} Completed
            </span>
          </div>

          {/* Task list */}
          <div className="divide-y divide-slate-100 text-xs">
            {activeContent.tasks.map((task) => {
              const assignee = members.find((m) => m.id === task.assigneeId);
              return (
                <div
                  key={task.id}
                  className="py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 px-2 rounded-lg"
                >
                  <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => toggleTask(activeContent.id, task.id)}
                      className="w-4 h-4 text-[#F5C518] rounded-sm"
                    />
                    <span
                      className={`font-medium ${
                        task.completed ? 'line-through text-slate-400' : 'text-slate-800'
                      }`}
                    >
                      {task.title}
                    </span>
                  </label>

                  <div className="flex items-center gap-3 text-[11px] text-slate-500 shrink-0">
                    <span className="font-semibold text-slate-700">{assignee?.name || 'Crew'}</span>
                    <span className="font-mono tabular-nums">{task.dueDate}</span>
                    <button
                      onClick={() => deleteTask(activeContent.id, task.id)}
                      className="p-1 text-slate-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {activeContent.tasks.length === 0 && (
              <div className="py-6 text-center text-slate-400 text-xs">
                No tasks logged for this content item.
              </div>
            )}
          </div>

          {/* Add task form */}
          <form onSubmit={handleCreateTask} className="pt-3 border-t border-slate-100 flex flex-wrap gap-2 text-xs">
            <input
              type="text"
              required
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="New task description (e.g., Record VO take 2)..."
              className="flex-1 min-w-[200px] px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
            />
            <select
              value={newTaskAssignee}
              onChange={(e) => setNewTaskAssignee(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={newTaskDueDate}
              onChange={(e) => setNewTaskDueDate(e.target.value)}
              className="px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-800"
            />
            <button
              type="submit"
              className="px-3.5 py-1.5 bg-[#F5C518] hover:bg-[#E5B510] text-[#111827] font-bold rounded-lg"
            >
              + Assign Task
            </button>
          </form>
        </div>
      )}

      {/* TAB 6: REVIEW */}
      {activeTab === 'review' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Internal Editorial Reviews & Feedback</h3>
              <p className="text-xs text-slate-500">
                Directorial approval and sign-offs before scheduling publication
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
              Status: {activeContent.status}
            </span>
          </div>

          {/* Feedback Comments History */}
          <div className="space-y-3 text-xs">
            {activeContent.reviewComments.map((comment) => (
              <div
                key={comment.id}
                className={`p-3.5 rounded-xl border ${
                  comment.status === 'Approved'
                    ? 'bg-emerald-50/50 border-emerald-200'
                    : comment.status === 'Needs Revision'
                    ? 'bg-amber-50/50 border-amber-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{comment.authorName}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                        comment.status === 'Approved'
                          ? 'bg-emerald-200 text-emerald-900'
                          : comment.status === 'Needs Revision'
                          ? 'bg-amber-200 text-amber-900'
                          : 'bg-slate-200 text-slate-800'
                      }`}
                    >
                      {comment.status}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">{comment.createdAt}</span>
                </div>
                <p className="text-slate-700 leading-relaxed">{comment.text}</p>
              </div>
            ))}

            {activeContent.reviewComments.length === 0 && (
              <div className="py-8 text-center text-slate-400 text-xs">
                No review comments logged for this content yet.
              </div>
            )}
          </div>

          {/* Add Review Box */}
          <form onSubmit={handleAddReview} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-800">Submit Review Verdict or Feedback</h4>
            <div className="flex flex-wrap gap-3 text-xs">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Reviewer Name</label>
                <select
                  value={reviewerId}
                  onChange={(e) => setReviewerId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Verdict Status</label>
                <select
                  value={reviewStatus}
                  onChange={(e) => setReviewStatus(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-semibold"
                >
                  <option value="Comment">General Comment</option>
                  <option value="Needs Revision">Needs Revision (Set to Revision)</option>
                  <option value="Approved">Approved (Set to Approved)</option>
                </select>
              </div>
            </div>

            <div>
              <textarea
                required
                rows={2}
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Write specific feedback regarding pacing, audio balance, or caption accuracy..."
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 bg-[#F5C518] hover:bg-[#E5B510] text-[#111827] text-xs font-bold rounded-lg shadow-xs"
              >
                Post Review Verdict
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 7: PUBLISHING */}
      {activeTab === 'publishing' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Publishing Portal & Contributor Verification</h3>
              <p className="text-xs text-slate-500">
                Official release validation: live URL check, verified team contributors, and debt settlement
              </p>
            </div>
            {activeContent.status === 'Published' && (
              <span className="text-xs font-bold font-mono text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-md">
                Officially Live
              </span>
            )}
          </div>

          {activeContent.status === 'Published' ? (
            <div className="p-5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-3 text-xs">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <span>Publication Verified Successfully</span>
              </div>
              <div className="space-y-1 text-slate-700 font-mono">
                <div>Live URL: <a href={activeContent.publishedUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">{activeContent.publishedUrl}</a></div>
                <div>Release Timestamp: {activeContent.actualPublishDate}</div>
                <div>Verified On: {activeContent.verifiedAt}</div>
              </div>
              <div className="pt-2 border-t border-emerald-200">
                <span className="font-semibold text-slate-800 block mb-1">Contributors Awarded +1 Credit:</span>
                <div className="flex flex-wrap gap-2">
                  {contributors.map((c) => (
                    <span key={c.id} className="bg-white border border-emerald-300 px-2 py-1 rounded font-semibold text-emerald-900">
                      {c.name} (+1 Credit)
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl text-xs space-y-2">
                <span className="font-bold text-amber-900">Uni Inside Media Publishing Rules:</span>
                <ul className="list-disc list-inside space-y-1 text-slate-700">
                  <li>Credits are only awarded after the live social media link is verified.</li>
                  <li>One unique content release credits each registered contributor with 1 point.</li>
                  <li>Earned credits directly settle outstanding content debt for the active cycle.</li>
                </ul>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={onOpenPublishModal}
                  className="px-5 py-2.5 bg-[#F5C518] hover:bg-[#E5B510] text-[#111827] text-xs font-bold rounded-xl shadow-xs flex items-center gap-2"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Verify & Publish Content Now</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 8: ACTIVITY LOG */}
      {activeTab === 'activity' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Content Audit Trail & Revision History</h3>
          <div className="divide-y divide-slate-100 text-xs">
            <div className="py-2 flex items-center justify-between text-slate-600">
              <span>Initial creation</span>
              <span className="font-mono text-slate-400">{activeContent.createdAt}</span>
            </div>
            <div className="py-2 flex items-center justify-between text-slate-600">
              <span>Latest metadata update</span>
              <span className="font-mono text-slate-400">{activeContent.updatedAt}</span>
            </div>
            {activeContent.verifiedAt && (
              <div className="py-2 flex items-center justify-between text-emerald-700 font-semibold">
                <span>Verified live publication & credits awarded</span>
                <span className="font-mono">{activeContent.verifiedAt}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* QUICK ADD SCENE MODAL FORM */}
      {showAddSceneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Add Scene to Storyboard</h3>
              <button onClick={() => setShowAddSceneModal(false)} className="text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSceneSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Scene Title</label>
                <input
                  type="text"
                  required
                  value={sceneTitle}
                  onChange={(e) => setSceneTitle(e.target.value)}
                  placeholder="e.g., Opening Hook in Computer Lab"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Duration (Seconds)</label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={sceneDuration}
                    onChange={(e) => setSceneDuration(Number(e.target.value))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Camera Angle</label>
                  <select
                    value={sceneAngle}
                    onChange={(e) => setSceneAngle(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900"
                  >
                    <option value="Wide Shot">Wide Shot</option>
                    <option value="Medium Shot">Medium Shot</option>
                    <option value="Close-Up">Close-Up</option>
                    <option value="POV">POV</option>
                    <option value="Drone / High Angle">Drone / High Angle</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Visual Direction</label>
                <textarea
                  rows={2}
                  value={sceneVisual}
                  onChange={(e) => setSceneVisual(e.target.value)}
                  placeholder="Actor looks at screen, slow camera dolly in..."
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Voice-Over / Narration</label>
                <textarea
                  rows={2}
                  value={sceneVo}
                  onChange={(e) => setSceneVo(e.target.value)}
                  placeholder="Dialogue or voice-over spoken during this shot..."
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddSceneModal(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#F5C518] hover:bg-[#E5B510] text-[#111827] font-bold rounded-lg"
                >
                  Save Scene
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
