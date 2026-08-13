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

마지막 확인: **2026-08-13 17:37 KST** (Codex, 배포 전 준비)

| 항목 | 현재 상태 |
| --- | --- |
| 공용 작업트리 | `/Users/macbookpro/Desktop/Work/I-Dont-Know-Seoul` |
| 현재 브랜치 | `main` |
| 배포 후보 소스 HEAD | `78088c4 docs: 월세 데이터와 선택 기준을 갱신한다` (인수인계 커밋 직전) |
| `origin/main` | `0a0d39b` — 로컬 작업 커밋 4개 미push |
| 미커밋 tracked | `AGENTS.md` 상태 갱신만 남음(이후 별도 커밋 예정) |
| 미추적 유지 | `Research on Advanced Regional Scoring Methods.md`, `claude-feedback/`, `feedback/`, `src/lib/__scratch_munjeong.test.ts` — 이번 배포에서 제외 |
| 최근 검증 | `npm test` **236/236 통과**, `npm run typecheck`·`npm run build`·`git diff --check` 전부 통과(2026-08-13) |
| 운영 배포 | 직전 배포는 `06d1f46`(2026-08-12). 월세 보강·선택 UI와 기존 미배포 개선을 합친 새 배포는 정확한 최종 SHA 승인 대기 |

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
