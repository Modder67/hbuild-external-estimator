import { useCallback, useEffect, useState } from 'react';

export type EstimatorProject<T> = {
  sourceId: string;
  clientSourceId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  jobCode: string;
  projectName: string;
  salesperson: string;
  scope: T;
};

export function newProject<T>(projectName: string, scope: T): EstimatorProject<T> {
  return {
    sourceId: crypto.randomUUID(), clientSourceId: crypto.randomUUID(),
    firstName: '', lastName: '', phone: '', email: '',
    addressLine1: '', addressLine2: '', city: '', region: '', postalCode: '',
    jobCode: '', projectName, salesperson: '', scope,
  };
}

export function useProjectDraft<T>(key: string, create: () => EstimatorProject<T>) {
  const archiveKey = `hbuild-estimator:${key}:archive`;
  const readArchive = (): EstimatorProject<T>[] => {
    try {
      const value = JSON.parse(localStorage.getItem(archiveKey) || '[]') as EstimatorProject<T>[];
      return Array.isArray(value) ? value.filter(item => item?.sourceId && item?.clientSourceId && item?.scope) : [];
    } catch { return []; }
  };
  const [draft, setDraft] = useState<EstimatorProject<T>>(() => {
    try {
      const saved = localStorage.getItem(`hbuild-estimator:${key}`);
      if (saved) {
        const parsed = JSON.parse(saved) as EstimatorProject<T>;
        if (parsed?.sourceId && parsed.clientSourceId && parsed.scope) return parsed;
      }
    } catch { /* A failed read becomes a new draft; the save error is surfaced below. */ }
    return create();
  });
  const [archivedDrafts, setArchivedDrafts] = useState<EstimatorProject<T>[]>(readArchive);
  const [saveError, setSaveError] = useState('');
  useEffect(() => {
    try {
      localStorage.setItem(`hbuild-estimator:${key}`, JSON.stringify(draft));
      localStorage.setItem(archiveKey, JSON.stringify(archivedDrafts));
      setSaveError('');
    } catch {
      setSaveError('Draft could not be saved in this browser. Export a copy before leaving this page.');
    }
  }, [draft, archivedDrafts, key, archiveKey]);
  const preserveCurrent = useCallback(() => {
    setArchivedDrafts(previous => [
      draft,
      ...previous.filter(item => item.sourceId !== draft.sourceId),
    ].slice(0, 50));
  }, [draft]);
  const adoptProject = useCallback((next: EstimatorProject<T>) => {
    if (JSON.stringify(next) !== JSON.stringify(draft)) preserveCurrent();
    setDraft(next);
  }, [draft, preserveCurrent]);
  const restoreLocal = useCallback((next: EstimatorProject<T>) => {
    if (JSON.stringify(next) !== JSON.stringify(draft)) preserveCurrent();
    setArchivedDrafts(previous => previous.filter(item => item.sourceId !== next.sourceId));
    setDraft(next);
  }, [draft, preserveCurrent]);
  const reset = useCallback(() => {
    preserveCurrent();
    setDraft(create());
  }, [create, preserveCurrent]);
  return { draft, setDraft, saveError, reset, adoptProject, restoreLocal, localDrafts: [draft, ...archivedDrafts] };
}