import { useEffect, useState } from 'react';

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
  const [saveError, setSaveError] = useState('');
  useEffect(() => {
    try {
      localStorage.setItem(`hbuild-estimator:${key}`, JSON.stringify(draft));
      setSaveError('');
    } catch {
      setSaveError('Draft could not be saved in this browser. Export a copy before leaving this page.');
    }
  }, [draft, key]);
  return { draft, setDraft, saveError, reset: () => setDraft(create()) };
}