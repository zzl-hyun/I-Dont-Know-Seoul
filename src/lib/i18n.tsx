import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  LOCALE_META,
  formatDestinationCount,
  formatMinutes,
  formatNeighborhoodCount,
  formatNumber,
  formatPercent,
  formatRank,
  formatRentMan,
  formatRentPeriod,
  translate,
  type Locale,
} from "./locale";

interface I18nValue {
  locale: Locale;
  tr: (source: string) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  minutes: (value: number, digits?: number) => string;
  rent: (value: number, digits?: number) => string;
  percent: (value: number, digits?: number) => string;
  neighborhoodCount: (value: number) => string;
  destinationCount: (value: number) => string;
  rank: (rank: number, total: number) => string;
  rentPeriod: (startDate: string, endDate: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      tr: (source) => translate(locale, source),
      number: (amount, options) => formatNumber(locale, amount, options),
      minutes: (amount, digits) => formatMinutes(locale, amount, digits),
      rent: (amount, digits) => formatRentMan(locale, amount, digits),
      percent: (amount, digits) => formatPercent(locale, amount, digits),
      neighborhoodCount: (amount) => formatNeighborhoodCount(locale, amount),
      destinationCount: (amount) => formatDestinationCount(locale, amount),
      rank: (position, total) => formatRank(locale, position, total),
      rentPeriod: (startDate, endDate) => formatRentPeriod(locale, startDate, endDate),
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const { locale, tr } = useI18n();

  return (
    <nav className={`locale-switcher ${className}`.trim()} aria-label={tr("언어")}>
      {(["ko", "en", "ja"] as const).map((candidate) => (
        <a
          key={candidate}
          href={
            typeof window === "undefined"
              ? candidate === "ko"
                ? "/"
                : `/${candidate}/`
              : `${candidate === "ko" ? "/" : `/${candidate}/`}${window.location.search}${window.location.hash}`
          }
          hrefLang={LOCALE_META[candidate].htmlLang}
          lang={LOCALE_META[candidate].htmlLang}
          aria-current={candidate === locale ? "page" : undefined}
        >
          {LOCALE_META[candidate].nativeLabel}
        </a>
      ))}
    </nav>
  );
}
