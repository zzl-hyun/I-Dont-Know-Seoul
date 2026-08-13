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

마지막 확인: **2026-08-13 23:58 KST** (Claude, UI/UX 개선 5건 + 지도 페이드 작업 후 배포까지 완료)

| 항목 | 현재 상태 |
| --- | --- |
| 공용 작업트리 | 이 세션은 `/Users/mac/Desktop/Project/Oneday` (다른 기기). 시작 시 `main`이 origin보다 **61커밋 뒤처져** 있어 `git merge --ff-only origin/main`으로 맞춤 |
| 현재 브랜치 | `main` |
| **HEAD (배포 완료)** | **`ca54bfd` fix(map): 동 색·불투명도 페이드를 직접 구현한다** |
| `origin/main` | `a504aa2` — 로컬 커밋 **8개 미push**(아래 세션 요약 참고). 배포는 `git push`가 아니라 `wrangler deploy` 직접 실행으로 이미 나갔다 — push 여부와 무관하게 운영엔 반영돼 있음 |
| 미커밋 tracked | 없음 (clean) |
| 미추적 유지 | `Research on Advanced Regional Scoring Methods.md` — 의도적으로 유지, 커밋 대상 아님 |
| 최근 검증 | `npm test` **233 passed / 2 skipped (235)**, `npm run typecheck`·`npm run build`·`git diff --check` 전부 통과(2026-08-13 23:53) |
| 운영 배포 | **완료.** Worker Version ID `b07dab9c-0a4f-45d7-bb05-b5fcbcf698b8`. `npm run data:seed` 실행함(번들 내용 자체는 이번 세션에서 안 바뀜 — 프론트만 건드림). 배포 후 `/api/data` HTTP 200 · `X-Oneday-Source: kv` 확인함 |

> 테스트 수가 236 → 235로 준 건 회귀가 아니다. `src/lib/__scratch_munjeong.test.ts`
> (미추적 스크래치 1개)를 조사 후 지운 것이 반영된 값이다.

### UI/UX 개선 5건 + 지도 페이드 (2026-08-13, Claude) — 구현·배포 완료

계획 파일: `docs/plans/ux-improvements-5.md` (구현 중 번복된 항목 2a를 그 문서
상단에 명시해 뒀다 — 아래 참고). 8개 커밋, 전부 `main`에 직접 커밋:

| # | 내용 | 커밋 |
|---|---|---|
| 1 | 마커 `minzoom` 12.2 — 줌아웃에서 동 아이콘 숨김 | `142594d` |
| 2a | 목적지 없이도 전 지역 등급색 표시 → **사용자가 실사용 후 번복, 되돌림** | `3e19f29` → `da9a202`(되돌림) |
| 2b | 통근 기본값 90→40분 복귀 (2a와 무관하게 유지) | `b9f62c1` |
| 3 | 추천 목록 ↔ 지도 hover 양방향 연동 | `0c7b138` |
| 4 | 가격 축 설명 압축(5줄 → 접이식 3열 그리드) | `364c316` |
| 5 | 검색 시 지도 색 페이드인 + 목적지 마커 물결 펄스 | `6e1ee85` → `ca54bfd`(재구현) |

**항목 2(목적지 없을 때 전 지역 등급색)는 계획서에 사용자가 명시적으로 확정한
내용이었지만, 배포 후 실사용해 보고 "굳이 필요 없다"고 판단을 바꿨다.**
`da9a202`가 `MapView.tsx`의 `hasDestination` 게이트, `shareUrl.ts`의
mode 가드, 안내 문구를 전부 원래대로(목적지 없으면 회색) 복원했다.
**계획 문서와 실제 코드가 이 지점에서 어긋나 있으니, 이 문서를 안 보고
`docs/plans/ux-improvements-5.md`만 참고하면 헷갈린다** — 그 문서 상단에
번복 사실을 적어 뒀다.

**항목 5는 한 번에 안 됐다 — 순서대로 겪은 문제와 수정:**
1. 처음엔 MapLibre의 `fill-opacity-transition`/`fill-color-transition`
   (네이티브 옵션)을 걸었는데(`6e1ee85`), **배포 후 사용자가 "페이드 안 보인다"고
   보고**. 원인 조사 결과 이 옵션은 `setPaintProperty`로 스타일 자체를 바꿀 때만
   적용되고, 이 앱처럼 `setFeatureState`로 동별 상태를 바꾸는 경로에는 전혀
   안 걸린다는 걸 확인(GPU가 feature-state를 매 프레임 직접 읽어 평가).
