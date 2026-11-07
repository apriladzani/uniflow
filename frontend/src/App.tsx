import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Building2, Check, ChevronRight, Clapperboard, Eye, EyeOff, Film, LogOut, LoaderCircle, Plus, Sparkles, Users, Video } from 'lucide-react';
import { CMSProvider, useCMS } from './context/CMSContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { ToastContainer } from './components/layout/ToastContainer';
import { DashboardView } from './components/dashboard/DashboardView';
import { CalendarView } from './components/calendar/CalendarView';
import { ProductionBoardView } from './components/kanban/ProductionBoardView';
import { ContentWorkspaceView } from './components/workspace/ContentWorkspaceView';
import { MediaLibraryView } from './components/media/MediaLibraryView';
import { AIAssistantView } from './components/ai/AIAssistantView';
import { ProfileView } from './components/profile/ProfileView';
import { TeamPerformanceView } from './components/performance/TeamPerformanceView';
import { ContentDebtView } from './components/debt/ContentDebtView';
import { TeamManagementView } from './components/team/TeamManagementView';
import { SettingsView } from './components/settings/SettingsView';
import { GoogleSignInButton } from './components/auth/GoogleSignInButton';
import { ForgotPasswordForm } from './components/auth/ForgotPasswordForm';
import { ContentModal } from './components/modals/ContentModal';
import { PublishVerificationModal } from './components/modals/PublishVerificationModal';
import { ContentItem } from './types/cms';
import { ApiError } from './api/client';
import { api } from './api/client';
import podcastStudioImage from './assets/images/media_podcast_studio_1792208216460.jpg';
import campusBrollImage from './assets/images/media_campus_broll_1792208216578.jpg';
import creativeLeadAvatar from './assets/images/avatar_creative_lead_1792208214781.jpg';
import videoEditorAvatar from './assets/images/avatar_video_editor_1792208215155.jpg';

