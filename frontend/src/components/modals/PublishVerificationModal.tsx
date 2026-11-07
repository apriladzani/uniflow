import React, { useState } from 'react';
import { X, CheckCircle, ShieldCheck, ExternalLink, Award } from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { ContentItem } from '../../types/cms';
import { localDateTimeValue } from '../../utils/date';

interface PublishVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: ContentItem;
}

export const PublishVerificationModal: React.FC<PublishVerificationModalProps> = ({
  isOpen,
  onClose,
  content,
}) => {
  const { members, verifyAndPublishContent } = useCMS();

  const [url, setUrl] = useState(
    content.publishedUrl ||
      (content.platform === 'Instagram'
        ? 'https://www.instagram.com/reel/'
        : content.platform === 'TikTok'
        ? 'https://www.tiktok.com/@uniinsidemedia/video/'
        : content.platform === 'YouTube'
        ? 'https://youtube.com/watch?v='
        : 'https://linkedin.com/posts/')
  );
  const [actualDate, setActualDate] = useState(
    content.actualPublishDate ||
      localDateTimeValue().slice(0, 16)
  );
  const [selectedContributors, setSelectedContributors] = useState<string[]>(
    content.contributorIds.length > 0 ? content.contributorIds : [content.picId]
  );
  const [checkCaption, setCheckCaption] = useState(true);
  const [checkAudio, setCheckAudio] = useState(true);
  const [checkThumb, setCheckThumb] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const toggleContributor = (id: string) => {
    setSelectedContributors((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleVerifyPublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!checkCaption || !checkAudio || !checkThumb) {
      setErrorMsg('Please complete all editorial publishing validation checklist items before releasing.');
      return;
    }

    setSaving(true);
    try {
      const res = await verifyAndPublishContent(content.id, url, actualDate, selectedContributors);
      if (!res.success) setErrorMsg(res.error || 'An error occurred while validating publication.');
      else onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header with verified badge icon */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-amber-50/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F5C518] text-[#111827] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Verify Publication & Allocate Credits
              </h2>
              <p className="text-xs text-slate-600">
                Official Uni Inside Media Release ({content.platform})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleVerifyPublish} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs leading-relaxed">
              {errorMsg}
            </div>
          )}

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Content Item Ready for Release
            </span>
            <p className="text-sm font-bold text-slate-900 mt-0.5">{content.title}</p>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
              <span>{content.platform}</span>
              <span>·</span>
              <span>{content.format}</span>
              <span>·</span>
              <span>Pillar: {content.pillar}</span>
            </div>
          </div>

          {/* URL Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              Verified Live Post URL <span className="text-rose-500">*</span>
            </label>
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.instagram.com/reel/DBG7Xy9pz01/"
              className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C518]/50 text-slate-900 font-mono"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Paste the live public URL from the official social platform.
            </p>
          </div>

          {/* Actual publish timestamp */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Actual Release Timestamp <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={actualDate}
              onChange={(e) => setActualDate(e.target.value)}
              placeholder="2026-10-16 19:30"
              className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C518]/50 text-slate-900 font-mono tabular-nums"
            />
          </div>

          {/* Credited Contributors */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-amber-500" />
              Verified Contributors Receiving Credits (1 Credit / Member)
            </label>
            <p className="text-[11px] text-slate-500 mb-2">
              Credits immediately settle active member content debt obligations for this cycle.
            </p>
            <div className="space-y-1.5 border border-slate-200 rounded-xl p-3 max-h-36 overflow-y-auto bg-slate-50/40">
              {members.map((m) => {
                const checked = selectedContributors.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-white text-xs cursor-pointer select-none transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleContributor(m.id)}
                      className="w-4 h-4 text-[#F5C518] rounded-sm border-slate-300 focus:ring-[#F5C518]"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-slate-800">{m.name}</span>
                      <span className="text-[11px] text-slate-400 ml-1.5">({m.role})</span>
                    </div>
                    {checked && (
                      <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-md">
                        +1 Credit
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Quality Standards Checklist */}
          <div className="p-3 bg-amber-50/50 border border-amber-200/60 rounded-xl space-y-2">
            <span className="text-xs font-bold text-amber-900 block">
              Uni Inside Media Quality Standard Checklist:
            </span>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={checkCaption}
                onChange={(e) => setCheckCaption(e.target.checked)}
                className="w-4 h-4 text-[#F5C518] rounded-sm"
              />
              <span>Caption copy, call-to-action, and official UIM hashtags verified</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={checkAudio}
                onChange={(e) => setCheckAudio(e.target.checked)}
                className="w-4 h-4 text-[#F5C518] rounded-sm"
              />
              <span>Audio/backsound is copyright-cleared & signature UIM sting/jingle included</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={checkThumb}
                onChange={(e) => setCheckThumb(e.target.checked)}
                className="w-4 h-4 text-[#F5C518] rounded-sm"
              />
              <span>High-CTR cover thumbnail conforms to official brand palette (#F5C518)</span>
            </label>
          </div>

          {/* Footer buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
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
              className="px-4 py-2 text-xs font-bold text-[#111827] bg-[#F5C518] hover:bg-[#E5B510] active:scale-98 rounded-lg shadow-sm transition-all flex items-center gap-1.5 disabled:cursor-wait disabled:opacity-60"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{saving ? 'Saving…' : 'Verify & Publish Deliverable'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
