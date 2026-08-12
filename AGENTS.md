# Repository Guidelines & Agent Handoff

> **Claude와 Codex가 함께 쓰는 단일 인수인계 파일입니다.** 두 에이전트 모두 작업을
> 시작하기 전에 이 파일과 `git status --short --branch`를 읽고, 종료하기 전에 자기
> 상태만 갱신합니다. 같은 작업트리를 공유하므로 다른 에이전트의 변경을 정리하거나
> 되돌리지 않습니다.

## Project Structure & Module Organization

`src/` contains the React 19/Vite frontend. Page-level state lives in `src/App.tsx`, reusable UI in `src/components/`, and routing, scoring, commute, and sharing logic in `src/lib/`. Keep shared domain types in `src/types.ts`. `worker/index.ts` is the Cloudflare Worker for `/api/data` and `/api/geocode`; keep it thin because production CPU time is limited. Data-generation scripts run in order from `scripts/1-boundaries.mjs` through `scripts/5-seed-kv.mjs`. Generated browser assets live in `public/`, while source snapshots and intermediate outputs live under `data/`.

## Build, Test, and Development Commands

- `npm ci`: install the locked dependency set.
- `npm run dev`: run the frontend-only Vite server.
- `npm run cf:dev`: run the Worker and static assets together at `localhost:8787`; prefer this for integration work.
- `npm test`: run the Vitest regression suite once.
- `npm run typecheck`: type-check frontend, Node config, and Worker projects.
- `npm run build`: type-check and create the production Vite bundle.
- `npm run data:boundaries && npm run data:subway && npm run data:metrics && npm run data:score`: regenerate data in dependency order.

## Coding Style & Naming Conventions

Use strict TypeScript, ES modules, two-space indentation, double quotes, and semicolons, matching the existing code. Name React components and exported types with `PascalCase`, functions and variables with `camelCase`, and true constants with `UPPER_SNAKE_CASE`. Prefer small pure functions for scoring and geometry. No repository-wide formatter or linter is configured, so preserve nearby formatting and run `git diff --check`.

## Testing Guidelines

Vitest tests are colocated as `*.test.ts` in `src/lib/` and `worker/`. Add regression tests for behavior changes, especially commute constants, score ties, URL parsing, generated bundle validation, and Worker fallback/cache paths. There is no fixed coverage threshold; changed branches should be exercised. Run `npm test`, `npm run typecheck`, and `npm run build` before opening a PR.

## Commit & Pull Request Guidelines

Follow the history’s Conventional Commit style: `feat(map): ...`, `fix(landing): ...`, or `docs: ...`. Keep commits focused and explain data/model changes in the body. PRs should summarize user-visible behavior, list verification commands, link relevant issues, and include screenshots for UI changes. Note regenerated assets or KV seeding requirements explicitly.

## Security & Configuration

Copy `.env.example` to `.env` for local data keys; never commit secrets. Store `KAKAO_REST_KEY` only as a Wrangler secret. Treat `npm run data:seed` and `npm run cf:deploy` as remote mutations and run them only when explicitly intended.

---

## Parallel Agent Protocol

### 작업 시작 전

1. 이 파일의 `Current Shared State`와 두 에이전트 슬롯을 읽습니다.
2. `git status --short --branch`, `git log -5 --oneline --decorate`를 실행합니다.
3. 자기 슬롯에 작업 목적·대상 파일·상태를 기록한 뒤 편집합니다.
4. 다른 에이전트가 소유 중인 파일과 겹치면 수정하지 말고 사용자에게 조정을 요청합니다.
5. 한 작업트리에서 한 에이전트가 작업 중일 때 다른 에이전트는 브랜치를 전환하지 않습니다.

가능하면 Claude와 Codex에 별도 `git worktree`와 기능 브랜치를 배정하는 것이 가장
안전합니다. 같은 작업트리를 계속 쓸 경우 아래 파일 소유권을 강제합니다.

### 파일 소유권

- 각 에이전트는 자기 슬롯의 `Owned files`만 수정합니다.
- 공유 파일(`AGENTS.md`, `package.json`, 설정, 공통 타입)은 수정 직전에 다시 읽고,
  상대 슬롯에 변경 계획을 기록합니다.
- `git add .`, `git add -A`, `git add --all`을 사용하지 않습니다. 항상
  `git add -- <확인한 파일>`로 스테이징합니다.
- 다른 에이전트의 미커밋·미추적 파일을 삭제·이동·포맷·stash하지 않습니다.
- 예상하지 못한 변경이 나타나면 동시 작업으로 간주하고 먼저 diff와 소유자를 확인합니다.

### 포트 소유권

- `8787`: Claude의 `wrangler/workerd` 통합 개발 서버. Codex가 종료하거나 재시작하지 않습니다.
- `5173`: 이번 UI 수동 검증에만 사용했고 인수인계 직전에 종료했습니다. 다시 필요하면
  Claude가 `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`로 실행합니다.
