import { useEffect, useState } from 'react';
import {
  createAndGetPrototypeRecord,
  getPrototypeStatus,
  isDesktopRuntime,
  type PrototypeRecord,
  type PrototypeStatus,
} from '../desktopRuntime';

export function DesktopRuntimeStatus() {
  const [status, setStatus] = useState<PrototypeStatus | null>(null);
  const [record, setRecord] = useState<PrototypeRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    void getPrototypeStatus()
      .then(setStatus)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Desktop runtime unavailable'));
  }, []);

  if (!isDesktopRuntime()) return null;

  const runRoundTrip = () => {
    setError(null);
    void createAndGetPrototypeRecord({ id: 'stage-a-test-record', label: 'Stage A test record' })
      .then(setRecord)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Prototype database operation failed'));
  };

  return (
    <aside className="mt-4 border border-rule p-3 text-xs text-muted" aria-label="Desktop runtime status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{status?.runtime ?? 'Connecting to desktop runtime…'}</span>
        <button type="button" onClick={runRoundTrip} className="underline underline-offset-4">
          Verify SQLite round trip
        </button>
      </div>
      <p className="mt-1">{status?.databaseReady ? 'Prototype database ready.' : 'Checking prototype database…'}</p>
      {record ? <p className="mt-1">Retrieved: {record.id}</p> : null}
      {error ? <p className="mt-1 text-red-700">{error}</p> : null}
    </aside>
  );
}
