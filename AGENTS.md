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

- `8787`: `wrangler/workerd` 통합 개발 서버 기본 포트. 다른 에이전트가 쓰는 중이면
  종료·재시작하지 않습니다.
- `5173`: Vite 프론트엔드 단독 서버(`npm run dev`). 필요할 때만 켜고 작업이 끝나면
  종료합니다 — `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`.
- 포트를 바꿀 때는 자기 슬롯에 새 포트를 기록합니다.

## Current Shared State

마지막 확인: **2026-08-16 (Codex, 동탄+GTX-A 구현 완료)**

| 항목 | 현재 상태 |
| --- | --- |
| 공용 작업트리 | `/Users/mac/Desktop/Work/I-Dont-Know-Seoul` |
| 현재 브랜치 | `feat/dongtan-gtx-a` |
| HEAD | PR `#7`이 `72a353e`로 `origin/main`에 merge됨; `feat/dongtan-gtx-a`에는 구현 커밋 `5c2c287` 이후 인수인계 전용 커밋만 남음(사용자 미추적 자료만 남음) |
| 최근 검증 | `npm test` 246/246, `npm run typecheck`·`npm run build`·`git diff --check` 전부 통과 |
| 운영 배포 | **완료.** Worker Version `092f4a9e-8277-45f1-8e46-1775644dbb7c`. `/api/data` 200(`X-Oneday-Source: kv`), `POST /api/data`·`POST /api/geocode` 405(`Allow: GET`) 프로덕션에서 확인 |
| 진행 중인 작업 | 없음. PR #7 merge 완료, 배포는 별도 승인 전까지 금지 |

이 표는 **지금 상태만** 유지합니다. 지나간 배치의 상세 서사(왜 그렇게 했는지,
뭘 시도했다 실패했는지)는 다시 쌓지 않고 커밋 메시지 본문에 맡깁니다 — 이
저장소는 커밋을 작업 단위로 쪼개고 본문에 "왜"를 적는 관례라 `git log`로
훑고 필요한 커밋만 `git show <sha>`로 펼쳐보면 재구성됩니다.

### 완료된 배치 (요약 — 상세는 커밋 메시지 본문)

| 배치 | 커밋 범위 | 핵심 |
| --- | --- | --- |
| 추천 품질·UX 개선 8건 | `94a7366`~`0a0d39b` | 통근 페널티 Φ(t) 비보상적 결합(`src/lib/score.ts`), 목적지 검색 교체/추가 분리, 월세 조합 사전계산 기반 마련, 동 마커를 최대인구 100m 셀로 |
| 월세 실거래 보강 | `7824799`~`78088c4` | 서울·경기 전월세 63만 건 집계(서울 2025 원본의 행 중복 결함 발견·제거 포함, `docs/data.md` 참고), 15조합×2모드 완전 사전계산, 화면 기본값을 단독·다가구 단일로 변경 |
| UI/UX 개선 5건 | `142594d`~`ca54bfd` | 마커 minzoom, 추천목록↔지도 hover 연동, 가격 축 설명 압축, 통근 기본값 40분 복귀, 지도 색 페이드인+목적지 펄스. "목적지 없을 때 전 지역 등급색" 항목은 실사용 후 번복돼 최종 미채택(`docs/plans/ux-improvements-5.md` 상단 참고) |
| 문서 정합성 수정 | `6e75f05`, `a058e91` | 위 배치들 리뷰 중 발견한 낡은 주석·수치 정정, 새로 얻은 함정을 `CLAUDE.md`로 이관 |
| Worker 안정성 수정 4건 | `c569727`, `a4042f5` | geocode KV 캐시 무가드 파싱·Kakao 파싱 실패 시 폴백 무력화·500 내부 메시지 노출·`POST /api/data` 405 누락을 Codex가 구현, Claude가 리뷰(누락된 폴백 무력화 문제 추가 발견)·후속 3건(500 한글화, 로그 스택트레이스, `/api/geocode` 405에 `Allow: GET`) 요청·재검증 후 커밋. Obsidian Vault `_agent/handoffs/`에 QA→구현→리뷰→후속수정 전 과정 기록 |
| 동탄구+GTX-A 확장 및 서울 월세 CSV 지원 | `5c2c287` | 대상 556개 동·35개 구로 확장하고 수서~동탄 GTX-A 수동 경로, 화성시 원자료, 3개년 서울 전월세 `.zip`/`.csv` 로더, 지표·점수·공개 번들을 재생성. 전체 회귀 246/246 통과 |

### Codex slot

- Status: done
- Task: Execute the approved Dongtan-gu/GTX-A expansion and make the Seoul rent pipeline accept the supplied CSV snapshots.
- Owned files: `AGENTS.md`; `CLAUDE.md`; `README.md`; `docs/commute.md`; `docs/data.md`; `docs/development.md`; `docs/scoring.md`; `data/dist/dong-meta.json`; `data/dist/metrics.json`; `data/dist/residential-access.json`; `data/dist/scores.json`; `data/dist/subway-graph.json`; `data/raw/police-crime-20241231.csv`; `data/raw/population-20260630.csv`; `data/raw/traffic-accident-hotspots-2012-2024.csv`; `public/data/bundle.json`; `public/dong.geojson`; `scripts/1-boundaries.mjs`; `scripts/2-subway.mjs`; `scripts/3-metrics.mjs`; `scripts/4-score.mjs`; `scripts/lib/bundle-validation.mjs`; `scripts/lib/bundle-validation.test.mjs`; `scripts/lib/rent.mjs`; `scripts/lib/residential-quality.test.ts`; `scripts/lib/seoul-rent.mjs`; `scripts/lib/seoul-rent.test.mjs`; `scripts/lib/sgis-population.mjs`; `scripts/update-marker-positions.mjs`; `src/App.tsx`; `src/components/DongDetail.tsx`; `src/components/Landing.tsx`; `src/components/MapView.tsx`; `src/components/WeightPlayground.tsx`; `src/lib/commute.test.ts`; `src/lib/commute.ts`; `src/lib/constants.ts`; `src/lib/data.test.ts`; `src/lib/dijkstra.ts`; `src/lib/explain.ts`; `src/lib/rent-bundle.test.ts`; `src/lib/score.ts`; `src/lib/subwayLines.ts`; `src/types.ts`.
- Changed: Added 9 Dongtan dongs, 4 manual GTX-A stations from Suseo to Dongtan, expanded source snapshots and scoring artifacts, and added `.csv` fallback support for the 2023–2025 Seoul rent inputs. Preserve `Research on Advanced Regional Scoring Methods.md` as an untracked user file.
- Verification: `npm run data:boundaries`, `npm run data:population`, `npm run data:metric-access`, `npm run data:access`, `npm run data:validate-access`, `npm run data:metrics`, `npm run data:score`, `npm test` (246/246), `npm run typecheck`, `npm run build`, and `git diff --check` pass. Branch pushed; no deployment.
- Commit/remote: implementation commit `5c2c287` was merged by PR #7 (`72a353e`); follow-up handoff commits remain on `origin/feat/dongtan-gtx-a`. No deployment. The prior inquiry widget is in `88b4139`.
- Next handoff: Obtain separate approval before the production data-seed/deploy procedure; the implementation PR is already merged.

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
