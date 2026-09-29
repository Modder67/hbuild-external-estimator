import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, FileText, Trash2, Home, Box, Grid3X3, Hammer, 
  Ruler, ChevronDown, Check, Download, AlertCircle
} from 'lucide-react';
import { useEstimateForm } from '@/hooks/useEstimateForm';
import { calculatePricing, formatCurrency, MeasurementType, RAILING_RATE, JOIST_SIZES, JoistSize, sumArray } from '@/lib/pricing';
import { LUMBER_OPTIONS, LUMBER_GROUPS, LUMBER_BY_ID, BEAM_LUMBER_GROUPS, POST_LUMBER_GROUPS, calcJoistCount, type LumberCalcResult } from '@/lib/lumber';
import { generateEstimatePDF } from '@/lib/pdfExport';
import { generateLumberTakeoffPDF } from '@/lib/pdfLumberTakeoff';
import { generateExcelExport } from '@/lib/excelExport';
import { useToast } from '@/hooks/use-toast';
import { LedgerIntakePanel } from '@/components/LedgerIntakePanel';
import { SharedDraftPanel } from '@/estimators/SharedDraftPanel';
import { deckProjectFromState, deckStateFromProject } from '@/estimators/deckProject';
import { calculateForSlug, uniqueLines } from '@workspace/estimator-core';
import type { Calculation } from '@workspace/estimator-core';

