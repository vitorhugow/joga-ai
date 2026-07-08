# JOGA AI — Guia Mobile: Google Play (Android) e App Store (iOS)

> A app já é uma PWA completa (manifest ✓, service worker ✓, offline ✓).
> Android embrulha a PWA num TWA (leve, 1-2 dias até aprovar).
> iOS exige um wrapper Capacitor (mais trabalhoso + risco de review).
> **Ordem recomendada: Android primeiro** — mais barato (23€ únicos),
> review mais rápida, e valida o processo antes de pagar os 92€/ano da Apple.

---

## PARTE A — ANDROID (TWA via Bubblewrap)

O TWA (Trusted Web Activity) mostra o site em Chrome fullscreen — a app
É o site, atualiza com cada deploy do Cloudflare, zero manutenção nativa.

### A1. Pré-requisitos (uma vez)
- Node instalado (já tens) · JDK 17: `brew install openjdk@17`
- Conta Google Play Console: https://play.google.com/console (25 USD únicos)
- `npm i -g @bubblewrap/cli`

### A2. Gerar o projeto
```bash
mkdir joga-ai-android && cd joga-ai-android
bubblewrap init --manifest https://jogaai.pt/manifest.webmanifest
```
Respostas ao wizard:
- Package name: `pt.jogaai.app`  (tem de bater com o assetlinks.json!)
- App name / short name: Joga AI
- Display: standalone · Status bar: `#0a0f1a`
- Signing key: deixa o Bubblewrap CRIAR (guarda a keystore + passwords
  num sítio seguro — perdê-la = nunca mais atualizar a app)

### A3. Build
```bash
bubblewrap build
```
Gera `app-release-bundle.aab` (para a Play Store) e um `.apk` de teste
(`adb install app-release-signed.apk` num Android para experimentar).

### A4. Play Console
1. Create app → App name "Joga AI", idioma pt-PT, Free.
2. Sobe o `.aab` em Production → Create release.
3. Preenche a ficha: descrição, ícone 512, feature graphic 1024×500,
   2+ screenshots de telemóvel (usa as do site!), privacy policy:
   https://jogaai.pt/privacidade
4. Data safety form: declara Firebase Auth/Firestore (conta, email,
   conteúdo do utilizador; sem venda de dados).

### A5. Digital Asset Links (remove a barra de URL do Chrome)
1. Play Console → Setup → App signing → copia o **SHA-256** do
   "App signing key certificate".
2. Cola em `artifacts/joga-ai/public/.well-known/assetlinks.json` (substitui o placeholder),
   commit + push.
3. Valida: https://jogaai.pt/.well-known/assetlinks.json tem de servir o
   JSON. Sem isto a app abre com barra de browser no topo — é o erro nº1.
4. Se assinaste localmente E o Play re-assina, podes precisar dos DOIS
   fingerprints no array (o teu + o do Play).

### A6. Review
Primeira review: 1-7 dias. Atualizações do SITE não precisam de nova
release — só mudanças ao wrapper (ícone, nome, cor).

---

## PARTE B — iOS (Capacitor)

iOS não aceita TWA. O Capacitor cria uma app nativa com WebView.
**Precisas de: Mac com Xcode + Apple Developer Program (99 USD/ano).**

### B1. Decisão de arquitetura (IMPORTANTE, lê antes de começar)
Duas opções de conteúdo:
- **(Recomendada p/ v1) Remote URL:** a WebView carrega https://jogaai.pt.
  Prós: atualiza com cada deploy, zero rebuilds. Contras: Apple é mais
  desconfiada (ver B4).
- Bundle local: empacota o build do Vite dentro da app. Mais "nativo"
  aos olhos da Apple, mas cada update = novo build + review.

### B2. Setup
```bash
cd artifacts/joga-ai
npm i @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "Joga AI" pt.jogaai.app --web-dir dist/public
```
Edita `capacitor.config.ts` (opção Remote URL):
```ts
import { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'pt.jogaai.app',
  appName: 'Joga AI',
  webDir: 'dist/public',
  server: { url: 'https://jogaai.pt', allowNavigation: ['jogaai.pt'] },
  ios: { backgroundColor: '#0a0f1a' },
};
export default config;
```
```bash
pnpm run build && npx cap add ios && npx cap open xcode
```
No Xcode: Signing & Capabilities → seleciona a tua team; Assets → ícone
1024 (usa o logo). Corre no simulador para testar.

### B3. Login Google no iOS
`signInWithPopup` pode falhar em WebView — o código já tem
`signInWithRedirect` como alternativa; testa o login no simulador e, se
falhar, força redirect quando `Capacitor.isNativePlatform()`.

### B4. O risco real: Guideline 4.2 (minimum functionality)
A Apple REJEITA apps que são "só um site embrulhado". Mitigações que
funcionam (mete pelo menos 2 antes de submeter):
- Plugin push notifications (@capacitor/push-notifications) — mesmo que
  só registes o token para uso futuro;
- @capacitor/share para partilha nativa da carta/resultado;
- @capacitor/haptics em ações-chave (golo marcado, skin trocada);
- Splash screen + ícone nativos bem feitos (@capacitor/splash-screen).
Se levares rejeição 4.2 mesmo assim: responde no Resolution Center
explicando os recursos nativos e re-submete — é negociação normal.

### B5. ⚠️ PRO no iOS — regra de ouro do IAP
- Pagamentos de PELADA (serviço físico) → Stripe normal, SEM IAP. ✅
- Subscrição PRO (bem digital) → dentro da app iOS, a Apple EXIGE IAP
  (15% de comissão) e PROÍBE botões/links para pagar fora.
  **Para a v1:** esconde os botões de compra do /premium quando estiver
  dentro do wrapper iOS (deteta via Capacitor) — mostra só "PRO ativo"
  para quem já tem. Quem compra, compra na web. IAP a sério fica para
  uma versão futura se o volume justificar.

### B6. Submissão
App Store Connect → New App → bundle `pt.jogaai.app` → screenshots
(6.7" e 5.5"), descrição, privacy policy URL, App Privacy form (mesmos
dados do Android). Review: 1-3 dias tipicamente.

---

## CHECKLIST FINAL PRÉ-LOJAS
- [ ] jogaai.pt nos Authorized domains do Firebase Auth (senão o login
      falha DENTRO das apps também!)
- [ ] assetlinks.json com SHA-256 real publicado (Android)
- [ ] Login Google testado dentro do wrapper (iOS e Android)
- [ ] Botões de compra PRO escondidos no wrapper iOS (B5)
- [ ] Privacy policy e Termos acessíveis sem login
- [ ] Ícones: 512 (Play) e 1024 (App Store) a partir do logo-badge

---

## Onde estão os ficheiros no repo

| Ficheiro | Caminho |
|----------|---------|
| Digital Asset Links | `artifacts/joga-ai/public/.well-known/assetlinks.json` |
| Este guia | `docs/MOBILE.md` |
| PWA manifest | gerado em build → `manifest.webmanifest` |

**Nota:** a pasta `.well-known` começa com ponto — no Finder macOS fica
oculta. No terminal: `ls -la artifacts/joga-ai/public/.well-known/`
