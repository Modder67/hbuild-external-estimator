import { costLine, money, type Calculation, type TakeoffLine, validQuantity } from './types';

export type PanAdjustmentPolicy = 'unconfirmed' | 'none' | 'minus-one-inch-total-each-dimension';
export type DrywallRepair = 'none' | 'simple' | 'other';
export type ShowerFinish = 'Brushed Nickel' | 'Stainless' | 'Chrome' | 'Matte Black' | 'Brushed Gold';

export type BathroomScope = {
  id: string;
  name: string;
  tubInScope: boolean;
  tubWidthIn: number;
  tubLengthIn: number;
  tubDrainSide: 'left' | 'right' | 'other';
  showerInScope: boolean;
  demoTileSurround: boolean;
  wallDemoSqFt: number;
  wallHeightFt: number;
  panDemoInScope: boolean;
  existingPanDemoSqFt: number;
  newWallInstallSqFt: number;
  newPanWidthIn: number;
  newPanDepthIn: number;
  panAdjustmentPolicy: PanAdjustmentPolicy;
  finish: ShowerFinish;
  nicheInScope: boolean;
  nicheCount: number;
  nicheWidthIn: number;
  nicheHeightIn: number;
  drywallRepair: DrywallRepair;
  existingVanityWidthIn: number;
  replaceVanity: boolean;
  newVanityWidthIn: number;
  sinkCount: number;
  replaceTrap: boolean;
  replaceFaucet: boolean;
  vanityLightCount: number;
  vanityLightOwnerSupplied: boolean;
  towelBarCount: number;
  towelBarOwnerSupplied: boolean;
  mirrorCount: number;
  mirrorOwnerSupplied: boolean;
  additionalLightCount: number;
  additionalLightsConfirmedSeparate: boolean;
};

export type DeletedBathroom = { bathroom: BathroomScope; index: number };

/** A controlled, serializable bathroom estimate state suitable for embedding in a larger project. */
export type BathroomState = {
  bathrooms: BathroomScope[];
  deletedBathroom: DeletedBathroom | null;
};

function blankBathroom(name = 'Bathroom'): BathroomScope {
  return {
    id: `bathroom-${crypto.randomUUID()}`,
    name,
    tubInScope: false,
    tubWidthIn: 0,
    tubLengthIn: 0,
    tubDrainSide: 'left',
    showerInScope: true,
    demoTileSurround: false,
    wallDemoSqFt: 0,
    wallHeightFt: 0,
    panDemoInScope: false,
    existingPanDemoSqFt: 0,
    newWallInstallSqFt: 0,
    newPanWidthIn: 0,
    newPanDepthIn: 0,
    panAdjustmentPolicy: 'unconfirmed',
    finish: 'Chrome',
    nicheInScope: false,
    nicheCount: 1,
    nicheWidthIn: 0,
    nicheHeightIn: 0,
    drywallRepair: 'none',
    existingVanityWidthIn: 0,
    replaceVanity: false,
    newVanityWidthIn: 36,
    sinkCount: 1,
    replaceTrap: false,
    replaceFaucet: false,
    vanityLightCount: 0,
    vanityLightOwnerSupplied: false,
    towelBarCount: 0,
    towelBarOwnerSupplied: false,
    mirrorCount: 0,
    mirrorOwnerSupplied: false,
    additionalLightCount: 0,
    additionalLightsConfirmedSeparate: false,
  };
}

export function newBathroomState(): BathroomState {
  return { bathrooms: [blankBathroom('Bathroom 1')], deletedBathroom: null };
}

export function addBathroomToState(state: BathroomState): BathroomState {
  const room = blankBathroom(`Bathroom ${state.bathrooms.length + 1}`);
  return { ...state, bathrooms: [...state.bathrooms, room], deletedBathroom: null };
}

