import { useMemo, useState, type ComponentType } from 'react';
import { Download, FileSpreadsheet, FileText, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EstimatorNavigation } from '@/components/EstimatorNavigation';
import { modulePdf, moduleSpreadsheet } from './exports';
import { newProject, useProjectDraft, type EstimatorProject } from './project';
import { money, POLICY, totals, uniqueLines, type Calculation } from './types';
import { ModuleIntakePanel, hasPendingIntakeForProject } from './ModuleIntakePanel';
import { SharedDraftPanel } from './SharedDraftPanel';

type EditorProps<T> = { value: T; onChange: (next: T) => void };

export function ModulePage<T>({
  slug, title, description, createScope, calculate, Editor,
}: {
  slug: 'flooring' | 'bathroom' | 'basement';
  title: string;
  description: string;
  createScope: () => T;
  calculate: (scope: T) => Calculation;
  Editor: ComponentType<EditorProps<T>>;
}) {
  const { draft, setDraft, saveError, reset, adoptProject, restoreLocal, localDrafts } =
    useProjectDraft(slug, () => newProject(title, createScope()));
  const result = useMemo(() => uniqueLines(calculate(draft.scope)), [calculate, draft.scope]);
  const summary = useMemo(() => totals(result), [result]);
  const [exportError, setExportError] = useState('');
  const [resetError, setResetError] = useState('');
  const update = <K extends keyof EstimatorProject<T>>(key: K, value: EstimatorProject<T>[K]) =>
    setDraft(previous => ({ ...previous, [key]: value }));
  const download = (action: () => void) => {
    try { setExportError(''); action(); }
    catch (error) { setExportError(error instanceof Error ? error.message : 'Export failed.'); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-16">
      <EstimatorNavigation active={slug} />
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex flex-wrap justify-between gap-4 items-end">
          <div>
            <p className="text-xs uppercase tracking-[.2em] text-primary">HBUILD · External estimating</p>
            <h1 className="mt-1 text-3xl font-display font-bold">{title} estimator</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => void (async () => {
            try {
              if (await hasPendingIntakeForProject(draft.sourceId)) {
                setResetError('A saved HBUILD delivery belongs to this job. New job is blocked until Ledger readback can be reconciled; keep the original draft and PDFs.');
                return;
              }
              if (window.confirm('Start a new local job? The current job will be preserved in this browser’s local draft history.')) {
                reset();
                setResetError('');
              }
            } catch {
              setResetError('Could not check pending deliveries. New job is blocked to protect saved PDFs.');
            }
          })()}><RotateCcw className="mr-2 h-4 w-4" />New job</Button>
        </header>
        {resetError && <p className="text-sm text-destructive" role="alert">{resetError}</p>}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-6 min-w-0">
            <section className="rounded-xl border border-border bg-card/70 p-5 space-y-4">
              <div>
                <h2 className="font-semibold text-lg">1 · Client & project</h2>
                <p className="text-xs text-muted-foreground">Saved in this browser as a draft. Reuse an exact client ID for a returning client; names are never matched automatically.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {([
                  ['firstName', 'Client first name'], ['lastName', 'Client last name'],
                  ['phone', 'Phone'], ['email', 'Email'],
                  ['addressLine1', 'Job address line 1'], ['addressLine2', 'Address line 2'],
                  ['city', 'City'], ['region', 'State'],
                  ['postalCode', 'ZIP / postal code'], ['jobCode', 'Job code (optional)'],
                  ['projectName', 'Project name'], ['salesperson', 'Estimator'],
                ] as const).map(([field, label]) => (
                  <label key={field} className="block text-sm font-medium">{label}
                    <Input className="mt-1" type={field === 'email' ? 'email' : 'text'} value={draft[field]}
                      onChange={event => update(field, event.target.value)} />
                  </label>
                ))}
              </div>
              <label className="block text-xs text-muted-foreground">Estimator client ID
                <Input className="mt-1 font-mono text-xs" value={draft.clientSourceId}
                  onChange={event => update('clientSourceId', event.target.value)} />
              </label>
              <p className="text-xs text-muted-foreground">Project source ID: <span className="font-mono">{draft.sourceId}</span></p>
              {saveError ? <p className="text-destructive text-sm" role="alert">{saveError}</p> :
                <p className="text-xs text-muted-foreground" role="status">Draft saved locally · not shared across devices</p>}
            </section>
            <section className="rounded-xl border border-border bg-card/70 p-5 space-y-4">
              <h2 className="font-semibold text-lg">2 · Measure & price</h2>
              <Editor value={draft.scope} onChange={scope => update('scope', scope)} />
            </section>
            <section className="rounded-xl border border-border bg-card/70 p-5 space-y-4" id={`${slug}-review`}>
              <h2 className="font-semibold text-lg">3 · Review & export</h2>
              <p className="text-sm text-muted-foreground">Known direct costs and purchasing quantities. Missing rates are not treated as $0. Tax is not calculated.</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">Scope</th><th>Charge</th><th className="text-right">Quantity</th><th className="text-right">Direct cost</th></tr></thead>
                  <tbody>{result.lines.map(line => (
                    <tr key={line.id} className="border-b border-border/50">
                      <td className="py-2">{line.group}</td><td>{line.label}</td>
                      <td className="text-right">{line.quantity} {line.unit}</td><td className="text-right">{money(line.totalCents)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {result.lines.length === 0 && <p className="text-sm text-muted-foreground">Add measured work to see calculated charges.</p>}
              <details className="border-t border-border pt-3">
                <summary className="cursor-pointer font-medium">Material takeoff · {result.takeoff.length} items</summary>
                <ul className="mt-2 space-y-1 text-sm">{result.takeoff.map(item =>
                  <li key={item.id}>{item.group}: {item.label} — {item.quantity} {item.unit}{item.note ? ` (${item.note})` : ''}</li>)}</ul>
              </details>
              {result.issues.length > 0 && <div className="rounded-lg border border-amber-600/40 bg-amber-500/10 p-4" role="status">
                <h3 className="font-semibold text-amber-300">Incomplete pricing or scope · {result.issues.length} items</h3>
                <ul className="mt-2 list-disc pl-5 text-sm space-y-1">{result.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>
              </div>}
              <details><summary className="cursor-pointer text-sm">Pricing assumptions</summary>
                <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">{result.assumptions.map((item, i) => <li key={i}>{item}</li>)}</ul>
              </details>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => download(() => moduleSpreadsheet(title, draft, result))}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />Download {title} spreadsheet
                </Button>
                <Button type="button" variant="outline" onClick={() => download(() => { modulePdf(title, draft, result, 'takeoff'); })}>
                  <Download className="mr-2 h-4 w-4" />Takeoff PDF
                </Button>
                <Button type="button" onClick={() => download(() => { modulePdf(title, draft, result, 'proposal'); })}>
                  <FileText className="mr-2 h-4 w-4" />{result.issues.length ? 'Download draft PDF' : 'Estimate PDF'}
                </Button>
              </div>
              {exportError && <p className="text-destructive text-sm" role="alert">{exportError}</p>}
            </section>
            <SharedDraftPanel
              slug={slug}
              project={draft}
              calculation={result}
              localDrafts={localDrafts}
              onLoadProject={adoptProject}
              onLoadLocalProject={restoreLocal}
            />
            <ModuleIntakePanel project={draft} calculation={result} estimatorType={title} deliveryPaused />
          </div>
          <aside className="lg:sticky lg:top-6 lg:self-start rounded-xl border border-primary/25 bg-card p-5 space-y-3">
            <h2 className="font-semibold">Known-cost summary</h2>
            <div className="flex justify-between text-sm"><span>Direct cost</span><strong>{money(summary.directCents)}</strong></div>
            <p className="text-xs text-muted-foreground">Additive markup · {POLICY.version}. Each rate applies to the same direct-cost base.</p>
            {([
              ['Company · 35%', summary.companyCents],
              ['Incidentals · 20%', summary.incidentalsCents],
              ['Accidents · 50%', summary.accidentsCents],
              ['Sales · 7%', summary.salesCents],
            ] as const).map(([label, cents]) =>
              <div className="flex justify-between text-xs" key={label}><span>{label}</span><span>{money(cents)}</span></div>)}
            <div className="flex justify-between border-t border-border pt-3 font-bold"><span>{result.issues.length ? 'Known subtotal' : 'Before tax'}</span><span>{money(summary.beforeTaxCents)}</span></div>
            <p className="text-xs text-amber-300">{result.issues.length ? 'Incomplete — not a final quote.' : 'Tax not configured; total including tax unavailable.'}</p>
            <a href={`#${slug}-review`} className="block text-center text-sm text-primary underline underline-offset-4 lg:hidden">Review scope & downloads</a>
          </aside>
        </div>
      </main>
    </div>
  );
}