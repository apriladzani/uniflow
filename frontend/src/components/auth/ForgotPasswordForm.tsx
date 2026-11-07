import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { api, ApiError } from '../../api/client';

type Step = 'email' | 'otp' | 'password';

interface ForgotPasswordFormProps {
  initialEmail: string;
  initialStep: 'email' | 'otp';
  onCancel: () => void;
  onComplete: (email: string) => void;
}

const errorMessage = (error: unknown) => error instanceof ApiError ? error.message : 'Unable to connect to the server. Please try again.';

const headings: Record<Step, string> = {
  email: 'Forgot your password?',
  otp: 'Check your email',
  password: 'Choose a new password',
};

export const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({ initialEmail, initialStep, onCancel, onComplete }) => {
  const [step, setStep] = useState<Step>(initialStep);
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  const goToStep = (next: Step) => {
    setStep(next);
    setError('');
    setNotice('');
  };

  const requestCode = async () => {
    const { resendAfterSeconds } = await api<{ resendAfterSeconds: number }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: email.trim() }) });
    setResendIn(resendAfterSeconds);
  };

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      await requestCode();
      setOtp('');
      goToStep('otp');
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally { setLoading(false); }
  };

  const handleResend = async () => {
    setError('');
    setNotice('');
    try {
      await requestCode();
      setOtp('');
      setNotice('If that email has an account, a new code is on its way. Earlier codes no longer work.');
    } catch (resendError) {
      setError(errorMessage(resendError));
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setLoading(true);
    try {
      const result = await api<{ resetToken: string }>('/auth/verify-reset-otp', { method: 'POST', body: JSON.stringify({ email: email.trim(), otp }) });
      setResetToken(result.resetToken);
      goToStep('password');
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally { setLoading(false); }
  };

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Your password must contain at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ resetToken, password }) });
      onComplete(email.trim());
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.code === 'RESET_TOKEN_INVALID') {
        setResetToken('');
        setOtp('');
        setStep('email');
      }
      setError(errorMessage(submitError));
    } finally { setLoading(false); }
  };

  const messages = <>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs leading-5 text-rose-700">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-800">{notice}</div>}
  </>;
  const submitClass = 'group flex w-full items-center justify-center gap-2 rounded-xl bg-[#F5C518] px-4 py-[13px] text-sm font-bold text-slate-950 shadow-[0_5px_12px_rgba(245,197,24,0.17)] transition hover:bg-[#E5B510] disabled:cursor-wait disabled:opacity-70';
  const submitContent = (idle: string, busy: string) => loading
    ? <><LoaderCircle className="h-4 w-4 animate-spin" /> {busy}</>
    : <>{idle}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>;

  return (
    <>
      <div className="mb-5">
        <h2 className="text-[30px] font-bold tracking-[-0.04em] text-slate-900">{headings[step]}</h2>
        <p className="mt-1.5 text-[13px] leading-5 text-slate-500">
          {step === 'email' && "Enter your account email and we'll send you a 6-digit code."}
          {step === 'otp' && <>If <span className="font-semibold text-slate-700">{email.trim()}</span> has an account, we sent it a 6-digit code. It expires in 10 minutes.</>}
          {step === 'password' && <>Code verified. Set the new password for <span className="font-semibold text-slate-700">{email.trim()}</span>.</>}
        </p>
      </div>

      {step === 'email' && (
        <form onSubmit={handleEmailSubmit} className="space-y-3.5" noValidate>
          <div><label htmlFor="forgot-email" className="mb-2 block text-xs font-semibold text-slate-700">Email address</label><input id="forgot-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required className="auth-input" placeholder="you@example.com" /></div>
          {messages}
          <button type="submit" disabled={loading} className={submitClass}>{submitContent('Send code', 'Sending…')}</button>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={handleOtpSubmit} className="space-y-3.5" noValidate>
          <div>
            <div className="mb-2 flex items-center justify-between"><label htmlFor="forgot-otp" className="block text-xs font-semibold text-slate-700">6-digit code</label><button type="button" disabled={resendIn > 0} onClick={handleResend} className="text-[11px] font-semibold text-slate-500 transition hover:text-slate-900 disabled:cursor-default disabled:text-slate-400 disabled:hover:text-slate-400">{resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}</button></div>
            <input id="forgot-otp" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus required className="auth-input font-mono tracking-[0.3em]" placeholder="000000" />
          </div>
          {messages}
          <button type="submit" disabled={loading} className={submitClass}>{submitContent('Verify code', 'Verifying…')}</button>
        </form>
      )}

      {step === 'password' && (
        <form onSubmit={handlePasswordSubmit} className="space-y-3.5" noValidate>
          <div><label htmlFor="forgot-password" className="mb-2 block text-xs font-semibold text-slate-700">New password</label><div className="relative"><input id="forgot-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" autoFocus required minLength={8} maxLength={128} className="auth-input pr-12" placeholder="At least 8 characters" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-slate-700" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
          <div><label htmlFor="forgot-confirm" className="mb-2 block text-xs font-semibold text-slate-700">Confirm new password</label><input id="forgot-confirm" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required minLength={8} maxLength={128} className="auth-input" placeholder="Enter your new password again" /></div>
          {messages}
          <button type="submit" disabled={loading} className={submitClass}>{submitContent('Update password', 'Updating…')}</button>
        </form>
      )}

      {step === 'otp'
        ? <button type="button" onClick={() => goToStep('email')} className="mt-5 flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Use a different email</button>
        : <button type="button" onClick={onCancel} className="mt-5 flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Back to sign in</button>}
    </>
  );
};
