import { BookingApiError, supabaseApiRequest } from "./booking";
import { validateCatalogQuote, type CatalogQuote } from "./catalogAssociations";

export type BookingDiscountInput = {
  dateISO: string; startMinute: number; endMinute: number; basisPoints: number;
  serviceIds: string[] | null; active: boolean;
};
export type BookingDiscount = BookingDiscountInput & { id: string; revision: number };
export type BookingDiscountList = {
  timezone: string; promotions: BookingDiscount[]; services: { id: string; name: string }[];
};

export function parseDiscountPercent(text: string): number | null {
  const normalized = text.trim().replace(",", ".");
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const points = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return points <= 10000 ? points : null;
}

export function manageBookingDiscount<T>(businessId: string, action: "list" | "create" | "update" | "delete",
  expectedUserId: string, input: object = {}): Promise<T> {
  return supabaseApiRequest<T>("/supabase/booking-discounts", {
    method: "POST", body: JSON.stringify({ businessId, action, input }),
  }, true, expectedUserId);
}

export async function quoteBookingDiscount(base: CatalogQuote, startsAt: string): Promise<CatalogQuote> {
  try {
    const quote = await supabaseApiRequest<CatalogQuote>("/supabase/booking-discounts/quote", {
      method: "POST", body: JSON.stringify({
        businessId: base.businessId, rootIds: base.rootIds, selectedIds: base.selectedAssociationIds, startsAt,
      }),
    }, true);
    return validateCatalogQuote(quote, base.businessId, base.rootIds);
  } catch (error) {
    // Older releases can serve the existing catalogue before the atomic SQL
    // migration. Its booking guard rejects stale prices once promotions exist.
    if (error instanceof BookingApiError && (error.status === 404 && !error.code
      || error.status === 501 && error.code === "BOOKING_DISCOUNTS_UNAVAILABLE")) return base;
    throw error;
  }
}

export type BookingDiscountPrices = Record<string, {totalPrice: number; discountTotal: number}>;
export function getBookingDiscountPrices(base: CatalogQuote, startsAt: string[]): Promise<BookingDiscountPrices> {
  return supabaseApiRequest<BookingDiscountPrices>("/supabase/booking-discounts/prices", {
    method: "POST", body: JSON.stringify({businessId:base.businessId,rootIds:base.rootIds,selectedIds:base.selectedAssociationIds,startsAt}),
  }, true);
}
