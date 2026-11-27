import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, AtSign, Building2, Check, ChevronRight, Clapperboard, Eye, EyeOff, Film, Lock, LogOut, LoaderCircle, Mail, Plus, Sparkles, User, Users, Video } from 'lucide-react';
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
import { AdminView } from './components/admin/AdminView';
import { BrandLogo } from './branding';
import { GoogleSignInButton } from './components/auth/GoogleSignInButton';
import { ForgotPasswordForm } from './components/auth/ForgotPasswordForm';
import { AUTH_COPY, AuthLang, readAuthLang, saveAuthLang } from './components/auth/authCopy';
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
  const [lang, setLangState] = useState<AuthLang>(readAuthLang);
  const t = AUTH_COPY[lang];
  const setLang = (next: AuthLang) => { setLangState(next); saveAuthLang(next); };
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = lang;
    return () => { document.documentElement.lang = previous; };
  }, [lang]);
  const [mode, setMode] = useState<'signin' | 'signup'>(() => window.location.hash === '#signup' ? 'signup' : 'signin');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem('uim_auth_remembered_email') || ''; } catch { return ''; }
  });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Sign-up is split in two steps (account details, then password) so the card keeps the sign-in size.
  const [signupStep, setSignupStep] = useState<1 | 2>(1);
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
    setSignupStep(1);
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
        setError(googleError instanceof ApiError ? googleError.message : t.errNetwork);
      }
    } finally { setLoading(false); }
  };

  const nameState = name;
  const usernameState = username;
  const emailState = email;
  const passwordState = password;
  const confirmPasswordState = confirmPassword;
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    // Browser/password-manager autofill (notably Safari) can fill inputs without firing
    // React's onChange, leaving state empty. Read the live DOM values at submit time.
    const form = event.currentTarget;
    const field = (id: string, fallback: string) => {
      const input = form.elements.namedItem(id);
      return input instanceof HTMLInputElement ? input.value : fallback;
    };
    const name = field('auth-name', nameState);
    const username = field('auth-username', usernameState);
    const email = field('auth-email', emailState);
    const password = field('auth-password', passwordState);
    const confirmPassword = field('auth-confirm', confirmPasswordState);
    setName(name); setUsername(username); setEmail(email); setPassword(password); setConfirmPassword(confirmPassword);
    const signupDetails = mode === 'signup' && signupStep === 1;
    if (signupDetails && name.trim().length < 2) {
      setError(t.errName);
      return;
    }
    if (signupDetails && !/^[a-z0-9_]{3,30}$/i.test(username.trim())) {
      setError(t.errUsername);
      return;
    }
    if ((mode === 'signin' || signupDetails) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t.errEmail);
      return;
    }
    if (signupDetails) {
      setSignupStep(2);
      return;
    }
    if (password.length < 8) {
      setError(t.errPasswordLength);
      return;
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setError(t.errPasswordMatch);
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
      // A taken username or email is fixed on the first step.
      if (submitError instanceof ApiError && (submitError.code === 'USERNAME_IN_USE' || submitError.code === 'EMAIL_IN_USE')) setSignupStep(1);
      setError(submitError instanceof ApiError ? submitError.message : t.errNetwork);
    } finally { setLoading(false); }
  };

  // Card contents rise in turn, 70ms apart, once the card has settled.
  const rise = (index: number) => ({ '--d': `${420 + index * 70}ms` } as React.CSSProperties);
  const at = (ms: number) => ({ '--d': `${ms}ms` } as React.CSSProperties);

  return (
    <main className="auth-page">
      {/* Full-bleed photo plate: never animated. Shades sit above it, UI above those. */}
      <img src={podcastStudioImage} alt="" className="auth-plate" />
      <div className="auth-shade" aria-hidden="true" />

      <section className="auth-hero" aria-label={t.heroLabel}>
        <div className="auth-brand auth-anim auth-fade-up" style={at(0)}>
          <BrandLogo className="auth-logo" imageClassName="auth-logo auth-logo-image" iconClassName="auth-logo-icon" strokeWidth={2.4} />
          <div>
            <div className="auth-brand-name">UNI INSIDE MEDIA</div>
            <div className="auth-brand-tagline">{t.tagline}</div>
          </div>
        </div>

        <div className="auth-collage" aria-hidden="true">
          <div className="auth-ring auth-ring-inner"><span /></div>
          <div className="auth-ring auth-ring-outer"><span /></div>
          <div className="auth-campus auth-anim auth-scale-in" style={at(300)}>
            <div className="auth-campus-photo"><img src={campusBrollImage} alt="" /></div>
            <div className="auth-campus-pill"><span className="auth-dot auth-dot-yellow" /> {t.onLocation} <span className="auth-campus-sep">·</span> 04:32</div>
          </div>
          <div className="auth-chip auth-chip-shoot">
            <div className="auth-chip-icon"><Video /></div>
            <div className="auth-chip-text"><div className="auth-chip-title">{t.shootDay}</div><div className="auth-chip-sub">{t.shootDaySub}</div></div>
            <span className="auth-dot auth-dot-green" />
          </div>
          <div className="auth-chip auth-chip-team">
            <div className="auth-avatars"><img src={creativeLeadAvatar} alt="" /><img src={videoEditorAvatar} alt="" /><span>+4</span></div>
            <div className="auth-chip-text"><div className="auth-chip-title">{t.madeTogether}</div><div className="auth-chip-sub">{t.madeTogetherSub}</div></div>
            <Users className="auth-chip-trail" />
          </div>
          <div className="auth-film"><Film /></div>
        </div>

        <div className="auth-pitch">
          <div className="auth-eyebrow auth-anim auth-fade" style={at(700)}><span /> {t.eyebrow}</div>
          <h1 className="auth-headline">
            <span className="auth-line"><span className="auth-anim auth-wipe" style={at(800)}>{t.headline1}</span></span>
            <span className="auth-line"><span className="auth-anim auth-wipe auth-headline-accent" style={at(900)}>{t.headline2}</span></span>
          </h1>
          <p className="auth-subline auth-anim auth-fade-up" style={at(1050)}>{t.subline}</p>
        </div>

        <div className="auth-footer auth-anim auth-fade" style={at(1150)}>
          <span>© 2025 Uni Inside Media</span>
          <span className="auth-footer-right"><span className="auth-dot auth-dot-yellow" /> {t.footer}</span>
        </div>
      </section>

      <section className={`auth-card auth-anim auth-card-in${mode === 'signup' && !forgotPassword ? ' is-signup' : ''}`} style={at(150)} aria-label={mode === 'signin' ? t.signInLabel : t.signUpLabel}>
        <div className="auth-form">
          <div className="auth-card-head auth-anim auth-rise" style={rise(0)}>
            <span className="auth-card-eyebrow"><span className="auth-dot auth-dot-green" /> {t.memberAccess}</span>
            <div className="auth-lang" role="group" aria-label={t.languageLabel}>
              {(['en', 'id'] as const).map((option) => (
                <button key={option} type="button" lang={option} aria-pressed={lang === option} onClick={() => setLang(option)} className={lang === option ? 'is-active' : ''}>{option.toUpperCase()}</button>
              ))}
            </div>
          </div>
          {forgotPassword ? (
            <div className="auth-forgot auth-anim auth-rise" style={rise(1)}>
              <ForgotPasswordForm
                lang={lang}
                initialEmail={forgotLinkEmail || email}
                initialStep={forgotLinkEmail ? 'otp' : 'email'}
                onCancel={leaveForgotPassword}
                onComplete={(resetEmail) => {
                  setEmail(resetEmail);
                  setPassword('');
                  leaveForgotPassword();
                  setNotice(t.passwordUpdated);
                }}
              />
            </div>
          ) : <>
          <div className="auth-title auth-anim auth-rise" style={rise(1)}>
            <h2>{mode === 'signin' ? t.signInTitle : t.signUpTitle}</h2>
            <p>{mode === 'signin' ? t.signInSub : t.signUpSub}</p>
          </div>

          {mode === 'signup' && (
            <div className="auth-step auth-anim auth-rise" style={rise(2)}>
              <span className="auth-step-num">{signupStep}</span>
              <span className="auth-step-title">{signupStep === 1 ? t.stepAccount : t.stepPassword}</span>
              <span className="auth-step-dots" role="img" aria-label={t.stepOf(signupStep)}>
                {[1, 2].map((step) => <span key={step} className={step === signupStep ? 'is-active' : step < signupStep ? 'is-done' : ''} />)}
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-fields" noValidate>
            {mode === 'signin' && <>
              <div className="auth-field auth-anim auth-rise" style={rise(2)}>
                <label htmlFor="auth-email" className="auth-label">{t.email}</label>
                <div className="auth-control"><Mail className="auth-control-icon" /><input id="auth-email" type="email" value={email} readOnly={Boolean(pendingGoogleCredential)} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required className="auth-input" placeholder={t.emailPlaceholder} /></div>
              </div>
              <div className="auth-field auth-anim auth-rise" style={rise(3)}>
                <label htmlFor="auth-password" className="auth-label">{t.password}</label>
                <div className="auth-control auth-password"><Lock className="auth-control-icon" /><input id="auth-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required minLength={8} className="auth-input" placeholder={t.passwordPlaceholder} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="auth-eye" aria-label={showPassword ? t.hidePassword : t.showPassword} aria-pressed={showPassword}>{showPassword ? <EyeOff /> : <Eye />}</button></div>
              </div>
              <div className="auth-options auth-anim auth-rise" style={rise(4)}>
                <label className="auth-remember"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="auth-checkbox" />{t.rememberMe}</label>
                <button type="button" onClick={() => { setError(''); setNotice(''); setForgotPassword(true); }} className="auth-link-strong">{t.forgotPassword}</button>
              </div>
            </>}

            {mode === 'signup' && signupStep === 1 && <>
              <div className="auth-row auth-anim auth-rise" style={rise(3)}>
                <div className="auth-field">
                  <label htmlFor="auth-name" className="auth-label">{t.fullName}</label>
                  <div className="auth-control"><User className="auth-control-icon" /><input id="auth-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required minLength={2} className="auth-input" placeholder={t.fullNamePlaceholder} autoFocus={!name} /></div>
                </div>
                <div className="auth-field">
                  <label htmlFor="auth-username" className="auth-label">{t.username}</label>
                  <div className="auth-control"><AtSign className="auth-control-icon" /><input id="auth-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]{3,30}" title={t.usernameHint} className="auth-input" placeholder={t.usernamePlaceholder} /></div>
                </div>
              </div>
              <div className="auth-field auth-anim auth-rise" style={rise(4)}>
                <label htmlFor="auth-email" className="auth-label">{t.email}</label>
                <div className="auth-control"><Mail className="auth-control-icon" /><input id="auth-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required className="auth-input" placeholder={t.emailPlaceholder} /></div>
              </div>
            </>}

            {mode === 'signup' && signupStep === 2 && (
              <div className="auth-row auth-step-enter">
                <div className="auth-field">
                  <label htmlFor="auth-password" className="auth-label">{t.password}</label>
                  <div className="auth-control auth-password"><Lock className="auth-control-icon" /><input id="auth-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required minLength={8} className="auth-input" placeholder={t.passwordShortPlaceholder} autoFocus /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="auth-eye" aria-label={showPassword ? t.hidePassword : t.showPassword} aria-pressed={showPassword}>{showPassword ? <EyeOff /> : <Eye />}</button></div>
                </div>
                <div className="auth-field">
                  <label htmlFor="auth-confirm" className="auth-label">{t.confirmPassword}</label>
                  <div className="auth-control auth-password"><Lock className="auth-control-icon" /><input id="auth-confirm" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required minLength={8} className="auth-input" placeholder={t.confirmShortPlaceholder} /><span className="auth-eye auth-eye-static" aria-hidden="true"><Check /></span></div>
                </div>
              </div>
            )}

            {error && <div role="alert" className="auth-alert auth-alert-error">{error}</div>}
            {notice && <div role="status" className="auth-alert auth-alert-notice">{notice}</div>}

            {mode === 'signup' && signupStep === 2 ? (
              <div className="auth-actions">
                <button type="button" onClick={() => { setSignupStep(1); setError(''); }} className="auth-back-button"><ArrowLeft />{t.back}</button>
                <button type="submit" disabled={loading} className="auth-submit">{loading ? <><LoaderCircle className="auth-spin" /> {t.creatingAccount}</> : <>{t.createAccount}<ArrowRight className="auth-submit-arrow" /></>}</button>
              </div>
            ) : (
              <button type="submit" disabled={loading} className="auth-submit auth-anim auth-rise" style={rise(5)}>
                {loading ? <><LoaderCircle className="auth-spin" /> {t.signingIn}</> : <>{mode === 'signin' ? t.signIn : t.nextStep}<ArrowRight className="auth-submit-arrow" /></>}
              </button>
            )}
          </form>

          {!pendingGoogleCredential && !(mode === 'signup' && signupStep === 2) && <div className="auth-google auth-anim auth-rise" style={rise(6)}><GoogleSignInButton mode={mode} lang={lang} onCredential={handleGoogleCredential} /></div>}

          <p className="auth-switch auth-anim auth-rise" style={rise(7)}>{mode === 'signin' ? t.noAccount : t.haveAccount}{' '}<button type="button" onClick={() => changeMode(mode === 'signin' ? 'signup' : 'signin')}>{mode === 'signin' ? t.signUp : t.signIn}</button></p>
          </>}

          <p className="auth-legal auth-anim auth-rise" style={rise(8)}>{t.legalBefore}<span>{t.terms}</span>{t.legalAnd}<span>{t.privacy}</span>{t.legalAfter}</p>
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
  const { activeTab, setActiveTab, contents, selectedContentId, setSelectedContentId, isAuthenticated, authLoading, showWorkspacePicker, currentWorkspace, contentLoading, contentLoadError, selectWorkspace, userProfile } = useCMS();

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

    const validTabs = new Set(['dashboard', 'calendar', 'kanban', 'workspace', 'storyboard', 'workspace-management', 'media', 'ai', 'performance', 'debt', 'team', 'settings', 'profile', 'admin']);
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
            {activeTab === 'admin' && (userProfile.isPlatformAdmin ? <AdminView /> : <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Halaman ini hanya untuk admin platform.</div>)}
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