export function duplicateBathroomInState(state: BathroomState, bathroom: BathroomScope): BathroomState {
  const duplicate: BathroomScope = {
    ...bathroom,
    id: `bathroom-${crypto.randomUUID()}`,
    name: `${bathroom.name} copy`,
    wallDemoSqFt: 0,
    wallHeightFt: 0,
    existingPanDemoSqFt: 0,
    newWallInstallSqFt: 0,
    newPanWidthIn: 0,
    newPanDepthIn: 0,
    tubWidthIn: 0,
    tubLengthIn: 0,
    nicheWidthIn: 0,
    nicheHeightIn: 0,
    towelBarCount: 0,
    mirrorCount: 0,
    vanityLightCount: 0,
    vanityLightOwnerSupplied: false,
    additionalLightCount: 0,
    sinkCount: 1,
  };
  return { ...state, bathrooms: [...state.bathrooms, duplicate], deletedBathroom: null };
}

function isCount(value: number): boolean {
  return validQuantity(value) && Number.isInteger(value);
}

function addTakeoff(
  lines: TakeoffLine[],
  id: string,
  bathroom: BathroomScope,
  label: string,
  quantity: number,
  unit: string,
  note?: string,
) {
  lines.push({ id: `${bathroom.id}:${id}`, group: bathroom.name, label, quantity, unit, note });
}

/**
 * Calculates direct, known bathroom costs only. Missing rates remain completeness issues;
 * project-level markups are intentionally left to the parent estimator.
 */
