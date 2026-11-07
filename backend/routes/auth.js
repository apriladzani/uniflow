import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { pool } from '../db.js';
import { passwordResetOtpEmail } from '../emails/passwordResetOtp.js';
import { mailConfigured, sendMail } from '../mail.js';
import { createOpaqueToken, hashPassword, hashToken, verifyPassword } from '../security.js';

export const authRouter = Router();

const cookieName = 'uim_session';
const sessionLifetimeMs = 1000 * 60 * 60 * 24 * 14;
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;
const otpLifetimeMinutes = 10;
const otpMaxAttempts = 5;
const otpResendCooldownSeconds = 60;
const otpMaxPerHour = 5;
const resetTokenLifetimeMinutes = 10;
const appUrl = (process.env.APP_URL || '').replace(/\/+$/, '');
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};

function sessionToken(request) {
  const pair = (request.headers.cookie || '').split(';').map((value) => value.trim())
    .find((value) => value.startsWith(`${cookieName}=`));
  return pair ? decodeURIComponent(pair.slice(cookieName.length + 1)) : '';
}

function setSessionCookie(response, token) {
  response.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionLifetimeMs });
}

function clearSessionCookie(response) {
  response.clearCookie(cookieName, cookieOptions);
}

function validateCredentials({ email, password }, response) {
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 254) {
    response.status(400).json({ error: 'VALIDATION_ERROR', message: 'Enter a valid email address.' });
    return false;
  }
  return validatePassword(password, response);
}

function validatePassword(password, response) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    response.status(400).json({ error: 'VALIDATION_ERROR', message: 'Password must be between 8 and 128 characters.' });
    return false;
  }
  return true;
}

async function saveSession(connection, userId) {
  const token = createOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + sessionLifetimeMs);
  await connection.execute(
    'INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
    [tokenHash, userId, expiresAt]
  );
  return { token, tokenHash };
}

authRouter.post('/sign-up', async (request, response, next) => {
  const { name, username, email, password } = request.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 120) {
    response.status(400).json({ error: 'VALIDATION_ERROR', message: 'Name must be between 2 and 120 characters.' });
    return;
  }
  if (typeof username !== 'string' || !/^[a-z0-9_]{3,30}$/i.test(username.trim())) {
    response.status(400).json({ error: 'VALIDATION_ERROR', message: 'Username must be 3–30 characters and contain only letters, numbers, or underscores.' });
    return;
  }
  if (!validateCredentials({ email, password }, response)) return;

  const normalizedUsername = username.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const userId = randomUUID();
    const passwordHash = await hashPassword(password);
    await connection.execute(
      'INSERT INTO users (id, email, password_hash, display_name, username) VALUES (?, ?, ?, ?, ?)',
      [userId, normalizedEmail, passwordHash, name.trim(), normalizedUsername]
    );
    const session = await saveSession(connection, userId);
    await connection.commit();
    setSessionCookie(response, session.token);
    response.status(201).json({ user: { id: userId, email: normalizedEmail, username: normalizedUsername, name: name.trim() } });
  } catch (error) {
    if (connection?.inTransaction) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      const [matches] = await pool.execute('SELECT email, username FROM users WHERE email = ? OR username = ? LIMIT 1', [normalizedEmail, normalizedUsername]);
      const duplicateUsername = matches[0]?.username === normalizedUsername;
      response.status(409).json({
        error: duplicateUsername ? 'USERNAME_IN_USE' : 'EMAIL_IN_USE',
        message: duplicateUsername ? 'That username is already taken.' : 'An account with this email already exists.',
      });
      return;
    }
    next(error);
  } finally {
    connection?.release();
  }
});

