export type CostLine = {
  id: string;
  group: string;
  label: string;
  quantity: number;
  unit: string;
  unitCostCents: number;
  totalCents: number;
  note?: string;
};

export type TakeoffLine = {
  id: string;
  group: string;
  label: string;
  quantity: number;
  unit: string;
  note?: string;
};

export type Calculation = {
  lines: CostLine[];
  takeoff: TakeoffLine[];
  issues: string[];
  assumptions: string[];
};

export const POLICY = {
  version: 'HBUILD-2026-09-additive-v1',
  company: 35,
  incidentals: 20,
  accidents: 50,
  sales: 7,
} as const;

export function validQuantity(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function costLine(id: string, group: string, label: string, quantity: number, unit: string, unitCostCents: number, note?: string): CostLine {
  if (!validQuantity(quantity) || !validQuantity(unitCostCents)) throw new Error(`Invalid quantity or rate: ${label}`);
  return { id, group, label, quantity, unit, unitCostCents, totalCents: Math.round(quantity * unitCostCents), note };
}

export function combine(...parts: Calculation[]): Calculation {
  return uniqueLines({
    lines: parts.flatMap(part => part.lines),
    takeoff: parts.flatMap(part => part.takeoff),
    issues: parts.flatMap(part => part.issues),
    assumptions: [...new Set(parts.flatMap(part => part.assumptions))],
  });
}

export function uniqueLines(result: Calculation): Calculation {
  const charges = new Set<string>();
  const takeoffIds = new Set<string>();
  let duplicate = false;
  const lines = result.lines.filter(line => {
    if (charges.has(line.id)) { duplicate = true; return false; }
    charges.add(line.id);
    return true;
  });
  const takeoff = result.takeoff.filter(item => {
    if (takeoffIds.has(item.id)) { duplicate = true; return false; }
    takeoffIds.add(item.id);
    return true;
  });
  return { ...result, lines, takeoff, issues: duplicate
    ? [...result.issues, 'Duplicate scope identities detected. Recreate the affected sections; duplicated charges were withheld.']
    : result.issues };
}

export function totals(result: Calculation) {
  const directCents = result.lines.reduce((sum, item) => sum + item.totalCents, 0);
  const companyCents = Math.round(directCents * POLICY.company / 100);
  const incidentalsCents = Math.round(directCents * POLICY.incidentals / 100);
  const accidentsCents = Math.round(directCents * POLICY.accidents / 100);
  const salesCents = Math.round(directCents * POLICY.sales / 100);
  return {
    directCents, companyCents, incidentalsCents, accidentsCents, salesCents,
    beforeTaxCents: directCents + companyCents + incidentalsCents + accidentsCents + salesCents,
  };
}

export function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

/** Generates collision-resistant identifiers in both browser and server runtimes. */
export function createId(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}
