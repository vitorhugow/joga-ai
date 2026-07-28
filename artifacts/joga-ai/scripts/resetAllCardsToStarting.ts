/**
 * resetAllCardsToStarting.ts — repõe TODAS as cartas (users com
 * profileComplete:true) ao estado inicial: OVR 50 (todos os 6 atributos a
 * 50), seasonStats zerado, e remove o rasto de evolução mais recente
 * (lastMatchRating, lastAttributeDeltas, lastEvolutionMatchId,
 * lastMatchNickname).
 *
 * NÃO toca em: nome, posição, camisola, foto, badges desbloqueados,
 * skins, PRO/entitlements, saldo, matchHistory (histórico de partidas
 * fica intacto, só a carta/estatísticas da época são repostas).
 *
 * Uso (a partir de artifacts/joga-ai/):
 *   node scripts/resetAllCardsToStarting.ts              # dry-run (nunca escreve)
 *   node scripts/resetAllCardsToStarting.ts --apply       # grava o reset
 *
 * Credenciais: gcloud auth print-access-token, igual aos outros scripts
 * one-off desta sessão (repairZeroedRatings.ts) — REST API directa, não
 * firebase-admin (ADC não configurado neste ambiente).
 */

import { execFileSync } from "node:child_process";

const PROJECT_ID = "joga-ai-f7622";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const APPLY = process.argv.includes("--apply");

function accessToken(): string {
  return execFileSync("gcloud", ["auth", "print-access-token"], {
    encoding: "utf8",
  }).trim();
}

function authHeaders() {
  return {
    Authorization: `Bearer ${accessToken()}`,
    "Content-Type": "application/json",
  };
}

type FsValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { arrayValue: { values?: FsValue[] } }
  | { mapValue: { fields?: Record<string, FsValue> } };

type FsDocument = {
  name: string;
  fields?: Record<string, FsValue>;
};

function fsToPlain(value: FsValue | undefined): unknown {
  if (!value) return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(fsToPlain);
  if ("mapValue" in value) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value.mapValue.fields ?? {})) out[k] = fsToPlain(v);
    return out;
  }
  return undefined;
}

function docId(name: string): string {
  return name.split("/").pop()!;
}

/** Query paginada — devolve todos os docs de users com profileComplete == true. */
async function listCompletedProfiles(): Promise<Array<{ id: string; fields: Record<string, unknown> }>> {
  const results: Array<{ id: string; fields: Record<string, unknown> }> = [];
  let pageToken: string | undefined;

  do {
    const body: Record<string, unknown> = {
      structuredQuery: {
        from: [{ collectionId: "users" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "profileComplete" },
            op: "EQUAL",
            value: { booleanValue: true },
          },
        },
        select: {
          fields: [
            { fieldPath: "__name__" },
            { fieldPath: "displayName" },
            { fieldPath: "attributes" },
            { fieldPath: "seasonStats" },
            { fieldPath: "lastMatchRating" },
            { fieldPath: "lastAttributeDeltas" },
            { fieldPath: "lastEvolutionMatchId" },
            { fieldPath: "lastMatchNickname" },
          ],
        },
        ...(pageToken ? { startAt: { values: [{ referenceValue: pageToken }] } } : {}),
      },
    };
    const res = await fetch(`${BASE}:runQuery`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`runQuery: HTTP ${res.status} ${await res.text()}`);
    const rows = (await res.json()) as Array<{ document?: FsDocument }>;
    const docs = rows.filter((r) => r.document).map((r) => r.document!);
    for (const d of docs) {
      const fields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(d.fields ?? {})) fields[k] = fsToPlain(v);
      results.push({ id: docId(d.name), fields });
    }
    // runQuery devolve tudo numa página só até um limite generoso; sem
    // paginação explícita aqui porque o volume de utilizadores é pequeno
    // (mesmo padrão de closeExpiredMatches/paymentReminders, que também
    // não paginam por o volume ser pequeno).
    pageToken = undefined;
  } while (pageToken);

  return results;
}

function toFsValue(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
  if (typeof v === "object") {
    const fields: Record<string, FsValue> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val === undefined) continue;
      fields[k] = toFsValue(val);
    }
    return { mapValue: { fields } };
  }
  throw new Error(`toFsValue: tipo não suportado ${typeof v}`);
}

