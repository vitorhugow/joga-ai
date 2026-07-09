# JOGA AI — Guia Mobile: Google Play (Android) e App Store (iOS)

> A app já é uma PWA completa (manifest ✓, service worker ✓, offline ✓).
> Android embrulha a PWA num TWA (leve, 1-2 dias até aprovar).
> iOS exige um wrapper Capacitor (mais trabalhoso + risco de review).
> **Ordem recomendada: Android primeiro** — mais barato (25€ únicos),
> review mais rápida, e valida o processo antes de pagar os 99€/ano da Apple.

---

## PARTE A — ANDROID (TWA via Bubblewrap)

O TWA (Trusted Web Activity) mostra o site em Chrome fullscreen — a app
É o site, atualiza com cada deploy do Cloudflare, zero manutenção nativa.

### A0. Estado no repo (antes do primeiro build)

| Ficheiro | Caminho | Notas |
|----------|---------|-------|
| PWA manifest | gerado em build → `dist/public/manifest.webmanifest` | Fonte: `vite.config.ts` (VitePWA) |
| Link no HTML | `artifacts/joga-ai/index.html` | `<link rel="manifest" href="/manifest.webmanifest">` |
| Digital Asset Links (placeholder) | `artifacts/joga-ai/public/.well-known/assetlinks.json` | Conteúdo actual: `[]` — ver A5 |
| Template Bubblewrap | `artifacts/joga-ai/twa-manifest.json` | Referência; o `bubblewrap init` gera outro na pasta Android |
| Este guia | `docs/MOBILE.md` | |

**packageId proposto:** `pt.jogaai.app` — **confirmar com o Vitor antes da
primeira publicação**. O packageId **nunca pode mudar** depois de subir à Play Store.

O `twa-manifest.json` de referência no repo tem:
- `host`: `jogaai.pt`
- `startUrl`: `/`
- `name` / `launcherName`: `Joga AI`
- `themeColor` / `backgroundColor`: `#0A0F1A` (coerente com o manifest PWA)
- `orientation`: `portrait`
- `webManifestUrl`: `https://jogaai.pt/manifest.webmanifest`

### A1. Pré-requisitos (uma vez)
- Node instalado (já tens) · JDK 17: `brew install openjdk@17`
- Conta Google Play Console: https://play.google.com/console (25 USD únicos)
- `npm i -g @bubblewrap/cli`

### A2. Sequência real (runbook)

```bash
# a) Inicializar o projecto TWA (numa pasta à parte, ex. joga-ai-android)
mkdir joga-ai-android && cd joga-ai-android
npx @bubblewrap/cli init --manifest https://jogaai.pt/manifest.webmanifest
```

Respostas ao wizard:
- Package name: `pt.jogaai.app` (tem de bater com o `assetlinks.json`!)
- App name / short name: **Joga AI**
- Display: standalone · Status bar / theme: `#0a0f1a`
- Signing key: deixa o Bubblewrap **CRIAR** (não versionar no git)

```bash
# b) Build local (gera .aab + keystore na pasta do projecto)
npx @bubblewrap/cli build
```

**c) Guardar keystore + passwords** num gestor de passwords + backup offline.
Perder a keystore = **nunca mais** actualizar a app na Play Store.

**d)** Upload do `app-release-bundle.aab` no Play Console → **Closed testing**
(ou Internal testing para começar).

**e)** Play Console → **App integrity** → **App signing** → copiar o
**SHA-256 fingerprint** do "App signing key certificate".

```bash
# f) Gerar o JSON de Digital Asset Links
npx @bubblewrap/cli fingerprint generateAssetLinks
# (ou montar manualmente com o SHA-256 do passo e)
```

**g)** Substituir `artifacts/joga-ai/public/.well-known/assetlinks.json` pelo
conteúdo real (array com `package_name` + `sha256_cert_fingerprints`), commit, push.

**h)** Verificar **antes** de convidar testers:

```bash
curl -sI https://jogaai.pt/.well-known/assetlinks.json | grep -i content-type
curl -s https://jogaai.pt/.well-known/assetlinks.json
```

Tem de devolver **HTTP 200** e `Content-Type: application/json`.
Sem isto a app abre com barra de browser no topo — é o erro nº1.

> **Placeholder actual:** `public/.well-known/assetlinks.json` contém `[]`.
> Isto é intencional até ao primeiro upload ao Play Console. O conteúdo real
> só existe depois de obteres o SHA-256 (passo e). Se assinaste localmente
> **e** o Play re-assina, podes precisar dos **dois** fingerprints no array.

