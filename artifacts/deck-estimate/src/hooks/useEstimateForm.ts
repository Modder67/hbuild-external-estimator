import { useState, useEffect } from 'react';
import { EstimateState, DEFAULT_ADDONS, MeasurementType, StairPosts, JoistSize } from '@/lib/pricing';
import { format } from 'date-fns';

const STORAGE_KEY = 'deck_remodel_pros_estimate_state';
const HISTORY_KEY = `${STORAGE_KEY}:history`;

const defaultState: EstimateState = {
  sourceId: crypto.randomUUID(),
  clientSourceId: crypto.randomUUID(),
  jobDetails: {
    salesperson: '',
    firstName: '',
    lastName: '',
    jobCode: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    region: '',
    postalCode: '',
    customerName: '',
    customerAddress: '',
    jobTitle: 'Full Deck Remodel',
    date: format(new Date(), 'yyyy-MM-dd'),
  },
  measurements: {
    ledger: [0],
    framing: [0],
    pictureFrame: [0],
    deckArea: [0],
    joistCount: [0],
    beam: [0],
    postCount: [0],
    caissons: [0],
    rail8: [0],
    rail10: [0],
    stair6: [0],
    stair8: [0],
    stair10: [0],
  },
  joistSize: '',
  lumberSelections: { ledger: '', framing: '', joist: '', beam: '', post: '' },
  stairPosts: { left: 0, middle: 0, right: 0, center: 0 },
  materialTier: 'premium',
  addons: DEFAULT_ADDONS,
  selectedMarkup: 'better',
};

export function useEstimateForm() {
  const [state, setState] = useState<EstimateState>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...defaultState,
          ...parsed,
          sourceId: typeof parsed.sourceId === 'string' ? parsed.sourceId : crypto.randomUUID(),
          clientSourceId: typeof parsed.clientSourceId === 'string' ? parsed.clientSourceId : crypto.randomUUID(),
          jobDetails: { ...defaultState.jobDetails, ...(parsed.jobDetails || {}) },
          measurements: { ...defaultState.measurements, ...(parsed.measurements || {}) },
          stairPosts: { ...defaultState.stairPosts, ...(parsed.stairPosts || {}) },
          lumberSelections: { ...defaultState.lumberSelections, ...(parsed.lumberSelections || {}) },
          addons: defaultState.addons.map(defaultAddon => {
            const storedAddon = parsed.addons?.find((a: any) => a.id === defaultAddon.id);
            return storedAddon ? { ...defaultAddon, ...storedAddon } : defaultAddon;
          })
        };
      }
    } catch (e) {
      console.error("Failed to load state from localStorage", e);
    }
    return defaultState;
  });
  const [history, setHistory] = useState<EstimateState[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(saved) ? saved.filter(item => item && typeof item === 'object').slice(0, 50) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);
  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  const preserveCurrent = () => setHistory(previous => [
    state,
    ...previous.filter(item => item.sourceId !== state.sourceId),
  ].slice(0, 50));

  const restoreState = (next: EstimateState) => {
    if (JSON.stringify(next) !== JSON.stringify(state)) preserveCurrent();
    setState(next);
  };

  const updateJobDetails = (field: keyof EstimateState['jobDetails'], value: string) => {
    setState(prev => {
      const next = { ...prev.jobDetails, [field]: value };
      if (field === 'firstName' || field === 'lastName')
        next.customerName = [next.firstName, next.lastName].filter(Boolean).join(' ');
      if (['addressLine1', 'addressLine2', 'city', 'region', 'postalCode'].includes(field))
        next.customerAddress = [next.addressLine1, next.addressLine2,
          [next.city, next.region, next.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      return {
        ...prev,
        jobDetails: next,
      };
    });
  };

  const setClientSourceId = (id: string) => {
    setState(prev => ({ ...prev, clientSourceId: id }));
  };

  const updateMeasurement = (type: MeasurementType, index: number, value: string) => {
    setState(prev => {
      const newArr = [...prev.measurements[type]];
      newArr[index] = parseFloat(value) || 0;
      return {
        ...prev,
        measurements: { ...prev.measurements, [type]: newArr }
      };
    });
  };

  const addMeasurementSegment = (type: MeasurementType) => {
    setState(prev => ({
      ...prev,
      measurements: { ...prev.measurements, [type]: [...prev.measurements[type], 0] }
    }));
  };

  const removeMeasurementSegment = (type: MeasurementType, index: number) => {
    setState(prev => {
      const newArr = prev.measurements[type].filter((_, i) => i !== index);
      if (newArr.length === 0) newArr.push(0);
      return {
        ...prev,
        measurements: { ...prev.measurements, [type]: newArr }
      };
    });
  };

  const updateStairPosts = (field: keyof StairPosts, value: string) => {
    setState(prev => ({
      ...prev,
      stairPosts: { ...prev.stairPosts, [field]: parseInt(value) || 0 }
    }));
  };

  const updateJoistSize = (size: JoistSize) => {
    setState(prev => ({ ...prev, joistSize: size }));
  };

  const updateLumberSelection = (section: 'ledger' | 'framing' | 'joist' | 'beam' | 'post', id: string) => {
    setState(prev => ({
      ...prev,
      lumberSelections: { ...prev.lumberSelections, [section]: id }
    }));
  };

  const setMaterialTier = (tier: EstimateState['materialTier']) => {
    setState(prev => ({ ...prev, materialTier: tier }));
  };

  const updateAddon = (id: string, updates: Partial<EstimateState['addons'][0]>) => {
    setState(prev => ({
      ...prev,
      addons: prev.addons.map(addon =>
        addon.id === id ? { ...addon, ...updates } : addon
      )
    }));
  };

  const setMarkup = (markup: EstimateState['selectedMarkup']) => {
    setState(prev => ({ ...prev, selectedMarkup: markup }));
  };

  const clearForm = () => {
    if (window.confirm("Are you sure you want to clear the entire form? This cannot be undone.")) {
      preserveCurrent();
      setState({
        ...defaultState,
        sourceId: crypto.randomUUID(),
        clientSourceId: crypto.randomUUID(),
        jobDetails: {
          ...defaultState.jobDetails,
          salesperson: state.jobDetails.salesperson
        }
      });
    }
  };

  return {
    state,
    history,
    restoreState,
    updateJobDetails,
    setClientSourceId,
    updateMeasurement,
    addMeasurementSegment,
    removeMeasurementSegment,
    updateStairPosts,
    updateJoistSize,
    updateLumberSelection,
    setMaterialTier,
    updateAddon,
    setMarkup,
    clearForm
  };
}
