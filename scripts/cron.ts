import { runScraperSuite } from '../src/services/scraper.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Cron entrypoint invoked by server.ts on the 30-min schedule. Reads all active
 * AtsSource rows and routes each through its ATS adapter, upserting jobs.
 */
export async function executeScraperSuite() {
  console.log('[+] Starting MedRemote ATS Data Engine...');
  try {
    const summary = await runScraperSuite();
    console.log(
      '[cron] Scrape summary:',
      summary
        .map(s => `${s.source} (${s.atsType}) fetched=${s.fetched} synced=${s.synced}${s.skipped ? ' [skip]' : ''}`)
        .join(' | ') || 'no active sources',
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  executeScraperSuite();
}