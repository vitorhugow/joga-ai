/** Data do jogo (sem hora) — ex: "qua., 8 jul." */
export function formatMatchDateOnly(date?: string | null): string | null {
  if (!date?.trim()) return null;
  const t = date.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    try {
      const d = new Date(`${t}T12:00:00`);
      return d.toLocaleDateString("pt-PT", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
    } catch {
      return t;
    }
  }
  return t;
}

/** Horário do jogo — ex: "19:30" */
export function formatMatchTimeOnly(time?: string | null): string | null {
  if (!time?.trim()) return null;
  const t = time.trim();
  const match = t.match(/^(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
  return t;
}

export function getMatchScheduleLines(input: {
  date?: string;
  scheduledDate?: string;
  scheduledTime?: string;
}): { dateLine: string; timeLine: string | null } {
  if (input.scheduledDate) {
    return {
      dateLine: formatMatchDateOnly(input.scheduledDate) ?? input.scheduledDate,
      timeLine: formatMatchTimeOnly(input.scheduledTime),
    };
  }

  const raw = input.date?.trim();
  if (!raw || raw === "—" || raw === "A definir") {
    return { dateLine: "A definir", timeLine: null };
  }

  // Evita mostrar ISO de criação (ex: 2026-07-08T16:22:02.000Z)
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    return { dateLine: "A definir", timeLine: null };
  }

  // Listagens locais antigas: string já formatada com data+hora
  return { dateLine: raw, timeLine: null };
}
