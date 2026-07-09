export type MatchAccessMode = "public" | "community" | "private";

export function resolveAccessMode(input: {
  accessMode?: MatchAccessMode;
  openToExternal?: boolean;
  communityId?: string;
}): MatchAccessMode {
  if (input.accessMode === "public" || input.accessMode === "community" || input.accessMode === "private") {
    return input.accessMode;
  }
  if (!input.communityId) {
    return input.openToExternal === false ? "private" : "public";
  }
  return input.openToExternal === true ? "public" : "community";
}

export function openToExternalFromAccessMode(mode: MatchAccessMode): boolean {
  return mode === "public";
}

/** Visível na descoberta pública (Encontrar Jogos). */
export function isListedInPublicBrowse(input: {
  accessMode?: MatchAccessMode;
  openToExternal?: boolean;
  communityId?: string;
  communityOpenToExternal?: boolean;
  communityProActive?: boolean;
  status?: string;
}): boolean {
  if (input.communityId) {
    if (input.communityOpenToExternal && input.communityProActive) {
      return !input.status || ["configurando", "ao_vivo", "aguardando_auditoria", "auditada"].includes(input.status);
    }
  }
  const mode = resolveAccessMode(input);
  if (mode !== "public") return false;
  if (input.communityId) return true;
  return !input.status || ["configurando", "ao_vivo", "aguardando_auditoria", "auditada"].includes(input.status);
}

export function accessModeLabel(mode: MatchAccessMode): string {
  if (mode === "public") return "Público";
  if (mode === "community") return "Apenas comunidade";
  return "Privado (só com link)";
}

/** Visível no feed da comunidade (exclui privadas). */
export function isListedInCommunityFeed(input: {
  accessMode?: MatchAccessMode;
  openToExternal?: boolean;
  communityId?: string;
}): boolean {
  return resolveAccessMode(input) !== "private";
}
