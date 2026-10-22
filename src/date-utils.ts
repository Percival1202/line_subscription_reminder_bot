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

export function daysUntilDate(input: string, now = new Date()): number {
  const target = new Date(`${input}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = target.getTime() - today.getTime();
  return Math.floor(diff / 86400000);
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
