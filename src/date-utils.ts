export function isValidDateText(input: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return false;
  }

  const date = new Date(`${input}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const [y, m, d] = input.split("-").map(Number);
  return date.getFullYear() === y && date.getMonth() + 1 === m && date.getDate() === d;
}

export function daysUntilDate(input: string | Date, now = new Date()): number {
  const parsed = input instanceof Date ? input : new Date(input);

  if (Number.isNaN(parsed.getTime())) {
    if (typeof input === "string") {
      const normalized = input.includes("T") ? input.slice(0, 10) : input;
      const fallback = new Date(`${normalized}T00:00:00`);
      if (Number.isNaN(fallback.getTime())) {
        return NaN;
      }

      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diff = fallback.getTime() - today.getTime();
      return Math.floor(diff / 86400000);
    }

    return NaN;
  }

  const target = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = target.getTime() - today.getTime();
  return Math.floor(diff / 86400000);
}

export function formatDisplayDate(input: string | Date | undefined): string {
  if (!input) {
    return "";
  }

  const raw = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(raw.getTime())) {
    const text = String(input).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return text.replace(/-/g, "/");
    }

    return text;
  }

  const year = raw.getFullYear();
  const month = String(raw.getMonth() + 1).padStart(2, "0");
  const day = String(raw.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

export function formatDaysLabel(daysUntil: number): string {
  if (daysUntil > 0) {
    return `${daysUntil} 天後到期`;
  }

  if (daysUntil === 0) {
    return "今天到期";
  }

  return `已逾期 ${Math.abs(daysUntil)} 天`;
}
