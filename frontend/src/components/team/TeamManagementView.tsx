import React, { useEffect, useState } from 'react';
import {
  Users,
  Plus,
  Edit2,
  X,
} from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { ApiError } from '../../api/client';
import { Member } from '../../types/cms';

export const TeamManagementView: React.FC = () => {
  const {
    members,
    addMember,
    updateMember,
    toggleMemberActive,
    contents,
    debtSummaries,
    showToast,
    membersLoading,
    membersLoadError,
    searchMemberCandidates,
    getAssignableMemberRoles,
  } = useCMS();

  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [usernameQuery, setUsernameQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<{ id: string; username: string; name: string; avatar: string } | null>(null);
  const [candidateResults, setCandidateResults] = useState<Array<{ id: string; username: string; name: string; avatar: string }>>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [roles, setRoles] = useState<Array<{ id: string; role_key: string; name: string }>>([]);
  const [roleId, setRoleId] = useState('');
  const [weeklyTarget, setWeeklyTarget] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const handleOpenAdd = () => {
    setUsernameQuery('');
    setSelectedUser(null);
    setCandidateResults([]);
    setRoles([]);
    setRoleId('');
    setWeeklyTarget(2);
    setEditingMember(null);
    setFormError('');
    setShowAddModal(true);
  };

  const handleOpenEdit = (member: Member) => {
    setEditingMember(member);
    setSelectedUser(null);
    setRoleId(member.roleId || '');
    setWeeklyTarget(member.weeklyTarget || 2);
    setFormError('');
    setShowAddModal(true);
  };

  useEffect(() => {
    if (!showAddModal) return;
    let cancelled = false;
    getAssignableMemberRoles().then((availableRoles) => {
      if (cancelled) return;
      setRoles(availableRoles);
      setRoleId((current) => current || editingMember?.roleId || availableRoles.find((item) => item.role_key === 'editor')?.id || availableRoles[0]?.id || '');
    }).catch((error) => {
      if (!cancelled) setFormError(error instanceof ApiError ? error.message : 'Workspace roles could not be loaded.');
    });
    return () => { cancelled = true; };
  }, [showAddModal, editingMember, getAssignableMemberRoles]);

  useEffect(() => {
    if (!showAddModal || editingMember || usernameQuery.trim().length < 2) {
      setCandidateResults([]);
      setCandidateLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setCandidateLoading(true);
      searchMemberCandidates(usernameQuery).then((users) => {
        if (!cancelled) setCandidateResults(users);
      }).catch((error) => {
        if (!cancelled) setFormError(error instanceof ApiError ? error.message : 'User search is unavailable.');
      }).finally(() => {
        if (!cancelled) setCandidateLoading(false);
      });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [showAddModal, editingMember, usernameQuery, searchMemberCandidates]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!roleId || (!editingMember && !selectedUser)) {
      setFormError('Select a registered user and workspace role.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      if (editingMember) {
        await updateMember(editingMember.id, { roleId, weeklyTarget: Number(weeklyTarget) });
      } else if (selectedUser) {
        await addMember({ userId: selectedUser.id, roleId, weeklyTarget: Number(weeklyTarget) });
      }
      setShowAddModal(false);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Member could not be saved.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Team Management & Role Allocations
          </h2>
          <p className="text-xs text-slate-500">
            Manage student editorial staff profiles, weekly quota allocations, and production roster permissions.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[#111827] bg-[#F5C518] hover:bg-[#E5B510] active:scale-98 rounded-lg shadow-xs transition-all whitespace-nowrap self-start md:self-auto"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Add Team Member</span>
        </button>
      </div>

      {membersLoading && <div role="status" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">Loading workspace members…</div>}
      {!membersLoading && membersLoadError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{membersLoadError}</div>}
      {!membersLoading && !membersLoadError && members.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-xs text-slate-500">No registered team members in this workspace yet.</div>}

      {/* Members Directory Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map((member) => {
          const summary = debtSummaries.find((s) => s.memberId === member.id);
          const assignedContents = contents.filter(
            (c) => c.picId === member.id || c.contributorIds.includes(member.id)
          );

          return (
            <div
              key={member.id}
              className={`bg-white rounded-2xl border p-4 shadow-2xs flex flex-col justify-between space-y-4 transition-all ${
                member.active ? 'border-slate-200/80' : 'border-slate-200 opacity-60 bg-slate-50/50'
              }`}
            >
              <div>
                {/* Header card with avatar & active status */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    {member.avatar ? (
                      <img
                        src={member.avatar}
                        alt={member.name}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-slate-900 text-[#F5C518] flex items-center justify-center font-bold text-base">
                        {member.name[0]}
                      </div>
                    )}
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 leading-tight">
                        {member.name}
                      </h3>
                      <span className="text-[11px] font-semibold text-slate-600 block mt-0.5">
                        {member.role}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleOpenEdit(member)}
                    className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
                    title="Edit Profile"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="mb-3 text-[11px] text-slate-500">@{member.username || 'username'}</div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Weekly Quota</span>
                    <span className="font-mono font-bold text-slate-800">{member.weeklyTarget} Credits</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Earned Credits</span>
                    <span className="font-mono font-bold text-emerald-600">
                      {summary?.eligibleCredits || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Active Debt</span>
                    <span className="font-mono font-bold text-amber-700">
                      {summary?.currentDebt || 0}
                    </span>
                  </div>
                </div>

                {/* Assigned contents list */}
                <div className="mt-3 text-xs">
                  <span className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Active Projects ({assignedContents.length}):
                  </span>
                  <div className="space-y-1">
                    {assignedContents.slice(0, 2).map((c) => (
                      <div
                        key={c.id}
                        className="text-[11px] text-slate-700 truncate bg-slate-50 px-2 py-1 rounded"
                      >
                        • {c.title} ({c.status})
                      </div>
                    ))}
                    {assignedContents.length > 2 && (
                      <span className="text-[10px] text-slate-400 italic">
                        +{assignedContents.length - 2} other deliverables
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom active toggle */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">Roster Status</span>
                <button
                  onClick={() => { void toggleMemberActive(member.id); }}
                  className={`text-[11px] font-bold px-2 py-0.5 rounded transition-colors ${
                    member.active
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {member.active ? 'Active Roster' : 'Inactive'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Add / Edit Member */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                {editingMember ? 'Edit Team Member Record' : 'Add New Team Member'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              {!editingMember ? (
                <div className="relative">
                  <label className="mb-1 block font-semibold text-slate-700">Registered user</label>
                  {selectedUser ? (
                    <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5">
                      {selectedUser.avatar ? <img src={selectedUser.avatar} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 font-bold text-[#F5C518]">{selectedUser.name.slice(0, 1)}</div>}
                      <div className="min-w-0 flex-1"><div className="truncate font-semibold text-slate-800">{selectedUser.name}</div><div className="text-[11px] text-slate-500">@{selectedUser.username}</div></div>
                      <button type="button" onClick={() => { setSelectedUser(null); setUsernameQuery(''); }} className="rounded p-1 text-slate-500 hover:bg-white" aria-label="Clear selected user"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="search"
                        value={usernameQuery}
                        onChange={(event) => { setUsernameQuery(event.target.value); setFormError(''); }}
                        placeholder="Search by username"
                        aria-label="Search registered users by username"
                        autoComplete="off"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-[#F5C518] focus:ring-2 focus:ring-[#F5C518]/20"
                      />
                      {usernameQuery.trim().length > 0 && usernameQuery.trim().length < 2 && <p className="mt-1 text-[10px] text-slate-400">Type at least 2 characters.</p>}
                      {(candidateLoading || candidateResults.length > 0 || (usernameQuery.trim().length >= 2 && !candidateLoading)) && (
                        <div role="listbox" aria-label="Registered users" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                          {candidateLoading && <div className="px-3 py-2 text-[11px] text-slate-500">Searching users...</div>}
                          {!candidateLoading && candidateResults.map((user) => (
                            <button
                              key={user.id}
                              type="button"
                              role="option"
                              aria-selected="false"
                              onClick={() => { setSelectedUser(user); setUsernameQuery(''); setCandidateResults([]); }}
                              className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-slate-50"
                            >
                              {user.avatar ? <img src={user.avatar} alt="" className="h-8 w-8 rounded-full object-cover" /> : <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-700">{user.name.slice(0, 1)}</div>}
                              <span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-800">@{user.username}</span><span className="block truncate text-[11px] text-slate-500">{user.name}</span></span>
                            </button>
                          ))}
                          {!candidateLoading && candidateResults.length === 0 && <div className="px-3 py-2 text-[11px] text-slate-500">No eligible registered users found.</div>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  {editingMember.avatar ? <img src={editingMember.avatar} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 font-bold text-slate-700">{editingMember.name.slice(0, 1)}</div>}
                  <div><div className="font-semibold text-slate-800">{editingMember.name}</div><div className="text-[11px] text-slate-500">@{editingMember.username}</div></div>
                </div>
              )}

              <div>
                <label className="mb-1 block font-semibold text-slate-700">Workspace role</label>
                <select value={roleId} onChange={(event) => setRoleId(event.target.value)} required disabled={roles.length === 0} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900">
                  {roles.length === 0 && <option value="">No assignable roles available</option>}
                  {roles.map((availableRole) => <option key={availableRole.id} value={availableRole.id}>{availableRole.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Weekly Output Quota (Default: 2 Credits)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={weeklyTarget}
                  onChange={(event) => setWeeklyTarget(Number(event.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-slate-900"
                />
              </div>

              {formError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-4 text-rose-700">{formError}</div>}

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={submitting || roles.length === 0} className="px-4 py-2 bg-[#F5C518] hover:bg-[#E5B510] text-[#111827] font-bold rounded-lg shadow-xs disabled:cursor-wait disabled:opacity-60">
                  {submitting ? 'Saving...' : editingMember ? 'Save Changes' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
