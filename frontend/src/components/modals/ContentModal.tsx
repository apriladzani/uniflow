import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { ContentItem, PlatformType, ContentFormat, PriorityLevel, ProductionStage } from '../../types/cms';
import { localDateKey } from '../../utils/date';

interface ContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: ContentItem | null;
  defaultDate?: string;
}

export const ContentModal: React.FC<ContentModalProps> = ({
  isOpen,
  onClose,
  initialData,
  defaultDate,
}) => {
  const { members, settings, addContent, updateContent, showToast } = useCMS();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [platform, setPlatform] = useState<PlatformType>('Instagram');
  const [format, setFormat] = useState<ContentFormat>('Reels');
  const [pillar, setPillar] = useState(settings.contentPillars[0] || 'Career & Internship Tips');
  const [priority, setPriority] = useState<PriorityLevel>('Medium');
  const [status, setStatus] = useState<ProductionStage>('Planning');
  const [picId, setPicId] = useState(members[0]?.id || '');
  const [contributorIds, setContributorIds] = useState<string[]>([members[0]?.id || '']);
  const [targetPublishDate, setTargetPublishDate] = useState(
    defaultDate || localDateKey()
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title);
      setDescription(initialData.description || '');
      setPlatform(initialData.platform);
      setFormat(initialData.format);
      setPillar(initialData.pillar);
      setPriority(initialData.priority);
      setStatus(initialData.status);
      setPicId(initialData.picId);
      setContributorIds(initialData.contributorIds);
      setTargetPublishDate(initialData.targetPublishDate);
    } else {
      setTitle('');
      setDescription('');
      setPlatform('Instagram');
      setFormat('Reels');
      setPillar(settings.contentPillars[0] || 'Career & Internship Tips');
      setPriority('Medium');
      setStatus('Planning');
      setPicId(members[0]?.id || '');
      setContributorIds(members[0]?.id ? [members[0].id] : []);
      setTargetPublishDate(defaultDate || localDateKey());
    }
  }, [initialData, isOpen, defaultDate, members, settings]);

  if (!isOpen) return null;

  const toggleContributor = (id: string) => {
    setContributorIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setFormError('');
    try {
      if (initialData) {
        const saved = await updateContent(initialData.id, {
          title,
          description,
          platform,
          format,
          pillar,
          priority,
          status,
          picId,
          contributorIds,
          targetPublishDate,
        });
        if (!saved) return;
        showToast('success', 'Changes saved', 'Content was updated in the database.');
      } else {
        await addContent({
        title,
        description,
        platform,
        format,
        pillar,
        priority,
        status,
        picId,
        contributorIds,
        targetPublishDate,
        });
      }
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Content could not be saved.');
      showToast('error', 'Content could not be saved', error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const formatOptions: Record<PlatformType, ContentFormat[]> = {
    Instagram: ['Reels', 'Carousel', 'Infographic Post'],
    TikTok: ['Shorts'],
    YouTube: ['Long-form Video', 'Shorts'],
    LinkedIn: ['Infographic Post', 'Carousel'],
    'X (Twitter)': ['Thread', 'Infographic Post'],
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/50">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {initialData ? 'Edit Content Details' : 'Create New Content'}
            </h2>
            <p className="text-xs text-slate-500">
              Plan publication deliverables and assign lead producer and contributors
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {formError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{formError}</div>}
          {/* Content Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Content Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., 5 Overlooked College Majors with 6-Figure Salaries"
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C518]/50 focus:border-[#F5C518] text-slate-900 font-medium"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Description & Editorial Angle
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Summary of premise, audience goal, and key takeaway..."
              className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C518]/50 focus:border-[#F5C518] text-slate-800"
            />
          </div>

          {/* Grid Platform & Format */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Media Platform
              </label>
              <select
                value={platform}
                onChange={(e) => {
                  const newPlat = e.target.value as PlatformType;
                  setPlatform(newPlat);
                  const availableFormats = formatOptions[newPlat] || ['Reels'];
                  setFormat(availableFormats[0]);
                }}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C518]/50 text-slate-900"
              >
                {settings.platforms.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Content Format
              </label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as ContentFormat)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C518]/50 text-slate-900"
              >
                {(formatOptions[platform] || ['Reels']).map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Grid Pillar & Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Content Pillar
              </label>
              <select
                value={pillar}
                onChange={(e) => setPillar(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C518]/50 text-slate-900"
              >
                {settings.contentPillars.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Production Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as PriorityLevel)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C518]/50 text-slate-900"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>

          {/* PIC & Target Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Person In Charge (PIC)
              </label>
              <select
                value={picId}
                onChange={(e) => {
                  const newPic = e.target.value;
                  setPicId(newPic);
                  if (!contributorIds.includes(newPic)) {
                    setContributorIds((prev) => [...prev, newPic]);
                  }
                }}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C518]/50 text-slate-900"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Target Release Date
              </label>
              <input
                type="date"
                required
                value={targetPublishDate}
                onChange={(e) => setTargetPublishDate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C518]/50 text-slate-900 font-mono tabular-nums"
              />
            </div>
          </div>

          {/* Pipeline Stage */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Production Stage
            </label>
            <select
              value={status}
              disabled={status === 'Published'}
              onChange={(e) => setStatus(e.target.value as ProductionStage)}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C518]/50 text-slate-900 disabled:bg-slate-100"
            >
              <option value="Planning">Planning</option>
              <option value="Scripting">Scripting</option>
              <option value="Shooting">Shooting</option>
              <option value="Editing">Editing</option>
              <option value="Review">Review</option>
              <option value="Revision">Revision</option>
              <option value="Approved">Approved</option>
              <option value="Scheduled">Scheduled</option>
              {status === 'Published' && <option value="Published">Published</option>}
            </select>
            {status === 'Published' && (
              <p className="text-[11px] text-amber-600 mt-1">
                Content is already marked Published and verified.
              </p>
            )}
          </div>

          {/* Multi-select Contributors */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Eligible Contributors (Awarded 1 Credit Each Upon Publication)
            </label>
            <p className="text-[11px] text-slate-500 mb-2">
              Each checked member receives 1 publishing credit when content reaches verified Published status.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-slate-200 rounded-lg p-3 max-h-36 overflow-y-auto bg-slate-50/50">
              {members.map((m) => {
                const isSelected = contributorIds.includes(m.id);
                return (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => toggleContributor(m.id)}
                    className={`flex items-center gap-2 p-2 rounded-lg text-left text-xs transition-colors ${
                      isSelected
                        ? 'bg-amber-50 border border-amber-300 text-amber-900 font-medium'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-sm flex items-center justify-center shrink-0 border ${
                        isSelected
                          ? 'bg-[#F5C518] border-amber-500 text-black'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div className="truncate">
                      <span className="truncate block font-medium">{m.name}</span>
                      <span className="text-[10px] text-slate-400 block truncate">{m.role}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-bold text-[#111827] bg-[#F5C518] hover:bg-[#E5B510] active:scale-98 rounded-lg shadow-xs transition-all disabled:cursor-wait disabled:opacity-60"
            >
              {saving ? 'Saving…' : initialData ? 'Save Changes' : 'Create Content'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
