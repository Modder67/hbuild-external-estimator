import type { EstimateState } from '@/lib/pricing';
import type { EstimatorProject } from './project';

export type DeckProject = EstimatorProject<EstimateState>;

/** Keep the full Deck form as server scope; the server owns all authoritative math. */
export function deckProjectFromState(state: EstimateState): DeckProject {
  const sourceId = state.sourceId ?? '';
  const clientSourceId = state.clientSourceId ?? '';
  const job = state.jobDetails;
  return {
    sourceId,
    clientSourceId,
    firstName: job.firstName,
    lastName: job.lastName,
    phone: '',
    email: '',
    addressLine1: job.addressLine1,
    addressLine2: job.addressLine2,
    city: job.city,
    region: job.region,
    postalCode: job.postalCode,
    jobCode: job.jobCode,
    projectName: job.jobTitle,
    salesperson: job.salesperson,
    scope: { ...state, sourceId, clientSourceId },
  };
}

/** Restore the immutable server project without losing any Deck-specific scope fields. */
export function deckStateFromProject(project: DeckProject): EstimateState {
  const scope = project.scope;
  return {
    ...scope,
    sourceId: project.sourceId,
    clientSourceId: project.clientSourceId,
    jobDetails: {
      ...scope.jobDetails,
      firstName: project.firstName,
      lastName: project.lastName,
      addressLine1: project.addressLine1,
      addressLine2: project.addressLine2,
      city: project.city,
      region: project.region,
      postalCode: project.postalCode,
      jobCode: project.jobCode,
      jobTitle: project.projectName,
      salesperson: project.salesperson,
      customerName: [project.firstName, project.lastName].filter(Boolean).join(' '),
      customerAddress: [
        project.addressLine1,
        project.addressLine2,
        [project.city, project.region, project.postalCode].filter(Boolean).join(' '),
      ].filter(Boolean).join(', '),
    },
  };
}