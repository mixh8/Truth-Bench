import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import Dashboard from "@/pages/dashboard";
import Report from "@/pages/report";
import Analyze from "@/pages/analyze";
import Chat from "@/pages/chat";
import TruthBench from "@/pages/truthbench";
import Results from "@/pages/results";
import NotFound from "@/pages/not-found";
import { ThemeProvider } from "@/components/theme-provider";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/report" component={Report} />
      <Route path="/analyze" component={Analyze} />
      <Route path="/chat" component={Chat} />
      <Route path="/truthbench" component={TruthBench} />
      <Route path="/results" component={Results} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <QueryClientProvider client={queryClient}>
        <Toaster />
        <Router />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
