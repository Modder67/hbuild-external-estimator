import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, FileText, Trash2, Home, Box, Grid3X3, Hammer, 
  Ruler, ChevronDown, Check, Download, AlertCircle
} from 'lucide-react';
import { useEstimateForm } from '@/hooks/useEstimateForm';
import { calculatePricing, formatCurrency, MeasurementType } from '@/lib/pricing';
import { generateEstimatePDF } from '@/lib/pdfExport';
import { useToast } from '@/hooks/use-toast';

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
    updateJobDetails, 
    updateMeasurement, 
    addMeasurementSegment, 
    removeMeasurementSegment,
    setMaterialTier, 
    updateAddon, 
    setMarkup, 
    clearForm 
  } = useEstimateForm();
  
  const { toast } = useToast();

  const pricing = useMemo(() => calculatePricing(state), [state]);

  const handleGeneratePDF = () => {
    if (!state.jobDetails.customerName) {
      toast({
        title: "Missing Information",
        description: "Please enter a customer name before generating the PDF.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      generateEstimatePDF(state, pricing);
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
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-primary">
              Deck Remodel Pros
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground uppercase tracking-widest font-semibold mt-1">
              Instant Estimate Builder
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={clearForm} className="text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="w-4 h-4 mr-2" />
            Clear
          </Button>
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
              <Label>Customer Name</Label>
              <Input 
                value={state.jobDetails.customerName}
                onChange={(e) => updateJobDetails('customerName', e.target.value)}
                placeholder="John & Jane Doe"
                className="bg-background/50 border-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>Customer Address</Label>
              <Input 
                value={state.jobDetails.customerAddress}
                onChange={(e) => updateJobDetails('customerAddress', e.target.value)}
                placeholder="123 Main St, Littleton CO"
                className="bg-background/50 border-muted"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Job Title</Label>
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
            </div>

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
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="hidden sm:block">
            <p className="text-sm text-muted-foreground">Selected Total:</p>
            <p className="text-xl font-display font-bold text-primary">
              {formatCurrency(pricing.totals[state.selectedMarkup])}
            </p>
          </div>
          <Button 
            size="lg" 
            onClick={handleGeneratePDF}
            className="w-full sm:w-auto bg-primary text-black hover:bg-primary/90 font-bold text-lg px-8 h-14 rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all hover:-translate-y-1"
          >
            <Download className="w-5 h-5 mr-2" />
            Generate PDF
          </Button>
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