- 포트를 바꿀 때는 자기 슬롯에 새 포트를 기록합니다.

## Current Shared State

마지막 확인: **2026-08-12 16:02 KST** (Claude)

| 항목 | 현재 상태 |
| --- | --- |
| 공용 작업트리 | `/Users/macbookpro/Desktop/Work/I-Dont-Know-Seoul` |
| 현재 브랜치 | `main` |
| 현재 HEAD | `06d1f46 chore(data): 월세 유형 분해 반영해 산출물을 재생성한다` |
| `origin/main` | `06d1f46` — **push 완료, 로컬과 원격 일치** |
| PR 이력 | #4·#5·#6 사용자가 직접 머지. 이후 랜딩 카피·CSS 수정 2건 + 월세 유형 분해 3건은 Claude가 main에 직접 커밋·push·배포까지 완료 |
| 미커밋 tracked | 없음 (clean) |
| 미추적 문서 | `AGENTS.md`, `CODE_REVIEW.md`, `DATA_ENRICHMENT_HANDOFF.md`, `GEOVISION_HANDOFF.md`, `claude-feedback/` — 의도적으로 untracked 유지 |
| 최근 검증 | `npm test` **184/184 통과**(SGIS 원자료 있어 `residential-quality.test.ts`도 실행됨), `npm run typecheck`·`npm run build` 통과 |
| 운영 배포 | **완료** — `06d1f46` 배포됨. Worker Version ID `fc08e487-334f-4247-bc81-e1a774baea47`. `/api/data`에서 `rentByType` 정상 서빙 확인(2026-08-12 16:05 KST) |

### 월세 유형 분해 (`e087d98`~`06d1f46`) — 완료·배포됨

### 다음 계획 (사용자 지시, 2026-08-12) — 아직 착수 안 함

세션이 곧 끊길 수 있다고 해서, 다음 세션이 다시 파악할 필요 없게 기술적
디테일까지 여기 남긴다.

#### 1. 환산월세 on/off 토글

- **on**(현재 기본): 보증금을 월세로 환산해 더한 값. **off**: 순수 월세만.
- **막히는 지점**: `scripts/3-metrics.mjs`의 `fetchRent()` → `runJob()`이
  API 응답을 받는 즉시 `toMonthly(deposit, monthly)`로 환산해버리고
  (`byLegal.get(k).push({ value: toMonthly(...), type: ep.name })`), 순수
  `monthly` 원값은 어디에도 안 남기고 버린다. **UI 토글만으로 안 되고
  수집 단계부터 손대야 한다** — 레코드를
  `{ monthly, converted, type }`처럼 둘 다 들고 있게 바꾸고, `typeBreakdown()`
  (`scripts/lib/rent.mjs`)도 두 값 각각의 중앙값을 내도록 확장해야 한다.
- 순수월세만 보면 "보증금 5000/월세 20"과 "보증금 0/월세 80"이 정반대로
  보일 수 있다 — 사용자도 이 트레이드오프를 이미 인지하고 있는지 확인하고
  가는 게 안전하다(직접 묻지는 않았음, 필요하면 물어볼 것).

#### 2. 월세 유형 합산 대신 선택형(원룸만/원룸+오피스텔 등)으로 전환

- **근거**: 이번 세션에 3개 구 실측 — 아파트가 단독·다가구보다 1.4~2.0배
  비쌈(강남 75.5→135.8만원, 마포 68.7→137.1만원, 노원 49.3→90.2만원).
  "원룸+오피스텔+아파트 합산은 편차가 너무 크다"가 사용자의 판단.
- **기초 데이터는 이미 있다**: 방금 배포한 `rentByType`
  (house/officetel/apartment 별 중앙값·표본수, `DongRawMetrics.rentByType`)이
  그대로 이 기능의 원재료다. 세 유형을 이미 나눠서 갖고 있다.
- **진짜 막히는 지점 — 백분위 재계산**: `CLAUDE.md`의 "백분위는 파이프라인
  값을 씁니다" 원칙(`4-score.mjs`가 `pct` 배열을 미리 계산해 번들에 싣고,
  클라이언트는 그 값을 그대로 씀 — 동점 처리가 클라이언트 재계산과 미세하게
  어긋나기 때문)과 정면으로 부딪힌다. 사용자가 유형 조합을 그때그때 고르면
  그 조합 기준 백분위를 다시 매겨야 하는데, 두 갈래뿐이다:
  - (a) 원룸/오피스텔/아파트의 **공집합 아닌 부분집합 7가지**를 파이프라인이
    전부 미리 계산해 번들에 싣는다(조합마다 547개 동 백분위 배열 하나씩 —
    번들이 커지지만 동점 처리 원칙은 안 깨짐).
  - (b) `rentByType`의 원값으로 **클라이언트가 그때그때 재계산**한다(가중치
    슬라이더처럼 즉시 반응하지만, "동점 평균 순위가 미세하게 어긋난다"는
    CLAUDE.md가 경고한 문제를 그대로 안게 됨).
  - 아직 어느 쪽으로 할지 결정 안 됨 — 착수 전에 사용자와 논의 필요.
