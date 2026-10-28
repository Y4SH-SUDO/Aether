import { AetherDB } from './database';
import { seedSampleData } from './sampleData';

export const demoDb = new AetherDB('aether-demo');

export async function ensureDemoData(): Promise<void> {
  if ((await demoDb.accounts.count()) === 0) {
    await seedSampleData(demoDb);
  }
}
