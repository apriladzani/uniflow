import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { authenticateSession, requireWorkspacePermission } from '../middleware/workspaceAccess.js';
import { getWorkspaceSettings } from './settings.js';

export const aiAssistantRouter = Router();
aiAssistantRouter.use(authenticateSession);

const systemPrompt = `You are the creative content assistant for Uni Inside Media, a student media team.
You help researchers and scriptwriters plan social content for a university audience.
Write in the same language as the user's topic (Indonesian or English). Keep it production-ready:
concrete visuals, voice-over lines, and on-screen text a team can shoot right away.`;

const cameraAngles = ['Wide Shot', 'Medium Shot', 'Close-Up', 'POV', 'Over the Shoulder', 'Drone / High Angle'];
const transitions = ['Cut', 'Dissolve', 'Wipe', 'Zoom In', 'Fade to Black'];

// Mirrors the Scene fields the Storyboard editor stores, so output can be exported as-is.
const storyboardSchema = {
  type: 'object',
  properties: {
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          durationSeconds: { type: 'integer' },
          cameraAngle: { type: 'string', enum: cameraAngles },
          transition: { type: 'string', enum: transitions },
          visualDirection: { type: 'string' },
          voiceOver: { type: 'string' },
          onScreenText: { type: 'string' },
        },
        required: ['title', 'durationSeconds', 'cameraAngle', 'transition', 'visualDirection', 'voiceOver', 'onScreenText'],
        additionalProperties: false,
      },
    },
  },
  required: ['scenes'],
  additionalProperties: false,
};

const toolInstructions = {
  storyboard: 'Break the video into 4-8 scenes whose durations add up to roughly the target duration. Give each scene a short title, camera angle, transition, visual direction, voice-over line, and on-screen text.',
  caption: 'Write an engagement-focused caption for the platform with a clear call to action, followed by 8-12 relevant hashtags. Output plain text only, no Markdown.',
};

const clip = (value, max) => String(value ?? '').trim().slice(0, max);

aiAssistantRouter.post('/:workspaceId/ai-assistant/generate', requireWorkspacePermission('content.read'), async (request, response, next) => {
  // The key comes from the user's browser per request and is never stored on the server.
  const apiKey = clip(request.get('x-anthropic-api-key'), 500);
  if (!apiKey) return response.status(400).json({ error: 'AI_KEY_REQUIRED', message: 'Enter your Claude API key first.' });

  const tool = request.body?.tool;
  if (!toolInstructions[tool]) return response.status(400).json({ error: 'INVALID_TOOL', message: 'Unknown AI Assistant tool.' });
  const topic = clip(request.body.topic, 2000);
  if (!topic) return response.status(400).json({ error: 'TOPIC_REQUIRED', message: 'Enter a topic first.' });

  const brief = [
    `Task: ${toolInstructions[tool]}`,
    `Topic: ${topic}`,
    ['Platform', request.body.platform, 60],
    ['Content pillar', request.body.pillar, 120],
    ['Tone', request.body.tone, 60],
    ['Target duration', tool === 'storyboard' ? request.body.duration : '', 60],
  ].map((line) => (Array.isArray(line) ? (clip(line[1], line[2]) ? `${line[0]}: ${clip(line[1], line[2])}` : '') : line))
    .filter(Boolean).join('\n');

  try {
    const { aiModel } = await getWorkspaceSettings(request.params.workspaceId);
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: aiModel,
      max_tokens: 16000,
      output_config: {
        effort: 'low',
        ...(tool === 'storyboard' ? { format: { type: 'json_schema', schema: storyboardSchema } } : {}),
      },
      system: systemPrompt,
      messages: [{ role: 'user', content: brief }],
    });
    if (message.stop_reason === 'refusal') {
      return response.status(422).json({ error: 'AI_REFUSED', message: 'The AI declined this request. Try rephrasing the topic.' });
    }
    if (message.stop_reason === 'max_tokens') {
      return response.status(502).json({ error: 'AI_TRUNCATED', message: 'The AI output was too long. Try a shorter target duration.' });
    }
    const text = message.content.filter((block) => block.type === 'text').map((block) => block.text).join('').trim();
    if (tool === 'caption') return response.json({ text });
    const { scenes } = JSON.parse(text);
    response.json({ scenes });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return response.status(401).json({ error: 'AI_AUTH_FAILED', message: 'The Claude API key was rejected. Check the key and try again.' });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return response.status(429).json({ error: 'AI_RATE_LIMITED', message: 'The AI is busy. Try again in a moment.' });
    }
    if (error instanceof Anthropic.BadRequestError && /credit balance/i.test(error.message)) {
      return response.status(402).json({ error: 'AI_NO_CREDIT', message: 'This Claude API account has no credit left. Top up in Plans & Billing.' });
    }
    if (error instanceof Anthropic.APIError) {
      return response.status(502).json({ error: 'AI_UNAVAILABLE', message: 'The AI service is unavailable right now. Try again shortly.' });
    }
    next(error);
  }
});