- 가격 축 점수·등급 컷이 유형 조합에 따라 통째로 움직이므로, 실제 분포를
  몇 가지 조합으로 미리 재보고 사용자에게 보여준 뒤 착수하는 게 안전하다.

#### 공통 유의사항

- 둘 다 `src/lib/score.ts`의 `GRADE_CUT`(상위 30%/하위 30%) 자체는 안
  바뀌지만, 그 컷을 가르는 **점수 분포**가 바뀐다 — "가중치 바꾸면 분포가
  통째로 이동한다"는 기존 원칙과 같은 이유로 신중해야 한다.
- 관련 파일: `scripts/3-metrics.mjs`(`fetchRent`, `toMonthly`, `ENDPOINTS`),
  `scripts/lib/rent.mjs`(`typeBreakdown`, `RENT_TYPES`), `scripts/4-score.mjs`
  (`pct` 계산 위치), `src/types.ts`(`RentByType`, `DongRawMetrics`),
  `src/components/DongDetail.tsx`(`rentByTypeText`).
- 참고 문서: `docs/data.md`의 "환산월세는 세 주택유형을 합친 값입니다" 절에
  이번 실측 근거가 이미 정리돼 있다.

사용자가 "환산월세가 원룸이랑 아파트를 합친 거 아니냐"고 질문 → 3개 구
실거래를 직접 유형별 조회해 확인(아파트가 단독·다가구보다 1.4~2.0배
비쌈) → AskUserQuestion으로 4개 선택지 제시 → 사용자가 "점수는 유지,
상세 패널에만 유형별 분해 표시"를 선택. `rentByType`(house/officetel/
apartment 별 중앙값·표본수)을 raw 지표에 추가하고 상세 패널 가격 축에
노출한다. 점수·등급 계산(`monthlyRentMan`)은 안 건드려서 등급 상위·하위
5개 동이 재생성 전후 동일함을 확인했다. `data:metrics`를 다시 돌려서
267,500건 실거래를 새로 받았다(라이브 API라 지난 재생성과 표본이 자연히
조금 다르다 — 이상 아님).

**배포하려면**: `npm run data:seed` → `npm run cf:deploy` (둘 다 별도 승인 필요).

### PR #6 이후 후속 수정 2건 (커밋·푸시·배포까지 완료)