### A3. Build de teste local
```bash
# APK para instalar num Android físico
adb install app-release-signed.apk
```

### A4. Play Console (ficha da loja)
1. Create app → App name "Joga AI", idioma pt-PT, Free.
2. Preenche a ficha: descrição, ícone 512, feature graphic 1024×500,
   2+ screenshots de telemóvel (usa as do site!), privacy policy:
   https://jogaai.pt/privacidade
3. Data safety form: declara Firebase Auth/Firestore (conta, email,
   conteúdo do utilizador; sem venda de dados).

### A5. Digital Asset Links — detalhe técnico

O ficheiro vive em `artifacts/joga-ai/public/.well-known/assetlinks.json`.
O Vite copia `public/` para `dist/public/` no build — pastas com ponto
(`.well-known`) **não são ignoradas** pelo `publicDir` default.

O `_headers` do Cloudflare Pages força:
```
/.well-known/assetlinks.json
  Content-Type: application/json
```

O Workbox PWA exclui `/.well-known/` do `navigateFallback` para não
interceptar este path.

### A6. Service workers (PWA + FCM push)

Dois service workers no **mesmo origin**, scopes **diferentes** (obrigatório):

| SW | Path | Scope |
|----|------|-------|
| Workbox (PWA offline) | `/sw.js` | `/` |
| Firebase Cloud Messaging | `/firebase-messaging-sw.js` | `/firebase-cloud-messaging-push-scope` |

O cliente regista o FCM com scope isolado (`pushNotifications.ts`).
O `_headers` do Cloudflare envia `Service-Worker-Allowed` no script FCM
para permitir scope mais estreito que o path do ficheiro.

O Workbox **não** pré-cacheia `firebase-messaging-sw.js` (`globIgnores`).

#### Testar push em background (após deploy)

Tokens antigos em `users/{uid}/fcmTokens` podem ter sido gerados contra
a registration errada (scope `/` do Workbox). Para testar de raiz:

1. DevTools → **Application** → **Service Workers** → **Unregister** em
   **ambos** (`sw.js` e `firebase-messaging-sw.js`).
2. Apagar documentos em `users/{teuUid}/fcmTokens` (ou desactivar push no perfil).
3. Recarregar o site, aceitar push de novo (gera token novo + SW FCM no scope certo).
4. Confirmar em DevTools dois registos com scopes **diferentes**.
5. Enviar mensagem de teste no Firebase Console com o site **fechado**.

Se o push em foreground funciona mas em background não, o scope ou o SW
do FCM ainda está errado — rever passos 1–4.

### A7. Review
Primeira review: 1-7 dias. Atualizações do **site** não precisam de nova
release — só mudanças ao wrapper (ícone, nome, cor, packageId).

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
- [ ] `jogaai.pt` nos Authorized domains do Firebase Auth (senão o login
      falha DENTRO das apps também!)
- [ ] `assetlinks.json` com SHA-256 real publicado (Android) — não `[]`
- [ ] `https://jogaai.pt/.well-known/assetlinks.json` → 200 + `application/json`
- [ ] packageId `pt.jogaai.app` confirmado antes do primeiro upload
- [ ] Keystore guardada em local seguro (fora do git)
- [ ] Login Google testado dentro do wrapper (iOS e Android)
- [ ] Botões de compra PRO escondidos no wrapper iOS (B5)
- [ ] Privacy policy e Termos acessíveis sem login
- [ ] Ícones: 512 (Play) e 1024 (App Store) a partir do logo-badge

---

## Onde estão os ficheiros no repo

| Ficheiro | Caminho |
|----------|---------|
| Digital Asset Links | `artifacts/joga-ai/public/.well-known/assetlinks.json` |
| Template TWA (referência) | `artifacts/joga-ai/twa-manifest.json` |
| PWA manifest (fonte) | `artifacts/joga-ai/vite.config.ts` → build gera `manifest.webmanifest` |
| Ícones PWA | `artifacts/joga-ai/public/pwa-192.png`, `pwa-512.png` |
| FCM service worker | `artifacts/joga-ai/public/firebase-messaging-sw.js` (gerado no build) |
| Pasta Android local | `artifacts/joga-ai-mobile/` (só README; projecto Bubblewrap fica fora) |
| Este guia | `docs/MOBILE.md` |

**Nota:** a pasta `.well-known` começa com ponto — no Finder macOS fica
oculta. No terminal: `ls -la artifacts/joga-ai/public/.well-known/`

**`.gitignore`:** keystores, `.aab`, `.apk`, pasta `/android/`, `bubblewrap.log`
e ficheiros com `keystore`/`signing` no nome **nunca** entram no repo.
