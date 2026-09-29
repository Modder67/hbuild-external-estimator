export * from './types';
export * from './flooring';
export * from './bathroom';
export * from './basement';

export const RATE_BOOK_VERSION = 'HBUILD-rates-2026-09-v1';
export const rateBookVersion = RATE_BOOK_VERSION;

import { calculateFlooring } from './flooring';
import { calculateBathroom } from './bathroom';
import { calculateBasement } from './basement';
import type { Calculation } from './types';

/** Calculate a known estimator scope. Malformed or unknown input is rejected without returning partial charges. */
export function calculateForSlug(slug: string, scope: unknown): Calculation {
  const rejected = (message: string): Calculation => ({ lines: [], takeoff: [], issues: [message], assumptions: [] });
  if (slug !== 'flooring' && slug !== 'bathroom' && slug !== 'basement') return rejected('Unsupported estimator slug: ' + slug + '.');
  const active = new Set<object>();
  const isJsonValue = (value: unknown): boolean => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'object') return false;
    if (active.has(value)) return false;
    active.add(value);
    const valid = Array.isArray(value)
      ? value.every(isJsonValue)
      : (() => {
          const prototype = Object.getPrototypeOf(value);
          return (prototype === Object.prototype || prototype === null) && Object.values(value as Record<string, unknown>).every(isJsonValue);
        })();
    active.delete(value);
    return valid;
  };
  let serializable = false;
  try {
    serializable = Boolean(scope && typeof scope === 'object' && !Array.isArray(scope) && isJsonValue(scope));
  } catch {
    return rejected('Estimator scope is malformed or not JSON-serializable.');
  }
  if (!serializable) return rejected('Estimator scope is malformed or not JSON-serializable.');
  const record = scope as Record<string, unknown>;
  const requiredArrays: Record<string, string[]> = { flooring: ['rooms', 'doors', 'orders', 'extras'], bathroom: ['bathrooms'], basement: ['walls', 'soffits', 'electricalPoints'] };
  if (requiredArrays[slug].some(key => !Array.isArray(record[key]))) return rejected('Malformed ' + slug + ' scope: required collections are missing or invalid.');
  const hasFields = (value: unknown, fields: string[]) => value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && fields.every(field => Object.prototype.hasOwnProperty.call(value, field));
  const hasEntries = (value: unknown, fields: string[]) => Array.isArray(value) && value.every(entry => hasFields(entry, fields));
  const flooringFields = ['rooms', 'doors', 'orders', 'extras', 'casingMaterialIncluded', 'casingPaintIncluded', 'casingRateCentsPerLft', 'casingPaintRateCentsPerDoor', 'doorTrimColor'];
  const roomFields = ['id', 'name', 'measuredSqft', 'existingType', 'demolition', 'demolitionAreaOverride', 'otherDemoDescription', 'otherDemoRateCents', 'substrate', 'package', 'wastePercent', 'packageSizeSqft', 'installedAreaOverride', 'carpetMaterialQuantitySqft', 'materialRateOverrideCents', 'materialUnitOverride', 'installRateOverrideCents', 'baseboardMode', 'baseboardLft', 'reinstallRateCents', 'pad', 'padRateCents'];
  const doorFields = ['id', 'location', 'roomName', 'pocket', 'exterior', 'width', 'measurement', 'heightIn', 'jambDepthIn', 'handing', 'swing', 'viewingSide', 'slideDirection', 'hardware', 'hardwarePackage', 'hardwareRateCents', 'reuseConfirmed', 'trimColor', 'doorPaintColor', 'orderId', 'customMaterialRateCents', 'customLaborRateCents'];
  const bathroomFields = ['id', 'name', 'tubInScope', 'tubWidthIn', 'tubLengthIn', 'tubDrainSide', 'showerInScope', 'demoTileSurround', 'wallDemoSqFt', 'wallHeightFt', 'panDemoInScope', 'existingPanDemoSqFt', 'newWallInstallSqFt', 'newPanWidthIn', 'newPanDepthIn', 'panAdjustmentPolicy', 'finish', 'nicheInScope', 'nicheCount', 'nicheWidthIn', 'nicheHeightIn', 'drywallRepair', 'existingVanityWidthIn', 'replaceVanity', 'newVanityWidthIn', 'sinkCount', 'replaceTrap', 'replaceFaucet', 'vanityLightCount', 'vanityLightOwnerSupplied', 'towelBarCount', 'towelBarOwnerSupplied', 'mirrorCount', 'mirrorOwnerSupplied', 'additionalLightCount', 'additionalLightsConfirmedSeparate'];
  const isFlooring = (value: unknown) => hasFields(value, flooringFields)
    && hasEntries((value as Record<string, unknown>).rooms, roomFields)
    && hasEntries((value as Record<string, unknown>).doors, doorFields)
    && hasEntries((value as Record<string, unknown>).orders, ['id', 'label', 'shippingCents'])
    && hasEntries((value as Record<string, unknown>).extras, ['id', 'label', 'quantity', 'unit', 'unitCostCents', 'included']);
  const isBathroom = (value: unknown) => {
    if (!hasFields(value, ['bathrooms', 'deletedBathroom'])) return false;
    const state = value as Record<string, unknown>;
    const deleted = state.deletedBathroom;
    return hasEntries(state.bathrooms, bathroomFields)
      && (deleted === null || (
        hasFields(deleted, ['bathroom', 'index'])
        && hasFields((deleted as Record<string, unknown>).bathroom, bathroomFields)
      ));
  };
  if (slug === 'flooring' && !isFlooring(scope)) return rejected('Malformed flooring scope: one or more records do not match the supported state shape.');
  if (slug === 'bathroom' && !isBathroom(scope)) return rejected('Malformed bathroom scope: one or more records do not match the supported state shape.');
  if (slug === 'basement') {
    const walls = ['id', 'name', 'roomName', 'lengthFt', 'heightFt', 'finishedFaces', 'sheetLengthIn', 'sheetWidthIn', 'wastePercent', 'surface', 'wetWallPackageConfirmed'];
    const soffits = ['id', 'name', 'roomName', 'lengthFt', 'widthIn', 'dropHeightIn', 'exposedFaces'];
    const points = ['id', 'roomName', 'kind', 'bathroomId'];
    const validBasement = hasFields(scope, ['egress', 'walls', 'soffits', 'panelWork', 'distinctPanelWorkConfirmed', 'electricalDays', 'dailyLaborExcluded', 'electricalPoints', 'includeFlooring', 'flooring', 'includeBathrooms', 'bathrooms', 'bathroomFloorOwner', 'bathroomLightingOwner'])
      && hasEntries(record.walls, walls)
      && hasEntries(record.soffits, soffits)
      && hasEntries(record.electricalPoints, points)
      && isFlooring(record.flooring)
      && isBathroom(record.bathrooms);
    if (!validBasement) return rejected('Malformed basement scope: one or more records do not match the supported state shape.');
  }
  try {
    if (slug === 'flooring') return calculateFlooring(scope as Parameters<typeof calculateFlooring>[0]);
    if (slug === 'bathroom') return calculateBathroom(scope as Parameters<typeof calculateBathroom>[0]);
    return calculateBasement(scope as Parameters<typeof calculateBasement>[0]);
  } catch {
    return rejected('Malformed ' + slug + ' scope: calculation was rejected and no charges were returned.');
  }
}
