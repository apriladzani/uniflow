import express from 'express';
import multer from 'multer';
import { databaseConfigured, getSchemaStatus, pool } from './db.js';
import { authRouter } from './routes/auth.js';
import { workspaceRouter } from './routes/workspaces.js';
import { contentRouter } from './routes/content.js';
import { memberRouter } from './routes/members.js';
import { mediaRouter } from './routes/media.js';
import { aiAssistantRouter } from './routes/aiAssistant.js';
import { settingsRouter } from './routes/settings.js';
import { profileRouter } from './routes/profile.js';

const app = express();
const port = Number(process.env.PORT || 4000);

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_request, response) => {
  if (!databaseConfigured) {
    response.status(503).json({ ok: false, databaseConfigured: false, schemaReady: false });
    return;
  }

  try {
    const schema = await getSchemaStatus();
    response.status(schema.ready ? 200 : 503).json({
      ok: schema.connected && schema.ready,
      databaseConnected: schema.connected,
      schemaReady: schema.ready,
      tableCount: schema.tableCount,
      missingTables: schema.missingTables,
      missingColumns: schema.missingColumns || [],
    });
  } catch {
    response.status(503).json({ ok: false, databaseConnected: false, schemaReady: false });
  }
});

// Reject malformed workspace-scoped URLs before the database readiness gate.
// This keeps an empty workspace ID from being reported as a misleading 503.
app.use((request, response, next) => {
  if (request.path.startsWith('/api/workspaces//')) {
    response.status(400).json({ error: 'WORKSPACE_REQUIRED', message: 'Select a workspace before using this feature.' });
    return;
  }
  next();
});

app.use('/api', async (_request, response, next) => {
  if (!databaseConfigured) {
    response.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' });
    return;
  }
  try {
    const schema = await getSchemaStatus();
    if (!schema.ready) {
      response.status(503).json({ error: 'DATABASE_SCHEMA_NOT_READY', missingTables: schema.missingTables });
      return;
    }
    next();
  } catch {
    // The readiness query itself can fail during a MySQL outage. Keep that
    // failure distinct from route or CDN errors, and do not log DB details.
    response.status(503).json({ error: 'DATABASE_UNAVAILABLE', message: 'UniFlow database is temporarily unavailable.' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);
app.use('/api/workspaces', workspaceRouter);
app.use('/api/workspaces', contentRouter);
app.use('/api/workspaces', memberRouter);
app.use('/api/workspaces', mediaRouter);
app.use('/api/workspaces', aiAssistantRouter);
app.use('/api/workspaces', settingsRouter);
app.use('/api', (_request, response) => response.status(404).json({ error: 'NOT_FOUND' }));

app.use((error, _request, response, _next) => {
  const knownMessages = {
    CDN_AUTH_FAILED: 'Kroombox rejected the server credentials. Check the CDN configuration.',
    CDN_FORBIDDEN: 'The Kroombox account does not have permission to access this asset or folder.',
    CDN_ASSET_NOT_FOUND: 'The requested Kroombox asset or folder was not found.',
    CDN_RATE_LIMITED: 'Kroombox is rate limiting requests. Retry shortly.',
    CDN_UPSTREAM_ERROR: 'Kroombox could not complete the request. Retry shortly.',
    CDN_REQUEST_FAILED: 'Kroombox could not complete the request. Please retry shortly.',
    CDN_UNAVAILABLE: 'UniFlow could not reach Kroombox. Retry the same upload shortly; it will not be sent again while its outcome is unknown.',
    CDN_INVALID_UPLOAD_RESPONSE: 'Kroombox returned an unexpected upload response. Please retry with the same upload.',
    CDN_INVALID_SIGNED_URL: 'Kroombox returned an invalid signed preview URL. Try preparing the preview again.',
    CDN_PREVIEW_UNAVAILABLE: 'Kroombox could not deliver this preview. Try again shortly.',
    MEDIA_METADATA_SAVE_FAILED: 'Kroombox accepted the upload, but UniFlow could not save its library record. Retry the same upload to finish saving it.',
    IDEMPOTENCY_KEY_CONFLICT: 'This upload retry key is already associated with a different file or destination.',
    UPLOAD_ALREADY_PROCESSING: 'This upload is already being processed. Wait a moment, then retry the same upload.',
  };
  let status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
  let code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'INTERNAL_ERROR';
  let message = knownMessages[code] || 'The request could not be completed.';
  if (error instanceof multer.MulterError) {
    status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = error.code === 'LIMIT_FILE_SIZE' ? 'UPLOAD_FILE_TOO_LARGE' : 'INVALID_UPLOAD';
    message = error.code === 'LIMIT_FILE_SIZE' ? 'The file exceeds the 100 MB upload limit.' : 'The upload request is invalid. Choose one file and try again.';
  } else if (status >= 500 && !knownMessages[code]) {
    status = 500;
    code = 'INTERNAL_ERROR';
  } else if (status >= 400 && !knownMessages[code]) {
    message = status === 413 ? 'The file exceeds the supported upload size.' : 'The request could not be completed.';
  }
  // Never log request URLs, query strings, headers, or exception messages.
  console.error('API request failed:', code);
  response.status(status).json({ error: code, message });
});

const server = app.listen(port, () => {
  console.log(`UniFlow API listening on port ${port}`);
});

function shutdown() {
  server.close(() => {
    pool?.end().finally(() => process.exit(0));
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