authRouter.post('/sign-in', async (request, response, next) => {
  const { email, password } = request.body || {};
  if (!validateCredentials({ email, password }, response)) return;

  const normalizedEmail = email.trim().toLowerCase();
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.execute(
      'SELECT id, email, username, password_hash, display_name, avatar_url, status FROM users WHERE email = ? LIMIT 1',
      [normalizedEmail]
    );
    const user = rows[0];
    const validPassword = await verifyPassword(password, user?.password_hash);
    if (!user || user.status !== 'active' || !validPassword) {
      response.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' });
      return;
    }

    await connection.beginTransaction();
    const session = await saveSession(connection, user.id);
    await connection.execute('UPDATE users SET last_login_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [user.id]);
    await connection.commit();
    setSessionCookie(response, session.token);
    response.json({ user: { id: user.id, email: user.email, username: user.username, name: user.display_name, avatarUrl: user.avatar_url || '' } });
  } catch (error) {
    if (connection?.inTransaction) await connection.rollback();
    next(error);
  } finally {
    connection?.release();
  }
});

async function availableUsername(connection, email) {
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 24).padEnd(3, '_');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}_${randomUUID().slice(0, 4)}`;
    const [rows] = await connection.execute('SELECT id FROM users WHERE username = ? LIMIT 1', [candidate]);
    if (!rows.length) return candidate;
  }
  return `${base}_${randomUUID().slice(0, 5)}`;
}

authRouter.get('/config', (_request, response) => {
  response.json({ googleClientId });
});

// Google Identity Services posts a signed ID token here; it covers both registering and signing in.
authRouter.post('/google', async (request, response, next) => {
  if (!googleClient) {
    response.status(503).json({ error: 'GOOGLE_NOT_CONFIGURED', message: 'Google sign-in is not configured. Add GOOGLE_CLIENT_ID to backend/.env.' });
    return;
  }
  const { credential, password } = request.body || {};
  if (typeof credential !== 'string' || !credential) {
    response.status(400).json({ error: 'VALIDATION_ERROR', message: 'Google credential is required.' });
    return;
  }

  let profile;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: googleClientId });
    profile = ticket.getPayload();
  } catch {
    response.status(401).json({ error: 'GOOGLE_TOKEN_INVALID', message: 'Google sign-in could not be verified. Please try again.' });
    return;
  }
  if (!profile?.sub || !profile.email || profile.email_verified !== true) {
    response.status(403).json({ error: 'GOOGLE_EMAIL_UNVERIFIED', message: 'Your Google account email must be verified first.' });
    return;
  }

  const email = profile.email.trim().toLowerCase();
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT id, email, username, password_hash, display_name, avatar_url, status, google_sub
       FROM users WHERE google_sub = ? OR email = ? ORDER BY google_sub = ? DESC LIMIT 1`,
      [profile.sub, email, profile.sub]
    );
    let user = rows[0];
    if (user && user.status !== 'active') {
      response.status(403).json({ error: 'ACCOUNT_DISABLED', message: 'This account has been disabled.' });
      return;
    }
    if (user && user.google_sub && user.google_sub !== profile.sub) {
      response.status(409).json({ error: 'EMAIL_IN_USE', message: 'This email is already linked to a different Google account.' });
      return;
    }
    // Emails are not verified at password sign-up, so anyone could have pre-registered this address.
    // Linking without the password would let that person keep access to the Google user's account.
    const linking = Boolean(user && !user.google_sub);
    if (linking && user.password_hash) {
      if (typeof password !== 'string' || !password) {
        response.status(409).json({ error: 'GOOGLE_LINK_PASSWORD_REQUIRED', message: 'An account with this email already exists. Enter its password once to link Google.' });
        return;
      }
      if (!await verifyPassword(password, user.password_hash)) {
        response.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'That password is incorrect.' });
        return;
      }
    }

    const newUser = !user;
    const username = newUser ? await availableUsername(connection, email) : user.username;
    await connection.beginTransaction();
    if (newUser) {
      const fallbackName = email.split('@')[0];
      user = {
        id: randomUUID(),
        email,
        username,
        display_name: String(profile.name || fallbackName).trim().slice(0, 120) || fallbackName.slice(0, 120),
        avatar_url: profile.picture && profile.picture.length <= 2048 ? profile.picture : null,
      };
      await connection.execute(
        `INSERT INTO users (id, email, google_sub, password_hash, display_name, username, avatar_url, email_verified_at, last_login_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
        [user.id, email, profile.sub, user.display_name, username, user.avatar_url]
      );
    } else if (linking) {
      await connection.execute(
        'UPDATE users SET google_sub = ?, email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP(3)), last_login_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
        [profile.sub, user.id]
      );
    } else {
      await connection.execute('UPDATE users SET last_login_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [user.id]);
    }
    const session = await saveSession(connection, user.id);
    await connection.commit();
    setSessionCookie(response, session.token);
    response.status(newUser ? 201 : 200).json({
      user: { id: user.id, email: user.email, username, name: user.display_name, avatarUrl: user.avatar_url || '' },
      created: newUser,
    });
  } catch (error) {
    if (connection?.inTransaction) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      response.status(409).json({ error: 'ACCOUNT_CONFLICT', message: 'This account was just changed. Please try again.' });
      return;
    }
    next(error);
  } finally {
    connection?.release();
  }
});

function hashOtp(userId, otp) {
  return hashToken(`${userId}:${otp}`);
}

async function issuePasswordResetOtp(email) {
  const connection = await pool.getConnection();
  let message;
  let recipient;
  try {
    await connection.beginTransaction();
    // The row lock serialises concurrent requests so the limits below cannot be raced.
    const [users] = await connection.execute(
      "SELECT id, email FROM users WHERE email = ? AND status = 'active' LIMIT 1 FOR UPDATE",
      [email]
    );
    const user = users[0];
    if (!user) { await connection.rollback(); return; }
    const [[usage]] = await connection.execute(
      `SELECT COALESCE(SUM(created_at > DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 1 HOUR)), 0) AS lastHour,
              COALESCE(SUM(created_at > DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL ${otpResendCooldownSeconds} SECOND)), 0) AS lastCooldown
       FROM password_reset_otps WHERE user_id = ?`,
      [user.id]
    );
    if (Number(usage.lastCooldown) > 0 || Number(usage.lastHour) >= otpMaxPerHour) { await connection.rollback(); return; }

    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await connection.execute('DELETE FROM password_reset_otps WHERE user_id = ? AND created_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 1 DAY)', [user.id]);
    // A new request cancels earlier codes and any verified step still waiting for a password.
    await connection.execute('UPDATE password_reset_otps SET consumed_at = COALESCE(consumed_at, CURRENT_TIMESTAMP(3)), reset_token_hash = NULL WHERE user_id = ?', [user.id]);
    await connection.execute(
      `INSERT INTO password_reset_otps (id, user_id, code_hash, expires_at)
       VALUES (?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ${otpLifetimeMinutes} MINUTE))`,
      [randomUUID(), user.id, hashOtp(user.id, otp)]
    );
    await connection.commit();
    recipient = user.email;
    message = passwordResetOtpEmail({ email: user.email, otp, expiresInMinutes: otpLifetimeMinutes, appUrl });
  } catch (error) {
    if (connection.inTransaction) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await sendMail({ to: recipient, ...message });
}

authRouter.post('/forgot-password', (request, response) => {
  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    response.status(400).json({ error: 'VALIDATION_ERROR', message: 'Enter a valid email address.' });
    return;
  }
  if (!mailConfigured) {
    response.status(503).json({ error: 'EMAIL_NOT_CONFIGURED', message: 'Password reset email is not configured yet. Please contact your workspace administrator.' });
    return;
  }
  // Answer before doing any work, so neither the body nor the timing reveals whether the email is registered.
  response.json({ ok: true, resendAfterSeconds: otpResendCooldownSeconds });
  issuePasswordResetOtp(email).catch((error) => console.error('Password reset email failed:', error.message));
});

authRouter.post('/verify-reset-otp', async (request, response, next) => {
  const { email, otp } = request.body || {};
  const invalidOtp = () => response.status(400).json({ error: 'INVALID_OTP', message: 'That code is incorrect or has expired. Check it or request a new one.' });
  if (typeof email !== 'string' || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) { invalidOtp(); return; }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT o.id, o.code_hash, o.attempts, u.id AS userId
       FROM users u JOIN password_reset_otps o ON o.user_id = u.id
       WHERE u.email = ? AND u.status = 'active' AND o.consumed_at IS NULL AND o.expires_at > CURRENT_TIMESTAMP(3)
       ORDER BY o.created_at DESC LIMIT 1 FOR UPDATE`,
      [email.trim().toLowerCase()]
    );
    const record = rows[0];
    if (!record || record.attempts >= otpMaxAttempts) {
      await connection.rollback();
      invalidOtp();
      return;
    }
    if (!timingSafeEqual(Buffer.from(hashOtp(record.userId, otp)), Buffer.from(record.code_hash))) {
      // Committed on purpose: a wrong guess has to count even though the request fails.
      await connection.execute('UPDATE password_reset_otps SET attempts = attempts + 1 WHERE id = ?', [record.id]);
      await connection.commit();
      invalidOtp();
      return;
    }

    // The code is spent here; only this short-lived token can set the password.
    const resetToken = createOpaqueToken();
    await connection.execute(
      `UPDATE password_reset_otps
       SET consumed_at = CURRENT_TIMESTAMP(3), reset_token_hash = ?,
           reset_token_expires_at = DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ${resetTokenLifetimeMinutes} MINUTE)
       WHERE id = ?`,
      [hashToken(resetToken), record.id]
    );
    await connection.commit();
    response.json({ resetToken });
  } catch (error) {
    if (connection?.inTransaction) await connection.rollback();
    next(error);
  } finally {
    connection?.release();
  }
});

