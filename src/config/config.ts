import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dotenv from 'dotenv';
import { z } from 'zod';
import type { LogLevel } from '../logger.js';

// Load .env if present
dotenv.config();

export const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/documents',
  'openid',
  'email',
] as const;

export interface Config {
  googleClientId: string;
  googleClientSecret: string;
  tokenPath: string;
  stateDir: string;
  allowedRecipients: string[];
  maxRecipients: number;
  maxSendsPerMinute: number;
  maxSendsPerDay: number;
  defaultDryRun: boolean;
  allowLiveSend: boolean;
  allowedDocIds: string[];
  maxAppendPerMinute: number;
  maxSubjectChars: number;
  maxBodyChars: number;
  maxAppendChars: number;
  logLevel: LogLevel;
  // Vercel / Cloud Serverless options
  serverApiKey?: string;
  googleRefreshToken?: string;
  accountEmail?: string;
  upstashRedisRestUrl?: string;
  upstashRedisRestToken?: string;
  isServerless: boolean;
}

/**
 * Searches for client_secret*.json or credentials.json if env vars not provided
 */
function findClientSecretFile(searchDir: string): { client_id: string; client_secret: string } | null {
  try {
    if (!fs.existsSync(searchDir)) return null;
    const files = fs.readdirSync(searchDir);
    const secretFile = files.find(
      (f) => (f.startsWith('client_secret_') || f === 'credentials.json') && f.endsWith('.json')
    );
    if (!secretFile) return null;

    const content = fs.readFileSync(path.join(searchDir, secretFile), 'utf8');
    const parsed = JSON.parse(content);
    const creds = parsed.installed || parsed.web;
    if (creds?.client_id && creds?.client_secret) {
      return { client_id: creds.client_id, client_secret: creds.client_secret };
    }
  } catch {
    // Ignore fallback inspection errors
  }
  return null;
}

function parseCommaSeparated(val?: string): string[] {
  if (!val || !val.trim()) return [];
  return val
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function parseBoolean(val: string | undefined, defaultVal: boolean): boolean {
  if (val === undefined || val.trim() === '') return defaultVal;
  return val.trim().toLowerCase() === 'true' || val.trim() === '1';
}

function parseNumber(val: string | undefined, defaultVal: number): number {
  if (val === undefined || val.trim() === '') return defaultVal;
  const num = Number.parseInt(val.trim(), 10);
  return Number.isNaN(num) ? defaultVal : num;
}

export function loadConfig(projectRoot = process.cwd()): Config {
  // Resolve client id and secret
  let clientId = process.env.GDM_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
  let clientSecret = process.env.GDM_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';

  if (!clientId || !clientSecret) {
    const fileCreds = findClientSecretFile(projectRoot);
    if (fileCreds) {
      clientId = clientId || fileCreds.client_id;
      clientSecret = clientSecret || fileCreds.client_secret;
    }
  }

  // Resolve state directory
  const defaultStateDir =
    process.env.APPDATA
      ? path.join(process.env.APPDATA, 'gmail-docs-mcp')
      : path.join(os.homedir(), '.config', 'gmail-docs-mcp');

  const stateDir = process.env.GDM_STATE_DIR || defaultStateDir;

  // Resolve token path
  const tokenPath =
    process.env.GDM_TOKEN_PATH ||
    process.env.TOKEN_PATH ||
    path.join(stateDir, 'token.json');

  const rawConfig = {
    googleClientId: clientId,
    googleClientSecret: clientSecret,
    tokenPath,
    stateDir,
    allowedRecipients: parseCommaSeparated(
      process.env.GDM_ALLOWED_RECIPIENTS || process.env.ALLOWED_RECIPIENTS
    ),
    maxRecipients: parseNumber(
      process.env.GDM_MAX_RECIPIENTS || process.env.MAX_RECIPIENTS_PER_MESSAGE,
      5
    ),
    maxSendsPerMinute: parseNumber(
      process.env.GDM_MAX_SENDS_PER_MINUTE || process.env.MAX_EMAILS_PER_MINUTE,
      5
    ),
    maxSendsPerDay: parseNumber(
      process.env.GDM_MAX_SENDS_PER_DAY || process.env.MAX_EMAILS_PER_DAY,
      50
    ),
    defaultDryRun: parseBoolean(
      process.env.GDM_DEFAULT_DRY_RUN || process.env.DEFAULT_DRY_RUN,
      true
    ),
    allowLiveSend: parseBoolean(process.env.GDM_ALLOW_LIVE_SEND, false),
    allowedDocIds: parseCommaSeparated(
      process.env.GDM_ALLOWED_DOC_IDS || process.env.ALLOWED_DOC_IDS
    ),
    maxAppendPerMinute: parseNumber(process.env.GDM_MAX_APPEND_PER_MINUTE, 10),
    maxSubjectChars: parseNumber(process.env.GDM_MAX_SUBJECT_CHARS, 200),
    maxBodyChars: parseNumber(process.env.GDM_MAX_BODY_CHARS, 50000),
    maxAppendChars: parseNumber(process.env.GDM_MAX_APPEND_CHARS, 100000),
    logLevel: (process.env.GDM_LOG_LEVEL || 'info').toLowerCase() as LogLevel,
    serverApiKey: process.env.GDM_SERVER_API_KEY || process.env.SERVER_API_KEY || undefined,
    googleRefreshToken:
      process.env.GDM_GOOGLE_REFRESH_TOKEN ||
      process.env.GDM_REFRESH_TOKEN ||
      process.env.GOOGLE_REFRESH_TOKEN ||
      undefined,
    accountEmail: process.env.GDM_ACCOUNT_EMAIL || process.env.ACCOUNT_EMAIL || undefined,
    upstashRedisRestUrl:
      process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || undefined,
    upstashRedisRestToken:
      process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || undefined,
    isServerless: Boolean(
      process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY
    ),
  };

  const ConfigSchema = z.object({
    googleClientId: z.string(),
    googleClientSecret: z.string(),
    tokenPath: z.string().min(1),
    stateDir: z.string().min(1),
    allowedRecipients: z.array(z.string()),
    maxRecipients: z.number().int().positive(),
    maxSendsPerMinute: z.number().int().positive(),
    maxSendsPerDay: z.number().int().positive(),
    defaultDryRun: z.boolean(),
    allowLiveSend: z.boolean(),
    allowedDocIds: z.array(z.string()),
    maxAppendPerMinute: z.number().int().positive(),
    maxSubjectChars: z.number().int().positive(),
    maxBodyChars: z.number().int().positive(),
    maxAppendChars: z.number().int().positive(),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']),
    serverApiKey: z.string().optional(),
    googleRefreshToken: z.string().optional(),
    accountEmail: z.string().optional(),
    upstashRedisRestUrl: z.string().optional(),
    upstashRedisRestToken: z.string().optional(),
    isServerless: z.boolean(),
  });

  return ConfigSchema.parse(rawConfig);
}
