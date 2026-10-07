import type { Request, Response, ErrorRequestHandler, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env.js';

export interface HttpError extends Error {
  status?: number;
  code?: number;
}

export class TierLimitError extends Error implements HttpError {
  public readonly status = 402;
  public readonly code = 402;
  constructor(feature: string) {
    super(`Tier limit reached for ${feature}. Upgrade via M-Pesa or card to continue.`);
    this.name = 'TierLimitError';
  }
}

export class LlmUnavailableError extends Error implements HttpError {
  public readonly status = 503;
  public readonly code = 503;
  constructor(original?: string) {
    super(`LLM provider unavailable. Try again in 2 minutes.${original ? env.NODE_ENV === 'development' ? ' (' + original + ')' : '' : ''}`);
    this.name = 'LlmUnavailableError';
  }
}

export class ProviderValidationError extends Error implements HttpError {
  public readonly status = 400;
  public readonly code = 400;
  constructor(msg: string) { super(msg); this.name = 'ProviderValidationError'; }
}

export const errorMiddleware: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (env.NODE_ENV === 'development') {
    console.error('[error-middleware]', err);
  }

  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', code: 400, details: err.flatten() });
    return;
  }

  if (err instanceof TierLimitError || err instanceof LlmUnavailableError || err instanceof ProviderValidationError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }

  const maybeHttp = err as HttpError | null;
  if (maybeHttp && typeof maybeHttp.status === 'number') {
    res.status(maybeHttp.status).json({
      error: maybeHttp.message ?? 'Request failed',
      code: maybeHttp.code ?? maybeHttp.status,
    });
    return;
  }

  const msg = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({
    error: env.NODE_ENV === 'development' ? msg : 'Unexpected error. Team notified.',
    code: 500,
  });
};
