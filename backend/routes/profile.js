import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateSession } from '../middleware/workspaceAccess.js';

export const profileRouter = Router();
profileRouter.use(authenticateSession);

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

function validationError(message, field) {
  const error = new Error(message);
  error.code = 'VALIDATION_ERROR';
  error.field = field;
  return error;
}

const optionalText = (value, field, label, max) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw validationError(`${label} must be text.`, field);
  const text = value.trim();
  if (text.length > max) throw validationError(`${label} must be at most ${max} characters.`, field);
  return text || null;
};

// Each validator maps a request field to [column, value]. Unknown fields are ignored.
const fieldValidators = {
  name: (value) => {
    const text = optionalText(value, 'name', 'Full name', 120);
    if (!text || text.length < 2) throw validationError('Nama lengkap minimal 2 karakter', 'name');
    return ['display_name', text];
  },
  nickname: (value) => ['nickname', optionalText(value, 'nickname', 'Nickname', 60)],
  phone: (value) => {
    const text = optionalText(value, 'phone', 'Phone number', 20);
    if (!text) return ['phone', null];
    // Stored as +62 followed by the national number without its leading 0.
    const digits = text.replace(/[\s-]/g, '').replace(/^\+?62/, '').replace(/^0/, '');
    if (!/^8\d{7,12}$/.test(digits)) throw validationError('Nomor telepon tidak valid', 'phone');
    return ['phone', `+62${digits}`];
  },
  bio: (value) => ['bio', optionalText(value, 'bio', 'Bio', 500)],
};

async function loadProfile(userId) {
  const [[user]] = await pool.execute(
    'SELECT id,email,email_verified_at,display_name,nickname,phone,bio,avatar_url FROM users WHERE id=? LIMIT 1',
    [userId]
  );
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    emailVerified: Boolean(user.email_verified_at),
    name: user.display_name,
    nickname: user.nickname || '',
    phone: user.phone || '',
    bio: user.bio || '',
    avatarUrl: user.avatar_url || '',
  };
}

profileRouter.get('/', async (request, response, next) => {
  try {
    const profile = await loadProfile(request.user.id);
    if (!profile) return response.status(404).json({ error: 'NOT_FOUND' });
    response.json({ profile });
  } catch (error) { next(error); }
});

profileRouter.patch('/', async (request, response, next) => {
  try {
    const assignments = [];
    for (const [key, value] of Object.entries(request.body || {})) {
      if (Object.hasOwn(fieldValidators, key)) assignments.push(fieldValidators[key](value));
    }
    if (!assignments.length) return response.status(400).json({ error: 'EMPTY_UPDATE', message: 'Nothing to save.' });
    await pool.execute(
      `UPDATE users SET ${assignments.map(([column]) => `${column}=?`).join(',')} WHERE id=?`,
      [...assignments.map(([, value]) => value), request.user.id]
    );
    response.json({ profile: await loadProfile(request.user.id) });
  } catch (error) {
    if (error.code === 'VALIDATION_ERROR') return response.status(400).json({ error: error.code, message: error.message, field: error.field });
    next(error);
  }
});

// The browser crops and resizes the photo, then sends it as a data URL.
profileRouter.put('/avatar', async (request, response, next) => {
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(request.body?.dataUrl || ''));
  if (!match) return response.status(400).json({ error: 'VALIDATION_ERROR', message: 'Format harus JPG atau PNG.' });
  const image = Buffer.from(match[2], 'base64');
  if (!image.length || image.length > AVATAR_MAX_BYTES) return response.status(400).json({ error: 'VALIDATION_ERROR', message: 'Foto maksimal 2 MB.' });
  try {
    const avatarUrl = `/api/profile/avatar/${request.user.id}?v=${Date.now()}`;
    await pool.execute('UPDATE users SET avatar_image=?,avatar_mime=?,avatar_url=? WHERE id=?', [image, match[1], avatarUrl, request.user.id]);
    response.json({ profile: await loadProfile(request.user.id) });
  } catch (error) { next(error); }
});

profileRouter.delete('/avatar', async (request, response, next) => {
  try {
    await pool.execute('UPDATE users SET avatar_image=NULL,avatar_mime=NULL,avatar_url=NULL WHERE id=?', [request.user.id]);
    response.json({ profile: await loadProfile(request.user.id) });
  } catch (error) { next(error); }
});

profileRouter.get('/avatar/:userId', async (request, response, next) => {
  try {
    const [[row]] = await pool.execute('SELECT avatar_image,avatar_mime FROM users WHERE id=? LIMIT 1', [request.params.userId]);
    if (!row?.avatar_image) return response.status(404).end();
    response.set('Content-Type', row.avatar_mime || 'image/jpeg');
    // The URL carries a version query, so a changed photo always gets a new URL.
    response.set('Cache-Control', 'private, max-age=31536000, immutable');
    response.send(row.avatar_image);
  } catch (error) { next(error); }
});