export function calculateBathroom(state: BathroomState): Calculation {
  const lines: Calculation['lines'] = [];
  const takeoff: TakeoffLine[] = [];
  const issues: string[] = [];
  const assumptions: string[] = [
    'Bathroom costs are direct-cost allowances only; project markups and tax are applied by the parent estimator.',
    'The linked Home Depot package contents and prices are unverified and have not been imported.',
    'Supplied fixed allowances are treated as unsplit per-bathroom direct costs where applicable.',
    'Existing pan demolition SQFT is entered as an independent confirmed footprint; new-pan dimensional adjustments are not applied to demolition area.',
  ];

  for (const bathroom of state.bathrooms) {
    const prefix = bathroom.id;
    const addIssue = (message: string) => issues.push(`${bathroom.name}: ${message}`);
    const addCost = (id: string, label: string, quantity: number, unit: string, unitCostCents: number, note?: string) => {
      if (quantity > 0) lines.push(costLine(`${prefix}:${id}`, bathroom.name, label, quantity, unit, unitCostCents, note));
    };

    const measuredValues: Array<[string, number]> = [
      ['Wall demolition area', bathroom.wallDemoSqFt],
      ['Wall height', bathroom.wallHeightFt],
      ['Existing pan demolition area', bathroom.existingPanDemoSqFt],
      ['New wall installation area', bathroom.newWallInstallSqFt],
      ['New pan width', bathroom.newPanWidthIn],
      ['New pan depth', bathroom.newPanDepthIn],
    ];
    for (const [label, value] of measuredValues) {
      if (!validQuantity(value)) addIssue(`${label} must be a non-negative number.`);
    }

    if (bathroom.demoTileSurround && validQuantity(bathroom.wallDemoSqFt)) {
      addCost('wall-demolition', 'Tile-surround wall demolition labor', bathroom.wallDemoSqFt, 'sq ft', 400);
    }
    if (bathroom.demoTileSurround && bathroom.wallDemoSqFt > 0 && bathroom.wallHeightFt === 0) {
      addIssue('Wall height is required for layout review; entered wall area is not multiplied by height.');
    }
    if (bathroom.panDemoInScope && validQuantity(bathroom.existingPanDemoSqFt)) {
      addCost('pan-demolition', 'Existing pan demolition labor', bathroom.existingPanDemoSqFt, 'sq ft', 900);
    }

    if (validQuantity(bathroom.newWallInstallSqFt) && bathroom.newWallInstallSqFt > 0) {
      const sheets = Math.ceil(bathroom.newWallInstallSqFt / 15);
      addTakeoff(takeoff, 'backerboard-sheets', bathroom, '5 ft × 3 ft backerboard sheets', sheets, 'sheets', '15 sq ft coverage per sheet; no waste allowance applied.');
      addTakeoff(takeoff, 'backerboard-area', bathroom, 'Backerboard coverage', sheets * 15, 'sq ft', `${bathroom.newWallInstallSqFt} sq ft net wall area; sheet rounding shown.`);
      addTakeoff(takeoff, 'tile-area', bathroom, 'Wall tile (preliminary, before waste)', bathroom.newWallInstallSqFt, 'sq ft', 'Zero-waste preliminary takeoff; no box-coverage rounding configured.');
      addIssue('Wall reconstruction material and installation rates are missing (tile, backerboard, setting materials, waterproofing, labor, and disposal).');
      addIssue('No universal waste allowance is configured; preliminary tile takeoff uses zero waste.');
      assumptions.push(`${bathroom.name}: backerboard quantity uses 15 sq ft per 5 × 3 ft sheet and rounds up; entered wall area is not multiplied by height.`);
    }

    if (bathroom.tubInScope) {
      addIssue('Tub material, removal, installation, and applicable package pricing are not configured.');
      if (bathroom.tubWidthIn <= 0 || bathroom.tubLengthIn <= 0) addIssue('Enter the tub dimensions in inches.');
    } else if (bathroom.showerInScope) {
      const hasNewPanDimensions = bathroom.newPanWidthIn > 0 || bathroom.newPanDepthIn > 0;
      if (hasNewPanDimensions && bathroom.panAdjustmentPolicy === 'unconfirmed') {
        addIssue('New pan measurement adjustment is unresolved; confirm the one-inch policy before using a pan area.');
      } else if (hasNewPanDimensions) {
        const adjustment = bathroom.panAdjustmentPolicy === 'minus-one-inch-total-each-dimension' ? 1 : 0;
        const width = bathroom.newPanWidthIn - adjustment;
        const depth = bathroom.newPanDepthIn - adjustment;
        if (width <= 0 || depth <= 0) {
          addIssue('Adjusted new pan dimensions must both be greater than zero.');
        } else {
          const area = width * depth / 144;
          addTakeoff(takeoff, 'new-pan-area', bathroom, 'New shower pan area (estimating only)', area, 'sq ft', `Raw: ${bathroom.newPanWidthIn} × ${bathroom.newPanDepthIn} in; adjusted: ${width} × ${depth} in. Verify product fit.`);
          assumptions.push(`${bathroom.name}: pan dimensions use ${adjustment ? 'one inch total subtracted from each entered dimension' : 'no dimensional adjustment'}; this policy is not a product-fit guarantee.`);
        }
      }
      if (bathroom.showerInScope) addIssue('Shower pan/assembly, valve, trim, and installation rates are not configured; the supplied valve/fixture/install price statement has unresolved allocation.');
    }

    if (bathroom.nicheInScope) {
      if (!isCount(bathroom.nicheCount) || bathroom.nicheCount < 1) addIssue('Niche quantity must be a positive whole number.');
      else {
        if (bathroom.nicheWidthIn <= 0 || bathroom.nicheHeightIn <= 0) addIssue('Enter positive niche width and height in inches.');
        addTakeoff(takeoff, 'niche-count', bathroom, 'Shower niches', bathroom.nicheCount, 'each', `${bathroom.nicheWidthIn} × ${bathroom.nicheHeightIn} in; dimensions and waterproofing/package inclusion require confirmation.`);
      }
      addIssue('Niche material and labor rates are missing; confirm prefab/package waterproofing coverage.');
    }

    if (bathroom.drywallRepair === 'simple') addCost('drywall-simple', 'Simple drywall touchups (per-bathroom allowance)', 1, 'bathroom', 53500);
    if (bathroom.drywallRepair === 'other') addCost('drywall-other', 'Other drywall repair (per-bathroom allowance)', 1, 'bathroom', 160000);
    if (bathroom.drywallRepair !== 'none') {
      assumptions.push(`${bathroom.name}: drywall repair is a fixed per-bathroom unsplit allowance; scope basis and labor/material allocation are pending confirmation.`);
    }

    if (bathroom.replaceVanity) {
      addIssue('Vanity supply, countertop/sink inclusion, cabinet removal, and cabinet installation pricing are missing.');
      if (bathroom.existingVanityWidthIn <= 0) addIssue('Enter the existing vanity width in inches.');
      if (!validQuantity(bathroom.newVanityWidthIn) || bathroom.newVanityWidthIn <= 0) addIssue('Enter a positive new vanity width in inches.');
      assumptions.push(`${bathroom.name}: sink count is entered explicitly; it is not derived from vanity width.`);
    }
    if (!isCount(bathroom.sinkCount) || bathroom.sinkCount < 1) {
      if (bathroom.replaceVanity || bathroom.replaceTrap || bathroom.replaceFaucet) addIssue('Sink count must be a positive whole number.');
    } else {
      const trapScope = bathroom.replaceVanity || bathroom.replaceTrap;
      const faucetScope = bathroom.replaceVanity || bathroom.replaceFaucet;
      if (trapScope) {
        addCost('p-trap', 'P-trap plumbing allowance', bathroom.sinkCount, 'each', 13000, 'Labor/material coverage is unresolved.');
        addIssue('P-trap allowance labor/material coverage needs clarification.');
      }
      if (faucetScope) {
        addCost('faucet', 'Faucet allowance (combined installation labor/material)', bathroom.sinkCount, 'each', 25000);
      }
      if (bathroom.sinkCount > 1 && (trapScope || faucetScope)) {
        assumptions.push(`${bathroom.name}: one trap and/or faucet allowance is applied per explicitly entered sink; confirm this multiplication policy.`);
      }
    }

    if (!isCount(bathroom.vanityLightCount)) addIssue('Vanity light quantity must be a non-negative whole number.');
    else {
      addCost('vanity-light', 'New vanity-light installation labor', bathroom.vanityLightCount, 'each', 7500, bathroom.vanityLightOwnerSupplied ? 'Labor only; owner-supplied fixture.' : 'Labor only; fixture material is not priced.');
      if (bathroom.vanityLightCount > 0 && !bathroom.vanityLightOwnerSupplied) addIssue('Vanity light fixture material price or owner-supplied status is required.');
    }
    if (!isCount(bathroom.towelBarCount)) addIssue('Towel bar quantity must be a non-negative whole number.');
    else if (bathroom.towelBarCount > 0) {
      addCost('towel-bars', 'Towel bar installation labor', bathroom.towelBarCount, 'each', 2500, bathroom.towelBarOwnerSupplied ? 'Owner-supplied material.' : 'Towel bar material is not priced.');
      if (!bathroom.towelBarOwnerSupplied) addIssue('Towel bar material price or owner-supplied status is required.');
    }
    if (!isCount(bathroom.mirrorCount)) addIssue('Mirror quantity must be a non-negative whole number.');
    else if (bathroom.mirrorCount > 0) {
      addCost('mirrors', 'Mirror installation labor', bathroom.mirrorCount, 'each', 12500, bathroom.mirrorOwnerSupplied ? 'Owner-supplied material.' : 'Mirror material is not priced.');
      if (!bathroom.mirrorOwnerSupplied) addIssue('Mirror material price or owner-supplied status is required.');
    }
    if (!isCount(bathroom.additionalLightCount)) {
      addIssue('Additional light quantity must be a non-negative whole number.');
    } else {
      const overlap = bathroom.vanityLightCount > 0 && bathroom.additionalLightCount > 0;
      if (overlap && !bathroom.additionalLightsConfirmedSeparate) {
        addIssue('Additional light allowance is held until confirmed to be for physical fixtures separate from vanity lights.');
      } else {
        addCost('additional-lights', 'Additional light (combined labor/material)', bathroom.additionalLightCount, 'each', 37500);
      }
    }
  }

  if (state.bathrooms.length === 0) issues.push('Add at least one bathroom to calculate bathroom scope.');
  return { lines, takeoff, issues: [...new Set(issues)], assumptions: [...new Set(assumptions)] };
}

