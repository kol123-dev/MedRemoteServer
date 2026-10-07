import { Request, Response } from 'express';
import {
  createSource,
  deleteSource,
  listSources,
  registeredAdapterTypes,
  runSource,
  updateSource,
} from '../services/ats-source.service.js';
import { CreateAtsSourceZod, PatchAtsSourceZod } from '../types/validation/ats.zod.js';

export const listRegisteredTypesHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json({ adapterTypes: registeredAdapterTypes() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list adapter types', code: 500 });
  }
};

export const listSourcesHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    const sources = await listSources();
    res.status(200).json(sources);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list ATS sources', code: 500 });
  }
};

export const createSourceHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = CreateAtsSourceZod.parse(req.body);
    const source = await createSource(body);
    res.status(201).json(source);
  } catch (err) {
    const status = (err as { status?: number })?.status === 409 ? 409 : 400;
    const message = err instanceof Error ? err.message : 'Failed to create ATS source';
    res.status(status).json({ error: message, code: status });
  }
};

export const patchSourceHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '');
    const body = PatchAtsSourceZod.parse(req.body);
    const source = await updateSource(id, body);
    if (!source) {
      res.status(404).json({ error: 'ATS source not found', code: 404 });
      return;
    }
    res.status(200).json(source);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update ATS source', code: 400 });
  }
};

export const deleteSourceHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '');
    const result = await deleteSource(id);
    if (!result) {
      res.status(404).json({ error: 'ATS source not found', code: 404 });
      return;
    }
    res.status(200).json({ ok: true, id: result.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete ATS source', code: 500 });
  }
};

export const runSourceHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '');
    const result = await runSource(id);
    if (!result) {
      res.status(404).json({ error: 'ATS source not found', code: 404 });
      return;
    }
    res.status(200).json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: 'Sync failed', code: 500 });
  }
};