authRouter.post('/reset-password', async (request, response, next) => {
  const { resetToken, password } = request.body || {};
  if (!validatePassword(password, response)) return;
  const invalidToken = () => response.status(400).json({ error: 'RESET_TOKEN_INVALID', message: 'This reset session has expired. Request a new code to continue.' });
  if (typeof resetToken !== 'string' || !resetToken) { invalidToken(); return; }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT o.user_id AS userId
       FROM password_reset_otps o JOIN users u ON u.id = o.user_id
       WHERE o.reset_token_hash = ? AND o.reset_token_expires_at > CURRENT_TIMESTAMP(3) AND u.status = 'active'
       LIMIT 1 FOR UPDATE`,
      [hashToken(resetToken)]
    );
    const record = rows[0];
    if (!record) {
      await connection.rollback();
      invalidToken();
      return;
    }

    const passwordHash = await hashPassword(password);
    await connection.execute(
      'UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP(3)) WHERE id = ?',
      [passwordHash, record.userId]
    );
    await connection.execute('UPDATE password_reset_otps SET reset_token_hash = NULL WHERE user_id = ?', [record.userId]);
    // Whoever had access before the reset must not keep it.
    await connection.execute('DELETE FROM user_sessions WHERE user_id = ?', [record.userId]);
    await connection.commit();
    clearSessionCookie(response);
    response.json({ ok: true });
  } catch (error) {
    if (connection?.inTransaction) await connection.rollback();
    next(error);
  } finally {
    connection?.release();
  }
});

authRouter.post('/logout', async (request, response, next) => {
  const token = sessionToken(request);
  try {
    if (token && pool) {
      await pool.execute('DELETE FROM user_sessions WHERE token_hash = ?', [hashToken(token)]);
    }
    clearSessionCookie(response);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', async (request, response, next) => {
  const token = sessionToken(request);
  if (!token) {
    response.status(401).json({ error: 'UNAUTHENTICATED' });
    return;
  }
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.email, u.username, u.display_name AS name, u.avatar_url AS avatarUrl
       FROM user_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP(3) AND u.status = 'active'
       LIMIT 1`,
      [hashToken(token)]
    );
    if (!rows.length) {
      clearSessionCookie(response);
      response.status(401).json({ error: 'UNAUTHENTICATED' });
      return;
    }
    await pool.execute('UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP(3) WHERE token_hash = ?', [hashToken(token)]);
    response.json({ user: rows[0] });
  } catch (error) {
    next(error);
  }
});
