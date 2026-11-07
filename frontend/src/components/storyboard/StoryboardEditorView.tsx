import React, { useState } from 'react';
import {
  Clapperboard,
  Plus,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Edit3,
  Clock,
  Eye,
  Camera,
  Layers,
  FileVideo,
  Check,
  Sparkles,
} from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { Scene } from '../../types/cms';
import { SelectFootage } from './SelectFootage';
import ImportStoryboardModal, { type ImportMode } from './ImportStoryboardModal';
import type { ParseOptions, ParsedScene } from './storyboardImport';

// Must match the Camera Angle / Transition dropdowns in the scene form below.
const CAMERA_ANGLE_OPTIONS: Scene['cameraAngle'][] = ['Wide Shot', 'Medium Shot', 'Close-Up', 'POV', 'Over the Shoulder', 'Drone / High Angle'];
const TRANSITION_OPTIONS: Scene['transition'][] = ['Cut', 'Dissolve', 'Wipe', 'Zoom In', 'Fade to Black'];

// Maps common AI wording onto UniFlow's shorter option lists (keys are lowercase, spaces only).
const CAMERA_ALIASES: Record<string, Scene['cameraAngle']> = {
  'extreme close up': 'Close-Up', ecu: 'Close-Up', 'medium close up': 'Close-Up', mcu: 'Close-Up', insert: 'Close-Up', detail: 'Close-Up', 'detail shot': 'Close-Up',
  'medium wide shot': 'Wide Shot', 'medium wide': 'Wide Shot', 'extreme wide shot': 'Wide Shot', 'extreme wide': 'Wide Shot', ews: 'Wide Shot', 'establishing shot': 'Wide Shot', 'long shot': 'Wide Shot', 'full shot': 'Wide Shot',
  'point of view': 'POV',
  'high angle': 'Drone / High Angle', drone: 'Drone / High Angle', aerial: 'Drone / High Angle', overhead: 'Drone / High Angle', 'top down': 'Drone / High Angle', 'birds eye': 'Drone / High Angle', 'bird s eye': 'Drone / High Angle', 'bird s eye view': 'Drone / High Angle',
  'two shot': 'Medium Shot', 'low angle': 'Medium Shot', 'dutch angle': 'Medium Shot',
};
const TRANSITION_ALIASES: Record<string, Scene['transition']> = {
  'jump cut': 'Cut', 'match cut': 'Cut', 'j cut': 'Cut', 'l cut': 'Cut', 'hard cut': 'Cut',
  'cross dissolve': 'Dissolve', crossfade: 'Dissolve', 'fade in': 'Dissolve', fade: 'Dissolve',
  'fade out': 'Fade to Black',
  zoom: 'Zoom In', 'zoom out': 'Zoom In', 'zoom transition': 'Zoom In',
  'whip pan': 'Wipe', whip: 'Wipe', swipe: 'Wipe', slide: 'Wipe',
};