1. **`815b964` SEO 랜딩 카피가 버스 접근을 빼먹고 있던 것을 고침** — 버스 기능
   (#6)이 SEO 랜딩(#5)보다 나중에 머지돼서 "역+도보만 계산한다"는 문구가
   기본/판교/강남 가이드에 남아 있었다. 특히 판교 페이지가 아이러니했다 —
   34분 도보 문제를 고치려고 버스를 넣었는데 그 페이지 FAQ는 여전히 도보만
   언급. `landingVariants.ts` + 정적 사본 3곳(`index.html`,
   `guide/pangyo-commute/`, `guide/gangnam-commute/`)을 동기화. 신분당선
   가이드는 애초에 틀린 주장이 없어 안 건드림.
2. **`70b61c7` 히어로 제목 고아 줄 수정** — 사용자가 강남 가이드 스크린샷으로
   "면" 한 글자가 혼자 다음 줄에 떨어지는 것을 신고. `.hero-lead`엔
   `word-break: keep-all`이 있었는데 `.hero h1`엔 빠져 있었다. 같은 속성 +
   `text-wrap: balance` 추가. **주의**: `cf:dev`(wrangler dev)는 `dist/`의
   미리 빌드된 자산을 서빙하므로 CSS만 고치고 `npm run build` 없이 새로고침하면
   반영 안 됨 — 실제로 한 번 이걸로 헛돌았다. 430~1900px·강남/판교/기본
   3페이지 전부 실제 Chrome으로 재확인.

### 버스 첫·마지막 접근 + SGIS 100m 인구분포 (PR #6) — 완료, 배포 완료

Codex가 격리 worktree(`/tmp/i-dont-know-seoul-bus-access`, `feat/bus-first-last-mile`)에서
구현하고 `claude-feedback/BUS_FIRST_LAST_MILE_REVIEW.md`로 리뷰를 요청했습니다.
Claude가 6개 핵심 질문(v4 스키마 좌표 누출 여부, 구간 합=총시간 불변식, 파이프라인·
런타임 공식 대조, 제품 가정 일치, `walkToStationMin` 전파, 원자료·키·SGIS 조건)을
실제 재계산·재실행으로 독립 검증했고, README·docs 예시 수치도 전부 실제 번들과
대조해 일치를 확인했습니다. 검증 과정에서 `residential-quality.test.ts`가 기본
5000ms 타임아웃 경계에서 flaky한 것을 발견해 20초로 늘려 별도 커밋으로 고쳤습니다.

작업 단위별 8개 커밋으로 나눠 커밋 → push → PR #6 생성까지 Claude가 진행했고,
**PR은 사용자가 직접 GitHub에서 머지했습니다**(`mergedBy: zzl-hyun`, 06:05 UTC).
로컬 `main`은 이후 `git pull --ff-only`로 맞췄습니다.

- 판교역 → SK AX 마지막 접근: 도보 34분 → 버스 약 17.8분
- SK AX 기준 55분 통근권: 7개 → 76개 동
- 양재1동 83.8→54.8분·양재2동 60.3→43.0분·서초2동 64.1→45.8분
- 기본 가중치 기준 등급 변동 22/547개 동, Best↔Bad 극단 변화 0개
- 공개 번들 6.86MB(gzip 1.90MB), 거주 프로필 13,068개 전부 좌표 없음(v4 스키마)

**완료된 절차 (2026-08-12 15:1x KST, Claude, 사용자 승인 받음):**

1. ✅ `npm run data:seed` (원격 KV 갱신)
2. ✅ `npm run cf:deploy` — Worker Version ID `aa5d1360-5e1c-4b38-9599-746adeb10ecb`
3. ✅ 운영 `/api/data` 확인: HTTP 200 · `X-Oneday-Source: kv` · 버스 41,423/2,943 ·
   `residential.version: sgis-2024-100m-bus-v4` 정상 서빙
4. ✅ 격리 worktree `/tmp/i-dont-know-seoul-bus-access` 제거 완료(`git worktree
   remove`), 로컬 브랜치 `feat/bus-first-last-mile`도 삭제. **원격 브랜치
   (`origin/feat/bus-first-last-mile`)는 아직 남아 있음** — 안 지웠음, 원하면 별도 요청

**아직 안 한 것 — 사용자가 직접 하기로 함:**

- **SGIS 신청조건 이행**: 화면·문서 출처표시는 이미 되어 있음. 운영 URL이
  확정됐으니 [SGIS 자료제공 활용결과](https://sgis.mods.go.kr/view/pss/dataProvdIntrcn)에
  운영 URL(`https://i-dont-know-seoul.cioud.workers.dev`) 사본 1부를 제출해야
  합니다. **사용자가 직접 처리하기로 함(2026-08-12) — Claude/Codex는 이 항목을
  대신 처리하지 않습니다.**

`data:seed`·`cf:deploy`는 매번 별도 승인 없이 실행하지 않습니다(세션·이전
승인 이력과 무관, 이번 승인은 이번 배포 1회에만 유효).

### 병합 결과 브라우저 검증 (2026-08-11 18:10, Claude)

AGENTS.md에 "headless Chrome은 MapLibre WebGL 초기화 제한으로 확인 불가"로
남아 있던 검증을 **실제 Chrome**(claude-in-chrome)으로 `127.0.0.1:8787`에서
마쳤습니다. 두 브랜치를 합친 상태를 아무도 실행해 본 적이 없어서 확인했습니다.

- 탭 전환: 추천 목록에서 사근동 클릭 → `상세 정보` 탭 활성화·스크롤 이동 정상
- 상세 상단 요약: 종합 67.8 / 치안 64 · 가격 79 · 생활편의 59 렌더 정상
- `계산 근거 전체 보기` 아코디언: 펼침 정상, 치안 63.5 = 60×0.38 + 62×0.46 +
  76×0.15 계산식 표시. **유흥업소 서울 중앙값이 1.81개/km² 로 나와 소상공인
  교체 데이터가 실제로 흐르는 것을 확인**
- 통근 경로 분리 섹션 정상, 지도에 지하철 구간과 **도보 구간 점선** 모두 렌더
- 추천 0개 상태(`?budget=40`): 높이 유지, 원인을 월세로 정확히 판별해
  `월세 제한 해제` 버튼 표시, 아래 공유 영역 안 밀림
- 지도 attribution 실제 표기 확인 (아래 CODE_REVIEW 오탐 항목 참고)

### CODE_REVIEW.md 의 "상태: 미수정" 표시는 전부 리뷰 시점 값입니다

문서가 갱신되지 않아 10개 항목이 모두 `미수정` 으로 남아 있지만, **실제로는
1~8번이 이미 수정돼 있습니다.** 코드에서 직접 확인한 결과(2026-08-11 18:15):

| # | 항목 | 실제 상태 | 근거 |
| --- | --- | --- | --- |
| 1 | 공유 URL 목적지 3개 우회 | 수정됨 | `shareUrl.ts:81` `MAX_DESTINATIONS` 로 자름 |
| 2 | 다중 목적지 툴팁 불일치 | 수정됨 | `App.tsx:227` worstMin 을 만든 목적지 객체를 그대로 씀 |
| 3 | 목적지 미선택 시 툴팁 오표시 | 수정됨 | `MapView.tsx` `hasDestination` 을 툴팁까지 전달 |
| 4 | 지오코딩 프록시 방어 부족 | 수정됨 | `worker/index.ts` GET-only 405 · 길이 제한 · `AbortSignal.timeout` · `allSettled` |
| 5 | 번들 런타임 검증 부재 | 수정됨 | `data.ts:49` `assertValidBundle` 호출 |
| 6 | 동점 등급이 배열 순서에 의존 | 수정됨 | `score.ts:56` 점수 동점 시 `code` 로 결정적 정렬 |
| 7 | station 캐시 무효화 | 수정됨 | `worker/index.ts:287` 10분 TTL |
| 8 | 반올림 가중치로 공식 어긋남 | 수정됨 | `4-score.mjs:198` 반올림 없이 `p.weight / wSum` |
| 9 | 지도 attribution 불일치 | **오탐** | 아래 참고 |
| 10 | 개발 의존성 npm audit | **미수정(사용자 판단 필요)** | `--omit=dev` 는 0건, `fix --force` 가 mapshaper breaking downgrade 제안 |

즉 남은 실제 작업은 10번뿐이고, 그건 임의로 실행하면 안 됩니다.

### CODE_REVIEW.md 항목 9는 오탐입니다 — 고치지 마세요

"지도 attribution이 README 표기와 불일치(© CARTO 누락)"로 적혀 있으나, 실제
화면에는 `경계 © 통계청 SGIS · 지하철 © OpenStreetMap | © CARTO, © OpenStreetMap
contributors` 가 정상 표시됩니다(브라우저에서 확대 확인).

`MapView.tsx:184` 의 `attributionControl: false` 는 **지도 생성 시 자동으로 붙는
기본 컨트롤만** 끕니다. 그 다음 줄에서 수동으로 추가한 `AttributionControl` 은
`customAttribution` 과 **스타일 소스에 선언된 attribution 을 함께** 표시하므로,
CARTO 베이스맵의 표기가 그대로 나옵니다. 코드를 고치면 오히려 중복 표기가 됩니다.

남은 실제 미수정 항목은 **10번(개발 의존성 npm audit)** 뿐입니다. `npm audit
--omit=dev` 는 0건이고, `npm audit fix --force` 가 mapshaper breaking downgrade
를 제안하므로 사용자 판단이 필요합니다 — 임의로 실행하지 마세요.

### 이번 세션에서 추가로 확인·수정한 것 (Claude, 사용자 부재 중)

- **`Edge.source` 의 `measured` 는 어디서도 생성되지 않습니다.** `2-subway.mjs`
  가 `estimated` 만 만들어서 ride 엣지 1,496개가 전부 추정값입니다. 따라서
  `hasEstimatedLeg` 는 도달 가능한 모든 경로에서 **항상 true** 이고, 이 값으로
  경로별 "추정" 배지를 달면 전부에 똑같이 붙어 정보가 되지 않습니다. 상세
  패널이 일괄 문구를 쓰는 게 현재로선 맞습니다. 필드는 나중에 역간 실측
  데이터를 넣을 자리로 남겨두고 주석만 사실과 맞췄습니다 (`60c2c45`).
  → 실측 소요시간 데이터를 붙이는 건 통근 모델 자체를 건드리는 일이라
    사용자 논의가 필요합니다. 임의로 착수하지 마세요.
- **상가업소 업종 분류 규칙을 `scripts/lib/sbiz.mjs` 로 모으고 테스트를
  붙였습니다** (`f3947f4`). "food 와 nightlife 는 절대 겹치지 않는다"는
  불변식이 깨져도 예외가 안 나고 등급 분포만 조용히 움직이는데, 규칙이
  `3-metrics.mjs` 안에 있어 테스트를 못 붙이는 상태였습니다(그 파일은 import
  시점에 `await main()` 이 돕니다). 캐시된 554,092건 전수로 이동 전후 분류
  결과가 동일함을 확인했습니다(불일치 0).
- 테스트 개수 표기를 실제와 맞췄습니다 (`9b31964`, 이후 86개로 재갱신).

## Claude Resume Brief — 오른쪽 패널 UI

> **ㅎㅇ Claude, 너 자는 동안 나 이런 일 했어.** 오른쪽 패널을 상세/추천 탭으로
> 재구성하고 계산 근거를 위로 올렸어. 월세를 극단적으로 낮춰 추천이 0개가 될 때
> 컴포넌트가 튀는 문제도 고쳤고, 사용자가 실제 브라우저에서 직접 확인해 정상 동작까지
> 확인했어. 아래는 네가 그대로 이어받기 위한 정확한 상태와 주의사항이야.

### 이번 작업의 사용자 요구

1. 오른쪽 상세 패널의 `계산 과정`을 위로 올려 결과를 빠르게 검산할 수 있게 한다.
2. 검색·목적지 입력은 유지하면서 긴 상세 정보와 조건·추천 목록이 한 열에서 뒤섞이지
   않도록 오른쪽 패널 구조를 개선한다.
3. 월세 슬라이더를 극단적으로 낮춰 추천 지역이 0개가 될 때, 10개 목록이 안내문 한 줄로
   축소되며 아래 컴포넌트가 순간 이동하는 불편을 없앤다.

### 구현된 동작

- 공통 검색·목적지 영역 아래에 `상세 정보 | 조건·추천` 탭을 추가했습니다.
- 지도나 추천 목록에서 동을 선택하면 상세 탭으로 전환되고 탭 시작 위치로 스크롤됩니다.
- 선택을 해제하거나 마지막 목적지를 지우면 조건·추천 탭으로 안전하게 돌아갑니다.
- 탭은 `tablist/tab/tabpanel`, `aria-selected`, 좌우 방향키·Home·End 포커스 이동을
  포함합니다. 선택한 동이 없으면 상세 탭은 비활성화됩니다.
- 상세 상단에는 종합 점수와 치안·가격·생활편의 3축을 먼저 요약합니다.
- 기존 축별 `계산 과정` 네 묶음을 `계산 근거 전체 보기` 아코디언 하나로 합쳤습니다.
  원지표 → 백분위 → 축 가중합 → 종합 기여도 → 등급 컷 순서가 한 번에 이어집니다.
- 통근 경로는 계산 아코디언 아래의 별도 `통근 경로` 섹션으로 분리했습니다.
- 추천 후보 계산 시 월세 적용 전 `commuteEligibleCount`를 세어 빈 결과의 원인이
  통근인지 월세인지 구분합니다.
- 월세 원인이면 `월세 제한 해제`, 통근 원인이면 `통근 한계 15분 늘리기` 버튼을
  보여줍니다. 통근 상한 90분에서는 더 늘리는 버튼을 숨깁니다.
- 추천 영역은 후보가 0~10개여도 `min-height: 400px`를 유지합니다. 월세 설명도 항상
  렌더링하고 50px를 확보하며, 사이드바에는 `scrollbar-gutter: stable`을 적용했습니다.
  따라서 추천 목록·설명·스크롤바의 생성과 소멸로 아래 공유 영역이 튀지 않습니다.

### 파일별 변경점

- `src/App.tsx`
  - `SidebarTab`, `sidebarTab`, `sidebarRef`, `sidebarTabsRef` 추가
  - `scrollSidebarToTabs`, `showSidebarTab`, `selectDong`으로 선택·탭·스크롤 동작 통합
  - 상세/추천 패널을 조건부 `tabpanel`로 분리
  - `picks` 계산 결과에 `commuteEligibleCount` 추가
  - 월세 설명을 조건부 DOM에서 상시 DOM으로 변경
  - `TopPicks`에 빈 결과 원인과 완화 콜백 전달
- `src/components/DongDetail.tsx`
  - 종합 및 3축 `score-overview` 추가
  - 축별 계산을 단일 `calculation` 아코디언으로 재구성
  - 통근 경로를 `detail-route`로 분리해 계산 근거 다음에 배치
- `src/components/TopPicks.tsx`
  - `emptyReason`, `canExpandCommute`, 두 완화 콜백 prop 추가
  - 0개 상태에서도 동일한 추천 섹션 제목·높이 유지
  - 원인별 안내와 즉시 복구 버튼, `role="status"` 추가
- `src/index.css`
  - 탭·점수 요약·통합 계산·통근 경로 스타일 추가
  - `.top-picks`, `.picks-empty`, `.picks-empty-action`, `.budget-note` 추가
  - `.sidebar`에 안정적인 스크롤바 여백 추가

### 검증 근거

- `npm test`: 7개 파일, **79/79 통과**
- `npm run typecheck`: 통과
- `npm run build`: 통과. 기존과 같은 500kB 초과 청크 경고만 있으며 실패가 아닙니다.
- `git diff --check`: 통과
- 자동 headless 확인은 MapLibre가 소프트웨어 WebGL 컨텍스트를 만들지 못해 앱을
  언마운트하여 중단했습니다. 변경 코드 오류가 아니라 headless 환경 제한입니다.
- 이후 사용자가 실제 브라우저의 `5173`에서 월세 슬라이더를 직접 조작해 “잘 된다”고
  확인했습니다. 수동 UI 확인은 완료 상태입니다.

### 현재 런타임과 Git

- 수동 검증에 쓴 `http://127.0.0.1:5173` Vite 서버는 인수인계 직전에 종료했습니다.
  다시 볼 필요가 있으면 `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`를
  실행하세요.
- Vite의 `/api`가 프록시하는 `http://127.0.0.1:8787`의 Claude 소유 workerd는 계속
  실행 중입니다. 이 프로세스는 재시작할 필요가 없습니다.
- 브랜치: `feat/sidebar-detail-tabs`; HEAD: `ee672c1`; upstream 없음
- tracked 미커밋: `App.tsx`, `DongDetail.tsx`, `TopPicks.tsx`, `index.css`
- 위 4개 파일 diff 합계: 686 insertions, 209 deletions. 이 수치는 탭/상세 재구성과
  추천 안정화가 모두 포함된 HEAD 대비 누적 diff입니다.
- `AGENTS.md`를 포함한 인수인계 문서 4개는 미추적입니다. UI 커밋에 자동으로 섞지
  말고, 문서도 Git에 넣을지는 사용자에게 별도로 확인합니다.
- 커밋·push·PR·최신 UI 배포는 아직 하지 않았습니다.

### Claude가 이어서 할 정확한 순서

1. `git status --short --branch`로 위 상태가 그대로인지 확인합니다.
2. `git diff -- src/App.tsx src/components/DongDetail.tsx src/components/TopPicks.tsx src/index.css`
   로 4개 UI 파일 전체를 리뷰합니다. 다른 미추적 문서는 건드리지 않습니다.
3. 추가 수정 요청이 없다면 코드 작업은 끝난 상태입니다. 사용자에게 커밋 범위와
   커밋 메시지를 먼저 보고하고, 승인받은 경우에만 명시적 파일 경로로 stage합니다.
4. 커밋 전 `npm test && npm run typecheck && npm run build`와 `git diff --check`를
   다시 실행합니다.
5. push·PR·배포는 각각 별도 요청으로 취급합니다. 특히 배포는 아래 Deployment Gate를
   모두 만족해야 하며, 현재 미커밋 상태에서는 절대 실행하지 않습니다.

### 분리된 데이터 작업 주의

`/private/tmp/idks-nightlife.HsXszI`의 `feat/sbiz-nightlife`는 별도 clean worktree이며
`7d52ad5`, `4604b2b` 두 커밋이 있습니다. 이 UI 브랜치에 섞거나 cherry-pick하지
마세요. 데이터 브랜치의 push와 seed→deploy 역시 사용자 별도 승인이 필요합니다.

## Agent Slots

### Claude

- Status: done — Codex의 버스 첫·마지막 접근 + SGIS 100m 인구분포 작업을 리뷰·커밋·
  push·PR까지 완료. PR #6은 사용자가 직접 머지함
- Owned files: 없음 (PR이 머지되어 격리 worktree 작업이 `main`에 합쳐짐)
- Last result:
  1. `claude-feedback/BUS_FIRST_LAST_MILE_REVIEW.md`가 요청한 6개 질문을 실제
     번들 재파싱·재계산으로 독립 검증(v4 스키마 좌표 0건, leg 합=총시간 정확히
     일치, 파이프라인·런타임 공식 12개 상수 전부 대조, UI 문구·15분 트리거 일치,
     `walkToStationMin` 전파, 키 유출 0건). 판교/양재1·2동/서초2동/55분 필터/
     등급 변동 22개·극단 0개까지 전부 직접 재현해 보고서 수치와 정확히 일치 확인
  2. 커밋을 작업 단위 8개로 분리(버스망 수집 → SGIS 인구 정규화 → 통근 엔진 →
     파이프라인 연결 → UI → 산출물 재생성 → 문서 → 테스트 타임아웃 수정).
     `residential-quality.test.ts`가 기본 5000ms 타임아웃 경계라 부하에 따라
     flaky한 것을 재검증 중 발견해 20초로 늘리는 커밋을 추가함
  3. README·docs/commute.md·docs/data.md·docs/scoring.md의 예시 수치(노량진1동
     순위·등급 점수·경로, 성동구 예시 축 점수·등급 컷)를 실제 재계산과 전수
     대조 — 전부 일치
  4. `git push` 후 `gh pr create`로 PR #6 생성. 이후 사용자가 GitHub에서 직접
     머지(`mergedBy: zzl-hyun`)한 것을 확인하고 로컬 `main`을 `git pull --ff-only`
     로 맞춤
  5. 병합된 `main`에서 `npm test`(178/178, SGIS 원자료 없어 1개 skip 정상) ·
     `npm run typecheck` 재확인
- Verification: 위 항목 전부 실제 명령 재실행·재계산으로 확인(자기보고 신뢰 안 함)
- Commit/remote: `e83eeba`~`12111e8`(8개, `feat/bus-first-last-mile`) → PR #6 →
  `79cc035`(머지)로 `origin/main`과 일치
- Next handoff: 배포까지 전부 완료(위 "Current Shared State" 참고). 남은 건
  SGIS 활용결과 URL 제출뿐이고 사용자가 직접 하기로 함 — Claude/Codex가 대신
  처리하지 않는다. 격리 worktree·로컬 브랜치는 정리 완료.

### Codex

- Status: done — 버스 첫·마지막 접근 + SGIS 100m 인구분포 구현 완료, Claude 리뷰
  통과, PR #6으로 머지됨. 격리 worktree는 더 이상 활성 작업 없음
- Task (완료): 도보 15분 초과 구간에 서울·경기 공식 버스 노선 기반 정적 접근시간을
  추가하고, 동 대표점 한 점 대신 실제 거주 인구 지점 분포로 출발 접근시간을 계산한다.
- Changed (머지된 결과):
  1. 경기 GBIS 2,225개 + 서울 `busRteInfo` 718개, 총 2,943개 노선·41,423개
     정류소를 정적 번들로 만들었다. 직접 도보 15분 초과일 때 양끝 450m 안의 같은
     방향 직행 노선만 찾아 도보+기대대기+거리/15km/h+정류장 정차로 환산한다.
  2. SGIS 2024 총인구 100m 격자 43,780개(12,262,398명)를 547/547개 동에
     배정하고 43,751개 접근 프로필을 동별 최대 24개·총 13,068개로 집약했다.
     목적지별 최적 역을 프로필마다 고른 뒤 인구 가중 중앙 통근시간을 동 대표값으로 쓴다.
  3. 공개 거주 프로필을 `sgis-2024-100m-bus-v4`로 올리고 `[가중치, 접근목록]`만
     직렬화해 원 셀·군집 대표 좌표를 전부 제거했다. 저장한 노선·승하차 순번·첫
     도보시간으로 좌표 없이도 버스 상세를 복원하며, 첫 집 쪽 지도선만 생략한다.
  4. 판교역→SK AX 마지막 접근은 34분 도보에서 `602-1B` 기준 약 17.8분으로,
     55분 통근권은 7개에서 76개로 회복됐다. 양재1동 83.8→54.8분,
     양재2동 60.3→43.0분, 서초2동 64.1→45.8분이다.
  5. 공개 번들은 6,864,403 bytes(gzip 1,903,279)이며 13,068개 프로필의 튜플
     길이가 모두 2임을 실제 Worker 응답에서도 확인했다.
- Verification: 자체 검증(`npm test` 167/167 등)에 더해 Claude가 독립 재검증까지
  완료 — 위 Claude 슬롯 참고.
- Commit/remote: `feat/bus-first-last-mile` → PR #6 → `main`(`79cc035`)에 머지 완료.
- Review report: `claude-feedback/BUS_FIRST_LAST_MILE_REVIEW.md` (리뷰 완료, 재사용 불필요)
- Next handoff: 없음 — 이 작업은 종료. 새 작업을 받으면 새 슬롯 내용으로 갱신할 것.

## Git and Deployment Gate

배포는 다음 조건을 **모두** 충족할 때만 실행합니다.

1. `git status --short --branch`와 전체 diff를 확인합니다.
2. 배포할 소스는 커밋되어 있어야 하며, 미커밋 tracked 변경이 있으면 중단합니다.
3. 배포 브랜치·정확한 commit SHA·포함 변경을 사용자에게 알리고 명시적 승인을 받습니다.
4. `npm test`, `npm run typecheck`, `npm run build`를 통과합니다.
5. 데이터 변경 유무와 관계없이 현재 운영 절차는 `npm run data:seed` 후
   `npm run cf:deploy` 순서를 지킵니다.
6. 배포 후 운영 `/api/data`가 HTTP 200, `X-Oneday-Source: kv`인지 확인하고
   데이터 버전·Worker version ID를 이 파일에 기록합니다.

**금지:** 세션 한도가 충분하다는 이유, 빌드가 성공했다는 이유, 사용자가 이전에
배포를 허용했다는 이유만으로 새 작업트리를 배포하지 않습니다. 매 배포마다 현재
SHA와 clean 상태를 새로 확인하고 승인을 받습니다.

## Handoff Update Template

각 에이전트는 자기 슬롯만 아래 형식으로 갱신합니다.

```text
- Status: working | blocked | ready for review | done
- Task: 한 줄 목적
- Owned files: 정확한 경로 목록
- Changed: 사용자에게 보이는 결과
- Verification: 실행한 명령과 결과
- Commit/remote: SHA와 push 여부, 없으면 uncommitted
- Next handoff: 다음 에이전트가 해야 할 한 가지
```