// --- UI Components ---
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function EstimateBuilder() {
  const { 
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
  } = useEstimateForm();
  
  const { toast } = useToast();

  const pricing = useMemo(() => calculatePricing(state), [state]);
  const deckProject = useMemo(() => deckProjectFromState(state), [state]);
  const sharedCalculation = useMemo(
    () => uniqueLines(calculateForSlug('deck', state)) as Calculation,
    [state],
  );
  const localProjectHistory = useMemo(
    () => history.map(deckProjectFromState),
    [history],
  );
  const takeoffAvailable = Object.values(pricing.lumber).some(value =>
    value && typeof value === 'object' && 'qty' in value && value.qty > 0);
  const missingTakeoffSelections = [
    pricing.totalLedgerLf > 0 && !state.lumberSelections.ledger ? 'ledger lumber' : '',
    pricing.totalLf > 0 && !state.lumberSelections.framing ? 'framing lumber' : '',
    pricing.totalLf > 0 && !state.lumberSelections.joist ? 'joist lumber' : '',
    state.measurements.beam.some(value => value > 0) && !state.lumberSelections.beam ? 'beam lumber' : '',
    state.measurements.postCount.some(value => value > 0) && !state.lumberSelections.post ? 'post lumber' : '',
  ].filter(Boolean);
  const issuanceBlockReason = state.projectId
    ? `This Deck form is linked to existing HBUILD project ${state.projectName || state.projectId}. Do not issue or queue it as a new job. Use Clear only after confirming this job is preserved; its browser history and legacy saved PDFs remain available.`
    : missingTakeoffSelections.length > 0 || !takeoffAvailable
      ? `A complete Deck takeoff is not ready${missingTakeoffSelections.length ? `: select ${missingTakeoffSelections.join(', ')}.` : ': select at least one lumber option for measured work.'} Save the updated server draft before issuing.`
      : undefined;

  const handleGeneratePDF = async () => {
    if (!state.jobDetails.customerName) {
      toast({
        title: "Missing Information",
        description: "Please enter a customer name before generating the PDF.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      await generateEstimatePDF(state, pricing);
      toast({
        title: "Success",
        description: "Professional estimate PDF generated successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-32">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/60 shadow-lg shadow-black/30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/hbuild-logo.png"
              alt="HBUILD Logo"
              className="w-10 h-10 object-contain"
            />
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-bold text-primary tracking-tight leading-none">
                HBUILD
              </h1>
              <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-[0.2em] font-medium mt-0.5">
                Instant Estimate Builder
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-sm text-muted-foreground font-medium">303-356-1262</span>
            <Button variant="outline" size="sm" onClick={clearForm} className="text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 className="w-4 h-4 mr-2" />
              Clear
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        
        {/* Job Details Card */}
        <Card className="border-l-4 border-l-primary overflow-hidden bg-card/50">
          <CardHeader className="bg-muted/30 pb-4">
            <CardTitle className="flex items-center gap-2 text-xl">
              <FileText className="text-primary w-5 h-5" />
              Job Details
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
            <div className="md:col-span-2 rounded-lg border border-primary/40 bg-primary/10 p-4 space-y-2">
              <p className="font-semibold">Need to issue a Deck quote?</p>
              <p className="text-sm text-muted-foreground">
                Complete the details and measurements, then sign in and save a server draft in Shared drafts & fixed quotes.
                The “Issue before-tax quote revision” button appears there after a server draft is loaded.
              </p>
              <a href="#deck-shared-title" className="inline-block text-sm font-semibold text-primary underline underline-offset-4">
                Go to shared drafts & fixed quotes
              </a>
            </div>
            <LedgerIntakePanel state={state} pricing={pricing} onClientSourceIdChange={setClientSourceId} />
            <div className="space-y-2">
              <Label>Salesperson</Label>
              <Input 
                value={state.jobDetails.salesperson}
                onChange={(e) => updateJobDetails('salesperson', e.target.value)}
                placeholder="Your Name"
                className="bg-background/50 border-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input 
                type="date"
                value={state.jobDetails.date}
                onChange={(e) => updateJobDetails('date', e.target.value)}
                className="bg-background/50 border-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>Client First Name</Label>
              <Input 
                value={state.jobDetails.firstName}
                onChange={(e) => updateJobDetails('firstName', e.target.value)}
                placeholder="John"
                className="bg-background/50 border-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>Client Last Name</Label>
              <Input 
                value={state.jobDetails.lastName}
                onChange={(e) => updateJobDetails('lastName', e.target.value)}
                placeholder="Doe"
                className="bg-background/50 border-muted"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Job Code (optional)</Label>
              <Input value={state.jobDetails.jobCode} onChange={e => updateJobDetails('jobCode', e.target.value)}
                placeholder="DRP-001" maxLength={20} className="bg-background/50 border-muted" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Client Address Line 1 (optional)</Label>
              <Input value={state.jobDetails.addressLine1} onChange={e => updateJobDetails('addressLine1', e.target.value)}
                placeholder="123 Main St" className="bg-background/50 border-muted" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Client Address Line 2 (optional)</Label>
              <Input value={state.jobDetails.addressLine2} onChange={e => updateJobDetails('addressLine2', e.target.value)}
                placeholder="Unit 2" className="bg-background/50 border-muted" />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={state.jobDetails.city} onChange={e => updateJobDetails('city', e.target.value)}
                placeholder="Littleton" className="bg-background/50 border-muted" />
            </div>
            <div className="space-y-2">
              <Label>State</Label>
              <Input value={state.jobDetails.region} onChange={e => updateJobDetails('region', e.target.value)}
                placeholder="CO" className="bg-background/50 border-muted" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Postal Code</Label>
              <Input value={state.jobDetails.postalCode} onChange={e => updateJobDetails('postalCode', e.target.value)}
                placeholder="80120" className="bg-background/50 border-muted" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Project Name</Label>
              <Input 
                value={state.jobDetails.jobTitle}
                onChange={(e) => updateJobDetails('jobTitle', e.target.value)}
                placeholder="e.g., Full Deck Remodel with Custom Railing"
                className="bg-background/50 border-muted"
              />
            </div>
          </CardContent>
        </Card>

        {/* Measurements Card */}
        <Card className="border-l-4 border-l-primary overflow-hidden shadow-lg shadow-black/20">
          <CardHeader className="bg-muted/30 pb-4">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Ruler className="text-primary w-5 h-5" />
              Measurements
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-10">
            
            {/* Primary Measurements */}
            <div className="space-y-8">
              <MeasurementGroup 
                title="Ledger Board" 
                icon={<Home className="w-4 h-4" />}
                type="ledger" 
                state={state} 
                unit="Linear Ft"
                updateMeasurement={updateMeasurement} 
                addMeasurementSegment={addMeasurementSegment}
                removeMeasurementSegment={removeMeasurementSegment}
              />

              {/* Ledger Board lumber selector */}
              <LumberSelector
                label="Ledger Board"
                section="ledger"
                selectedId={state.lumberSelections?.ledger ?? ''}
                lumberCalc={pricing.lumber.ledger}
                onSelect={updateLumberSelection}
              />
              
              <MeasurementGroup 
                title="Framing / Perimeter" 
                icon={<Box className="w-4 h-4" />}
                type="framing" 
                state={state} 
                unit="Linear Ft"
                updateMeasurement={updateMeasurement} 
                addMeasurementSegment={addMeasurementSegment}
                removeMeasurementSegment={removeMeasurementSegment}
              />

              {/* Framing lumber selector */}
              <LumberSelector
                label="New Ledger"
                section="framing"
                selectedId={state.lumberSelections?.framing ?? ''}
                lumberCalc={pricing.lumber.framing}
                onSelect={updateLumberSelection}
              />

              <MeasurementGroup 
                title="Square Edge / Picture Frame" 
                icon={<Ruler className="w-4 h-4" />}
                type="pictureFrame" 
                state={state} 
                unit="Linear Ft"
                updateMeasurement={updateMeasurement} 
                addMeasurementSegment={addMeasurementSegment}
                removeMeasurementSegment={removeMeasurementSegment}
              />

              <MeasurementGroup 
                title="Deck Surface Area" 
                icon={<Grid3X3 className="w-4 h-4" />}
                type="deckArea" 
                state={state} 
                unit="Sq Ft"
                updateMeasurement={updateMeasurement} 
                addMeasurementSegment={addMeasurementSegment}
                removeMeasurementSegment={removeMeasurementSegment}
              />

              {/* Deck board auto-count */}
              {pricing.totalDeckSqFt > 0 && (
                <div className="flex items-center gap-3 px-1">
                  <Grid3X3 className="w-4 h-4 text-primary shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{pricing.totalDeckSqFt} sq ft</span>
                    {' → '}
                    <span className="font-bold text-primary text-base">{pricing.totalDeckBoards} deck boards</span>
                    <span className="text-xs ml-1">(@ ×0.1410)</span>
                  </p>
                </div>
              )}

              {/* Floor Joists — auto-calculated */}
              <div className="bg-card/50 rounded-xl border border-border/50 p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Ruler className="w-4 h-4 text-primary" />
                  <h4 className="font-semibold text-foreground">Floor Joists</h4>
                </div>
                {pricing.totalLf > 0 ? (
                  <div className="flex items-center gap-3 bg-background/40 rounded-lg px-4 py-3">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Auto-Calculated Joist Count</p>
                      <p className="text-2xl font-bold font-mono text-primary">
                        {calcJoistCount(pricing.totalLedgerLf, pricing.totalLf)}
                        <span className="text-sm font-normal text-muted-foreground ml-2">joists</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {pricing.totalLf} LF (framing) ÷ 16" OC × 1.20 overage
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Enter Framing/Perimeter measurements to auto-calculate.</p>
                )}
              </div>

              {/* Floor Joist lumber selector */}
              <LumberSelector
                label="Floor Joists"
                section="joist"
                selectedId={state.lumberSelections?.joist ?? ''}
                lumberCalc={pricing.lumber.joist}
                onSelect={updateLumberSelection}
              />

              {/* Optional Existing Joist Size */}
              <div className="bg-card/50 rounded-xl border border-border/50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Hammer className="w-4 h-4 text-primary" />
                  <h4 className="font-semibold text-sm text-foreground">Existing Deck Joist Size</h4>
                  <span className="ml-1 text-xs text-muted-foreground italic">(optional)</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {JOIST_SIZES.map(size => (
                    <button
                      key={size}
                      onClick={() => updateJoistSize(state.joistSize === size ? '' : size as JoistSize)}
                      className={`px-4 py-2 rounded-lg border text-sm font-mono font-semibold transition-all duration-150 ${
                        state.joistSize === size
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background/50 border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                  {state.joistSize && (
                    <button
                      onClick={() => updateJoistSize('')}
                      className="px-3 py-2 rounded-lg border border-border/50 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-all"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {state.joistSize && (
                  <p className="mt-2 text-xs text-primary font-medium">
                    Selected: {state.joistSize} joists
                  </p>
                )}
              </div>

              <MeasurementGroup 
                title="Beam Replacement / Installation" 
                icon={<Box className="w-4 h-4" />}
                type="beam" 
                state={state} 
                unit="Linear Ft"
                updateMeasurement={updateMeasurement} 
                addMeasurementSegment={addMeasurementSegment}
                removeMeasurementSegment={removeMeasurementSegment}
              />

              {/* Beam lumber selector */}
              <LumberSelector
                label="Beam Lumber"
                section="beam"
                selectedId={state.lumberSelections?.beam ?? ''}
                lumberCalc={pricing.lumber.beam}
                qtyLabel={pricing.lumber.beam ? `${pricing.lumber.beam.qty} ${pricing.lumber.beam.option.unit === 'LFT' ? 'LFT' : 'pcs'} (+20% overage)` : undefined}
                groups={BEAM_LUMBER_GROUPS}
                onSelect={updateLumberSelection}
              />

              <MeasurementGroup 
                title="Post Count" 
                icon={<Ruler className="w-4 h-4" />}
                type="postCount" 
                state={state} 
                unit="Each"
                updateMeasurement={updateMeasurement} 
                addMeasurementSegment={addMeasurementSegment}
                removeMeasurementSegment={removeMeasurementSegment}
              />

              {/* Post lumber selector */}
              <LumberSelector
                label="Post Lumber"
                section="post"
                selectedId={state.lumberSelections?.post ?? ''}
                lumberCalc={pricing.lumber.post}
                qtyLabel={pricing.lumber.post ? `${pricing.lumber.post.qty} posts (qty as entered)` : undefined}
                groups={POST_LUMBER_GROUPS}
                onSelect={updateLumberSelection}
              />

              <MeasurementGroup 
                title="Caissons" 
                icon={<Hammer className="w-4 h-4" />}
                type="caissons" 
                state={state} 
                unit="QTY"
                updateMeasurement={updateMeasurement} 
                addMeasurementSegment={addMeasurementSegment}
                removeMeasurementSegment={removeMeasurementSegment}
              />
            </div>

            <div className="h-px w-full bg-border"></div>

            {/* Railing Sections */}
            <div>
              <h3 className="text-lg font-semibold mb-4 text-primary flex items-center gap-2">
                <Hammer className="w-5 h-5" /> Railing Sections
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Flat Sections</h4>
                  <MeasurementGroup title="8ft Flat Sections" type="rail8" unit="Sections" state={state} updateMeasurement={updateMeasurement} addMeasurementSegment={addMeasurementSegment} removeMeasurementSegment={removeMeasurementSegment} />
                  <MeasurementGroup title="10ft Flat Sections" type="rail10" unit="Sections" state={state} updateMeasurement={updateMeasurement} addMeasurementSegment={addMeasurementSegment} removeMeasurementSegment={removeMeasurementSegment} />
                </div>
                <div className="space-y-6">
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Stair Diagonals</h4>
                  <MeasurementGroup title="6ft Stair Diagonals" type="stair6" unit="Sections" state={state} updateMeasurement={updateMeasurement} addMeasurementSegment={addMeasurementSegment} removeMeasurementSegment={removeMeasurementSegment} />
                  <MeasurementGroup title="8ft Stair Diagonals" type="stair8" unit="Sections" state={state} updateMeasurement={updateMeasurement} addMeasurementSegment={addMeasurementSegment} removeMeasurementSegment={removeMeasurementSegment} />
                  <MeasurementGroup title="10ft Stair Diagonals" type="stair10" unit="Sections" state={state} updateMeasurement={updateMeasurement} addMeasurementSegment={addMeasurementSegment} removeMeasurementSegment={removeMeasurementSegment} />
                </div>
              </div>

              {/* Stair Posts */}
              <div className="bg-background border rounded-xl p-4 md:p-5 relative group overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
                <h3 className="font-bold text-foreground text-lg mb-4 flex items-center gap-2">
                  <Hammer className="w-4 h-4 text-muted-foreground" />
                  Stair Posts
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {(['left', 'middle', 'right', 'center'] as const).map((pos) => (
                    <div key={pos} className="space-y-2">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                        {pos.charAt(0).toUpperCase() + pos.slice(1)} QTY
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        value={state.stairPosts[pos] || ''}
                        onChange={(e) => updateStairPosts(pos, e.target.value)}
                        placeholder="0"
                        className="bg-background/50 border-muted text-center font-mono text-lg h-12"
                      />
                    </div>
                  ))}
                </div>
                {(state.stairPosts.left + state.stairPosts.middle + state.stairPosts.right + state.stairPosts.center) > 0 && (
                  <div className="mt-3 flex justify-end">
                    <div className="bg-muted px-3 py-1 rounded-md border border-border">
                      <span className="text-sm text-muted-foreground mr-2">Total Posts:</span>
                      <span className="font-mono font-bold text-primary">
                        {state.stairPosts.left + state.stairPosts.middle + state.stairPosts.right + state.stairPosts.center}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Railing Total Summary */}
              {pricing.totalRailingLf > 0 && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-10 bg-primary rounded-full" />
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Railing</p>
                      <p className="text-lg font-bold text-foreground font-mono">
                        {pricing.totalRailingLf} LF
                        <span className="text-sm font-normal text-muted-foreground ml-2">× ${RAILING_RATE}/LF</span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Railing Subtotal</p>
                    <p className="text-2xl font-display font-bold text-primary">{formatCurrency(pricing.totalRailingLf * RAILING_RATE)}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Contractor-Only Lumber Cost Summary */}
            {(pricing.lumber.ledger || pricing.lumber.framing || pricing.lumber.joist || pricing.lumber.beam || pricing.lumber.post) && (
              <div className="rounded-xl border-2 border-amber-700/50 bg-amber-950/30 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <h4 className="font-bold text-amber-400 uppercase tracking-wider text-sm">Contractor Use Only — Lumber Cost</h4>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-amber-700/30 text-amber-500/70 uppercase text-xs tracking-wider">
                      <th className="text-left pb-2">Section</th>
                      <th className="text-left pb-2">Lumber</th>
                      <th className="text-center pb-2">QTY</th>
                      <th className="text-right pb-2">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-700/20">
                    {pricing.lumber.ledger && pricing.lumber.ledger.qty > 0 && (
                      <tr>
                        <td className="py-2 text-muted-foreground">Ledger Board</td>
                        <td className="py-2 font-mono text-foreground">{pricing.lumber.ledger.option.label}</td>
                        <td className="py-2 text-center font-bold text-amber-400">{pricing.lumber.ledger.qty} pcs</td>
                        <td className="py-2 text-right font-mono text-foreground">{formatCurrency(pricing.lumber.ledger.cost)}</td>
                      </tr>
                    )}
                    {pricing.lumber.framing && pricing.lumber.framing.qty > 0 && (
                      <tr>
                        <td className="py-2 text-muted-foreground">New Ledger (Framing)</td>
                        <td className="py-2 font-mono text-foreground">{pricing.lumber.framing.option.label}</td>
                        <td className="py-2 text-center font-bold text-amber-400">{pricing.lumber.framing.qty} pcs</td>
                        <td className="py-2 text-right font-mono text-foreground">{formatCurrency(pricing.lumber.framing.cost)}</td>
                      </tr>
                    )}
                    {pricing.lumber.joist && pricing.lumber.joist.qty > 0 && (
                      <tr>
                        <td className="py-2 text-muted-foreground">Floor Joists</td>
                        <td className="py-2 font-mono text-foreground">{pricing.lumber.joist.option.label}</td>
                        <td className="py-2 text-center font-bold text-amber-400">{pricing.lumber.joist.qty} pcs</td>
                        <td className="py-2 text-right font-mono text-foreground">{formatCurrency(pricing.lumber.joist.cost)}</td>
                      </tr>
                    )}
                    {pricing.lumber.beam && pricing.lumber.beam.qty > 0 && (
                      <tr>
                        <td className="py-2 text-muted-foreground">Beam Replacement</td>
                        <td className="py-2 font-mono text-foreground">{pricing.lumber.beam.option.label}</td>
                        <td className="py-2 text-center font-bold text-amber-400">
                          {pricing.lumber.beam.qty} {pricing.lumber.beam.option.unit === 'LFT' ? 'LFT' : 'pcs'}
                        </td>
                        <td className="py-2 text-right font-mono text-foreground">{formatCurrency(pricing.lumber.beam.cost)}</td>
                      </tr>
                    )}
                    {pricing.lumber.post && pricing.lumber.post.qty > 0 && (
                      <tr>
                        <td className="py-2 text-muted-foreground">Posts</td>
                        <td className="py-2 font-mono text-foreground">{pricing.lumber.post.option.label}</td>
                        <td className="py-2 text-center font-bold text-amber-400">{pricing.lumber.post.qty} EA</td>
                        <td className="py-2 text-right font-mono text-foreground">{formatCurrency(pricing.lumber.post.cost)}</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-amber-700/40">
                      <td colSpan={3} className="pt-3 text-amber-400 font-semibold uppercase text-xs tracking-wider">Total Lumber Cost</td>
                      <td className="pt-3 text-right font-bold text-amber-300 text-base font-mono">{formatCurrency(pricing.lumber.totalCost)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

          </CardContent>
        </Card>

        {/* Decking Material Tier */}
        <Card className="border-l-4 border-l-primary overflow-hidden shadow-lg shadow-black/20">
          <CardHeader className="bg-muted/30 pb-4">
            <CardTitle className="text-xl">Decking Material Tier</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { id: 'basic', title: '$ Basic Composite', desc: 'Entry Level', mult: 1.0 },
                { id: 'premium', title: '$$ Premium Composite', desc: 'Most Popular', mult: 1.35 },
                { id: 'luxury', title: '$$$ Luxury / Exotic', desc: 'Premium Finish', mult: 1.75 },
              ].map((tier) => {
                const isSelected = state.materialTier === tier.id;
                return (
                  <button
                    key={tier.id}
                    onClick={() => setMaterialTier(tier.id as any)}
                    className={`
                      relative p-4 rounded-xl text-left border-2 transition-all duration-200
                      hover:shadow-md
                      ${isSelected 
                        ? 'border-primary bg-primary/10 shadow-lg shadow-primary/5' 
                        : 'border-border bg-background hover:border-primary/50'
                      }
                    `}
                  >
                    {isSelected && (
                      <div className="absolute top-3 right-3 bg-primary text-primary-foreground rounded-full p-0.5">
                        <Check className="w-4 h-4" />
                      </div>
                    )}
                    <h3 className={`font-bold text-lg ${isSelected ? 'text-primary' : 'text-foreground'}`}>{tier.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{tier.desc}</p>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Optional Add-ons */}
        <Card className="border-l-4 border-l-primary overflow-hidden shadow-lg shadow-black/20">
          <CardHeader className="bg-muted/30 pb-4">
            <CardTitle className="text-xl flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" /> Optional Add-ons
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 gap-4">
              {state.addons.map((addon) => (
                <div 
                  key={addon.id} 
                  className={`
                    p-4 rounded-xl border transition-colors
                    ${addon.enabled ? 'border-primary/50 bg-primary/5' : 'border-border bg-background'}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Checkbox 
                        id={`addon-${addon.id}`}
                        checked={addon.enabled}
                        onCheckedChange={(c) => updateAddon(addon.id, { enabled: !!c })}
                        className="w-5 h-5"
                      />
                      <Label 
                        htmlFor={`addon-${addon.id}`}
                        className="text-base cursor-pointer font-medium"
                      >
                        {addon.name}
                      </Label>
                    </div>
                  </div>

                  <AnimatePresence>
                    {addon.enabled && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex flex-wrap gap-4 mt-4 pl-8">
                          {(!addon.isFlat && !addon.isPerSqFt) && (
                            <div className="space-y-1.5 w-full sm:w-auto">
                              <Label className="text-xs text-muted-foreground uppercase">Quantity / LF</Label>
                              <Input 
                                type="number" 
                                min="1"
                                value={addon.qty || ''}
                                onChange={(e) => updateAddon(addon.id, { qty: parseInt(e.target.value) || 0 })}
                                className="w-full sm:w-24 bg-background"
                              />
                            </div>
                          )}
                          <div className="space-y-1.5 w-full sm:w-auto">
                            <Label className="text-xs text-muted-foreground uppercase">Price Override ($)</Label>
                            <Input 
                              type="number" 
                              min="0"
                              step="0.01"
                              value={addon.priceOverride || ''}
                              onChange={(e) => updateAddon(addon.id, { priceOverride: parseFloat(e.target.value) || 0 })}
                              className="w-full sm:w-32 bg-background font-mono"
                            />
                          </div>
                          <div className="flex items-end pb-2">
                             <span className="text-sm text-muted-foreground italic">
                               {addon.isFlat ? '(Flat Fee)' : addon.isPerSqFt ? '(Auto-calculated from Deck Sq Ft)' : `(${addon.basePrice} base)`}
                             </span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-200">Legacy browser estimate vs issued quote</p>
          <p className="text-sm text-amber-100/90">
            The Deck builder’s selected total and existing browser PDF exports are legacy, tax-inclusive local estimates.
            A shared server revision is a separate, server-recomputed BEFORE-TAX amount for the selected tier; it is not
            interchangeable with the legacy total and cannot be issued until this exact project and calculation match a saved server revision.
          </p>
          {(!takeoffAvailable || missingTakeoffSelections.length > 0) && (
            <p className="text-sm font-medium text-amber-200" role="alert">
              Takeoff selections are missing{missingTakeoffSelections.length ? `: ${missingTakeoffSelections.join(', ')}` : ''}. A complete issued delivery is not ready; choose lumber for measured work before issuing.
            </p>
          )}
          {state.projectId && (
            <p className="text-sm font-medium text-amber-200" role="alert">
              Existing HBUILD project link detected. This job cannot be issued or queued as a new Deck project. Preserve its local history and PDFs; use Clear only when intentionally starting a separate job.
            </p>
          )}
        </div>

        <SharedDraftPanel
          slug="deck"
          project={deckProject}
          calculation={sharedCalculation}
          localDrafts={[deckProject, ...localProjectHistory]}
          onLoadProject={project => restoreState(deckStateFromProject(project))}
          onLoadLocalProject={project => restoreState(deckStateFromProject(project))}
          issuanceBlockReason={issuanceBlockReason}
        />

        {/* Live Pricing Breakdown */}
        <Card className="border-l-4 border-l-secondary overflow-hidden shadow-xl shadow-black/30">
          <CardHeader className="bg-secondary/10 pb-4 border-b border-border">
            <CardTitle className="text-xl flex items-center gap-2 text-secondary-foreground">
              💰 Estimate Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 p-0 sm:p-6">
            {pricing.lineItems.length === 0 ? (
              <div className="text-center py-12 px-4 text-muted-foreground">
                <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>Enter measurements above to see the pricing breakdown.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table className="min-w-[500px]">
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="w-[45%] text-foreground">Item</TableHead>
                        <TableHead className="text-right text-foreground">Qty</TableHead>
                        <TableHead className="text-right text-foreground">Unit Price</TableHead>
                        <TableHead className="text-right text-foreground font-bold">Line Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pricing.lineItems.map((item, i) => (
                        <TableRow key={i} className={item.type === 'addon' ? 'bg-primary/5' : ''}>
                          <TableCell className="font-medium text-muted-foreground">
                            {item.name}
                            {item.type === 'addon' && <span className="ml-2 text-xs text-primary px-1.5 py-0.5 rounded bg-primary/10">Add-on</span>}
                          </TableCell>
                          <TableCell className="text-right font-mono">{item.qty}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(item.unitPrice)}</TableCell>
                          <TableCell className="text-right font-bold font-mono text-foreground">{formatCurrency(item.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Lumber Materials Summary */}
              {(pricing.lumberCounts.ledger2x10x20 > 0 || pricing.lumberCounts.framing2x12x16 > 0 || pricing.lumberCounts.deck075x55x20 > 0) && (
                <div className="mt-6 mx-4 sm:mx-0 rounded-xl border border-amber-700/30 bg-amber-950/20 p-4">
                  <h4 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    🪵 Materials Required
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[380px]">
                      <thead>
                        <tr className="text-xs text-muted-foreground uppercase border-b border-border">
                          <th className="text-left py-1.5 font-semibold">Component</th>
                          <th className="text-center py-1.5 font-semibold">Lumber Size</th>
                          <th className="text-right py-1.5 font-semibold">Measurement</th>
                          <th className="text-center py-1.5 font-semibold text-amber-400">Qty to Order</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pricing.lumberCounts.ledger2x10x20 > 0 && (
                          <tr className="border-b border-border/50">
                            <td className="py-2 text-muted-foreground">Ledger Board</td>
                            <td className="py-2 text-center font-mono font-bold text-foreground">2×10×20</td>
                            <td className="py-2 text-right font-mono text-muted-foreground">{pricing.totalLedgerLf} LF</td>
                            <td className="py-2 text-center font-bold text-amber-400 text-base">{pricing.lumberCounts.ledger2x10x20} pcs</td>
                          </tr>
                        )}
                        {pricing.lumberCounts.framing2x12x16 > 0 && (
                          <tr className="border-b border-border/50">
                            <td className="py-2 text-muted-foreground">Framing / Perimeter</td>
                            <td className="py-2 text-center font-mono font-bold text-foreground">2×12×16</td>
                            <td className="py-2 text-right font-mono text-muted-foreground">{pricing.totalLf} LF</td>
                            <td className="py-2 text-center font-bold text-amber-400 text-base">{pricing.lumberCounts.framing2x12x16} pcs</td>
                          </tr>
                        )}
                        {pricing.lumberCounts.deck075x55x20 > 0 && (
                          <tr>
                            <td className="py-2 text-muted-foreground">Deck Surface</td>
                            <td className="py-2 text-center font-mono font-bold text-foreground">¾×5½×20</td>
                            <td className="py-2 text-right font-mono text-muted-foreground">{pricing.totalDeckSqFt} sq ft</td>
                            <td className="py-2 text-center font-bold text-amber-400 text-base">{pricing.lumberCounts.deck075x55x20} pcs</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="mt-6 space-y-3 px-4 sm:px-0">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal:</span>
                    <span className="font-mono">{formatCurrency(pricing.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax (8.5%):</span>
                    <span className="font-mono">{formatCurrency(pricing.tax)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-foreground border-t border-border pt-3">
                    <span>Base Cost Total:</span>
                    <span className="font-mono text-secondary">{formatCurrency(pricing.subtotal + pricing.tax)}</span>
                  </div>
                </div>

                {/* Markup Tiers */}
                <div className="mt-10 px-4 sm:px-0">
                  <h3 className="text-lg font-bold text-center mb-6 text-muted-foreground">Select Quote Tier</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { id: 'good', label: 'Good', sub: '52% Margin', price: pricing.totals.good },
                      { id: 'better', label: 'Better', sub: '42% Margin', price: pricing.totals.better, recommended: true },
                      { id: 'best', label: 'Best Value', sub: '37% Margin', price: pricing.totals.best },
                    ].map((tier) => {
                      const isSelected = state.selectedMarkup === tier.id;
                      return (
                        <div 
                          key={tier.id}
                          onClick={() => setMarkup(tier.id as any)}
                          className={`
                            relative cursor-pointer rounded-2xl border-2 p-5 text-center transition-all duration-300
                            ${isSelected 
                              ? 'border-primary bg-primary/10 scale-[1.02] shadow-xl shadow-primary/20 z-10' 
                              : 'border-border bg-card hover:border-primary/50 hover:bg-card/80'
                            }
                          `}
                        >
                          {tier.recommended && !isSelected && (
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-secondary text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">
                              Recommended
                            </div>
                          )}
                          {isSelected && (
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-black text-[10px] uppercase font-bold px-3 py-1 rounded-full shadow-md">
                              Selected
                            </div>
                          )}
                          <h4 className={`text-lg font-bold ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}>{tier.label}</h4>
                          <div className={`text-2xl lg:text-3xl font-display font-bold mt-2 ${isSelected ? 'text-foreground' : 'text-foreground/80'}`}>
                            {formatCurrency(tier.price)}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2 font-mono">{tier.sub}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Floating Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/90 backdrop-blur-lg border-t border-border shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="hidden sm:block shrink-0">
            <p className="text-xs text-muted-foreground">Legacy browser total · tax included</p>
            <p className="text-xl font-display font-bold text-primary">
              {formatCurrency(pricing.totals[state.selectedMarkup])}
            </p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              size="lg"
              variant="outline"
              onClick={async () => {
                const hasLumber = Object.values(pricing.lumber).some(v => v && typeof v === 'object' && (v as any).qty > 0);
                if (!hasLumber) {
                  toast({ title: 'No Lumber Selected', description: 'Select at least one lumber option to generate a takeoff.', variant: 'destructive' });
                  return;
                }
                try {
                  await generateLumberTakeoffPDF(state, pricing);
                  toast({ title: 'Lumber Takeoff Generated', description: 'Takeoff PDF ready for ordering.' });
                } catch {
                  toast({ title: 'Error', description: 'Failed to generate takeoff PDF.', variant: 'destructive' });
                }
              }}
              className="flex-1 sm:flex-none border-amber-600/50 text-amber-400 hover:bg-amber-950/40 hover:border-amber-500 font-semibold h-14 px-5 rounded-xl transition-all"
            >
              <Download className="w-4 h-4 mr-2" />
              Lumber Takeoff
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                try {
                  generateExcelExport(state, pricing);
                  toast({ title: 'Excel Exported', description: 'Your estimate spreadsheet is downloading.' });
                } catch {
                  toast({ title: 'Error', description: 'Failed to generate Excel file.', variant: 'destructive' });
                }
              }}
              className="flex-1 sm:flex-none border-green-700/60 text-green-400 hover:bg-green-950/40 hover:border-green-500 font-semibold h-14 px-5 rounded-xl transition-all"
            >
              <Download className="w-4 h-4 mr-2" />
              Export Excel
            </Button>
            <Button 
              size="lg" 
              onClick={handleGeneratePDF}
              className="flex-1 sm:flex-none bg-primary text-black hover:bg-primary/90 font-bold text-lg px-8 h-14 rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all hover:-translate-y-1"
            >
              <Download className="w-5 h-5 mr-2" />
              Generate PDF
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


// --- Helper Component for Measurement Groups ---
function MeasurementGroup({ 
  title, icon, type, unit, state, updateMeasurement, addMeasurementSegment, removeMeasurementSegment 
}: { 
  title: string, 
  icon?: React.ReactNode,
  type: MeasurementType, 
  unit: string,
  state: any, 
  updateMeasurement: any, 
  addMeasurementSegment: any, 
  removeMeasurementSegment: any 
}) {
  const segments = state.measurements[type];
  const total = segments.reduce((sum: number, val: number) => sum + (Number(val) || 0), 0);

  return (
    <div className="bg-background border rounded-xl p-4 md:p-5 relative group overflow-hidden">
      {/* Decorative background accent */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-2">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <h3 className="font-bold text-foreground text-lg">{title}</h3>
        </div>
        <div className="bg-muted px-3 py-1 rounded-md border border-border">
          <span className="text-sm text-muted-foreground mr-2">Total:</span>
          <span className="font-mono font-bold text-primary">{total}</span>
          <span className="text-xs text-muted-foreground ml-1">{unit}</span>
        </div>
      </div>

      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {segments.map((val: number, idx: number) => (
            <motion.div 
              key={`${type}-${idx}`}
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-3"
            >
              <div className="flex-1 relative">
                <Label className="absolute -top-2 left-2 text-[10px] uppercase bg-background px-1 text-muted-foreground">
                  {segments.length > 1 ? `Segment ${idx + 1}` : unit}
                </Label>
                <Input 
                  type="number"
                  min="0"
                  value={val || ''}
                  onChange={(e) => updateMeasurement(type, idx, e.target.value)}
                  className="w-full bg-transparent font-mono text-lg py-6 focus-visible:ring-primary focus-visible:border-primary border-muted"
                  placeholder="0"
                />
              </div>
              {segments.length > 1 && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => removeMeasurementSegment(type, idx)}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => addMeasurementSegment(type)}
          className="mt-2 w-full border-dashed border-muted-foreground/50 text-muted-foreground hover:text-primary hover:border-primary hover:bg-primary/5 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" /> Add Segment
        </Button>
      </div>
    </div>
  );
}

// --- Lumber Selector Component ---
function LumberSelector({
  label,
  section,
  selectedId,
  lumberCalc,
  qtyLabel,
  groups,
  onSelect,
}: {
  label: string;
  section: 'ledger' | 'framing' | 'joist' | 'beam' | 'post';
  selectedId: string;
  lumberCalc: LumberCalcResult | null;
  qtyLabel?: string;
  groups?: { label: string; ids: string[] }[];
  onSelect: (section: 'ledger' | 'framing' | 'joist' | 'beam' | 'post', id: string) => void;
}) {
  const displayGroups = groups ?? LUMBER_GROUPS;
  return (
    <div className="bg-card/40 rounded-xl border border-amber-800/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Download className="w-4 h-4 text-amber-400" />
        <h4 className="font-semibold text-sm text-amber-300">{label} — Lumber Selection</h4>
      </div>

      <select
        value={selectedId}
        onChange={(e) => onSelect(section, e.target.value)}
        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/60"
      >
        <option value="">— Select Lumber —</option>
        {displayGroups.map(group => (
          <optgroup key={group.label} label={group.label}>
            {group.ids.map(id => {
              const opt = LUMBER_BY_ID[id];
              return (
                <option key={id} value={id}>
                  {opt.label} — ${opt.costPerUnit.toFixed(2)}/{opt.unit}
                </option>
              );
            })}
          </optgroup>
        ))}
      </select>

      {lumberCalc && lumberCalc.qty > 0 && (
        <div className="flex items-center justify-between bg-amber-950/40 rounded-lg px-4 py-2.5 border border-amber-800/30">
          <div>
            <p className="text-xs text-amber-500/80 uppercase tracking-wider">Qty Needed</p>
            <p className="text-xl font-bold font-mono text-amber-300">
              {qtyLabel ?? `${lumberCalc.qty} ${lumberCalc.option.unit === 'LFT' ? 'LFT' : 'pcs'}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-amber-500/80 uppercase tracking-wider">Material Cost</p>
            <p className="text-xl font-bold font-mono text-amber-300">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(lumberCalc.cost)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
