import React, { useState } from 'react';
import {
  Sparkles,
  Clapperboard,
  Hash,
  Copy,
  Edit2,
  Send,
  RefreshCw,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { localDateKey } from '../../utils/date';
import { ContentItem, PlatformType, Scene } from '../../types/cms';
import { api } from '../../api/client';

type GeneratedScene = Omit<Scene, 'id' | 'sceneNumber'>;

const API_KEY_STORAGE = 'uim_anthropic_api_key';
const NEW_CONTENT = '__new__';

const inputClass = 'w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F5C518]/50';

export const AIAssistantView: React.FC = () => {
  const {
    settings, members, contents, activeWorkspaceId, addContent, updateContent, appendScenes,
    setSelectedContentId, setActiveTab, showToast,
  } = useCMS();

  const [activeTool, setActiveTool] = useState<'storyboard' | 'caption'>('storyboard');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) || '');
  const [showKey, setShowKey] = useState(false);
  const [promptInput, setPromptInput] = useState('');
  const [platform, setPlatform] = useState('Instagram');
  const [pillar, setPillar] = useState('');
  const [tone, setTone] = useState('');
  const [targetDuration, setTargetDuration] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [scenes, setScenes] = useState<GeneratedScene[]>([]);
  const [caption, setCaption] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [exportTarget, setExportTarget] = useState(NEW_CONTENT);
  const [isExporting, setIsExporting] = useState(false);

  const hasOutput = activeTool === 'storyboard' ? scenes.length > 0 : caption.length > 0;

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    if (value.trim()) localStorage.setItem(API_KEY_STORAGE, value.trim());
    else localStorage.removeItem(API_KEY_STORAGE);
  };

  const generateResponse = async () => {
    if (!apiKey.trim()) {
      showToast('error', 'API key required', 'Enter your Claude API key first.');
      return;
    }
    if (!promptInput.trim()) {
      showToast('error', 'Topic required', 'Enter a topic, campus trend, or premise first.');
      return;
    }
    setIsGenerating(true);
    setIsEditing(false);
    if (activeTool === 'storyboard') setScenes([]);
    else setCaption('');
    try {
      const result = await api<{ scenes?: GeneratedScene[]; text?: string }>(
        '/workspaces/' + encodeURIComponent(activeWorkspaceId) + '/ai-assistant/generate',
        {
          method: 'POST',
          headers: { 'x-anthropic-api-key': apiKey.trim() },
          body: JSON.stringify({ tool: activeTool, topic: promptInput, platform, pillar, tone: tone.trim() || settings.aiDefaultTone, duration: targetDuration }),
        }
      );
      if (activeTool === 'storyboard') setScenes(result.scenes || []);
      else setCaption(result.text || '');
      showToast('success', 'AI Draft Generated', 'Review the draft, then export it to the storyboard.');
    } catch (error) {
      showToast('error', 'AI Assistant failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const scenesAsText = () => scenes.map((scene, index) =>
    `SCENE ${index + 1}: ${scene.title} (${scene.durationSeconds}s | ${scene.cameraAngle} | ${scene.transition})\n` +
    `- Visual: ${scene.visualDirection}\n- Audio / VO: ${scene.voiceOver}\n- On-Screen Text: ${scene.onScreenText}`
  ).join('\n\n');

  const handleCopy = () => {
    navigator.clipboard?.writeText(activeTool === 'storyboard' ? scenesAsText() : caption);
    showToast('success', 'Copied to Clipboard', 'AI draft copied.');
  };

  const updateGeneratedScene = (index: number, updates: Partial<GeneratedScene>) => {
    setScenes((prev) => prev.map((scene, i) => (i === index ? { ...scene, ...updates } : scene)));
  };

  const createContent = () => addContent({
    title: promptInput.trim().slice(0, 150) || 'AI-Generated Production Plan',
    description: activeTool === 'caption' ? caption : `Storyboard drafted with AI Assistant: ${promptInput.trim()}`,
    platform: (settings.platforms.includes(platform as PlatformType) ? platform : settings.platforms[0] || 'Instagram') as PlatformType,
    format: platform === 'Instagram' ? 'Reels' : platform === 'TikTok' ? 'Shorts' : 'Long-form Video',
    pillar: settings.contentPillars.includes(pillar) ? pillar : settings.contentPillars[0] || '',
    priority: 'Medium',
    status: 'Scripting',
    picId: members[0]?.id || '',
    contributorIds: members[0]?.id ? [members[0].id] : [],
    targetPublishDate: (() => { const date = new Date(); date.setDate(date.getDate() + 3); return localDateKey(date); })(),
  });

  const handleExport = async () => {
    if (!hasOutput) return;
    setIsExporting(true);
    try {
      let target: ContentItem | undefined;
      if (exportTarget === NEW_CONTENT) {
        target = await createContent();
      } else {
        target = contents.find((item) => item.id === exportTarget);
        if (!target) throw new Error('The selected content no longer exists.');
      }

      let saved = true;
      if (activeTool === 'storyboard') {
        saved = await appendScenes(target, scenes);
      } else if (exportTarget !== NEW_CONTENT) {
        // New content already carries the caption as its description.
        const description = [target.description.trim(), `--- Caption (AI) ---\n${caption}`].filter(Boolean).join('\n\n');
        saved = await updateContent(target.id, { description });
      }
      if (!saved) return;

      showToast('success', 'Exported to Storyboard', `"${target.title}" is ready in the storyboard.`);
      setSelectedContentId(target.id);
      setActiveTab('storyboard');
    } catch (error) {
      showToast('error', 'Export failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Creative AI Engine
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/80">
              ⚡ Powered by Claude
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Uni Inside Media AI Content Assistant
          </h2>
          <p className="text-xs text-slate-500">
            Generate storyboard scenes and social captions, then export them straight to the storyboard.
          </p>
        </div>

        {/* Tool Modes */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl text-xs overflow-x-auto no-scrollbar">
          {[
            { id: 'storyboard', label: 'Storyboard', icon: Clapperboard },
            { id: 'caption', label: 'Caption', icon: Hash },
          ].map((tool) => {
            const Icon = tool.icon;
            const isActive = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => {
                  setActiveTool(tool.id as 'storyboard' | 'caption');
                  setIsEditing(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 font-bold rounded-lg whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#F5C518]' : 'text-slate-400'}`} />
                <span>{tool.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Form Input & Generated Output */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Form: Parameters */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#F5C518]" />
            <span>Generation Parameters</span>
          </h3>

          <div className="space-y-3.5 text-xs">
            {/* API key */}
            <div>
              <label className="flex items-center gap-1 font-semibold text-slate-700 mb-1">
                <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                Claude API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder="sk-ant-..."
                  autoComplete="off"
                  spellCheck={false}
                  className={`${inputClass} pr-8 font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Saved only in this browser. Clear the field to remove it.</p>
            </div>

            {/* Prompt input */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Topic, Campus Trend, or Premise
              </label>
              <textarea
                rows={3}
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="e.g., How to approach thesis advisors respectfully and get fast email replies..."
                className={`${inputClass} px-3 py-2`}
              />
            </div>

            {/* Platform & Pillar */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Target Platform</label>
                <input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="e.g., Instagram" className={inputClass} />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Content Pillar</label>
                <input value={pillar} onChange={(e) => setPillar(e.target.value)} placeholder="e.g., Career & Internship Tips" className={inputClass} />
              </div>
            </div>

            {/* Tone & Duration */}
            <div className={`grid gap-3 ${activeTool === 'storyboard' ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tone of Voice</label>
                <input value={tone} onChange={(e) => setTone(e.target.value)} placeholder={settings.aiDefaultTone || 'e.g., Casual, student friendly'} className={inputClass} />
              </div>
              {activeTool === 'storyboard' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Target Duration</label>
                  <input value={targetDuration} onChange={(e) => setTargetDuration(e.target.value)} placeholder="e.g., 60 seconds" className={inputClass} />
                </div>
              )}
            </div>

            {/* Generate Button */}
            <button
              onClick={generateResponse}
              disabled={isGenerating}
              className="w-full py-2.5 bg-[#F5C518] hover:bg-[#E5B510] active:scale-98 text-[#111827] font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 text-xs disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Generating {activeTool === 'storyboard' ? 'Storyboard' : 'Caption'}...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate {activeTool === 'storyboard' ? 'Storyboard' : 'Caption'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Output View */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">AI Output</h3>
                <span className="text-[11px] text-slate-400">
                  {isEditing ? 'Live Edit Mode' : activeTool === 'storyboard' ? `${scenes.length} scenes` : 'Caption Preview'}
                </span>
              </div>

              {hasOutput && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>{isEditing ? 'Done Editing' : 'Edit'}</span>
                  </button>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </button>
                </div>
              )}
            </div>

            {/* Output Display */}
            {!hasOutput ? (
              <div className="py-24 text-center text-slate-400 text-xs">
                <Sparkles className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-600">No generated output yet.</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Enter your API key and topic on the left panel and click Generate.
                </p>
              </div>
            ) : activeTool === 'caption' ? (
              isEditing ? (
                <textarea
                  rows={14}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="w-full p-4 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F5C518]/50"
                />
              ) : (
                <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl max-h-[420px] overflow-y-auto">
                  <pre className="text-xs text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">{caption}</pre>
                </div>
              )
            ) : (
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {scenes.map((scene, index) => (
                  <div key={index} className="p-3 bg-slate-50/70 border border-slate-200 rounded-xl text-xs space-y-1.5">
                    {isEditing ? (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-500 shrink-0">#{index + 1}</span>
                          <input value={scene.title} onChange={(e) => updateGeneratedScene(index, { title: e.target.value })} className={inputClass} />
                          <input
                            type="number"
                            min={0}
                            value={scene.durationSeconds}
                            onChange={(e) => updateGeneratedScene(index, { durationSeconds: Math.max(0, Number(e.target.value) || 0) })}
                            className={`${inputClass} w-20`}
                          />
                          <span className="text-slate-400">s</span>
                        </div>
                        {([
                          ['visualDirection', 'Visual'],
                          ['voiceOver', 'Audio / VO'],
                          ['onScreenText', 'On-Screen Text'],
                        ] as const).map(([field, label]) => (
                          <div key={field}>
                            <label className="block font-semibold text-slate-600 mb-0.5">{label}</label>
                            <textarea rows={2} value={scene[field]} onChange={(e) => updateGeneratedScene(index, { [field]: e.target.value })} className={inputClass} />
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900">Scene {index + 1}: {scene.title}</span>
                          <span className="text-[11px] text-slate-500 whitespace-nowrap">
                            {scene.durationSeconds}s · {scene.cameraAngle} · {scene.transition}
                          </span>
                        </div>
                        <p className="text-slate-700"><span className="font-semibold">Visual:</span> {scene.visualDirection}</p>
                        <p className="text-slate-700"><span className="font-semibold">Audio / VO:</span> {scene.voiceOver}</p>
                        <p className="text-slate-700"><span className="font-semibold">On-Screen Text:</span> {scene.onScreenText}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Export to Storyboard */}
          {hasOutput && (
            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
              <label className="font-semibold text-slate-600 whitespace-nowrap">Export to</label>
              <select
                value={exportTarget}
                onChange={(e) => setExportTarget(e.target.value)}
                className="flex-1 min-w-0 px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
              >
                <option value={NEW_CONTENT}>+ New content</option>
                {contents.map((item) => (
                  <option key={item.id} value={item.id}>{item.title}</option>
                ))}
              </select>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[#111827] hover:bg-slate-800 text-white font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
              >
                {isExporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 text-[#F5C518]" />}
                <span>Export to Storyboard</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
