import { useState } from 'react';
import { BathroomEditor } from './Bathroom';
import { FlooringEditor } from './Flooring';
import { calculateBasement, makeId } from '@workspace/estimator-core';
import type {
  BasementState, BasementWall, BasementSoffit, BasementElectricalPoint, ElectricalPointKind,
  TakeoffLine,
} from '@workspace/estimator-core';
export * from '@workspace/estimator-core';

type EditorProps = { value: BasementState; onChange: (value: BasementState) => void };
const field = 'w-full rounded-md border border-border bg-background px-3 py-2 text-foreground';
const card = 'space-y-3 rounded-lg border border-border p-4';
const numeric = (value: number | null) => value === null ? '' : String(value);
const toNumber = (value: string) => value === '' ? null : Number(value);

export function BasementEditor({ value, onChange }: EditorProps) {
  const [deletedWall, setDeletedWall] = useState<BasementWall | null>(null);
  const [deletedSoffit, setDeletedSoffit] = useState<BasementSoffit | null>(null);
  const updateWall = (id: string, changes: Partial<BasementWall>) => onChange({ ...value, walls: value.walls.map(wall => wall.id === id ? { ...wall, ...changes } : wall) });
  const updateSoffit = (id: string, changes: Partial<BasementSoffit>) => onChange({ ...value, soffits: value.soffits.map(soffit => soffit.id === id ? { ...soffit, ...changes } : soffit) });
  const addWall = () => onChange({ ...value, walls: [...value.walls, {
    id: makeId('wall'), name: `Wall ${value.walls.length + 1}`, roomName: '', lengthFt: null, heightFt: null,
    finishedFaces: 1, sheetLengthIn: 96, sheetWidthIn: 48, wastePercent: 0, surface: 'drywall', wetWallPackageConfirmed: false,
  }] });
  const addSoffit = () => onChange({ ...value, soffits: [...value.soffits, {
    id: makeId('soffit'), name: `Soffit ${value.soffits.length + 1}`, roomName: '', lengthFt: null,
    widthIn: null, dropHeightIn: null, exposedFaces: 1,
  }] });
  const addPoint = () => onChange({ ...value, electricalPoints: [...value.electricalPoints, {
    id: makeId('point'), roomName: '', kind: 'can', bathroomId: '',
  }] });
  const duplicateWall = (wall: BasementWall) => onChange({ ...value, walls: [...value.walls, { ...wall, id: makeId('wall'), name: `${wall.name} copy` }] });
  const duplicateSoffit = (soffit: BasementSoffit) => onChange({ ...value, soffits: [...value.soffits, { ...soffit, id: makeId('soffit'), name: `${soffit.name} copy` }] });
  const duplicatePoint = (point: BasementElectricalPoint) => onChange({ ...value, electricalPoints: [...value.electricalPoints, { ...point, id: makeId('point') }] });
  const removePoint = (id: string) => onChange({ ...value, electricalPoints: value.electricalPoints.filter(point => point.id !== id) });
  const numberField = (label: string, current: number | null, onValue: (next: number | null) => void, id: string, step = 'any') => (
    <label className="block space-y-1 text-sm" htmlFor={id}>{label}
      <input id={id} data-testid={id} className={field} type="number" min="0" step={step} value={numeric(current)} onChange={event => onValue(toNumber(event.currentTarget.value))} />
    </label>
  );
  const calculation = calculateBasement(value);
  const subtotal = calculation.lines.reduce((sum, line) => sum + line.totalCents, 0);

  return <div className="space-y-6" data-testid="basement-editor">
    <section className={card} aria-labelledby="basement-conditions-heading">
      <h2 id="basement-conditions-heading" className="text-xl font-semibold">Existing conditions</h2>
      <label className="block space-y-1 text-sm">Egress window
        <select aria-label="Egress window" className={field} value={value.egress} onChange={event => onChange({ ...value, egress: event.currentTarget.value as BasementState['egress'] })}>
          <option value="unconfirmed">Unconfirmed</option><option value="yes">Yes</option><option value="no">No — add one $2,500 cut allowance</option>
        </select>
      </label>
      <p className="text-sm text-muted-foreground">The cut allowance is not a complete window/well installation or a code-compliance determination.</p>
    </section>

    <section className={card} aria-labelledby="basement-walls-heading">
      <header className="flex items-center justify-between gap-3"><h2 id="basement-walls-heading" className="text-xl font-semibold">Perimeter walls</h2><button type="button" className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={addWall}>Add wall segment</button></header>
      <p className="text-sm">Enter each physical segment separately. Height is required; no wall height or floor area is inferred. Fixed wall allowance is charged once per LFT ($4 labor + $12 material); takeoff is informational.</p>
      {value.walls.map(wall => <article key={wall.id} className={card}>
        <h3 className="font-medium">{wall.name}</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block space-y-1 text-sm">Segment name<input aria-label={`${wall.name} segment name`} className={field} value={wall.name} onChange={event => updateWall(wall.id, { name: event.currentTarget.value })} /></label>
          <label className="block space-y-1 text-sm">Room<input aria-label={`${wall.name} room`} className={field} value={wall.roomName} onChange={event => updateWall(wall.id, { roomName: event.currentTarget.value })} /></label>
          {numberField('Length (LFT)', wall.lengthFt, next => updateWall(wall.id, { lengthFt: next }), `wall-length-${wall.id}`)}
          {numberField('Wall height (ft) — required', wall.heightFt, next => updateWall(wall.id, { heightFt: next }), `wall-height-${wall.id}`)}
          {numberField('Finished faces', wall.finishedFaces, next => updateWall(wall.id, { finishedFaces: next ?? 0 }), `wall-faces-${wall.id}`, '1')}
          <label className="block space-y-1 text-sm">Drywall sheet length<select aria-label={`${wall.name} drywall sheet length`} className={field} value={wall.sheetLengthIn} onChange={event => updateWall(wall.id, { sheetLengthIn: Number(event.currentTarget.value) as 96 | 120 })}><option value="96">8 ft (96 in)</option><option value="120">10 ft (120 in)</option></select></label>
          {numberField('Drywall sheet width (in) — proposed 48 in', wall.sheetWidthIn, next => updateWall(wall.id, { sheetWidthIn: next ?? 0 }), `wall-sheet-width-${wall.id}`)}
          {numberField('Drywall waste (%)', wall.wastePercent, next => updateWall(wall.id, { wastePercent: next ?? 0 }), `wall-waste-${wall.id}`, '0.1')}
          <label className="block space-y-1 text-sm">Surface type<select aria-label={`${wall.name} surface type`} className={field} value={wall.surface} onChange={event => updateWall(wall.id, { surface: event.currentTarget.value as BasementWall['surface'] })}><option value="drywall">Drywall face</option><option value="wet-wall">Wet-wall / tile surface</option><option value="other">Other surface</option></select></label>
          {wall.surface === 'wet-wall' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={wall.wetWallPackageConfirmed} onChange={event => updateWall(wall.id, { wetWallPackageConfirmed: event.currentTarget.checked })} />Confirm the fixed drywall package applies to this wet-wall surface</label>}
        </div>
        <button type="button" className="rounded border px-3 py-1" onClick={() => duplicateWall(wall)}>Duplicate segment</button>
        <button type="button" className="rounded border px-3 py-1" onClick={() => { setDeletedWall(wall); onChange({ ...value, walls: value.walls.filter(item => item.id !== wall.id) }); }}>Delete segment</button>
      </article>)}
      {deletedWall && <p role="status">Deleted {deletedWall.name}. <button type="button" className="underline" onClick={() => { onChange({ ...value, walls: [...value.walls, deletedWall] }); setDeletedWall(null); }}>Undo</button></p>}
    </section>

    <section className={card} aria-labelledby="basement-soffits-heading">
      <header className="flex items-center justify-between gap-3"><h2 id="basement-soffits-heading" className="text-xl font-semibold">Soffits</h2><button type="button" className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={addSoffit}>Add soffit</button></header>
      <p className="text-sm">Soffit pricing is unresolved. Takeoff shows one 8-ft plywood piece and six 2×4×8 pieces per partial or full 8-ft section.</p>
      {value.soffits.map(soffit => <article key={soffit.id} className={card}>
        <h3 className="font-medium">{soffit.name}</h3><div className="grid gap-3 md:grid-cols-3">
          <label className="block space-y-1 text-sm">Soffit name<input aria-label={`${soffit.name} name`} className={field} value={soffit.name} onChange={event => updateSoffit(soffit.id, { name: event.currentTarget.value })} /></label>
          <label className="block space-y-1 text-sm">Room<input aria-label={`${soffit.name} room`} className={field} value={soffit.roomName} onChange={event => updateSoffit(soffit.id, { roomName: event.currentTarget.value })} /></label>
          {numberField('Length (ft)', soffit.lengthFt, next => updateSoffit(soffit.id, { lengthFt: next }), `soffit-length-${soffit.id}`)}
          {numberField('Width (in)', soffit.widthIn, next => updateSoffit(soffit.id, { widthIn: next }), `soffit-width-${soffit.id}`)}
          {numberField('Drop height (in)', soffit.dropHeightIn, next => updateSoffit(soffit.id, { dropHeightIn: next }), `soffit-drop-${soffit.id}`)}
          {numberField('Exposed faces', soffit.exposedFaces, next => updateSoffit(soffit.id, { exposedFaces: next ?? 0 }), `soffit-faces-${soffit.id}`, '1')}
        </div><button type="button" className="rounded border px-3 py-1" onClick={() => duplicateSoffit(soffit)}>Duplicate soffit</button><button type="button" className="rounded border px-3 py-1" onClick={() => { setDeletedSoffit(soffit); onChange({ ...value, soffits: value.soffits.filter(item => item.id !== soffit.id) }); }}>Delete soffit</button>
      </article>)}
      {deletedSoffit && <p role="status">Deleted {deletedSoffit.name}. <button type="button" className="underline" onClick={() => { onChange({ ...value, soffits: [...value.soffits, deletedSoffit] }); setDeletedSoffit(null); }}>Undo</button></p>}
    </section>

    <section className={card} aria-labelledby="basement-electrical-heading">
      <header className="flex items-center justify-between gap-3"><h2 id="basement-electrical-heading" className="text-xl font-semibold">Electrical</h2><button type="button" className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={addPoint}>Add fixture/box point</button></header>
      <p className="text-sm">Includes rough and trim. Enter one row for each distinct physical point; room attribution is required for review. Wire is $38 once per point. The $200/day charge is additive and applied once.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block space-y-1 text-sm">Panel work<select aria-label="Panel work" className={field} value={value.panelWork} onChange={event => onChange({ ...value, panelWork: event.currentTarget.value as BasementState['panelWork'] })}><option value="none">None</option><option value="upgrade">Upgrade — $4,800</option><option value="subpanel">Subpanel — $750</option><option value="both">Both — confirm distinct intended scopes</option></select></label>
        {value.panelWork === 'both' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.distinctPanelWorkConfirmed} onChange={event => onChange({ ...value, distinctPanelWorkConfirmed: event.currentTarget.checked })} />Confirm upgrade and subpanel are distinct intended scopes</label>}
        {numberField('Electrical labor days ($200/day)', value.electricalDays, next => onChange({ ...value, electricalDays: next, dailyLaborExcluded: false }), 'electrical-days')}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.dailyLaborExcluded} onChange={event => onChange({ ...value, dailyLaborExcluded: event.currentTarget.checked, electricalDays: event.currentTarget.checked ? null : value.electricalDays })} />Explicitly exclude standard daily labor</label>
      </div>
      {value.electricalPoints.map(point => <article key={point.id} className="grid gap-3 rounded border p-3 md:grid-cols-4">
        <label className="block space-y-1 text-sm">Physical point ID<input aria-label="Physical point ID" className={field} value={point.id} onChange={event => onChange({ ...value, electricalPoints: value.electricalPoints.map(item => item.id === point.id ? { ...item, id: event.currentTarget.value } : item) })} /></label>
        <label className="block space-y-1 text-sm">Room<input aria-label={`${point.id} room`} className={field} value={point.roomName} onChange={event => onChange({ ...value, electricalPoints: value.electricalPoints.map(item => item.id === point.id ? { ...item, roomName: event.currentTarget.value } : item) })} /></label>
        <label className="block space-y-1 text-sm">Fixture / box type<select aria-label={`${point.id} fixture type`} className={field} value={point.kind} onChange={event => onChange({ ...value, electricalPoints: value.electricalPoints.map(item => item.id === point.id ? { ...item, kind: event.currentTarget.value as ElectricalPointKind } : item) })}><option value="can">Can light — $25 + $175</option><option value="outlet">Outlet — $35 + $175</option><option value="switch">Switch — $25 + $175</option><option value="wall-light">Wall light — $25 + $175</option><option value="hanging-light">Hanging light/fan — $45 + $275</option></select></label>
        {value.includeBathrooms && value.bathrooms.bathrooms.length > 0 && <label className="block space-y-1 text-sm">Bathroom association (optional)<select aria-label={`${point.id} bathroom association`} className={field} value={point.bathroomId} onChange={event => onChange({ ...value, electricalPoints: value.electricalPoints.map(item => item.id === point.id ? { ...item, bathroomId: event.currentTarget.value } : item) })}><option value="">Not linked to bathroom lighting</option>{value.bathrooms.bathrooms.map(bathroom => <option key={bathroom.id} value={bathroom.id}>{bathroom.name}</option>)}</select></label>}
        <button type="button" className="rounded border px-3 py-1" onClick={() => duplicatePoint(point)}>Duplicate point</button>
        <button type="button" className="rounded border px-3 py-1" onClick={() => removePoint(point.id)}>Remove point</button>
      </article>)}
    </section>

    <section className={card} aria-labelledby="basement-flooring-heading">
      <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={value.includeFlooring} onChange={event => onChange({ ...value, includeFlooring: event.currentTarget.checked })} />Include optional flooring and doors</label>
      {value.includeFlooring && <div id="basement-flooring-heading"><FlooringEditor value={value.flooring} onChange={flooring => onChange({ ...value, flooring })} /></div>}
    </section>

    <section className={card} aria-labelledby="basement-bathrooms-heading">
      <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={value.includeBathrooms} onChange={event => onChange({ ...value, includeBathrooms: event.currentTarget.checked })} />Include optional bathrooms</label>
      {value.includeBathrooms && <>
        <h2 id="basement-bathrooms-heading" className="text-xl font-semibold">Bathroom ownership</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block space-y-1 text-sm">Bathroom floor owner<select aria-label="Bathroom floor owner" className={field} value={value.bathroomFloorOwner} onChange={event => onChange({ ...value, bathroomFloorOwner: event.currentTarget.value as BasementState['bathroomFloorOwner'] })}><option value="unconfirmed">Unconfirmed</option><option value="flooring">Shared Flooring module</option><option value="excluded">Excluded from this estimate</option></select></label>
          <label className="block space-y-1 text-sm">Bathroom lighting owner<select aria-label="Bathroom lighting owner" className={field} value={value.bathroomLightingOwner} onChange={event => onChange({ ...value, bathroomLightingOwner: event.currentTarget.value as BasementState['bathroomLightingOwner'] })}><option value="unconfirmed">Unconfirmed</option><option value="bathroom">Bathroom module</option><option value="basement-electrical">Basement electrical</option></select></label>
        </div>
        <p className="text-sm">Bathroom floors are never inferred from wall measurements or auto-priced twice. If Basement electrical owns bathroom lighting, bathroom fixture allowances are suppressed; add the distinct linked physical points above to price them there.</p>
        <BathroomEditor value={value.bathrooms} onChange={bathrooms => {
          const existingIds = new Set(value.bathrooms.bathrooms.map(bathroom => bathroom.id));
          const claimedIds = new Set<string>();
          const deleted = value.bathrooms.deletedBathroom?.bathroom;
          const normalized = bathrooms.bathrooms.map(bathroom => {
            if (deleted === bathroom) return bathroom;
            if (!existingIds.has(bathroom.id) || claimedIds.has(bathroom.id)) {
              const id = makeId('bathroom');
              claimedIds.add(id);
              return { ...bathroom, id };
            }
            claimedIds.add(bathroom.id);
            return bathroom;
          });
          onChange({ ...value, bathrooms: { ...bathrooms, bathrooms: normalized } });
        }} />
      </>}
    </section>

    <section className={card} aria-label="Basement direct-cost review">
      <h2 className="text-xl font-semibold">Basement direct-cost review</h2>
      <p><strong>Known direct costs: ${(subtotal / 100).toFixed(2)}</strong> — no markup or tax applied in this module.</p>
      <h3 className="font-semibold">Priced scope</h3>
      {calculation.lines.length ? <ul>{calculation.lines.map(line => <li key={line.id}>{line.group}: {line.label} — {line.quantity} {line.unit} × ${(line.unitCostCents / 100).toFixed(2)} = ${(line.totalCents / 100).toFixed(2)}{line.note ? ` (${line.note})` : ''}</li>)}</ul> : <p>No priced scope selected.</p>}
      <h3 className="font-semibold">Material takeoff (informational)</h3>
      {calculation.takeoff.length ? <ul>{calculation.takeoff.map((item: TakeoffLine) => <li key={item.id}>{item.group}: {item.label} — {item.quantity} {item.unit}{item.note ? ` (${item.note})` : ''}</li>)}</ul> : <p>No takeoff quantities yet.</p>}
      <h3 className="font-semibold">Completeness issues</h3>
      {calculation.issues.length ? <ul role="status">{calculation.issues.map(issue => <li key={issue}>{issue}</li>)}</ul> : <p>No known completeness issues.</p>}
    </section>
  </div>;
}