const AuthScreen: React.FC = () => {
  const { login, register, loginWithGoogle } = useCMS();
  const [mode, setMode] = useState<'signin' | 'signup'>(() => window.location.hash === '#signup' ? 'signup' : 'signin');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem('uim_auth_remembered_email') || ''; } catch { return ''; }
  });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // Set while an existing password account must confirm its password to link Google.
  const [pendingGoogleCredential, setPendingGoogleCredential] = useState('');
  const [forgotPassword, setForgotPassword] = useState(() => window.location.hash.startsWith('#forgot-password'));
  // Set when the page was opened from the button in the reset email: the code step comes first.
  const [forgotLinkEmail, setForgotLinkEmail] = useState(() => (
    window.location.hash.startsWith('#forgot-password') ? new URLSearchParams(window.location.hash.split('?')[1] || '').get('email') || '' : ''
  ));

  const leaveForgotPassword = () => {
    setForgotPassword(false);
    setForgotLinkEmail('');
    if (window.location.hash.startsWith('#forgot-password')) window.history.replaceState(null, '', window.location.pathname);
  };

  const changeMode = (next: 'signin' | 'signup') => {
    setMode(next);
    setPendingGoogleCredential('');
    window.history.replaceState(null, '', next === 'signup' ? '#signup' : window.location.pathname);
    setError('');
    setNotice('');
  };

  const handleGoogleCredential = async (credential: string) => {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await loginWithGoogle(credential);
    } catch (googleError) {
      if (googleError instanceof ApiError && googleError.code === 'GOOGLE_LINK_PASSWORD_REQUIRED') {
        const claims = JSON.parse(atob(credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        setMode('signin');
        setEmail(claims.email || '');
        setPassword('');
        setPendingGoogleCredential(credential);
        setNotice(googleError.message);
      } else {
        setError(googleError instanceof ApiError ? googleError.message : 'Unable to connect to the server. Please try again.');
      }
    } finally { setLoading(false); }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (mode === 'signup' && name.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (mode === 'signup' && !/^[a-z0-9_]{3,30}$/i.test(username.trim())) {
      setError('Username must be 3–30 characters and use only letters, numbers, or underscores.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Your password must contain at least 8 characters.');
      return;
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    if (mode === 'signin' && rememberMe) {
      try { localStorage.setItem('uim_auth_remembered_email', email.trim()); } catch { /* storage is optional */ }
    } else if (mode === 'signin') {
      try { localStorage.removeItem('uim_auth_remembered_email'); } catch { /* storage is optional */ }
    }
    try {
      if (pendingGoogleCredential) await loginWithGoogle(pendingGoogleCredential, password);
      else await (mode === 'signin' ? login(email, password) : register(name, username, email, password));
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.code === 'GOOGLE_TOKEN_INVALID') setPendingGoogleCredential('');
      setError(submitError instanceof ApiError ? submitError.message : 'Unable to connect to the server. Please try again.');
    } finally { setLoading(false); }
  };

  return (
    <main className="auth-shell h-screen min-h-0 overflow-hidden bg-white lg:grid lg:grid-cols-2">
      <section className="auth-visual relative hidden h-full min-h-0 overflow-hidden lg:flex" aria-label="Uni Inside Media creative team">
        <img src={podcastStudioImage} alt="Podcast studio prepared for a content shoot" className="auth-visual-photo absolute inset-0 h-full w-full object-cover" />
        <div className="auth-visual-shade absolute inset-0" />
        <div className="auth-grain absolute inset-0" />
        <div className="relative z-10 flex h-full w-full flex-col p-7 xl:p-10">
          <div className="flex items-center gap-3 text-white">
            <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#F5C518] text-slate-950 shadow-lg shadow-black/10"><Clapperboard className="h-5 w-5" strokeWidth={2.4} /></div>
            <div><div className="text-[15px] font-extrabold tracking-tight">UNI INSIDE MEDIA</div><div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">Creative Studio</div></div>
          </div>

          <div className="auth-art flex min-h-0 flex-1 items-center justify-center py-4" aria-hidden="true">
            <div className="auth-frame relative aspect-[1.08] w-full max-w-[500px]">
              <div className="auth-orbit auth-orbit-one" /><div className="auth-orbit auth-orbit-two" />
              <div className="auth-art-image absolute inset-[12%_8%_14%_16%] overflow-hidden rounded-[34px] border border-white/25 shadow-2xl shadow-black/40">
                <img src={campusBrollImage} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-white/10" />
                <div className="absolute bottom-5 left-5 flex items-center gap-2 rounded-full border border-white/25 bg-slate-950/40 px-3 py-2 text-[11px] font-semibold text-white backdrop-blur-md"><span className="h-2 w-2 rounded-full bg-[#F5C518]" /> ON LOCATION <span className="text-white/50">•</span> 04:32</div>
              </div>
              <div className="auth-float-card auth-float-top absolute right-0 top-[13%] flex items-center gap-3 rounded-2xl border border-white/60 bg-white/95 p-3.5 shadow-xl shadow-black/15 backdrop-blur">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Video className="h-5 w-5" /></div><div><div className="text-[11px] font-bold text-slate-900">Shoot day</div><div className="mt-0.5 text-[10px] text-slate-500">Campus stories · In progress</div></div><span className="ml-1 h-2 w-2 rounded-full bg-emerald-500" />
              </div>
              <div className="auth-float-card auth-float-bottom absolute bottom-[8%] left-0 flex items-center gap-3 rounded-2xl border border-white/60 bg-white/95 p-3.5 shadow-xl shadow-black/15 backdrop-blur">
                <div className="flex -space-x-2"><img src={creativeLeadAvatar} alt="" className="h-9 w-9 rounded-full border-2 border-white object-cover" /><img src={videoEditorAvatar} alt="" className="h-9 w-9 rounded-full border-2 border-white object-cover" /><div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-[#F5C518] text-[10px] font-bold text-slate-900">+4</div></div><div><div className="text-[11px] font-bold text-slate-900">Made together</div><div className="mt-0.5 text-[10px] text-slate-500">One team, one story</div></div><Users className="ml-2 h-4 w-4 text-slate-400" />
              </div>
              <div className="auth-floating-mark absolute right-[15%] top-[38%] flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F5C518] text-slate-950 shadow-lg shadow-black/20"><Film className="h-5 w-5" /></div>
            </div>
          </div>

          <div className="max-w-lg pb-1 text-white">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#F5C518]"><span className="h-px w-7 bg-[#F5C518]" /> Stories move us forward</div>
            <h1 className="max-w-[560px] text-[30px] font-bold leading-[1.13] tracking-[-0.04em] xl:text-[36px]">Make good stories.<br /><span className="text-[#F5C518]">Make them together.</span></h1>
            <p className="mt-3 max-w-md text-[13px] leading-5 text-white/70">Your creative home for planning, producing, and sharing the stories that bring our community closer.</p>
          </div>
          <div className="mt-5 flex items-center justify-between text-[10px] text-white/45"><span>© 2025 Uni Inside Media</span><span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#F5C518]" /> Stories made with purpose</span></div>
        </div>
      </section>

      <section className="auth-form-side relative flex h-full min-h-0 items-center justify-center overflow-y-auto overscroll-contain px-5 py-6 sm:px-10 lg:px-10 xl:px-16">
        <div className="absolute left-6 top-6 flex items-center gap-2.5 lg:hidden"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F5C518] text-slate-950"><Clapperboard className="h-4 w-4" /></span><span className="text-xs font-extrabold tracking-wide text-slate-900">UNI INSIDE MEDIA</span></div>
        <div className="auth-form-content w-full max-w-[420px] py-10 lg:py-0">
          <div className="mb-5 hidden items-center justify-between lg:flex"><div className="text-xs font-semibold text-slate-400">Member access</div><div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> YOUR CREATIVE WORKSPACE</div></div>
          {forgotPassword ? (
            <ForgotPasswordForm
              initialEmail={forgotLinkEmail || email}
              initialStep={forgotLinkEmail ? 'otp' : 'email'}
              onCancel={leaveForgotPassword}
              onComplete={(resetEmail) => {
                setEmail(resetEmail);
                setPassword('');
                leaveForgotPassword();
                setNotice('Your password has been updated. Sign in with your new password.');
              }}
            />
          ) : <>
          <div className="mb-5">
            <h2 className="text-[30px] font-bold tracking-[-0.04em] text-slate-900">{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h2>
            <p className="mt-1.5 text-[13px] leading-5 text-slate-500">{mode === 'signin' ? 'Sign in to pick up where your team left off.' : 'Join your team and bring your next story to life.'}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
            {mode === 'signup' && <div><label htmlFor="auth-name" className="mb-2 block text-xs font-semibold text-slate-700">Full name</label><input id="auth-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required minLength={2} className="auth-input" placeholder="Your full name" /></div>}
            {mode === 'signup' && <div><label htmlFor="auth-username" className="mb-2 block text-xs font-semibold text-slate-700">Username</label><input id="auth-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]{3,30}" className="auth-input" placeholder="e.g. apriladzani" /><p className="mt-1 text-[10px] text-slate-400">Use letters, numbers, and underscores.</p></div>}
            <div><label htmlFor="auth-email" className="mb-2 block text-xs font-semibold text-slate-700">Email address</label><input id="auth-email" type="email" value={email} readOnly={Boolean(pendingGoogleCredential)} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required className="auth-input" placeholder="you@example.com" /></div>
            <div><div className="mb-2 flex items-center justify-between"><label htmlFor="auth-password" className="block text-xs font-semibold text-slate-700">Password</label>{mode === 'signin' && <button type="button" onClick={() => { setError(''); setNotice(''); setForgotPassword(true); }} className="text-[11px] font-semibold text-slate-500 transition hover:text-slate-900">Forgot password?</button>}</div><div className="relative"><input id="auth-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={8} className="auth-input pr-12" placeholder={mode === 'signin' ? 'Enter your password' : 'At least 8 characters'} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-slate-700" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
            {mode === 'signup' && <div><label htmlFor="auth-confirm" className="mb-2 block text-xs font-semibold text-slate-700">Confirm password</label><div className="relative"><input id="auth-confirm" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required minLength={8} className="auth-input pr-12" placeholder="Enter your password again" /><span className="pointer-events-none absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-300"><Check className="h-4 w-4" /></span></div></div>}
            {mode === 'signin' && <label className="flex cursor-pointer items-center gap-2.5 text-xs text-slate-600"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 accent-[#F5C518]" />Remember me</label>}
            {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs leading-5 text-rose-700">{error}</div>}
            {notice && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-800">{notice}</div>}
            <button type="submit" disabled={loading} className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#F5C518] px-4 py-[13px] text-sm font-bold text-slate-950 shadow-[0_5px_12px_rgba(245,197,24,0.17)] transition hover:bg-[#E5B510] disabled:cursor-wait disabled:opacity-70">{loading ? <><LoaderCircle className="h-4 w-4 animate-spin" /> {mode === 'signin' ? 'Signing in…' : 'Creating account…'}</> : <>{mode === 'signin' ? 'Sign In' : 'Sign Up'}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>}</button>
          </form>

          {!pendingGoogleCredential && <GoogleSignInButton mode={mode} onCredential={handleGoogleCredential} />}

          <p className="mt-5 text-center text-xs text-slate-500">{mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}<button type="button" onClick={() => changeMode(mode === 'signin' ? 'signup' : 'signin')} className="font-bold text-slate-900 underline decoration-[#F5C518] decoration-2 underline-offset-[3px] transition hover:text-amber-700">{mode === 'signin' ? 'Sign Up' : 'Sign In'}</button></p>
          </>}
          <div className="auth-form-extras">
            <div className="my-5 flex items-center gap-3"><div className="h-px flex-1 bg-slate-100" /><span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-300">A space to create</span><div className="h-px flex-1 bg-slate-100" /></div>
            <div className="grid grid-cols-3 gap-2.5 text-center"><div className="rounded-xl bg-slate-50 px-2 py-2.5"><Video className="mx-auto h-4 w-4 text-slate-400" /><div className="mt-1.5 text-[9px] font-semibold text-slate-500">Production</div></div><div className="rounded-xl bg-slate-50 px-2 py-2.5"><Users className="mx-auto h-4 w-4 text-slate-400" /><div className="mt-1.5 text-[9px] font-semibold text-slate-500">Teamwork</div></div><div className="rounded-xl bg-slate-50 px-2 py-2.5"><Film className="mx-auto h-4 w-4 text-slate-400" /><div className="mt-1.5 text-[9px] font-semibold text-slate-500">Storytelling</div></div></div>
            <p className="mt-5 text-center text-[10px] text-slate-400">By continuing, you agree to our <span className="font-medium text-slate-500">Terms</span> and <span className="font-medium text-slate-500">Privacy Policy</span>.</p>
          </div>
        </div>
      </section>
    </main>
  );
};

const WorkspaceSelectionScreen: React.FC = () => {
  const { workspaces, selectWorkspace, createWorkspace, joinWorkspace, logout } = useCMS();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [role, setRole] = useState('Creative Coordinator');
  const [inviteCode, setInviteCode] = useState('');
  const [joinError, setJoinError] = useState('');

  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const handleJoin = async (event: React.FormEvent) => {
    event.preventDefault();
    const code = inviteCode.trim();
    if (!code) {
      setJoinError('Enter a workspace invite code to continue.');
      return;
    }
    setWorkspaceLoading(true);
    try { await joinWorkspace(code); }
    catch (error) { setJoinError(error instanceof ApiError ? error.message : 'Unable to join this workspace. Please try again.'); }
    finally { setWorkspaceLoading(false); }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setWorkspaceLoading(true);
    try { await createWorkspace({ name: name.trim(), description: description.trim(), role }); }
    catch (error) { setJoinError(error instanceof ApiError ? error.message : 'Unable to create workspace. Please try again.'); }
    finally { setWorkspaceLoading(false); }
    setName('');
    setDescription('');
    setRole('Creative Coordinator');
    setIsCreateOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 lg:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">UniFlow</div>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{workspaces.length ? 'All workspaces' : 'Create or join a workspace'}</h1>
          </div>
          <button type="button" onClick={logout} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"><LogOut className="h-4 w-4" />Log out</button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              onClick={() => selectWorkspace(workspace.id)}
              className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-bold text-slate-900" style={{ backgroundColor: workspace.accent }}>
                    {workspace.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-lg font-bold text-slate-900">{workspace.name}</div>
                    <div className="text-xs text-slate-500">{workspace.status}</div>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-400 transition group-hover:text-slate-700" />
              </div>

              <p className="mb-3 flex-1 text-xs leading-5 text-slate-600">{workspace.description}</p>

              <div className="grid gap-2 border-t border-slate-200 pt-4 text-xs text-slate-600">
                <div className="flex items-center justify-between">
                  <span>Your role</span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">{workspace.role}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Members</span>
                  <span className="font-semibold text-slate-800">{workspace.memberCount ?? workspace.members.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Content</span>
                  <span className="font-semibold text-slate-800">{workspace.contentCount ?? workspace.contents.length}</span>
                </div>
              </div>
            </button>
          ))}

          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="flex min-h-[150px] items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center text-slate-600 transition hover:border-[#F5C518] hover:bg-amber-50 hover:text-slate-900"
          >
            <div>
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm">
                <Plus className="h-5 w-5" />
              </div>
              <div className="text-sm font-semibold">Create new workspace</div>
            </div>
          </button>

          {workspaces.length === 0 && (
            <form onSubmit={handleJoin} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-1 text-sm font-semibold text-slate-900">Join a workspace</div>
              <p className="mb-4 text-xs leading-5 text-slate-500">Enter an invite code from your team to join their workspace.</p>
              <input value={inviteCode} onChange={(event) => { setInviteCode(event.target.value); setJoinError(''); }} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none transition focus:border-[#F5C518] focus:bg-white focus:ring-2 focus:ring-[#F5C518]/20" placeholder="Workspace invite code" aria-label="Workspace invite code" />
              {joinError && <p role="alert" className="mt-2 text-[11px] text-rose-600">{joinError}</p>}
              <button type="submit" disabled={workspaceLoading} className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">{workspaceLoading ? 'Joining…' : 'Join workspace'}</button>
            </form>
          )}
        </div>
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">New workspace</div>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">Create workspace</h2>
              </div>
              <button type="button" onClick={() => setIsCreateOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Workspace name</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-[#F5C518] focus:bg-white focus:ring-2 focus:ring-[#F5C518]/20"
                  placeholder="Example: UniInside Academy"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Description</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-[#F5C518] focus:bg-white focus:ring-2 focus:ring-[#F5C518]/20"
                  placeholder="Describe the focus of this workspace"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Initial role</label>
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-[#F5C518] focus:bg-white focus:ring-2 focus:ring-[#F5C518]/20"
                >
                  <option value="Owner">Owner</option>
                  <option value="Workspace Manager">Workspace Manager</option>
                  <option value="Creative Coordinator">Creative Coordinator</option>
                  <option value="Editor">Editor</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700">Cancel</button>
                <button type="submit" className="rounded-xl bg-[#F5C518] px-4 py-2.5 text-sm font-semibold text-[#111827] hover:bg-[#E5B510]">Create workspace</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const WorkspaceManagementPage: React.FC = () => {
  const { workspaces, currentWorkspace, selectWorkspace, createWorkspace } = useCMS();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [role, setRole] = useState('Creative Coordinator');

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    try { await createWorkspace({ name: name.trim(), description: description.trim(), role }); } catch { return; }
    setName('');
    setDescription('');
    setRole('Creative Coordinator');
    setIsCreateOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Workspace</div>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">Manage workspace</h2>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#F5C518] px-4 py-2.5 text-sm font-semibold text-[#111827] transition hover:bg-[#E5B510]"
        >
          <Plus className="h-4 w-4" />
          Create workspace
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Building2 className="h-4 w-4 text-[#F5C518]" />
            Workspace list
          </div>
          <div className="space-y-4">
            {workspaces.map((workspace) => (
              <div key={workspace.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-slate-900" style={{ backgroundColor: workspace.accent }}>
                      {workspace.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">{workspace.name}</div>
                      <div className="text-xs text-slate-500">{workspace.description}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700">{workspace.role}</span>
                    <button
                      type="button"
                      onClick={() => selectWorkspace(workspace.id)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      {workspace.id === currentWorkspace?.id ? 'Active' : 'Select'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Sparkles className="h-4 w-4 text-[#F5C518]" />
            Workspace role preview
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Current active</div>
            <div className="mt-3 text-2xl font-bold text-slate-900">{currentWorkspace?.name}</div>
            <div className="mt-2 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">{currentWorkspace?.role}</div>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <div className="flex items-center justify-between"><span>Members</span><span className="font-semibold text-slate-800">{currentWorkspace?.members.length ?? 0}</span></div>
              <div className="flex items-center justify-between"><span>Content</span><span className="font-semibold text-slate-800">{currentWorkspace?.contentCount ?? 0}</span></div>
              <div className="flex items-center justify-between"><span>Status</span><span className="font-semibold text-slate-800">{currentWorkspace?.status}</span></div>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Workspace members</div>
            <div className="space-y-2">
              {(currentWorkspace?.members ?? []).slice(0, 4).map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium text-slate-800">{member.name}</div>
                    <div className="text-xs text-slate-500">{member.role}</div>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${member.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                    {member.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">New</div>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">Create workspace</h2>
              </div>
              <button type="button" onClick={() => setIsCreateOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">✕</button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Workspace name</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-[#F5C518] focus:bg-white focus:ring-2 focus:ring-[#F5C518]/20"
                  placeholder="Example: UniInside Commerce"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Description</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-[#F5C518] focus:bg-white focus:ring-2 focus:ring-[#F5C518]/20"
                  placeholder="Describe this workspace"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Initial role</label>
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-[#F5C518] focus:bg-white focus:ring-2 focus:ring-[#F5C518]/20"
                >
                  <option value="Owner">Owner</option>
                  <option value="Workspace Manager">Workspace Manager</option>
                  <option value="Creative Coordinator">Creative Coordinator</option>
                  <option value="Editor">Editor</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700">Cancel</button>
                <button type="submit" className="rounded-xl bg-[#F5C518] px-4 py-2.5 text-sm font-semibold text-[#111827] hover:bg-[#E5B510]">Create workspace</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const MainContent: React.FC = () => {
  const { activeTab, setActiveTab, contents, selectedContentId, setSelectedContentId, isAuthenticated, authLoading, showWorkspacePicker, currentWorkspace, contentLoading, contentLoadError, selectWorkspace } = useCMS();

  const [routeReady, setRouteReady] = useState(false);
  const [routeError, setRouteError] = useState('');
  const routeSyncMode = useRef<'push' | 'replace'>('push');
  const initialPathResolved = useRef(false);

  const [isContentModalOpen, setIsContentModalOpen] = useState(false);
  const [editContentData, setEditContentData] = useState<ContentItem | null>(null);
  const [defaultDateForCreate, setDefaultDateForCreate] = useState<string | undefined>(undefined);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [publishTargetContent, setPublishTargetContent] = useState<ContentItem | null>(null);

  const handleOpenCreate = () => {
    setEditContentData(null);
    setDefaultDateForCreate(undefined);
    setIsContentModalOpen(true);
  };

  const handleOpenCreateWithDate = (date: string) => {
    setEditContentData(null);
    setDefaultDateForCreate(date);
    setIsContentModalOpen(true);
  };

  const handleOpenEdit = (content: ContentItem) => {
    setEditContentData(content);
    setIsContentModalOpen(true);
  };

  const handleOpenPublish = (content?: ContentItem) => {
    const target = content || contents.find((item) => item.id === selectedContentId) || contents[0];
    if (target) {
      setPublishTargetContent(target);
      setIsPublishModalOpen(true);
    }
  };

  const activeContent = contents.find((item) => item.id === selectedContentId) || contents[0];

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setRouteReady(false);
      setRouteError('');
      initialPathResolved.current = false;
      return;
    }

    const validTabs = new Set(['dashboard', 'calendar', 'kanban', 'workspace', 'storyboard', 'workspace-management', 'media', 'ai', 'performance', 'debt', 'team', 'settings', 'profile']);
    const applyPath = async (path: string) => {
      routeSyncMode.current = 'replace';
      setRouteError('');
      let parts: string[];
      try { parts = path.split('/').filter(Boolean).map((part) => decodeURIComponent(part)); }
      catch { setRouteError('This page could not be found.'); setRouteReady(true); return; }
      let workspaceKey = '';
      let section = 'dashboard';
      let contentKey = '';
      if (parts[0] === 'w') {
        if (parts[2] === 'content' ? parts.length !== 4 : parts.length > 3) {
          setRouteError('This page could not be found.'); setRouteReady(true); return;
        }
        workspaceKey = parts[1] || '';
        if (parts[2] === 'content') contentKey = parts[3] || '';
        else if (parts[2]) section = parts[2];
      } else if (parts[0] === 'workspace') {
        // Legacy UUID routes are resolved by the same permission checked endpoint.
        if (parts[2] === 'content' ? parts.length !== 4 : parts.length > 3) {
          setRouteError('This page could not be found.'); setRouteReady(true); return;
        }
        workspaceKey = parts[1] || '';
        if (parts[2] === 'content') contentKey = parts[3] || '';
        else if (parts[2]) section = parts[2];
      } else {
        setActiveTab('dashboard');
        setRouteReady(true);
        return;
      }

      try {
        if (!workspaceKey || (contentKey && !contentKey.trim()) || (!contentKey && !validTabs.has(section))) {
          throw new Error('This page could not be found.');
        }
        const { workspace } = await api<{ workspace: { id: string; slug: string } }>(`/workspaces/slug/${encodeURIComponent(workspaceKey)}`);
        selectWorkspace(workspace.id);
        if (contentKey) {
          const resolved = await api<{ workspaceId: string; contentId: string; contentSlug: string }>(
            `/workspaces/slug/${encodeURIComponent(workspace.slug)}/content/${encodeURIComponent(contentKey)}`
          );
          setSelectedContentId(resolved.contentId);
          setActiveTab('workspace');
        } else {
          setActiveTab(section);
        }
      } catch (error) {
        setRouteError(error instanceof ApiError && error.status === 404 ? 'Workspace or content not found.' : error instanceof Error ? error.message : 'Workspace or content not found.');
      } finally {
        setRouteReady(true);
      }
    };

    const handlePopState = () => { void applyPath(window.location.pathname); };
    window.addEventListener('popstate', handlePopState);
    if (!initialPathResolved.current) {
      initialPathResolved.current = true;
      void applyPath(window.location.pathname);
    }
    return () => window.removeEventListener('popstate', handlePopState);
  }, [authLoading, isAuthenticated, selectWorkspace, setActiveTab, setSelectedContentId]);

  useEffect(() => {
    if (!isAuthenticated || !routeReady || routeError || !currentWorkspace?.slug) return;
    let nextPath = `/w/${encodeURIComponent(currentWorkspace.slug)}/${encodeURIComponent(activeTab)}`;
    if (activeTab === 'workspace' || activeTab === 'storyboard') {
      const selectedContent = contents.find((item) => item.id === selectedContentId);
      if (selectedContentId && !selectedContent) return;
      if (selectedContent?.slug) nextPath = `/w/${encodeURIComponent(currentWorkspace.slug)}/content/${encodeURIComponent(selectedContent.slug)}`;
    }
    if (window.location.pathname !== nextPath) {
      if (routeSyncMode.current === 'replace') window.history.replaceState(null, '', nextPath);
      else window.history.pushState(null, '', nextPath);
    }
    routeSyncMode.current = 'push';
  }, [activeTab, contents, currentWorkspace?.slug, isAuthenticated, routeError, routeReady, selectedContentId]);

  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-white"><LoaderCircle className="h-6 w-6 animate-spin text-[#F5C518]" aria-label="Loading session" /></div>;
  if (!isAuthenticated) return <AuthScreen />;
  if (routeError) return <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-6"><section className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><h1 className="text-xl font-bold text-slate-900">Page not found</h1><p className="mt-2 text-sm text-slate-500">{routeError}</p><button onClick={() => { setRouteError(''); setRouteReady(true); setActiveTab('dashboard'); }} className="mt-5 rounded-lg bg-[#F5C518] px-4 py-2 text-sm font-semibold text-slate-900">Go to workspace</button></section></main>;
  if (showWorkspacePicker) return <WorkspaceSelectionScreen />;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F8FAFC]">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onOpenCreateModal={handleOpenCreate} />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {contentLoading && <div role="status" className="mx-auto mb-3 max-w-[1520px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">Loading workspace content...</div>}
          {!contentLoading && contentLoadError && <div role="alert" className="mx-auto mb-3 max-w-[1520px] rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{contentLoadError}</div>}
          <div className="max-w-[1520px] mx-auto">
            {activeTab === 'dashboard' && <DashboardView />}
            {activeTab === 'calendar' && (
              <CalendarView
                onOpenCreateWithDate={handleOpenCreateWithDate}
                onOpenEditModal={handleOpenEdit}
              />
            )}
            {activeTab === 'kanban' && (
              <ProductionBoardView
                onOpenPublishModal={handleOpenPublish}
              />
            )}
            {(activeTab === 'workspace' || activeTab === 'storyboard') && (
              <ContentWorkspaceView
                onOpenPublishModal={() => handleOpenPublish()}
                onOpenEditModal={() => activeContent && handleOpenEdit(activeContent)}
              />
            )}
            {activeTab === 'workspace-management' && <WorkspaceManagementPage />}
            {activeTab === 'media' && <MediaLibraryView />}
            {activeTab === 'ai' && <AIAssistantView />}
            {activeTab === 'performance' && <TeamPerformanceView />}
            {activeTab === 'debt' && <ContentDebtView />}
            {activeTab === 'team' && <TeamManagementView />}
            {activeTab === 'settings' && <SettingsView />}
            {activeTab === 'profile' && <ProfileView />}
          </div>
        </main>
      </div>

      <ContentModal
        isOpen={isContentModalOpen}
        onClose={() => setIsContentModalOpen(false)}
        initialData={editContentData}
        defaultDate={defaultDateForCreate}
      />

      {publishTargetContent && (
        <PublishVerificationModal
          isOpen={isPublishModalOpen}
          onClose={() => {
            setIsPublishModalOpen(false);
            setPublishTargetContent(null);
          }}
          content={publishTargetContent}
        />
      )}

      <ToastContainer />
      <div className="fixed bottom-4 right-4 z-40 hidden rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs font-medium text-slate-700 shadow-lg backdrop-blur-sm md:flex">
        {currentWorkspace?.name ?? 'Workspace'}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <CMSProvider>
      <MainContent />
    </CMSProvider>
  );
}
