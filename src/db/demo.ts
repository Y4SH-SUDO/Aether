import { AetherDB } from './database';
import { seedSampleData } from './sampleData';

export const demoDb = new AetherDB('aether-demo');

export async function ensureDemoData(): Promise<void> {
  if ((await demoDb.accounts.count()) === 0) {
    await seedSampleData(demoDb);
  }
}

export async function resetDemoData(): Promise<void> {
    await demoDb.transaction('rw', [
      demoDb.accounts, demoDb.categories, demoDb.transactions, demoDb.investments,
      demoDb.trades, demoDb.valuations, demoDb.loans, demoDb.deletedTransactions,
      demoDb.audit, demoDb.imports, demoDb.backups,
    ], async () => {
      await Promise.all([
        demoDb.accounts.clear(), demoDb.categories.clear(), demoDb.transactions.clear(),
        demoDb.investments.clear(), demoDb.trades.clear(), demoDb.valuations.clear(),
        demoDb.loans.clear(), demoDb.deletedTransactions.clear(), demoDb.audit.clear(),
        demoDb.imports.clear(), demoDb.backups.clear(),
      ]);
      await seedSampleData(demoDb);
    });
}
