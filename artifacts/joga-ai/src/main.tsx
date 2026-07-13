import { createRoot } from "react-dom/client";
import App from "./App";
import { captureReferralFromUrl } from "./lib/referral";
import "./index.css";

// Boot OK — limpa flags de recuperação pós-deploy
sessionStorage.removeItem("joga-deploy-reload");
sessionStorage.removeItem("joga-ai-chunk-reload");

// Captura ?ref=<uid> (convite de amigo) antes de qualquer navegação limpar a URL
captureReferralFromUrl();

createRoot(document.getElementById("root")!).render(<App />);
