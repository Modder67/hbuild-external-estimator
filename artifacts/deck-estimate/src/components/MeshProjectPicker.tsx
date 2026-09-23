import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient, type Session } from '@supabase/supabase-js';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

type Project = { id: string; name: string; slug: string; color: string; sort: number };
export type ProjectDetails = {
  projectId: string;
  jobCode: string | null;
  customerName: string | null;
  customerAddress: string | null;
  clientSource: 'ledger' | 'draft-link' | 'missing';
};

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const auth = url && key ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
}) : null;

export function MeshProjectPicker({
  projectId,
  projectName,
  onSelect,
  onDetails,
}: {
  projectId?: string;
  projectName?: string;
  onSelect: (project: { id: string; name: string } | null) => void;
  onDetails: (projectId: string, details: ProjectDetails | null) => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [search, setSearch] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [connectionReady, setConnectionReady] = useState<boolean | null>(null);
  const [details, setDetails] = useState<ProjectDetails | null>(null);
  const [detailError, setDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailAttempt, setDetailAttempt] = useState(0);
  const selectionRef = useRef({ projectId, onSelect, onDetails });
  selectionRef.current = { projectId, onSelect, onDetails };

  useEffect(() => {
    fetch('/api/mesh/status')
      .then(async response => {
        if (!response.ok) throw new Error('Mesh server unavailable');
        const body = await response.json();
        setConnectionReady(body.configured === true);
      })
      .catch(() => setConnectionReady(false));
  }, []);

  useEffect(() => {
    if (!auth) return;
    void auth.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = auth.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setProjects([]);
      if (!next && selectionRef.current.projectId) selectionRef.current.onSelect(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch('/api/mesh/projects', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal: controller.signal,
    }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Project lookup failed.');
      if (!Array.isArray(body.projects)) throw new Error('Invalid project response.');
      setProjects(body.projects);
    }).catch(err => {
      if (!controller.signal.aborted) {
        setProjects([]);
        setError(err instanceof Error ? err.message : 'Project lookup failed.');
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [session?.access_token]);

  useEffect(() => {
    setDetails(null);
    setDetailError('');
    if (!session || !projectId || !projects.some(p => p.id === projectId)) return;
    const controller = new AbortController();
    setDetailLoading(true);
    fetch(`/api/mesh/projects/${encodeURIComponent(projectId)}/details`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal: controller.signal,
    }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Verified job details unavailable.');
      if (body.projectId !== projectId || !['ledger', 'draft-link', 'missing'].includes(body.clientSource)) {
        throw new Error('Invalid job detail response.');
      }
      if (!controller.signal.aborted) {
        setDetails(body as ProjectDetails);
        selectionRef.current.onDetails(projectId, body as ProjectDetails);
      }
    }).catch(err => {
      if (!controller.signal.aborted) {
        setDetailError(err instanceof Error ? err.message : 'Verified job details unavailable.');
        selectionRef.current.onDetails(projectId, null);
      }
    }).finally(() => {
      if (!controller.signal.aborted) setDetailLoading(false);
    });
    return () => controller.abort();
  }, [projectId, session?.access_token, projects, detailAttempt]);

  const filtered = useMemo(() =>
    projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.toLowerCase().includes(search.toLowerCase())),
  [projects, search]);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!auth) return;
    setError('');
    setLoading(true);
    const { error: authError } = await auth.auth.signInWithPassword({ email, password });
    setPassword('');
    if (authError) setError(authError.message);
    setLoading(false);
  };

  return (
    <div className="md:col-span-2 space-y-3 rounded-lg border border-border bg-background/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="project-search">HBUILD Project</Label>
        {session && <Button type="button" size="sm" variant="ghost" onClick={() => void auth?.auth.signOut()}>Sign out</Button>}
      </div>
      {!auth || connectionReady === false ? (
        <p className="text-sm text-amber-400" role="status">Mesh project access is not provisioned yet. You can still create and download estimates locally.</p>
      ) : connectionReady === null ? (
        <p className="text-sm text-muted-foreground" role="status">Checking project connection…</p>
      ) : !session ? (
        <form onSubmit={signIn} className="flex flex-col sm:flex-row gap-2">
          <Input type="email" autoComplete="username" placeholder="HBUILD email" aria-label="HBUILD email" value={email} onChange={e => setEmail(e.target.value)} required />
          <Input type="password" autoComplete="current-password" placeholder="Password" aria-label="Password" value={password} onChange={e => setPassword(e.target.value)} required />
          <Button disabled={loading} type="submit">{loading ? 'Signing in…' : 'Sign in'}</Button>
        </form>
      ) : (
        <>
          <Input id="project-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects by name" />
          <select
            aria-label="Select HBUILD project"
            className="w-full rounded-md border border-border bg-background p-2 text-foreground"
            value={projects.some(p => p.id === projectId) ? projectId : ''}
            disabled={loading || Boolean(error)}
            onChange={e => {
              const match = projects.find(p => p.id === e.target.value);
              if (projectId && e.target.value !== projectId && !window.confirm('Switching projects clears this estimate and client details. Continue?')) return;
              onSelect(match ? { id: match.id, name: match.name } : null);
            }}
          >
            <option value="">No project selected</option>
            {filtered.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            {projectId && !filtered.some(p => p.id === projectId) && projects.some(p => p.id === projectId) && (
              <option value={projectId}>{projects.find(p => p.id === projectId)?.name}</option>
            )}
          </select>
          {loading && <p className="text-sm text-muted-foreground" role="status">Loading projects…</p>}
          {!loading && !error && projects.length === 0 && <p className="text-sm text-muted-foreground">No projects are available to this account.</p>}
          {projectId && !projects.some(p => p.id === projectId) && !loading && (
            <p className="text-sm text-amber-400">Previously selected project {projectName || ''} could not be verified. Choose another project before saving.</p>
          )}
          {projectId && details && (
            <div className="text-sm text-muted-foreground" role="status">
              <p>Job code: <strong className="text-foreground">{details.jobCode || 'Not assigned'}</strong></p>
              <p>{details.clientSource === 'ledger' ? 'Client details checked against H Ledger.' :
                details.clientSource === 'draft-link' ? 'Client name is from the H Draft link; live ledger details are unavailable.' :
                'No linked client details are available.'}</p>
              {!details.customerAddress && <p>Verified client address is unavailable.</p>}
            </div>
          )}
          {detailLoading && <p className="text-sm text-muted-foreground" role="status">Checking H Draft job details…</p>}
          {detailError && projectId && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-amber-400" role="status">{detailError} Client details entered below are manual and unverified.</p>
              <Button type="button" size="sm" variant="outline" onClick={() => setDetailAttempt(n => n + 1)}>Retry details</Button>
            </div>
          )}
        </>
      )}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <p className="text-xs text-muted-foreground">Project names come from H FORESIGHT. H Draft supplies linked job details only when its signed source is available; manually entered details are not verified.</p>
    </div>
  );
}