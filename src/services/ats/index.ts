import { AtsAdapter, AtsJobInput, AtsSourceLike } from './ats.types';
import { GreenhouseAdapter } from './greenhouse.adapter';
import { LeverAdapter } from './lever.adapter';
import { JobgetherAdapter } from './jobgether.adapter';
import { WorkingNomadsAdapter } from './workingnomads.adapter';
import { RemoteCoAdapter } from './remoteco.adapter';

/**
 * Pluggable ATS adapter registry (factory pattern).
 *
 * Every adapter implements `AtsAdapter` and self-registers by `atsType`.
 * The scraper reads active `AtsSource` rows from the DB and routes each row to
 * the matching adapter. To support a new ATS: write an adapter class, register
 * it below, then add rows in DB (atsType = adapter's `atsType`). No other code
 * changes are required.
 */

const registry = new Map<string, AtsAdapter>();

function register(adapter: AtsAdapter): void {
  registry.set(adapter.atsType, adapter);
}

export function getAtsAdapter(atsType: string): AtsAdapter | undefined {
  return registry.get(atsType);
}

export function listAtsAdapters(): string[] {
  return [...registry.keys()];
}

// --- Register built-in adapters -------------------------------------------------
register(new GreenhouseAdapter());
register(new LeverAdapter());
register(new JobgetherAdapter());
register(new WorkingNomadsAdapter());
register(new RemoteCoAdapter());

export type { AtsAdapter, AtsContext, AtsJobInput, AtsSourceLike } from './ats.types';
export default registry;