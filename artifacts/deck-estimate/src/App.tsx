import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import EstimateBuilder from "@/pages/EstimateBuilder";
import { EstimatorNavigation } from "@/components/EstimatorNavigation";
import { ModulePage } from "@/estimators/ModulePage";
import { calculateFlooring, FlooringEditor, newFlooringState } from "@/estimators/Flooring";
import { calculateBathroom, BathroomEditor, newBathroomState } from "@/estimators/Bathroom";
import { calculateBasement, BasementEditor, newBasementState } from "@/estimators/Basement";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/">{() => <><EstimatorNavigation active="deck" /><EstimateBuilder /></>}</Route>
      <Route path="/flooring">{() => <ModulePage key="flooring" slug="flooring" title="Flooring & doors"
        description="Measure rooms and door openings, price known scope, and review incomplete rates before issuing a quote."
        createScope={newFlooringState} calculate={calculateFlooring} Editor={FlooringEditor} />}</Route>
      <Route path="/bathroom">{() => <ModulePage key="bathroom" slug="bathroom" title="Bathroom"
        description="Measure bathroom demolition, walls, fixtures, and allowances with a separate material takeoff."
        createScope={newBathroomState} calculate={calculateBathroom} Editor={BathroomEditor} />}</Route>
      <Route path="/basement">{() => <ModulePage key="basement" slug="basement" title="Basement remodeling"
        description="Combine basement walls, soffits and electrical with shared flooring, doors, and bathroom scope under one job."
        createScope={newBasementState} calculate={calculateBasement} Editor={BasementEditor} />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