export const StoryboardEditorView: React.FC = () => {
  const {
    contents,
    selectedContentId,
    addScene,
    updateScene,
    deleteScene,
    duplicateScene,
    reorderScenes,
    appendScenes,
    mediaAssets,
    members,
    showToast,
    activeWorkspaceId,
  } = useCMS();

  const activeContent = contents.find((c) => c.id === selectedContentId) || contents[0];

  // Selected scene for detail view / edit
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [previewScene, setPreviewScene] = useState<Scene | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Add scene state
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(5);
  const [visualDirection, setVisualDirection] = useState('');
  const [aRollDirection, setARollDirection] = useState('');
  const [bRollDirection, setBRollDirection] = useState('');
  const [footageReferences, setFootageReferences] = useState<NonNullable<Scene['footageReferences']>>({});
  const [voiceOver, setVoiceOver] = useState('');
  const [onScreenText, setOnScreenText] = useState('');
  const [cameraAngle, setCameraAngle] = useState<Scene['cameraAngle']>('Medium Shot');
  const [transition, setTransition] = useState<Scene['transition']>('Cut');
  const [footageRef, setFootageRef] = useState('');
  const [editorNotes, setEditorNotes] = useState('');
  const [assignedMemberId, setAssignedMemberId] = useState('');

  if (!activeContent) {
    return (
      <div className="bg-white p-8 rounded-2xl text-center text-slate-500">
        No content selected to edit storyboard.
      </div>
    );
  }

  const scenes = activeContent.scenes;
  const totalDuration = scenes.reduce((acc, sc) => acc + (sc.durationSeconds || 0), 0);
  const completedScenes = scenes.filter((scene) => scene.isCompleted).length;
  const completionPercent = scenes.length ? Math.round((completedScenes / scenes.length) * 100) : 0;

  const importOptions: ParseOptions = {
    cameraAngles: CAMERA_ANGLE_OPTIONS,
    transitions: TRANSITION_OPTIONS,
    cameraAliases: CAMERA_ALIASES,
    transitionAliases: TRANSITION_ALIASES,
    members: members.map((member) => ({ id: member.id, name: member.name })),
  };

  // Saves all imported scenes in one request, so the import is all-or-nothing.
  const handleImport = async (parsed: ParsedScene[], mode: ImportMode) => {
    const imported: Omit<Scene, 'id' | 'sceneNumber'>[] = parsed.map((item) => ({
      title: item.title,
      durationSeconds: item.durationSeconds,
      cameraAngle: item.cameraAngle as Scene['cameraAngle'],
      transition: item.transition as Scene['transition'],
      assignedMemberId: item.assignedMemberId || '',
      visualDirection: item.visualDirection,
      aRollDirection: item.aRollDirection,
      bRollDirection: item.bRollDirection,
      voiceOver: item.voiceOver,
      onScreenText: item.onScreenText,
      footageRef: item.legacyFootageNote,
      editorNotes: item.editorNotes,
      isCompleted: false,
    }));
    const saved = mode === 'replace'
      ? await reorderScenes(activeContent.id, imported.map((scene) => ({ ...scene, id: '', sceneNumber: 0 })))
      : await appendScenes(activeContent, imported);
    if (!saved) throw new Error('Scene gagal disimpan. Coba lagi.');
    showToast('success', 'Storyboard imported', `${imported.length} scene berhasil diimport.`);
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const newScenes = [...scenes];
    const temp = newScenes[index - 1];
    newScenes[index - 1] = newScenes[index];
    newScenes[index] = temp;
    if (await reorderScenes(activeContent.id, newScenes)) showToast('info', 'Order Updated', `Scene #${index + 1} moved up.`);
  };

  const handleMoveDown = async (index: number) => {
    if (index === scenes.length - 1) return;
    const newScenes = [...scenes];
    const temp = newScenes[index + 1];
    newScenes[index + 1] = newScenes[index];
    newScenes[index] = temp;
    if (await reorderScenes(activeContent.id, newScenes)) showToast('info', 'Order Updated', `Scene #${index + 1} moved down.`);
  };

  const handleSaveScene = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (editingScene) {
      const saved = await updateScene(activeContent.id, editingScene.id, {
        title,
        durationSeconds: Number(duration),
        visualDirection,
        aRollDirection,
        bRollDirection,
        footageReferences,
        voiceOver,
        onScreenText,
        cameraAngle,
        transition,
        footageRef,
        editorNotes,
        assignedMemberId,
        isCompleted: editingScene.isCompleted,
      });
      if (!saved) return;
      setEditingScene(null);
    } else {
      const saved = await addScene(activeContent.id, {
        title,
        durationSeconds: Number(duration),
        visualDirection,
        aRollDirection,
        bRollDirection,
        footageReferences,
        voiceOver,
        onScreenText,
        cameraAngle,
        transition,
        footageRef,
        editorNotes,
        assignedMemberId,
        isCompleted: false,
      });
      if (!saved) return;
      setShowAddModal(false);
    }

    // Reset
    setTitle('');
    setDuration(5);
    setVisualDirection('');
    setARollDirection('');
    setBRollDirection('');
    setFootageReferences({});
    setVoiceOver('');
    setOnScreenText('');
    setFootageRef('');
    setEditorNotes('');
    setAssignedMemberId('');
  };

  const openEditModal = (scene: Scene) => {
    setEditingScene(scene);
    setTitle(scene.title);
    setDuration(scene.durationSeconds);
    setVisualDirection(scene.visualDirection);
    setARollDirection(scene.aRollDirection || '');
    setBRollDirection(scene.bRollDirection || '');
    setFootageReferences(scene.footageReferences || {});
    setVoiceOver(scene.voiceOver);
    setOnScreenText(scene.onScreenText);
    setCameraAngle(scene.cameraAngle);
    setTransition(scene.transition);
    setFootageRef(scene.footageRef || '');
    setEditorNotes(scene.editorNotes || '');
    setAssignedMemberId(scene.assignedMemberId || '');
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Storyboard Studio
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-xs font-mono font-bold text-slate-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              Total Duration: {totalDuration} Seconds ({Math.floor(totalDuration / 60)}m {totalDuration % 60}s)
            </span>
            <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              Scenes complete: {completedScenes}/{scenes.length}
            </span>
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200" aria-label={`Storyboard ${completionPercent}% complete`}>
              <div className="h-full rounded-full bg-[#F5C518] transition-all" style={{ width: `${completionPercent}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">
              {activeContent.title}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
        <button
          onClick={() => setShowImportModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all whitespace-nowrap"
        >
          <Sparkles className="w-4 h-4 text-[#E5B510]" />
          <span>Import dari AI</span>
        </button>
        <button
          onClick={() => {
            setEditingScene(null);
            setTitle('');
            setDuration(5);
            setVisualDirection('');
            setARollDirection('');
            setBRollDirection('');
            setFootageReferences({});
            setVoiceOver('');
            setOnScreenText('');
            setAssignedMemberId('');
            setShowAddModal(true);
          }}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[#111827] bg-[#F5C518] hover:bg-[#E5B510] active:scale-98 rounded-lg shadow-xs transition-all whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Scene</span>
        </button>
        </div>
      </div>

      {/* Storyboard timeline scenes cards */}
      <div className="space-y-3">
        {scenes.map((scene, index) => (
          <div
            key={scene.id}
            className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs hover:border-slate-300 transition-all flex flex-col lg:flex-row gap-4"
          >
            {/* Left badge & order controls */}
            <div className="flex lg:flex-col items-center justify-between lg:justify-center gap-2 lg:w-16 border-b lg:border-b-0 lg:border-r border-slate-100 pb-2 lg:pb-0 lg:pr-3">
              <div className="w-9 h-9 rounded-xl bg-slate-900 text-[#F5C518] font-black text-sm flex items-center justify-center font-mono">
                #{scene.sceneNumber}
              </div>

              <div className="flex lg:flex-col items-center gap-1">
                <button
                  disabled={index === 0}
                  onClick={() => handleMoveUp(index)}
                  className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-20"
                  title="Move Up"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  disabled={index === scenes.length - 1}
                  onClick={() => handleMoveDown(index)}
                  className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-20"
                  title="Move Down"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Scene details */}
            <div className="flex-1 min-w-0 space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">{scene.title}</h3>
                  <span className="font-mono tabular-nums text-slate-600 bg-slate-100 px-2 py-0.5 rounded font-semibold text-[11px] flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    {scene.durationSeconds}s
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <label className={`flex items-center gap-1.5 rounded-lg px-2 py-1 font-semibold cursor-pointer ${scene.isCompleted ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'}`}>
                    <input
                      type="checkbox"
                      checked={Boolean(scene.isCompleted)}
                      onChange={(event) => updateScene(activeContent.id, scene.id, { isCompleted: event.target.checked })}
                      aria-label={`Mark scene ${scene.sceneNumber} complete`}
                      className="h-4 w-4 rounded border-slate-300 accent-[#F5C518]"
                    />
                    {scene.isCompleted ? 'Complete' : 'Mark complete'}
                  </label>
                  <span className="flex items-center gap-1 font-medium bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                    <Camera className="w-3 h-3 text-slate-400" />
                    {scene.cameraAngle}
                  </span>
                  <span className="flex items-center gap-1 font-medium bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                    <Layers className="w-3 h-3 text-slate-400" />
                    Transition: {scene.transition}
                  </span>
                </div>
              </div>

              {/* Grid: Visual, A-Roll, B-Roll, VO, On-Screen Text */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Main Visual Direction
                  </span>
                  <p className="text-slate-800 leading-relaxed">{scene.visualDirection}</p>
                  {scene.footageReferences?.mainVisual && <p className="mt-1 truncate text-[10px] text-slate-500">Footage: {scene.footageReferences.mainVisual}</p>}
                </div>

                <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">A-Roll</span>
                  <p className="text-slate-800 leading-relaxed">{scene.aRollDirection || '—'}</p>
                  {scene.footageReferences?.aRoll && <p className="mt-1 truncate text-[10px] text-slate-500">Footage: {scene.footageReferences.aRoll}</p>}
                </div>

                <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">B-Roll</span>
                  <p className="text-slate-800 leading-relaxed">{scene.bRollDirection || '—'}</p>
                  {scene.footageReferences?.bRoll && <p className="mt-1 truncate text-[10px] text-slate-500">Footage: {scene.footageReferences.bRoll}</p>}
                </div>

                <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Voice-Over / Dialogue
                  </span>
                  <p className="text-slate-700 italic font-serif leading-relaxed">
                    {scene.voiceOver || '(No voice-over dialogue)'}
                  </p>
                </div>

                <div className="p-3 bg-amber-50/30 rounded-xl border border-amber-100/60">
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block mb-1">
                    On-Screen Text & Notes
                  </span>
                  <p className="text-amber-900 font-semibold mb-1">
                    {scene.onScreenText || '—'}
                  </p>
                  {scene.editorNotes && (
                    <p className="text-slate-500 text-[11px] italic">
                      Note: {scene.editorNotes}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="font-bold uppercase tracking-wide text-slate-400">Assigned to</span>
                <span className="font-semibold text-slate-700">
                  {members.find((member) => member.id === scene.assignedMemberId)?.name || 'Unassigned'}
                </span>
              </div>
            </div>

            {/* Right action buttons */}
            <div className="flex lg:flex-col items-center justify-end gap-1.5 lg:w-28 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
              <button
                onClick={() => setPreviewScene(scene)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-lg w-full justify-center transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>
              <button
                onClick={() => openEditModal(scene)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-lg w-full justify-center transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
              <button
                onClick={() => duplicateScene(activeContent.id, scene.id)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-lg w-full justify-center transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Duplicate</span>
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete Scene #${scene.sceneNumber}?`)) {
                    deleteScene(activeContent.id, scene.id);
                  }
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg w-full justify-center transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        ))}

        {scenes.length === 0 && (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
            <Clapperboard className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800">Storyboard is Empty</h3>
            <p className="text-xs text-slate-500 mt-1">
              Design scene sequencing, dialogue audio cues, and director visual instructions
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 px-4 py-2 bg-[#F5C518] hover:bg-[#E5B510] text-[#111827] text-xs font-bold rounded-lg shadow-xs"
            >
              + Add First Scene
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="mt-4 ml-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg"
            >
              ✨ Import dari AI
            </button>
          </div>
        )}
      </div>

      {/* Modal Add / Edit Scene */}
      {(showAddModal || editingScene) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/50">
              <h3 className="text-sm font-bold text-slate-900">
                {editingScene ? `Edit Scene #${editingScene.sceneNumber}` : 'Add New Storyboard Scene'}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingScene(null);
                }}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveScene} className="flex-1 overflow-y-auto p-6 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Scene Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Scene 2 - Salary Tracer Study Infographic"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Duration (Seconds)</label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Camera Angle</label>
                  <select
                    value={cameraAngle}
                    onChange={(e) => setCameraAngle(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  >
                    <option value="Wide Shot">Wide Shot</option>
                    <option value="Medium Shot">Medium Shot</option>
                    <option value="Close-Up">Close-Up</option>
                    <option value="POV">POV</option>
                    <option value="Over the Shoulder">Over the Shoulder</option>
                    <option value="Drone / High Angle">Drone / High Angle</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Transition</label>
                  <select
                    value={transition}
                    onChange={(e) => setTransition(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  >
                    <option value="Cut">Cut</option>
                    <option value="Dissolve">Dissolve</option>
                    <option value="Wipe">Wipe</option>
                    <option value="Zoom In">Zoom In</option>
                    <option value="Fade to Black">Fade to Black</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Assigned Member</label>
                <select
                  value={assignedMemberId}
                  onChange={(event) => setAssignedMemberId(event.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                >
                  <option value="">Unassigned</option>
                  {members.filter((member) => member.active).map((member) => (
                    <option key={member.id} value={member.id}>{member.name} · {member.role}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Main Visual Direction & Blocking</label>
                <textarea
                  rows={2}
                  required
                  value={visualDirection}
                  onChange={(e) => setVisualDirection(e.target.value)}
                  placeholder="Composition details, presenter movement, props..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                />
                <SelectFootage key={`${editingScene?.id || 'new'}-main_visual`} label="Main Visual Direction" workspaceId={activeWorkspaceId} contentId={activeContent.id} sceneId={editingScene?.id} section="main_visual" linkedAssets={editingScene?.footageAssets?.mainVisual} />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">A-Roll Direction</label>
                <textarea rows={2} value={aRollDirection} onChange={(e) => setARollDirection(e.target.value)} placeholder="Presenter or interview footage direction..." className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900" />
                <SelectFootage key={`${editingScene?.id || 'new'}-a_roll`} label="A-Roll" workspaceId={activeWorkspaceId} contentId={activeContent.id} sceneId={editingScene?.id} section="a_roll" linkedAssets={editingScene?.footageAssets?.aRoll} />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">B-Roll Direction</label>
                <textarea rows={2} value={bRollDirection} onChange={(e) => setBRollDirection(e.target.value)} placeholder="Supporting cutaway footage direction..." className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900" />
                <SelectFootage key={`${editingScene?.id || 'new'}-b_roll`} label="B-Roll" workspaceId={activeWorkspaceId} contentId={activeContent.id} sceneId={editingScene?.id} section="b_roll" linkedAssets={editingScene?.footageAssets?.bRoll} />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Voice-Over / Audio Narration</label>
                <textarea
                  rows={2}
                  value={voiceOver}
                  onChange={(e) => setVoiceOver(e.target.value)}
                  placeholder="Dialogue or voice-over spoken during this scene..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">On-Screen Text (Overlay)</label>
                  <input
                    type="text"
                    value={onScreenText}
                    onChange={(e) => setOnScreenText(e.target.value)}
                    placeholder="e.g., TIP 1: CHECK TRACER STUDY"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Legacy Footage Note</label>
                  <input
                    type="text"
                    value={footageRef}
                    onChange={(e) => setFootageRef(e.target.value)}
                    placeholder="e.g., Campus Rectorate 4K (med-1)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Editor Notes</label>
                <input
                  type="text"
                  value={editorNotes}
                  onChange={(e) => setEditorNotes(e.target.value)}
                  placeholder="e.g., Add subtle ding sound effect when point appears, yellow text #F5C518"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingScene(null);
                  }}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#F5C518] hover:bg-[#E5B510] text-[#111827] font-bold rounded-lg shadow-xs"
                >
                  {editingScene ? 'Save Changes' : 'Add Scene'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Scene Dialog */}
      {previewScene && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-[#111827] text-white rounded-2xl max-w-lg w-full p-6 border border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-mono font-bold text-[#F5C518]">
                SCENE PREVIEW #{previewScene.sceneNumber} · {previewScene.durationSeconds} SECONDS
              </span>
              <button onClick={() => setPreviewScene(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            {/* Video frame simulator */}
            <div className="aspect-video bg-black rounded-xl border border-slate-800 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
              <div className="absolute top-3 left-3 bg-red-600 text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded">
                REC 00:0{previewScene.durationSeconds}
              </div>
              <div className="absolute top-3 right-3 text-[11px] font-mono text-slate-400">
                {previewScene.cameraAngle}
              </div>

              <Clapperboard className="w-12 h-12 text-[#F5C518]/60 mb-2" />
              <h4 className="text-sm font-bold text-white mb-1">{previewScene.title}</h4>
              <p className="text-xs text-slate-300 max-w-xs">{previewScene.visualDirection}</p>
              {(previewScene.aRollDirection || previewScene.bRollDirection) && <div className="mt-3 grid grid-cols-2 gap-2 text-left text-[11px] text-slate-300">
                <p><span className="block font-bold text-slate-500">A-ROLL</span>{previewScene.aRollDirection || '—'}</p>
                <p><span className="block font-bold text-slate-500">B-ROLL</span>{previewScene.bRollDirection || '—'}</p>
              </div>}

              {previewScene.onScreenText && (
                <div className="mt-3 bg-[#F5C518] text-[#111827] px-3 py-1 rounded text-xs font-black shadow-md">
                  {previewScene.onScreenText}
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs text-slate-300">
              <span className="text-slate-500 font-semibold text-[10px] block mb-1">AUDIO NARRATION:</span>
              <p className="italic">{previewScene.voiceOver || '(No voice-over dialogue)'}</p>
            </div>

            <button
              onClick={() => setPreviewScene(null)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg"
            >
              Close Preview
            </button>
          </div>
        </div>
      )}

      <ImportStoryboardModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImport}
        existingSceneCount={scenes.length}
        content={{
          title: activeContent.title,
          platform: activeContent.platform,
          format: activeContent.format,
          pillar: activeContent.pillar,
          brief: activeContent.description,
        }}
        options={importOptions}
      />
    </div>
  );
};
