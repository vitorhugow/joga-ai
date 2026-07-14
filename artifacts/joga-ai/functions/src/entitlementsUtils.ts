type PlanEntitlementSlot = {
  active?: boolean;
  proUntil?: string | null;
};

function slotActive(slot?: PlanEntitlementSlot | null): boolean {
  if (!slot?.active) return false;
  if (!slot.proUntil) return true;
  return Date.now() < new Date(slot.proUntil).getTime();
}

/** PRO Jogador activo — inclui Clube PRO (organizerPro). */
export function hasPlayerProEntitlements(entitlements: Record<string, unknown> | undefined): boolean {
  if (!entitlements) return false;

  const playerPro = entitlements.playerPro as PlanEntitlementSlot | undefined;
  const organizerPro = entitlements.organizerPro as PlanEntitlementSlot | undefined;
  if (playerPro || organizerPro) {
    return slotActive(playerPro) || slotActive(organizerPro);
  }

  if (entitlements.pro !== true) return false;
  const proUntil = entitlements.proUntil;
  if (typeof proUntil !== "string") return true;
  return Date.now() < new Date(proUntil).getTime();
}
