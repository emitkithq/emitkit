import { Option, Schema } from "effect";

/**
 * An event's value: money it carries at the top level of its metadata, as
 * `{ "amount": 49, "currency": "EUR" }`. The dashboard shows it on the event
 * and sums it (per currency) into the Revenue figure.
 *
 * - `amount` is a JSON number in major units (49.5 is €49.50), negative for
 *   refunds. Numeric strings do not count.
 * - `currency` is a three-letter ISO 4217 code, any case; stored upper-case.
 * - Money nested deeper (`{ "attempted": { "amount": 9, "currency": "EUR" } }`)
 *   is displayed as money but is not the event's value.
 *
 * Shared by ingest (which stores the value in its own columns) and the
 * dashboard (which renders it), so both apply exactly the same rule.
 */
export interface EventValue {
  readonly amount: number;
  readonly currency: string;
}

const Money = Schema.Struct({
  amount: Schema.Finite,
  currency: Schema.String.check(Schema.isPattern(/^[A-Za-z]{3}$/u)),
});

const decodeMoney = Schema.decodeUnknownOption(Money);

/** Money in `value` (any JSON), or `null`. */
export const moneyOf = (value: unknown): EventValue | null =>
  decodeMoney(value).pipe(
    Option.map(({ amount, currency }): EventValue => ({
      amount,
      currency: currency.toUpperCase(),
    })),
    Option.getOrNull
  );

/** The event's value: money at the top level of its metadata, or `null`. */
export const eventValue = (
  metadata: Readonly<Record<string, unknown>>
): EventValue | null => moneyOf(metadata);