2. `requestAnimationFrame`으로 직접 구현(불투명도만, 색은 스냅) → **사용자가
   "사라질 때 번쩍인다"고 보고**. 색이 즉시 회색으로 스냅한 채 불투명도가 아직
   안 내려가 있어 잠깐 밝은 회색이 번쩍이는 것으로 확인.
3. **색·불투명도를 같은 `fadeT`(feature-state)로 함께 보간**하도록 재구현
   (`ca54bfd`) — `fillColorExpr`/`fillOpacityExpr`를
   `interpolate(fadeT, prev, current)` 형태로 바꾸고, `scheduleFade()`가
   전환마다 `prevGrade`/`prevBand`/`prevReachable`/`prevOpacity`를 스냅샷한다.
   바뀐 동만 애니메이션 대상에 올려(547개 전체를 매번 다시 걸지 않음) 슬라이더
   드래그 시 성능 위험을 피했다. 지속시간은 사용자 요청으로 300→250→150→**200ms**
   최종 확정.
4. 브라우저 콘솔에서 `getFeatureState`를 매 프레임 폴링해 `fadeT`가 나타나는
   방향·사라지는 방향 모두 0→1로 선형 보간되는 것을 실측 확인(스크린샷이
   아니라 수치로 검증 — 300ms 이하 전환은 스크린샷 타이밍으로 못 잡는다).

**남은 절차**: 없음 — 배포까지 끝났다. 굳이 확인한다면 다음 세션이 브라우저로
목적지 검색·통근 슬라이더 드래그 시 페이드가 200ms로 자연스러운지 한 번
훑어보는 정도.

### 코덱스 월세 보강 작업 리뷰 (2026-08-13, Claude) — 통과

`7824799`~`9e041ec` 5개 커밋을 독립 검증했다(자기보고 신뢰 안 함). 결과:

**검증 통과**
- 15조합 × 2모드 완전성: 547동 × 30칸 = 16,410칸 **빠짐 0**
- 기준조합(3종 환산) = `monthlyRentMan` **불일치 0/547**
- `data.ts`가 번들 로딩 시 조합 누락·기준값 불일치를 던지는 런타임 방어 추가 — 좋은 보강
- 통근 기본값 40→90분 처리(Claude가 Phase B 프롬프트에서 빠뜨렸던 항목을 코덱스가 챙김)
- 기본값을 단독·다가구로 바꾼 판단이 데이터로 정당: p10~p90이 42~65만원으로
  좁아진다(3종 합산은 51~100, 아파트 단독은 p90 191만원)

**리뷰 중 발견해 이번 커밋(`6e75f05`)에서 고친 것**
- 서울 2025 원본 파일의 행 중복 결함이 문서에 없었음 → CLAUDE.md·docs/data.md에
  실측 수치와 함께 남김(제일 중요, 아래 참고)
- `docs/data.md` 번들 크기가 실측과 달랐음(8.07MB → 7.69MB)
- 상세 패널 하단 표본부족 경고가 번들 기준 조합만 봐서 13개 동에서 안 뜸

**연립·다세대를 다가구/아파트에 합칠지 검토 → 분리 유지가 맞음**
같은 면적 기준(10~40㎡)인데 순위상관이 house↔rowhouse 0.581로 house↔officetel
0.564와 사실상 같고, 체계적으로 1.32배 비싸다. 게다가 둘 다 표본 있는 412개 동에서
연립·다세대 비중이 p10 10%~p90 63%로 제각각이라, 합치면 시세가 아니라 재고
구성을 재게 된다 — 사용자가 "3종 합산은 편차가 크다"고 지적한 문제의 반복이다.

### 추천 품질·UX 개선 8건 (2026-08-13) — 구현·리뷰·push 완료, 배포 대기

계획 파일: `/Users/macbookpro/.claude/plans/claude-md-serialized-frog.md`(승인된
전체 계획, 8건 각각의 설계 근거·검증 결과가 자세히 남아 있다). 사용자가 배포된
서비스를 직접 써보고 제기한 6건 + 이전 세션에 AGENTS.md에 남겨뒀던 미결 2건
(환산월세 on/off, 월세 유형 선택형)을 합쳐 총 8건. 서브에이전트(Sonnet 5,
Phase별 1개)로 나눠 구현하고 Claude가 전부 독립 재검증했다.

