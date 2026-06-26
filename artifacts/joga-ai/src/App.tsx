import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BottomNavigation } from "@/components/BottomNavigation";
import { pageTransition } from "@/components/joga/motion";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthGateProvider } from "@/contexts/AuthGateContext";
import { ProfileSetupGate } from "@/components/profile/ProfileSetupGate";
import { checkAndCloseExpiredMatch } from "@/lib/matchAutoClose";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Perfil from "@/pages/Perfil";
import Comunidades from "@/pages/Comunidades";
import ComunidadePage from "@/pages/ComunidadePage";
import CriarPartida from "@/pages/CriarPartida";
import PreJogo from "@/pages/PreJogo";
import AoVivo from "@/pages/AoVivo";
import PosJogo from "@/pages/PosJogo";
import Jogos from "@/pages/Jogos";
import Premium from "@/pages/Premium";
import Campos from "@/pages/Campos";
import Evolucao from "@/pages/Evolucao";
import Ranking from "@/pages/Ranking";
import Login from "@/pages/Login";

const queryClient = new QueryClient();

const HIDE_NAV_RE = /\/partida\/[^/]+\/(ao-vivo|pos-jogo)|\/entrar/;

function AnimatedRoutes() {
  const [location] = useLocation();
  const hideNav = HIDE_NAV_RE.test(location);

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div key={location} {...pageTransition}>
          <Switch location={location}>
            <Route path="/" component={Home} />
            <Route path="/perfil/evolucao" component={Evolucao} />
            <Route path="/perfil" component={Perfil} />
            <Route path="/comunidades" component={Comunidades} />
            <Route path="/comunidades/:id" component={ComunidadePage} />
            <Route path="/criar-partida" component={CriarPartida} />
            <Route path="/partida/:id/pre-jogo" component={PreJogo} />
            <Route path="/partida/:id/ao-vivo" component={AoVivo} />
            <Route path="/partida/:id/pos-jogo" component={PosJogo} />
            <Route path="/entrar" component={Login} />
            <Route path="/jogos" component={Jogos} />
            <Route path="/premium" component={Premium} />
            <Route path="/campos" component={Campos} />
            <Route path="/ranking" component={Ranking} />
            <Route component={NotFound} />
          </Switch>
        </motion.div>
      </AnimatePresence>
      {!hideNav && <BottomNavigation />}
    </>
  );
}

function Router() {
  return <AnimatedRoutes />;
}

// Verifica partidas expiradas no arranque (client-side Opção A)
checkAndCloseExpiredMatch();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AuthGateProvider>
            <ProfileSetupGate />
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </AuthGateProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
