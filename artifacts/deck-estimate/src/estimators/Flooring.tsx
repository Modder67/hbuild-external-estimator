import { useState, type ChangeEvent } from 'react';
import { calculateFlooring, newFlooringState, newId, packageLabels } from '@workspace/estimator-core';
import type {
  BaseboardMode, DoorWidth, FloorType, FlooringDoor, FlooringExtra, FlooringOrder,
  FlooringPackage, FlooringRoom, FlooringState, Calculation,
} from '@workspace/estimator-core';
export * from '@workspace/estimator-core';

type FlooringEditorProps = { value: FlooringState; onChange: (value: FlooringState) => void };

const fieldStyle = 'w-full rounded-md border border-border bg-background px-3 py-2 text-foreground';
const rowStyle = 'rounded-lg border border-border p-4 space-y-3';

function numericValue(event: ChangeEvent<HTMLInputElement>): number {
  return event.target.value === '' ? 0 : Number(event.target.value);
}

function nullableNumericValue(event: ChangeEvent<HTMLInputElement>): number | null {
  return event.target.value === '' ? null : Number(event.target.value);
}

export function FlooringEditor({ value, onChange }: FlooringEditorProps) {
  const [deletedRoom, setDeletedRoom] = useState<FlooringRoom | null>(null);
  const updateRoom = (id: string, changes: Partial<FlooringRoom>) => onChange({ ...value, rooms: value.rooms.map(room => room.id === id ? { ...room, ...changes } : room) });
  const updateDoor = (id: string, changes: Partial<FlooringDoor>) => onChange({ ...value, doors: value.doors.map(door => door.id === id ? { ...door, ...changes } : door) });
  const addRoom = () => onChange({ ...value, rooms: [...value.rooms, {
    id: newId('room'), name: `Room ${value.rooms.length + 1}`, measuredSqft: 0, existingType: 'carpet', demolition: false,
    demolitionAreaOverride: null, otherDemoDescription: '', otherDemoRateCents: null, substrate: 'unknown', package: 'lvp-median',
    wastePercent: 0, packageSizeSqft: null, installedAreaOverride: null, carpetMaterialQuantitySqft: null,
    materialRateOverrideCents: null, materialUnitOverride: null, installRateOverrideCents: null,
    baseboardMode: 'none', baseboardLft: 0, reinstallRateCents: null, pad: 'none', padRateCents: null,
  }] });
  const duplicateRoom = (room: FlooringRoom) => onChange({ ...value, rooms: [...value.rooms, {
    ...room, id: newId('room'), name: `${room.name} copy`, measuredSqft: 0, demolitionAreaOverride: null,
    installedAreaOverride: null, carpetMaterialQuantitySqft: null, baseboardLft: 0,
  }] });
  const addOrder = () => onChange({ ...value, orders: [...value.orders, { id: newId('order'), label: `Order ${value.orders.length + 1}`, shippingCents: null }] });
  const addDoor = () => {
    const order = value.orders[0] ?? { id: 'order-1', label: 'Order 1', shippingCents: null };
    onChange({
      ...value,
      orders: value.orders.length ? value.orders : [order],
      doors: [...value.doors, {
        id: newId('door'), location: '', roomName: '', pocket: false, exterior: false, width: 30, measurement: 'slab',
        heightIn: null, jambDepthIn: null, handing: '', swing: '', viewingSide: '', slideDirection: '',
        hardware: 'new', hardwarePackage: '', hardwareRateCents: null, reuseConfirmed: false,
        trimColor: value.doorTrimColor, doorPaintColor: '', orderId: order.id, customMaterialRateCents: null, customLaborRateCents: null,
      }],
    });
  };
  const removeDoor = (id: string) => onChange({ ...value, doors: value.doors.filter(door => door.id !== id) });
  const duplicateDoor = (door: FlooringDoor) => onChange({ ...value, doors: [...value.doors, { ...door, id: newId('door'), location: '' }] });
  const input = (label: string, current: number, change: (next: number) => void, testId: string, step = 'any') => (
    <label className="block text-sm space-y-1">{label}<input data-testid={testId} className={fieldStyle} type="number" min="0" step={step} value={current} onChange={event => change(numericValue(event))} /></label>
  );
  const optionalInput = (label: string, current: number | null, change: (next: number | null) => void, testId: string, step = 'any') => (
    <label className="block text-sm space-y-1">{label}<input data-testid={testId} className={fieldStyle} type="number" min="0" step={step} value={current ?? ''} onChange={event => change(nullableNumericValue(event))} /></label>
  );

  return <div className="space-y-6" data-testid="flooring-editor">
    <section className="space-y-3">
      <header className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">Flooring rooms</h2><button type="button" data-testid="button-add-room" className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={addRoom}>Add room</button></header>
      {!value.rooms.length && <p className="text-sm text-muted-foreground">Add a room to enter flooring measurements and pricing.</p>}
      {value.rooms.map(room => <article className={rowStyle} key={room.id} data-testid={`room-${room.id}`}>
        <div className="flex items-center justify-between gap-3"><h3 className="font-medium">{room.name}</h3><div className="flex gap-2">
          <button type="button" data-testid={`button-duplicate-room-${room.id}`} className="rounded border px-3 py-1" onClick={() => duplicateRoom(room)}>Duplicate</button>
          <button type="button" data-testid={`button-delete-room-${room.id}`} className="rounded border px-3 py-1" onClick={() => { setDeletedRoom(room); onChange({ ...value, rooms: value.rooms.filter(item => item.id !== room.id) }); }}>Delete</button>
        </div></div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block text-sm space-y-1">Room name<input data-testid={`input-room-name-${room.id}`} className={fieldStyle} value={room.name} onChange={event => updateRoom(room.id, { name: event.target.value })} /></label>
          {input('Measured area (SQFT)', room.measuredSqft, measuredSqft => updateRoom(room.id, { measuredSqft }), `input-measured-sqft-${room.id}`, '0.01')}
          <label className="block text-sm space-y-1">Existing flooring<select data-testid={`select-existing-type-${room.id}`} className={fieldStyle} value={room.existingType} onChange={event => updateRoom(room.id, { existingType: event.target.value as FloorType })}>
            {(['carpet', 'lvp', 'tile', 'hardwood', 'linoleum', 'other'] as FloorType[]).map(type => <option key={type} value={type}>{type}</option>)}
          </select></label>
          <label className="flex items-center gap-2 text-sm"><input data-testid={`toggle-demolition-${room.id}`} type="checkbox" checked={room.demolition} onChange={event => updateRoom(room.id, { demolition: event.target.checked })} />Demolish existing flooring</label>
          {room.demolition && <>{input('Demolition area override (SQFT)', room.demolitionAreaOverride ?? room.measuredSqft, v => updateRoom(room.id, { demolitionAreaOverride: v }), `input-demo-area-${room.id}`, '0.01')}
            {room.existingType === 'other' && <><label className="block text-sm space-y-1">Other flooring description<input data-testid={`input-other-demo-${room.id}`} className={fieldStyle} value={room.otherDemoDescription} onChange={event => updateRoom(room.id, { otherDemoDescription: event.target.value })} /></label>{input('Custom demolition rate (cents/SQFT)', room.otherDemoRateCents ?? 0, v => updateRoom(room.id, { otherDemoRateCents: v }), `input-other-rate-${room.id}`, '1')}</>}</>}
          <label className="block text-sm space-y-1">Substrate<select data-testid={`select-substrate-${room.id}`} className={fieldStyle} value={room.substrate} onChange={event => updateRoom(room.id, { substrate: event.target.value as FlooringRoom['substrate'] })}><option value="unknown">Unknown</option><option value="concrete">Concrete / slab</option><option value="wood">Wood subfloor</option><option value="other">Other</option></select></label>
          <label className="block text-sm space-y-1">New flooring package<select data-testid={`select-package-${room.id}`} className={fieldStyle} value={room.package} onChange={event => updateRoom(room.id, { package: event.target.value as FlooringPackage })}>{Object.entries(packageLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          {input('Material waste (%)', room.wastePercent, wastePercent => updateRoom(room.id, { wastePercent }), `input-waste-${room.id}`, '0.1')}
          {input('Installation area override (SQFT)', room.installedAreaOverride ?? room.measuredSqft, installedAreaOverride => updateRoom(room.id, { installedAreaOverride }), `input-install-area-${room.id}`, '0.01')}
          {room.package.startsWith('carpet') && input('Carpet material roll-layout override (SQFT)', room.carpetMaterialQuantitySqft ?? 0, v => updateRoom(room.id, { carpetMaterialQuantitySqft: v || null }), `input-carpet-quantity-${room.id}`, '0.01')}
          {input('Package size (SQFT; optional)', room.packageSizeSqft ?? 0, v => updateRoom(room.id, { packageSizeSqft: v || null }), `input-package-size-${room.id}`, '0.01')}
          {room.package.startsWith('carpet') && <label className="block text-sm space-y-1">Carpet material unit confirmation<select data-testid={`select-material-unit-${room.id}`} className={fieldStyle} value={room.materialUnitOverride ?? ''} onChange={event => updateRoom(room.id, { materialUnitOverride: event.target.value ? event.target.value as 'sqft' | 'sqyd' : null })}><option value="">Unconfirmed</option><option value="sqft">Rate is per SQFT</option><option value="sqyd">Rate is per SQYD</option></select></label>}
          {optionalInput('Material rate override (cents/unit)', room.materialRateOverrideCents, materialRateOverrideCents => updateRoom(room.id, { materialRateOverrideCents }), `input-material-rate-${room.id}`, '1')}
          {optionalInput('Installation rate override (cents/unit)', room.installRateOverrideCents, installRateOverrideCents => updateRoom(room.id, { installRateOverrideCents }), `input-install-rate-${room.id}`, '1')}
          <label className="block text-sm space-y-1">Baseboard mode<select data-testid={`select-baseboard-mode-${room.id}`} className={fieldStyle} value={room.baseboardMode} onChange={event => updateRoom(room.id, { baseboardMode: event.target.value as BaseboardMode })}><option value="none">None</option><option value="new">New baseboard</option><option value="reinstall">Reinstall existing</option></select></label>
          {room.baseboardMode !== 'none' && <>{input('Baseboard length (LFT)', room.baseboardLft, baseboardLft => updateRoom(room.id, { baseboardLft }), `input-baseboard-lft-${room.id}`, '0.01')}{room.baseboardMode === 'reinstall' && optionalInput('Reinstall rate (cents/LFT)', room.reinstallRateCents, reinstallRateCents => updateRoom(room.id, { reinstallRateCents }), `input-reinstall-rate-${room.id}`, '1')}</>}
          {room.package.startsWith('carpet') && <><label className="block text-sm space-y-1">Carpet pad<select data-testid={`select-pad-${room.id}`} className={fieldStyle} value={room.pad} onChange={event => updateRoom(room.id, { pad: event.target.value as FlooringRoom['pad'] })}><option value="none">No pad</option><option value="7lb">7 lb pad</option><option value="10lb">10 lb pad</option></select></label>{room.pad !== 'none' && optionalInput('Pad rate (cents/SQFT)', room.padRateCents, padRateCents => updateRoom(room.id, { padRateCents }), `input-pad-rate-${room.id}`, '1')}</>}
        </div>
      </article>)}
      {deletedRoom && <div role="status" className="flex items-center gap-3"><span>Deleted “{deletedRoom.name}”.</span><button type="button" data-testid="button-undo-room-delete" className="underline" onClick={() => { onChange({ ...value, rooms: [...value.rooms, deletedRoom] }); setDeletedRoom(null); }}>Undo</button></div>}
    </section>
    <section className="space-y-3">
      <header className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">Doors (optional)</h2><button type="button" data-testid="button-add-door" className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={addDoor}>Add door</button></header>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block text-sm space-y-1">Default trim color<input data-testid="input-default-trim-color" className={fieldStyle} value={value.doorTrimColor} onChange={event => onChange({ ...value, doorTrimColor: event.target.value })} /></label>
        <label className="block text-sm space-y-1">Casing material included in door material?<select data-testid="select-casing-material-included" className={fieldStyle} value={value.casingMaterialIncluded === null ? '' : String(value.casingMaterialIncluded)} onChange={event => onChange({ ...value, casingMaterialIncluded: event.target.value === '' ? null : event.target.value === 'true' })}><option value="">Unresolved</option><option value="true">Yes</option><option value="false">No — price separately</option></select></label>
        <label className="block text-sm space-y-1">Casing paint supplies covered?<select data-testid="select-casing-paint-included" className={fieldStyle} value={value.casingPaintIncluded === null ? '' : String(value.casingPaintIncluded)} onChange={event => onChange({ ...value, casingPaintIncluded: event.target.value === '' ? null : event.target.value === 'true' })}><option value="">Unresolved</option><option value="true">Yes</option><option value="false">No — price separately</option></select></label>
        {value.casingMaterialIncluded === false && input('Casing rate (cents/LFT)', value.casingRateCentsPerLft ?? 0, v => onChange({ ...value, casingRateCentsPerLft: v }), 'input-casing-rate', '1')}
        {value.casingPaintIncluded === false && input('Casing paint rate (cents/door)', value.casingPaintRateCentsPerDoor ?? 0, v => onChange({ ...value, casingPaintRateCentsPerDoor: v }), 'input-casing-paint-rate', '1')}
      </div>
      {value.doors.map(door => <article className={rowStyle} key={door.id} data-testid={`door-${door.id}`}>
        <header className="flex items-center justify-between"><h3 className="font-medium">{door.location || 'New opening'} — {door.width} in; {door.pocket ? `slides ${door.slideDirection || 'direction needed'}` : `${door.handing || 'handing needed'} hand, ${door.swing || 'swing needed'}`}</h3><div className="flex gap-2"><button type="button" data-testid={`button-duplicate-door-${door.id}`} className="rounded border px-3 py-1" onClick={() => duplicateDoor(door)}>Duplicate specs</button><button type="button" data-testid={`button-delete-door-${door.id}`} className="rounded border px-3 py-1" onClick={() => removeDoor(door.id)}>Delete</button></div></header>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block text-sm space-y-1">Location<input data-testid={`input-door-location-${door.id}`} className={fieldStyle} value={door.location} onChange={event => updateDoor(door.id, { location: event.target.value })} /></label>
          <label className="block text-sm space-y-1">Related room<input data-testid={`input-door-room-${door.id}`} className={fieldStyle} value={door.roomName} onChange={event => updateDoor(door.id, { roomName: event.target.value })} /></label>
          <label className="block text-sm space-y-1">Width (in)<select data-testid={`select-door-width-${door.id}`} className={fieldStyle} value={door.width} onChange={event => updateDoor(door.id, { width: Number(event.target.value) as DoorWidth })}>{[24, 30, 32, 36].map(width => <option key={width} value={width}>{width}</option>)}</select></label>
          <label className="block text-sm space-y-1">Measurement describes<select data-testid={`select-door-measurement-${door.id}`} className={fieldStyle} value={door.measurement} onChange={event => updateDoor(door.id, { measurement: event.target.value as FlooringDoor['measurement'] })}><option value="slab">Door slab</option><option value="rough-opening">Rough opening (not slab size)</option></select></label>
          <label className="flex items-center gap-2 text-sm"><input data-testid={`toggle-pocket-${door.id}`} type="checkbox" checked={door.pocket} onChange={event => updateDoor(door.id, { pocket: event.target.checked, handing: '', swing: '' })} />Pocket door</label>
          <label className="flex items-center gap-2 text-sm"><input data-testid={`toggle-exterior-${door.id}`} type="checkbox" checked={door.exterior} onChange={event => updateDoor(door.id, { exterior: event.target.checked })} />Exterior door</label>
          {door.pocket ? <label className="block text-sm space-y-1">Slide direction<select data-testid={`select-door-slide-${door.id}`} className={fieldStyle} value={door.slideDirection} onChange={event => updateDoor(door.id, { slideDirection: event.target.value as FlooringDoor['slideDirection'] })}><option value="">Choose direction</option><option value="left">Slides left</option><option value="right">Slides right</option></select></label> : <>
            <label className="block text-sm space-y-1">Handing<select data-testid={`select-door-handing-${door.id}`} className={fieldStyle} value={door.handing} onChange={event => updateDoor(door.id, { handing: event.target.value as FlooringDoor['handing'] })}><option value="">Choose handing</option><option value="left">Left</option><option value="right">Right</option></select></label>
            <label className="block text-sm space-y-1">Swing<select data-testid={`select-door-swing-${door.id}`} className={fieldStyle} value={door.swing} onChange={event => updateDoor(door.id, { swing: event.target.value as FlooringDoor['swing'] })}><option value="">Choose swing</option><option value="inward">Inward</option><option value="outward">Outward</option></select></label>
            <label className="block text-sm space-y-1">Viewing side<input data-testid={`input-door-view-side-${door.id}`} className={fieldStyle} value={door.viewingSide} onChange={event => updateDoor(door.id, { viewingSide: event.target.value })} /></label>
          </>}
          <label className="block text-sm space-y-1">Hardware<select data-testid={`select-door-hardware-${door.id}`} className={fieldStyle} value={door.hardware} onChange={event => updateDoor(door.id, { hardware: event.target.value as FlooringDoor['hardware'] })}><option value="new">New</option><option value="reuse">Reuse</option></select></label>
          {door.hardware === 'new' ? <><label className="block text-sm space-y-1">Hardware package<input data-testid={`input-door-hardware-package-${door.id}`} className={fieldStyle} value={door.hardwarePackage} onChange={event => updateDoor(door.id, { hardwarePackage: event.target.value })} /></label>{optionalInput('Hardware rate (cents)', door.hardwareRateCents, hardwareRateCents => updateDoor(door.id, { hardwareRateCents }), `input-door-hardware-rate-${door.id}`, '1')}</> : <label className="flex items-center gap-2 text-sm"><input data-testid={`toggle-reuse-confirmed-${door.id}`} type="checkbox" checked={door.reuseConfirmed} onChange={event => updateDoor(door.id, { reuseConfirmed: event.target.checked })} />Reuse suitability confirmed</label>}
          <label className="block text-sm space-y-1">Trim color<input data-testid={`input-door-trim-color-${door.id}`} className={fieldStyle} value={door.trimColor} onChange={event => updateDoor(door.id, { trimColor: event.target.value })} /></label>
          <label className="block text-sm space-y-1">Door paint color<input data-testid={`input-door-paint-color-${door.id}`} className={fieldStyle} value={door.doorPaintColor} onChange={event => updateDoor(door.id, { doorPaintColor: event.target.value })} /></label>
          <label className="block text-sm space-y-1">Door order<select data-testid={`select-door-order-${door.id}`} className={fieldStyle} value={door.orderId} onChange={event => updateDoor(door.id, { orderId: event.target.value })}>{value.orders.map(order => <option key={order.id} value={order.id}>{order.label}</option>)}</select></label>
          {door.pocket || door.exterior ? <>{optionalInput('Custom material rate (cents)', door.customMaterialRateCents, customMaterialRateCents => updateDoor(door.id, { customMaterialRateCents }), `input-door-material-rate-${door.id}`, '1')}{optionalInput('Custom labor rate (cents)', door.customLaborRateCents, customLaborRateCents => updateDoor(door.id, { customLaborRateCents }), `input-door-labor-rate-${door.id}`, '1')}</> : null}
          {input('Height (in; optional)', door.heightIn ?? 0, heightIn => updateDoor(door.id, { heightIn: heightIn || null }), `input-door-height-${door.id}`, '0.01')}
          {input('Jamb depth (in; optional)', door.jambDepthIn ?? 0, jambDepthIn => updateDoor(door.id, { jambDepthIn: jambDepthIn || null }), `input-door-jamb-${door.id}`, '0.01')}
        </div><p className="text-sm text-muted-foreground">Casing takeoff: 6 sticks × 8 ft (48 LFT). Confirm supplier handing before purchase.</p>
      </article>)}
      <div className="space-y-2">{value.orders.map(order => <div key={order.id} className="flex flex-wrap items-end gap-3">
        <label className="block min-w-40 flex-1 text-sm space-y-1">Order label<input data-testid={`input-order-label-${order.id}`} className={fieldStyle} value={order.label} onChange={event => onChange({ ...value, orders: value.orders.map(item => item.id === order.id ? { ...item, label: event.target.value } : item) })} /></label>
        {input(`${order.label} shipping / handling (cents)`, order.shippingCents ?? 0, shippingCents => onChange({ ...value, orders: value.orders.map(item => item.id === order.id ? { ...item, shippingCents: shippingCents || null } : item) }), `input-order-shipping-${order.id}`, '1')}
      </div>)}<button type="button" data-testid="button-add-order" className="rounded border px-3 py-2" onClick={addOrder}>Add separate order</button></div>
    </section>
    <section className="space-y-3">
      <header className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">Additional extras</h2><button type="button" data-testid="button-add-extra" className="rounded border px-3 py-2" onClick={() => onChange({ ...value, extras: [...value.extras, { id: newId('extra'), label: '', quantity: 1, unit: 'item', unitCostCents: null, included: false }] })}>Add extra</button></header>
      {value.extras.map(extra => <div key={extra.id} className="grid gap-3 md:grid-cols-5">
        <label className="block text-sm space-y-1">Description<input data-testid={`input-extra-label-${extra.id}`} className={fieldStyle} value={extra.label} onChange={event => onChange({ ...value, extras: value.extras.map(item => item.id === extra.id ? { ...item, label: event.target.value } : item) })} /></label>
        {input('Quantity', extra.quantity, quantity => onChange({ ...value, extras: value.extras.map(item => item.id === extra.id ? { ...item, quantity } : item) }), `input-extra-quantity-${extra.id}`, '0.01')}
        <label className="block text-sm space-y-1">Unit<input data-testid={`input-extra-unit-${extra.id}`} className={fieldStyle} value={extra.unit} onChange={event => onChange({ ...value, extras: value.extras.map(item => item.id === extra.id ? { ...item, unit: event.target.value } : item) })} /></label>
        {optionalInput('Rate (cents/unit)', extra.unitCostCents, unitCostCents => onChange({ ...value, extras: value.extras.map(item => item.id === extra.id ? { ...item, unitCostCents } : item) }), `input-extra-rate-${extra.id}`, '1')}
        <label className="flex items-center gap-2 text-sm"><input data-testid={`toggle-extra-included-${extra.id}`} type="checkbox" checked={extra.included} onChange={event => onChange({ ...value, extras: value.extras.map(item => item.id === extra.id ? { ...item, included: event.target.checked } : item) })} />Included in package (not separately charged)</label>
        <button type="button" data-testid={`button-delete-extra-${extra.id}`} className="rounded border px-3 py-1" onClick={() => onChange({ ...value, extras: value.extras.filter(item => item.id !== extra.id) })}>Delete extra</button>
      </div>)}
    </section>
    <CalculationSummary calculation={calculateFlooring(value)} />
  </div>;
}

function CalculationSummary({ calculation }: { calculation: Calculation }) {
  const directCents = calculation.lines.reduce((sum, line) => sum + line.totalCents, 0);
  return <section className="space-y-2 rounded-lg border border-border p-4" data-testid="flooring-calculation">
    <h2 className="text-xl font-semibold">Known direct cost</h2>
    {calculation.lines.map(line => <div key={line.id} data-testid={`cost-line-${line.id}`} className="flex justify-between gap-4 text-sm"><span>{line.label} <span className="text-muted-foreground">({line.quantity} {line.unit})</span></span><span>${(line.totalCents / 100).toFixed(2)}</span></div>)}
    <p data-testid="text-flooring-direct-total" className="border-t border-border pt-2 font-semibold">Direct subtotal: ${(directCents / 100).toFixed(2)}</p>
    {!!calculation.issues.length && <div role="alert" data-testid="flooring-pricing-issues"><h3 className="font-semibold">Pricing issues</h3><ul className="list-disc pl-5 text-sm">{calculation.issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul></div>}
    {!!calculation.assumptions.length && <ul className="list-disc pl-5 text-xs text-muted-foreground">{calculation.assumptions.map(item => <li key={item}>{item}</li>)}</ul>}
  </section>;
}