| # | 내용 | 커밋 |
|---|---|---|
| 1 | 목적지 검색 — 메인 검색창은 교체, "+목적지 추가"만 누적 | `94a7366` |
| 2 | 계산 근거 아코디언 기본 펼침(동 전환 시 리마운트) | `1a2f6a1` |
| 3 | 통근 페널티 Φ(t) 종합점수에 곱셈(비보상적), 통근 기본값 40→90분 | `0b99f71`, `77567a5`(회귀 테스트 보강) |
| 4 | 월세 유형 조합(7)×환산모드(2)=14가지 파이프라인 사전계산 | `6fa0125`, `23c215e` |
| 5 | 월세 유형·환산모드 선택 UI(사이드바 체크박스+토글) | `eb0b425`, `192da61` |
| 6 | 동 마커를 폴리곤 대표점 대신 최대 인구 100m 셀로 | `448d8f7`, `0a0d39b` |

리서치 문서(`Research on Advanced Regional Scoring Methods.md`) 채택 범위:
비선형 통근 페널티(Φ)와 곱셈(비보상적 결합) 2가지만 채택, NAM·쇼케적분·WASM·
절대기준점 정규화는 근거와 함께 기각(계획 파일 참고, 학습 라벨 없음·"계산
과정 전면 공개" 원칙과 충돌·기존 없는 문제 등).

**독립 검증에서 실제로 발견·수정한 것**(자기보고만 믿지 않고 전부 재확인):
- Phase B: 서브에이전트가 회귀 테스트를 스크래치로만 확인하고 커밋에 안 남김 →
  Claude가 `score.test.ts`에 9개 영구 테스트 직접 추가(`77567a5`), 상수 주석의
  검산표도 소수점 오차 발견해 정정
- Phase C 파이프라인: 번들 크기가 계획 추정(+92KB)보다 훨씬 크게(+480KB, raw
  JSON 기준) 늘어난 걸 발견 → gzip 실측(+32KB, 1.7%)으로 실제 전송 비용은
  미미함을 확인하고 구조는 유지하기로 판단
- Phase C UI: `explainAxis`가 `score[axis]`를 직접 읽는지 재계산하는지 직접
  코드 추적해 상단 배지·계산식이 어긋나지 않음을 확인(버그 아니었음)
- 모든 phase: 547개 동 실측 재계산으로 회귀 없음(목적지 미선택 시 완전
  동일)·의도대로 동작함(문정역 기준 장지동>공릉1동 등)·폴리곤 내부 등을
  전부 독립 검증. 수치는 계획 파일과 각 phase 커밋 메시지에 있다.

**남은 절차**:
1. **배포 승인 필요** — `npm run data:seed` → `npm run cf:deploy`
2. 배포 후 통근 페널티가 반영된 지도가 목적지별로 훨씬 크게 움직인다는 걸
   사용자에게 미리 안내함(문정역 하나로 등급 변동 345/547개, Best↔Bad 극단
   49개 — 자연스러운 변화지만 체감상 지도가 확 달라 보일 것)
3. 격리 작업 없이 전부 `main`에 직접 커밋했으므로 별도 정리(worktree 삭제 등)
   불필요

## Agent Slots

### Claude

- Status: done — UI/UX 개선 5건 + 지도 색 페이드 버그 수정까지 구현·검증·배포 완료
- Task: `docs/plans/ux-improvements-5.md`의 5건 구현. 배포 후 사용자 실사용
  피드백으로 항목 2 번복 + 페이드 애니메이션 2회 재작업
- Owned files: 이번 세션에서 건드린 파일 — `src/components/MapView.tsx`,
  `src/App.tsx`, `src/components/TopPicks.tsx`, `src/components/DongDetail.tsx`,
  `src/lib/constants.ts`, `src/lib/shareUrl.ts`, `src/lib/shareUrl.test.ts`,
  `src/index.css`, `CLAUDE.md`, `docs/plans/ux-improvements-5.md`. 지금은 후속
  작업이 없어 소유권 주장 안 함 — 다음에 건드릴 에이전트가 자유롭게 써도 됨
- Changed: 위 "UI/UX 개선 5건 + 지도 페이드" 절 참고. 요약하면 (1) 줌아웃 마커
  숨김 (2) 목적지 없을 때 회색 유지(원복) + 통근 기본 40분 (3) 목록↔지도 hover
  연동 (4) 가격 축 설명 압축 (5) 지도 색 페이드인 200ms·목적지 마커 펄스
- Verification: `npm test` 233/235(2 skip) · `npm run typecheck` · `npm run build`
  · `git diff --check` 전부 통과. 브라우저(Chrome, cf:dev + 실제 프로덕션 둘 다)로
  각 항목 시나리오 직접 클릭 확인. 페이드는 스크린샷이 아니라
  `map.getFeatureState()`를 매 프레임 폴링해 0→1 선형 보간을 수치로 검증(300ms
  이하 전환은 스크린샷 타이밍으로 못 잡는다는 걸 이번에 배움)
- Commit/remote: `142594d`~`ca54bfd`(8개, `main` 직접 커밋) — **origin/main에
  미push**. 배포는 `wrangler deploy` 직접 실행으로 이미 나갔으므로 push 여부와
  운영 상태는 별개
- Next handoff: 없음. 이 세션에서 발견한 교훈만 남긴다 — **MapLibre의
  `*-transition` paint 옵션은 `setFeatureState`로 바뀌는 값에는 안 걸린다**(오직
  `setPaintProperty` 스타일 교체에만 적용). feature-state 기반으로 뭔가를 부드럽게
  움직이려면 반드시 `requestAnimationFrame` + 수동 `interpolate` 표현식을 써야
  한다. 이 프로젝트는 등급색·불투명도를 전부 feature-state로 계산하므로(그래야
  547개 폴리곤이 즉시 반응한다), 앞으로 이 위에 애니메이션을 더 얹을 일이 있으면
  `MapView.tsx`의 `scheduleFade`/`FadeState` 패턴을 재사용할 것 — 새로 `-transition`
  옵션부터 시도하지 말 것(이미 한 번 겪었다).

### Codex

- Status: ready for deploy — 구현·감사·커밋 완료, 최종 SHA 승인 대기
- Task: 월세 실거래 데이터를 보강하고 선택값을 점수·문구에 연결하며 기본값과 UI를 정돈한다.
- Owned files: `AGENTS.md`, `package.json`, `package-lock.json`, `scripts/3-metrics.mjs`,
  `scripts/4-score.mjs`, `scripts/lib/rent.mjs`, `scripts/lib/rent.test.mjs`,
  `scripts/lib/rent-api.mjs`, `scripts/lib/rent-api.test.mjs`,
  `scripts/lib/rent-variants.test.mjs`, `scripts/lib/seoul-rent.mjs`,
  `scripts/lib/seoul-rent.test.mjs`, `src/types.ts`, `src/App.tsx`,
  `src/components/DongDetail.tsx`, `src/components/Landing.tsx`,
  `src/components/WeightPlayground.tsx`, `src/index.css`, `src/lib/data.ts`, `src/lib/data.test.ts`,
  `src/lib/constants.ts`, `src/lib/explain.ts`, `src/lib/explain.test.ts`, `src/lib/rent-selection.ts`,
  `src/lib/rent-selection.test.ts`, `src/lib/rent-bundle.test.ts`, `src/lib/shareUrl.ts`, `src/lib/shareUrl.test.ts`,
  `README.md`, `docs/data.md`, `docs/development.md`, `docs/scoring.md`,
  `data/dist/metrics.json`, `data/dist/scores.json`, `public/data/bundle.json`
- Changed: 빈 URL 월세 기본값을 단독·다가구 환산월세로 변경하고 번들 기준 3종
  점수와 분리했다. 기존 3종 선택은 공유 URL에 명시적으로 저장된다. 유형 선택은
  동일 폭 2×2 카드 그리드, 340px 미만 1열로 정돈했다. 마지막 한 유형의 해제 불가
  상태에서도 선택 카드·체크·글자가 회색으로 흐려지지 않도록 표시를 보강했다.
- Verification: `npm test` 236/236, `npm run typecheck`, `npm run build`,
  `git diff --check` 통과. 547개 동의 15조합×2모드 완전성·기준 3종 불변식과
  문정1동 화면 기본 variant 59.58만원·가격 16.4점 회귀를 독립 감사까지 완료.
- Commit/remote: `7824799`, `b7e58b0`, `f8959fc`, `78088c4` 로컬 커밋, 미push
- Next handoff: 최종 SHA 승인 후 새 KV 전파 확인 → Worker 배포 → 운영 응답 검증

> **(Claude, 2026-08-13 23:58 갱신)** 위 대기 상태는 해소됐다 — 이 월세 보강
> 작업은 Codex가 아니라 이후 세션(다른 기기)에서 `main`에 이미 fast-forward
> 병합된 상태로 발견됐고, 그 위에 UI/UX 개선 5건을 얹어 `npm run cf:deploy`로
> 함께 배포했다(Worker Version `b07dab9c-...`). Codex 쪽 설계 설명·검증 기록은
> 그대로 두고 배포 완료 사실만 남긴다.

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