/**
 * PATCH com updateMask — campos presentes em `setFields` são escritos;
 * campos listados em `deleteFieldPaths` (mas ausentes de `setFields`) são
 * APAGADOS pela API (updateMask inclui o path, fields não tem o valor).
 */
async function patchUser(
  userId: string,
  setFields: Record<string, unknown>,
  deleteFieldPaths: string[],
): Promise<void> {
  const allPaths = [...Object.keys(setFields), ...deleteFieldPaths];
  const mask = allPaths.map((p) => `updateMask.fieldPaths=${encodeURIComponent(p)}`).join("&");
  const body: { fields: Record<string, FsValue> } = { fields: {} };
  for (const [k, v] of Object.entries(setFields)) body.fields[k] = toFsValue(v);
  const res = await fetch(`${BASE}/users/${userId}?${mask}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`patchUser ${userId}: HTTP ${res.status} ${await res.text()}`);
}

const STARTING_ATTRIBUTES = {
  ritmo: 50,
  finalizacao: 50,
  passe: 50,
  defesa: 50,
  drible: 50,
  fisico: 50,
};

const STARTING_SEASON_STATS = {
  matches: 0,
  goals: 0,
  assists: 0,
  saves: 0,
  mvp: 0,
  averageRating: 0,
};

const DELETE_FIELD_PATHS = ["lastMatchRating", "lastAttributeDeltas", "lastEvolutionMatchId", "lastMatchNickname"];

function overallOf(attrs: Record<string, unknown> | undefined): number {
  if (!attrs) return 0;
  const values = Object.values(attrs).map((v) => Number(v) || 0);
  if (values.length === 0) return 0;
  return Math.floor(values.reduce((a, b) => a + b, 0) / values.length);
}

async function main() {
  console.log(APPLY ? "MODO: --apply (vai escrever)" : "MODO: dry-run (não escreve nada)");
  console.log();

  const users = await listCompletedProfiles();
  console.log(`Encontrados ${users.length} utilizadores com profileComplete:true.`);
  console.log();

  let reset = 0;
  let alreadyAtStarting = 0;

  for (const user of users) {
    const name = String(user.fields.displayName ?? "(sem nome)");
    const attrs = user.fields.attributes as Record<string, unknown> | undefined;
    const currentOverall = overallOf(attrs);
    const seasonStats = user.fields.seasonStats as Record<string, unknown> | undefined;
    const matches = Number(seasonStats?.matches ?? 0);

    const isAlreadyStarting =
      currentOverall === 50 &&
      matches === 0 &&
      !user.fields.lastMatchRating &&
      !user.fields.lastAttributeDeltas;

    if (isAlreadyStarting) {
      alreadyAtStarting++;
      continue;
    }

    console.log(`--- ${user.id} (${name}) ---`);
    console.log(`  OVR atual: ${currentOverall} -> 50`);
    console.log(`  seasonStats atual: matches=${matches}, goals=${seasonStats?.goals ?? 0}, assists=${seasonStats?.assists ?? 0}, saves=${seasonStats?.saves ?? 0}, mvp=${seasonStats?.mvp ?? 0} -> tudo a 0`);
    console.log(`  campos a apagar: ${DELETE_FIELD_PATHS.filter((p) => user.fields[p] !== undefined).join(", ") || "(nenhum presente)"}`);

    if (APPLY) {
      await patchUser(
        user.id,
        {
          attributes: STARTING_ATTRIBUTES,
          seasonStats: STARTING_SEASON_STATS,
          updatedAt: new Date().toISOString(),
        },
        DELETE_FIELD_PATHS,
      );
      console.log("  GRAVADO.");
    } else {
      console.log("  (dry-run — nada gravado)");
    }
    console.log();
    reset++;
  }

  console.log("=== Resumo ===");
  console.log(`Total com carta montada: ${users.length}`);
  console.log(`Já estavam no estado inicial (ignorados): ${alreadyAtStarting}`);
  console.log(`${APPLY ? "Repostos" : "Seriam repostos"}: ${reset}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
