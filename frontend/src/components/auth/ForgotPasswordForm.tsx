import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { AUTH_COPY, AuthLang } from './authCopy';

type Step = 'email' | 'otp' | 'password';

interface ForgotPasswordFormProps {
  lang: AuthLang;
  initialEmail: string;
  initialStep: 'email' | 'otp';
  onCancel: () => void;
  onComplete: (email: string) => void;
}

export const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({ lang, initialEmail, initialStep, onCancel, onComplete }) => {
  const t = AUTH_COPY[lang];
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

  const errorMessage = (caught: unknown) => caught instanceof ApiError ? caught.message : t.errNetwork;

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
      setError(t.errEmail);
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
      setNotice(t.resendNotice);
    } catch (resendError) {
      setError(errorMessage(resendError));
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!/^\d{6}$/.test(otp)) {
      setError(t.errCode);
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
      setError(t.errPasswordLength);
      return;
    }
    if (password !== confirmPassword) {
      setError(t.errPasswordMatch);
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
    {error && <div role="alert" className="auth-alert auth-alert-error">{error}</div>}
    {notice && <div role="status" className="auth-alert auth-alert-notice">{notice}</div>}
  </>;
  const submitContent = (idle: string, busy: string) => loading
    ? <><LoaderCircle className="auth-spin" /> {busy}</>
    : <>{idle}<ArrowRight className="auth-submit-arrow" /></>;
  const strongEmail = (parts: [string, string, string]) => <>{parts[0]}<strong>{parts[1]}</strong>{parts[2]}</>;

  return (
    <>
      <div className="auth-title">
        <h2>{step === 'email' ? t.forgotTitle : step === 'otp' ? t.checkEmailTitle : t.newPasswordTitle}</h2>
        <p>
          {step === 'email' && t.forgotSub}
          {step === 'otp' && strongEmail(t.checkEmailSub(email.trim()))}
          {step === 'password' && strongEmail(t.newPasswordSub(email.trim()))}
        </p>
      </div>

      {step === 'email' && (
        <form onSubmit={handleEmailSubmit} className="auth-fields" noValidate>
          <div className="auth-field"><label htmlFor="forgot-email" className="auth-label">{t.email}</label><input id="forgot-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required className="auth-input" placeholder={t.emailPlaceholder} /></div>
          {messages}
          <button type="submit" disabled={loading} className="auth-submit">{submitContent(t.sendCode, t.sending)}</button>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={handleOtpSubmit} className="auth-fields" noValidate>
          <div className="auth-field">
            <div className="auth-label-row"><label htmlFor="forgot-otp" className="auth-label">{t.code}</label><button type="button" disabled={resendIn > 0} onClick={handleResend} className="auth-link-quiet">{resendIn > 0 ? t.resendIn(resendIn) : t.resendCode}</button></div>
            <input id="forgot-otp" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus required className="auth-input auth-input-code" placeholder="000000" />
          </div>
          {messages}
          <button type="submit" disabled={loading} className="auth-submit">{submitContent(t.verifyCode, t.verifying)}</button>
        </form>
      )}

      {step === 'password' && (
        <form onSubmit={handlePasswordSubmit} className="auth-fields" noValidate>
          <div className="auth-field"><label htmlFor="forgot-password" className="auth-label">{t.newPassword}</label><div className="auth-password"><input id="forgot-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" autoFocus required minLength={8} maxLength={128} className="auth-input" placeholder={t.newPasswordPlaceholder} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="auth-eye" aria-label={showPassword ? t.hidePassword : t.showPassword} aria-pressed={showPassword}>{showPassword ? <EyeOff /> : <Eye />}</button></div></div>
          <div className="auth-field"><label htmlFor="forgot-confirm" className="auth-label">{t.confirmNewPassword}</label><input id="forgot-confirm" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required minLength={8} maxLength={128} className="auth-input" placeholder={t.confirmNewPasswordPlaceholder} /></div>
          {messages}
          <button type="submit" disabled={loading} className="auth-submit">{submitContent(t.updatePassword, t.updating)}</button>
        </form>
      )}

      <button type="button" onClick={step === 'otp' ? () => goToStep('email') : onCancel} className="auth-back">
        <ArrowLeft />{step === 'otp' ? t.differentEmail : t.backToSignIn}
      </button>
    </>
  );
};