type BathroomEditorProps = { value: BathroomState; onChange: (value: BathroomState) => void };

function NumberInput({
  id, label, value, unit, onChange, step = 'any', min = 0,
}: {
  id: string; label: string; value: number; unit: string; onChange: (value: number) => void; step?: string; min?: number;
}) {
  return (
    <label className="bathroom-field" htmlFor={id}>
      <span>{label} <span className="bathroom-unit">({unit})</span></span>
      <input id={id} data-testid={`input-${id}`} type="number" min={min} step={step} value={value} onChange={event => onChange(event.currentTarget.value === '' ? 0 : Number(event.currentTarget.value))} />
    </label>
  );
}

function CheckInput({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="bathroom-check" htmlFor={id}><input id={id} data-testid={`input-${id}`} type="checkbox" checked={checked} onChange={event => onChange(event.currentTarget.checked)} /> {label}</label>;
}

export function BathroomEditor({ value, onChange }: BathroomEditorProps) {
  const update = (id: string, changes: Partial<BathroomScope>) => onChange({
    ...value,
    bathrooms: value.bathrooms.map(bathroom => bathroom.id === id ? { ...bathroom, ...changes } : bathroom),
  });
  const addBathroom = () => onChange(addBathroomToState(value));
  const duplicateBathroom = (bathroom: BathroomScope) => {
    onChange(duplicateBathroomInState(value, bathroom));
  };
  const deleteBathroom = (bathroom: BathroomScope) => {
    const index = value.bathrooms.findIndex(item => item.id === bathroom.id);
    onChange({ ...value, bathrooms: value.bathrooms.filter(item => item.id !== bathroom.id), deletedBathroom: { bathroom, index } });
  };
  const undoDelete = () => {
    if (!value.deletedBathroom) return;
    const bathrooms = [...value.bathrooms];
    bathrooms.splice(Math.min(value.deletedBathroom.index, bathrooms.length), 0, value.deletedBathroom.bathroom);
    onChange({ ...value, bathrooms, deletedBathroom: null });
  };
  const calculation = calculateBathroom(value);
  const knownCents = calculation.lines.reduce((sum, line) => sum + line.totalCents, 0);

  return (
    <section className="bathroom-estimator" aria-label="Bathroom estimate editor">
      <header className="bathroom-editor-header">
        <div><h2>Bathroom scope</h2><p>Build bathroom scope on its own or embed it in a larger remodel estimate.</p></div>
        <button type="button" data-testid="button-add-bathroom" onClick={addBathroom}>Add bathroom</button>
      </header>
      {value.deletedBathroom && <p role="status" data-testid="status-bathroom-deleted">Bathroom deleted. <button type="button" data-testid="button-undo-delete" onClick={undoDelete}>Undo</button></p>}
      {value.bathrooms.map((bathroom, index) => {
        const set = (changes: Partial<BathroomScope>) => update(bathroom.id, changes);
        const id = `${bathroom.id}`;
        return (
          <article className="bathroom-card" key={bathroom.id} data-testid={`card-bathroom-${bathroom.id}`}>
            <details open>
              <summary>{bathroom.name || `Bathroom ${index + 1}`}</summary>
              <div className="bathroom-actions">
                <label htmlFor={`name-${id}`}>Bathroom name</label>
                <input id={`name-${id}`} data-testid={`input-name-${id}`} value={bathroom.name} onChange={event => set({ name: event.currentTarget.value })} />
                <button type="button" data-testid={`button-duplicate-${id}`} onClick={() => duplicateBathroom(bathroom)}>Duplicate with cleared measurements</button>
                <button type="button" data-testid={`button-delete-${id}`} onClick={() => deleteBathroom(bathroom)}>Delete</button>
              </div>
              <details open>
                <summary>Configuration and measurements</summary>
                <div className="bathroom-grid">
                  <CheckInput id={`${id}-tub`} label="Tub in scope" checked={bathroom.tubInScope} onChange={tubInScope => set({ tubInScope })} />
                  {bathroom.tubInScope && <>
                    <NumberInput id={`${id}-tub-width`} label="Tub width" unit="in" value={bathroom.tubWidthIn} onChange={tubWidthIn => set({ tubWidthIn })} />
                    <NumberInput id={`${id}-tub-length`} label="Tub length" unit="in" value={bathroom.tubLengthIn} onChange={tubLengthIn => set({ tubLengthIn })} />
                    <label className="bathroom-field" htmlFor={`${id}-drain`}><span>Drain side (viewing reference to be confirmed)</span><select id={`${id}-drain`} data-testid={`input-${id}-drain`} value={bathroom.tubDrainSide} onChange={event => set({ tubDrainSide: event.currentTarget.value as BathroomScope['tubDrainSide'] })}><option value="left">Left</option><option value="right">Right</option><option value="other">Other</option></select></label>
                  </>}
                  <CheckInput id={`${id}-shower`} label="Shower in scope" checked={bathroom.showerInScope} onChange={showerInScope => set({ showerInScope })} />
                  <label className="bathroom-field" htmlFor={`${id}-finish`}><span>Shower finish</span><select id={`${id}-finish`} data-testid={`input-${id}-finish`} value={bathroom.finish} onChange={event => set({ finish: event.currentTarget.value as ShowerFinish })}>{['Brushed Nickel', 'Stainless', 'Chrome', 'Matte Black', 'Brushed Gold'].map(finish => <option key={finish}>{finish}</option>)}</select><small>No finish premium configured.</small></label>
                </div>
              </details>
              <details open>
                <summary>Demolition and wall/pan measurements</summary>
                <div className="bathroom-grid">
                  <CheckInput id={`${id}-demo-walls`} label="Demo tile surround" checked={bathroom.demoTileSurround} onChange={demoTileSurround => set({ demoTileSurround })} />
                  {bathroom.demoTileSurround && <>
                    <NumberInput id={`${id}-wall-demo`} label="Wall demolition area" unit="sq ft" value={bathroom.wallDemoSqFt} onChange={wallDemoSqFt => set({ wallDemoSqFt })} />
                  </>}
                  <NumberInput id={`${id}-wall-height`} label="Wall height" unit="ft" value={bathroom.wallHeightFt} onChange={wallHeightFt => set({ wallHeightFt })} />
                  <CheckInput id={`${id}-demo-pan`} label="Demo existing tub/pan footprint" checked={bathroom.panDemoInScope} onChange={panDemoInScope => set({ panDemoInScope })} />
                  {bathroom.panDemoInScope && <NumberInput id={`${id}-pan-demo`} label="Existing pan demolition footprint" unit="sq ft" value={bathroom.existingPanDemoSqFt} onChange={existingPanDemoSqFt => set({ existingPanDemoSqFt })} />}
                  <NumberInput id={`${id}-new-wall`} label="New tiled wall installation area" unit="sq ft" value={bathroom.newWallInstallSqFt} onChange={newWallInstallSqFt => set({ newWallInstallSqFt })} />
                  {!bathroom.tubInScope && bathroom.showerInScope && <>
                    <NumberInput id={`${id}-pan-width`} label="New shower pan width" unit="in (drywall-to-drywall)" value={bathroom.newPanWidthIn} onChange={newPanWidthIn => set({ newPanWidthIn })} />
                    <NumberInput id={`${id}-pan-depth`} label="New shower pan depth" unit="in (drywall-to-drywall)" value={bathroom.newPanDepthIn} onChange={newPanDepthIn => set({ newPanDepthIn })} />
                    <label className="bathroom-field" htmlFor={`${id}-pan-policy`}><span>Pan dimension adjustment policy</span><select id={`${id}-pan-policy`} data-testid={`input-${id}-pan-policy`} value={bathroom.panAdjustmentPolicy} onChange={event => set({ panAdjustmentPolicy: event.currentTarget.value as PanAdjustmentPolicy })}><option value="unconfirmed">Unconfirmed (do not adjust)</option><option value="none">Confirmed: no adjustment</option><option value="minus-one-inch-total-each-dimension">Confirmed: subtract 1 inch total from each dimension</option></select><small>Explicit confirmation is required; not a product-fit guarantee.</small></label>
                  </>}
                </div>
              </details>
              <details open>
                <summary>Materials, niche, and drywall</summary>
                <p className="bathroom-note">The supplied Home Depot list is inaccessible/unverified; its products and prices have not been imported. Material prices and waste/box coverage need configuration.</p>
                <div className="bathroom-grid">
                  <CheckInput id={`${id}-niche`} label="Niche in scope" checked={bathroom.nicheInScope} onChange={nicheInScope => set({ nicheInScope })} />
                  {bathroom.nicheInScope && <>
                    <NumberInput id={`${id}-niche-count`} label="Niche quantity" unit="each" step="1" value={bathroom.nicheCount} onChange={nicheCount => set({ nicheCount })} min={1} />
                    <NumberInput id={`${id}-niche-width`} label="Niche width" unit="in" value={bathroom.nicheWidthIn} onChange={nicheWidthIn => set({ nicheWidthIn })} />
                    <NumberInput id={`${id}-niche-height`} label="Niche height" unit="in" value={bathroom.nicheHeightIn} onChange={nicheHeightIn => set({ nicheHeightIn })} />
                  </>}
                  <label className="bathroom-field" htmlFor={`${id}-drywall`}><span>Drywall repair (choose one)</span><select id={`${id}-drywall`} data-testid={`input-${id}-drywall`} value={bathroom.drywallRepair} onChange={event => set({ drywallRepair: event.currentTarget.value as DrywallRepair })}><option value="none">No repair</option><option value="simple">Simple touchups — $535</option><option value="other">Other drywall repair — $1,600</option></select></label>
                </div>
              </details>
              <details open>
                <summary>Vanity, plumbing, lighting, and accessories</summary>
                <div className="bathroom-grid">
                  <NumberInput id={`${id}-old-vanity-width`} label="Existing vanity width" unit="in" value={bathroom.existingVanityWidthIn} onChange={existingVanityWidthIn => set({ existingVanityWidthIn })} />
                  <CheckInput id={`${id}-replace-vanity`} label="Replace vanity" checked={bathroom.replaceVanity} onChange={replaceVanity => set({ replaceVanity })} />
                  {bathroom.replaceVanity && <div className="bathroom-field"><label htmlFor={`${id}-new-vanity-width`}>New vanity width</label><select id={`${id}-new-vanity-width`} data-testid={`input-${id}-new-vanity-width`} value={[24, 30, 32, 34, 36, 38].includes(bathroom.newVanityWidthIn) ? bathroom.newVanityWidthIn : 'custom'} onChange={event => set({ newVanityWidthIn: event.currentTarget.value === 'custom' ? 0 : Number(event.currentTarget.value) })}><option value="24">24 in</option><option value="30">30 in</option><option value="32">32 in</option><option value="34">34 in</option><option value="36">36 in</option><option value="38">38 in</option><option value="custom">Custom</option></select>{![24, 30, 32, 34, 36, 38].includes(bathroom.newVanityWidthIn) && <NumberInput id={`${id}-custom-vanity-width`} label="Custom new vanity width" unit="in" value={bathroom.newVanityWidthIn} onChange={newVanityWidthIn => set({ newVanityWidthIn })} />}</div>}
                  {(bathroom.replaceVanity || bathroom.replaceTrap || bathroom.replaceFaucet) && <NumberInput id={`${id}-sink-count`} label="Sink count" unit="each" step="1" min={1} value={bathroom.sinkCount} onChange={sinkCount => set({ sinkCount })} />}
                  <CheckInput id={`${id}-replace-trap`} label="Replace P-trap (independent fixture scope)" checked={bathroom.replaceTrap} onChange={replaceTrap => set({ replaceTrap })} />
                  <CheckInput id={`${id}-replace-faucet`} label="Replace faucet (independent fixture scope)" checked={bathroom.replaceFaucet} onChange={replaceFaucet => set({ replaceFaucet })} />
                  <NumberInput id={`${id}-vanity-lights`} label="New vanity-light installation quantity" unit="each" step="1" value={bathroom.vanityLightCount} onChange={vanityLightCount => set({ vanityLightCount })} />
                  {bathroom.vanityLightCount > 0 && <CheckInput id={`${id}-vanity-light-owner`} label="Vanity light fixture is owner-supplied" checked={bathroom.vanityLightOwnerSupplied} onChange={vanityLightOwnerSupplied => set({ vanityLightOwnerSupplied })} />}
                  <NumberInput id={`${id}-towel-bars`} label="Towel bar quantity" unit="each" step="1" value={bathroom.towelBarCount} onChange={towelBarCount => set({ towelBarCount })} />
                  {bathroom.towelBarCount > 0 && <CheckInput id={`${id}-towel-owner`} label="Towel bar material is owner-supplied" checked={bathroom.towelBarOwnerSupplied} onChange={towelBarOwnerSupplied => set({ towelBarOwnerSupplied })} />}
                  <NumberInput id={`${id}-mirrors`} label="Mirror installation quantity" unit="each" step="1" value={bathroom.mirrorCount} onChange={mirrorCount => set({ mirrorCount })} />
                  {bathroom.mirrorCount > 0 && <CheckInput id={`${id}-mirror-owner`} label="Mirror material is owner-supplied" checked={bathroom.mirrorOwnerSupplied} onChange={mirrorOwnerSupplied => set({ mirrorOwnerSupplied })} />}
                  <NumberInput id={`${id}-additional-lights`} label="Additional light quantity" unit="each" step="1" value={bathroom.additionalLightCount} onChange={additionalLightCount => set({ additionalLightCount })} />
                  {bathroom.vanityLightCount > 0 && bathroom.additionalLightCount > 0 && <CheckInput id={`${id}-lights-separate`} label="Confirm additional lights are separate physical fixtures" checked={bathroom.additionalLightsConfirmedSeparate} onChange={additionalLightsConfirmedSeparate => set({ additionalLightsConfirmedSeparate })} />}
                </div>
                <p className="bathroom-note">Vanity-light installation ($75 labor) and additional-light allowance ($375 combined) are separate scope. Confirm distinct physical fixtures before including both.</p>
              </details>
            </details>
          </article>
        );
      })}
      {value.bathrooms.length === 0 && <p>No bathrooms yet. Add a bathroom to begin.</p>}
      <section className="bathroom-summary" aria-label="Bathroom scope review and live estimate">
        <h3>Scope review and live summary</h3>
        <p data-testid="text-bathroom-known-subtotal"><strong>Known-cost subtotal: {money(knownCents)}</strong> — direct known costs only; not a complete bathroom price. No project markup or tax is applied here.</p>
        <div>
          <h4>Known priced scope</h4>
          {calculation.lines.length ? <ul>{calculation.lines.map(line => <li key={line.id} data-testid={`line-bathroom-cost-${line.id}`}>{line.group}: {line.label} — {line.quantity} {line.unit} × {money(line.unitCostCents)} = {money(line.totalCents)}{line.note ? ` (${line.note})` : ''}</li>)}</ul> : <p>No priced scope selected yet.</p>}
        </div>
        <div>
          <h4>Purchasing takeoff</h4>
          {calculation.takeoff.length ? <ul>{calculation.takeoff.map(line => <li key={line.id} data-testid={`line-bathroom-takeoff-${line.id}`}>{line.group}: {line.label} — {line.quantity} {line.unit}{line.note ? ` (${line.note})` : ''}</li>)}</ul> : <p>No takeoff quantities yet.</p>}
        </div>
        <div>
          <h4>Completeness issues</h4>
          {calculation.issues.length ? <ul role="status" data-testid="list-bathroom-issues">{calculation.issues.map(issue => <li key={issue}>{issue}</li>)}</ul> : <p data-testid="status-bathroom-complete">No known completeness issues.</p>}
        </div>
      </section>
    </section>
  );
}