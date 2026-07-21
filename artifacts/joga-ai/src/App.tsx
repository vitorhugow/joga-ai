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
import { MatchVoteReminderModal } from "@/components/MatchVoteReminderModal";
import { AppServices } from "@/components/AppServices";
import { checkAndCloseExpiredMatch } from "@/lib/matchAutoClose";
import { Suspense } from "react";
import { JogaLogo } from "@/components/brand/JogaLogo";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { lazyRoute } from "@/lib/lazyRoute";

// Code splitting: cada página vira um chunk próprio, carregado sob demanda.
const Perfil = lazyRoute(() => import("@/pages/Perfil"));
const Comunidades = lazyRoute(() => import("@/pages/Comunidades"));
const ComunidadePage = lazyRoute(() => import("@/pages/ComunidadePage"));
const CriarPartida = lazyRoute(() => import("@/pages/CriarPartida"));
const PreJogo = lazyRoute(() => import("@/pages/PreJogo"));
const AoVivo = lazyRoute(() => import("@/pages/AoVivo"));
const PosJogo = lazyRoute(() => import("@/pages/PosJogo"));
const Jogos = lazyRoute(() => import("@/pages/Jogos"));
const JogaAiCup = lazyRoute(() => import("@/pages/JogaAiCup"));
const Premium = lazyRoute(() => import("@/pages/Premium"));
const Campos = lazyRoute(() => import("@/pages/Campos"));
const Evolucao = lazyRoute(() => import("@/pages/Evolucao"));
const Ranking = lazyRoute(() => import("@/pages/Ranking"));
const Login = lazyRoute(() => import("@/pages/Login"));
const ComunidadeConfiguracoes = lazyRoute(() => import("@/pages/ComunidadeConfiguracoes"));
const ClubeDashboard = lazyRoute(() => import("@/pages/ClubeDashboard"));
const CriarComunidade = lazyRoute(() => import("@/pages/CriarComunidade"));
const Privacidade = lazyRoute(() => import("@/pages/Privacidade"));
const Termos = lazyRoute(() => import("@/pages/Termos"));
const DemoCarta = lazyRoute(() => import("@/pages/DemoCarta"));
const Admin = lazyRoute(() => import("@/pages/Admin"));
const Instalar = lazyRoute(() => import("@/pages/Instalar"));

function PageFallback() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 px-6"
      style={{ background: "#0A0F1A" }}
    >
      <JogaLogo size="xl" />
      <p className="text-white/50 text-sm font-medium tracking-wide">A carregar…</p>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400/60 border-t-transparent" />
    </div>
  );
}

const queryClient = new QueryClient();

const HIDE_NAV_RE = /\/partida\/[^/]+\/(ao-vivo|pos-jogo)|\/entrar|\/demo-carta|\/privacidade|\/termos|\/admin/;

function AnimatedRoutes() {
  const [location] = useLocation();
  const hideNav = HIDE_NAV_RE.test(location);

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div key={location} {...pageTransition}>
          <RouteErrorBoundary>
            <Suspense fallback={<PageFallback />}>
              <Switch location={location}>
            <Route path="/" component={Home} />
            <Route path="/perfil/evolucao" component={Evolucao} />
            <Route path="/perfil/:viewId" component={Perfil} />
            <Route path="/perfil" component={Perfil} />
            <Route path="/jogador/:id" component={Perfil} />
            <Route path="/comunidades/criar" component={CriarComunidade} />
            <Route path="/comunidades/:id/configuracoes" component={ComunidadeConfiguracoes} />
            <Route path="/comunidades/:id/dashboard" component={ClubeDashboard} />
            <Route path="/comunidades" component={Comunidades} />
            <Route path="/comunidades/:id" component={ComunidadePage} />
            <Route path="/criar-partida" component={CriarPartida} />
            <Route path="/partida/:id/pre-jogo" component={PreJogo} />
            <Route path="/partida/:id/ao-vivo" component={AoVivo} />
            <Route path="/partida/:id/pos-jogo" component={PosJogo} />
            <Route path="/entrar" component={Login} />
            <Route path="/privacidade" component={Privacidade} />
            <Route path="/termos" component={Termos} />
            <Route path="/demo-carta" component={DemoCarta} />
            <Route path="/jogos" component={Jogos} />
            <Route path="/cup" component={JogaAiCup} />
            <Route path="/premium" component={Premium} />
            <Route path="/admin" component={Admin} />
            <Route path="/campos" component={Campos} />
            <Route path="/ranking" component={Ranking} />
            <Route path="/instalar" component={Instalar} />
              <Route component={NotFound} />
            </Switch>
            </Suspense>
          </RouteErrorBoundary>
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
            <AppServices />
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
