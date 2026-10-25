export interface GroupPrice {
  persons: number;
  price: number;
  vehicle?: string;
}

/** The price-list row for exactly this many travellers (none above the largest group listed). */
export function groupPriceFor(rows: GroupPrice[] | undefined, persons: number): GroupPrice | undefined {
  if (!rows?.length || !Number.isFinite(persons) || persons < 1) return undefined;
  return rows.find((r) => r.persons === persons);
}
