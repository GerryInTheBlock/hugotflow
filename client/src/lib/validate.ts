/** "03/14/2008" or "03 / 14 / 2008" → "2008-03-14"; null if not a real date. */
export function parseBirthdate(input: string): string | null {
  const m = input.replace(/\s/g, "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const d = new Date(Date.UTC(+yyyy, +mm - 1, +dd));
  if (d.getUTCFullYear() !== +yyyy || d.getUTCMonth() !== +mm - 1 || d.getUTCDate() !== +dd) return null;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/** Whole years between an ISO birthdate and today. */
export function ageOn(isoBirthdate: string, today = new Date()): number {
  const [y, m, d] = isoBirthdate.split("-").map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}
