import { useState, useEffect } from 'react';
import { EstimateState, DEFAULT_ADDONS, MeasurementType } from '@/lib/pricing';
import { format } from 'date-fns';

const STORAGE_KEY = 'deck_remodel_pros_estimate_state';

const defaultState: EstimateState = {
  jobDetails: {
    salesperson: '',
    customerName: '',
    customerAddress: '',
    jobTitle: 'Full Deck Remodel',
    date: format(new Date(), 'yyyy-MM-dd'),
  },
  measurements: {
    ledger: [0],
    framing: [0],
    deckArea: [0],
    rail8: [0],
    rail10: [0],
    stair6: [0],
    stair8: [0],
    stair10: [0],
  },
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
        // Merge with default state to ensure all fields exist (e.g. if new addons were added)
        return {
          ...defaultState,
          ...parsed,
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const updateJobDetails = (field: keyof EstimateState['jobDetails'], value: string) => {
    setState(prev => ({
      ...prev,
      jobDetails: { ...prev.jobDetails, [field]: value }
    }));
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
      // Ensure at least one segment remains
      if (newArr.length === 0) newArr.push(0);
      return {
        ...prev,
        measurements: { ...prev.measurements, [type]: newArr }
      };
    });
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
      setState({
        ...defaultState,
        // Preserve salesperson name
        jobDetails: {
          ...defaultState.jobDetails,
          salesperson: state.jobDetails.salesperson
        }
      });
    }
  };

  return {
    state,
    updateJobDetails,
    updateMeasurement,
    addMeasurementSegment,
    removeMeasurementSegment,
    setMaterialTier,
    updateAddon,
    setMarkup,
    clearForm
  };
}
