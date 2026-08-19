import { useEffect, useRef, useState } from "react";
import type { Destination } from "../types";
import {
  searchGeographicSuggestions,
  type GeographicSuggestion,
} from "../lib/geographicNames";
import { useI18n } from "../lib/i18n";

interface Props {
  onPick: (dest: Destination) => void;
  /** 목적지 상한에 도달하면 입력을 막는다 */
  disabled?: boolean;
  placeholder?: string;
  geographicSuggestions?: GeographicSuggestion[];
}

interface Suggestion {
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** station/neighborhood = 로컬 별칭 검색, place = Kakao 지오코딩 결과 */
  kind: "station" | "neighborhood" | "place";
}

const EMPTY_GEOGRAPHIC_SUGGESTIONS: GeographicSuggestion[] = [];

/**
 * 목적지 검색.
 *
 * 실제 지오코딩은 Worker의 /api/geocode 가 담당한다. Kakao REST 키를
 * 클라이언트에 노출하지 않기 위해서다. 키가 설정되지 않은 환경에서는
 * Worker가 지하철역 이름 검색으로 폴백하므로 개발 중에도 동작한다.
 */
export default function DestinationSearch({
  onPick,
  disabled,
  placeholder,
  geographicSuggestions = EMPTY_GEOGRAPHIC_SUGGESTIONS,
}: Props) {
  const { tr } = useI18n();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  /**
   * 항목을 고르면 입력값이 그 이름으로 바뀌는데, 그대로 두면 그 변경이
   * 다시 검색을 트리거해서 방금 닫은 드롭다운이 곧바로 다시 열린다.
   * 선택으로 인한 변경 한 번은 건너뛴다.
   */
  const skipNextSearch = useRef(false);

  // 입력이 멈춘 뒤에만 요청한다 (타이핑마다 호출하면 쿼터가 빨리 닳는다)
  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    const localItems = searchGeographicSuggestions(geographicSuggestions, q);
    setItems(localItems);
    setActive(0);
    setOpen(true);
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const data: { results: Suggestion[] } = await res.json();
        const merged = [...localItems, ...(data.results ?? [])].filter(
          (item, index, all) =>
            all.findIndex(
              (candidate) => candidate.lat === item.lat && candidate.lng === item.lng
            ) === index
        );
        setItems(merged.slice(0, 10));
        setActive(0);
        setOpen(true);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setItems(localItems);
          setOpen(localItems.length > 0);
        }
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [geographicSuggestions, query]);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const choose = (s: Suggestion) => {
    onPick({ name: s.name, address: s.address, lat: s.lat, lng: s.lng });
    skipNextSearch.current = true;
    // 이 컴포넌트는 교체(메인 검색창)와 추가("+ 목적지 추가") 양쪽에서 재사용된다.
    // 어느 쪽이든 선택 직후엔 입력창을 비운다 — 이름이 남으면 다음 검색에 방해된다.
    setQuery("");
    setItems([]);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="search" ref={boxRef}>
      <input
        className="search-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => items.length && setOpen(true)}
        disabled={disabled}
        placeholder={
          disabled
            ? tr("목적지를 더 추가할 수 없습니다")
            : /*
               * 예시를 "강남역, SK AX" 로 둔다. 역 하나와 회사 하나를 보여줘
               * 둘 다 된다는 걸 알리는 게 첫째 이유고, SK AX 는 판교라
               * **목적지가 서울 밖이어도 된다**는 것까지 같이 알린다
               * (서울 밖으로 통근하며 서울에 사는 게 이 도구의 흔한 쓰임이다).
               */
              (placeholder ?? tr("회사나 학교를 검색하세요 (예: 강남역, SK AX)"))
        }
        autoComplete="off"
        spellCheck={false}
        aria-label={tr("목적지 검색")}
      />
      {open && (
        <div className="suggestions" role="listbox">
          {items.length === 0 && !loading && (
            <div className="suggestion" style={{ color: "var(--text-faint)" }}>
              {tr("검색 결과가 없습니다")}
            </div>
          )}
          {items.map((s, i) => (
            <button
              key={`${s.name}-${s.lat}-${s.lng}-${i}`}
              className="suggestion"
              data-active={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(s)}
              role="option"
              aria-selected={i === active}
            >
              {s.name}
              {s.kind === "station" && <span className="pill">{tr("지하철역")}</span>}
              {s.kind === "neighborhood" && <span className="pill">{tr("행정동")}</span>}
              <small>{s.address}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
