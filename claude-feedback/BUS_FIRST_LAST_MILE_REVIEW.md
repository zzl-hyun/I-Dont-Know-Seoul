# Claude 리뷰 요청 — 버스 첫·마지막 접근 + 100m 거주분포

작성: Codex, 2026-08-12 KST  
상태: **구현·데이터 재생성·로컬 검증 완료 / 미커밋 / 미푸시 / 미배포**

## 0. 먼저 볼 위치

- 리뷰 대상 worktree: `/tmp/i-dont-know-seoul-bus-access`
- 브랜치: `feat/bus-first-last-mile`
- 기준 커밋: `49792cf fix(ci): 얕은 클론에서 공백 검사가 죽던 것을 고친다`
- 공용 `main`: `/Users/macbookpro/Desktop/Work/I-Dont-Know-Seoul`
- Claude 소유 `127.0.0.1:8787`: 건드리지 않았고 현재도 실행 중
- Codex 통합 검증용 `8790`: 검증 후 종료함

이 보고서 자체는 공용 작업트리의 미추적 `claude-feedback/` 폴더에만 있습니다.
기능 변경은 전부 위 격리 worktree에 있고, 아직 커밋·push·PR·배포하지 않았습니다.

## 1. 해결하려던 문제

사용자가 실제로 다니는 SK AX 판교캠퍼스 예시에서 두 모델 오류가 겹쳤습니다.

1. 목적지가 판교역에서 약 1.6km 떨어져 있는데 기존 모델은 마지막 구간을 34분
   도보로 고정했습니다. 이 상수가 55분 필터를 대부분 먹어 추천 가능 동이 7개로
   줄었습니다. 실제 사용자는 판교역에서 버스로 약 10분, 혼잡 시 20분 정도
   이동합니다.
2. 양재1동처럼 산지와 주거지가 함께 있는 큰 행정동은 폴리곤 내부 대표점 한 점이
   실제 거주지를 대표하지 못했습니다. 동 안에 역세권 주거지가 있어도 산지 쪽
   대표점 때문에 역까지 수십 분 도보로 계산됐습니다.

사용자와 합의한 정책은 다음 두 가지입니다.

- 직접 도보가 15분을 넘으면 실제 서울·경기 정류장 순서에서 같은 방향 직행
  버스를 찾아 정적 소요시간으로 환산합니다.
- 동 대표점 한 점 대신 SGIS 2024년 100m 총인구 격자의 실제 거주분포를 사용합니다.

실시간 API는 런타임에 호출하지 않습니다.

## 2. 사용자에게 보이는 결과

| 항목 | 기존 | 변경 후 |
| --- | ---: | ---: |
| 판교역 → SK AX 마지막 접근 | 도보 약 34분 | `602-1B` 버스 접근 약 17.8분 |
| SK AX, 통근 55분 이내 동 | 7개 | 76개 |
| 양재1동 → SK AX | 83.8분 | 54.8분 |
| 양재2동 → SK AX | 60.3분 | 43.0분 |
| 서초2동 → SK AX | 64.1분 | 45.8분 |

- 상세 패널은 버스 정류장까지 도보, 기대 대기, 노선명·정류장 수, 하차 후 도보를
  분리해서 표시합니다.
- 지도는 버스 승차 구간과 목적지 쪽 도보 구간을 표시합니다.
- 공개 거주 좌표를 제거했기 때문에 **거주지에서 첫 역·정류장까지의 지도선만**
  생략합니다. 첫 도보시간과 버스 노선 상세, 총합은 그대로 표시합니다.
- 실시간 위치·정체를 반영하지 않는 정적 추정이라는 안내를 상세 패널에 표시합니다.
- 생활편의 축의 `walkToStationMin`도 인구 가중 중앙값으로 바뀌었습니다. 기본
  가중치 등급은 22/547개 동에서 변했고 `Best↔Bad` 극단 변화는 0개입니다.

## 3. 버스 모델

### 채택 조건

- 직접 도보가 **15분 초과**일 때만 버스를 검토합니다.
- 출발·도착 양쪽에서 **450m 이내** 정류장만 봅니다.
- 같은 노선에서 `승차 순번 < 하차 순번`인 정방향 직행만 허용합니다.
- 도보보다 **최소 1분** 빨라야 채택합니다.
- 버스끼리 환승하거나 지하철 대신 버스만 타는 전체 경로는 만들지 않습니다.

### 시간식

```text
버스 접근 실제시간
  = 승차 정류장까지 도보
  + clamp(평일 배차간격 / 2, 2분, 8분)
  + 노선 운행거리 / 15km/h
  + 통과 정류장 수 × 0.2분
  + 하차 정류장에서 목적지까지 도보
```

- 경기 배차는 `peekAlloc` → `npeekAlloc` → 기본 15분 순서입니다.
- 서울 `busRteInfo`에는 현재 배차 필드가 없어 기본 15분을 씁니다.
- 경기 BMS 2023 스냅샷은 현재 GBIS의 `routeId + staOrder + stationId`가 모두
  맞고 누적거리가 단조인 구간만 사용합니다.
- 나머지 경기 구간과 서울은 연속 정류장 직선거리 × 1.25를 씁니다.
- 역 선택에만 기존 도보 선택 가중치를 적용하고, 화면 총시간에는 넣지 않습니다.

파이프라인 모델 상수와 브라우저 런타임 상수는 회귀 테스트로 대조합니다. 공개
번들 검증기도 버스 참조의 노선·순번·거리와 실제시간·선택비용 공식을 다시 계산합니다.

## 4. 공식 버스 데이터 산출물

현재 `data/dist/bus-network.json`:

- 정류장: **41,423개**
- 노선: **2,943개**
  - 경기 GBIS: 2,225개
  - 서울 열린데이터광장 `busRteInfo`: 718개
- 경기 현재 노선 정류행: 197,241건
- 경기 BMS 원행: 482,779건
- 현재 GBIS와 BMS의 3중 키 정확 매칭: 24,085건(12.2%)
- BMS 누적거리 사용 구간: 13,865개
- 정류장 순서 충돌: 경기 0건, 서울 0건

원천·캐시는 모두 `data/raw/*` 규칙으로 무시됩니다. 특히 다음 파일을 수정하거나
커밋하면 안 됩니다.

- `data/raw/BMS_info.csv`
- `data/raw/gbis-route-20260812.txt`
- `data/raw/gbis-route-station-20260812.txt`
- `data/raw/seoul-bus-rte-info-v1/`

사용자가 채팅에 준 경기 인증키는 소스·문서에 없습니다. 최종 고정 문자열 검사도
통과했습니다.

## 5. SGIS 100m 거주분포와 공개 스키마

원본 1,307,715행에서 2024년 총인구 `to_in_001` 양수 셀을 대상 경계에 배정한 결과:

- 사용 셀: **43,780개**
- 총인구: **12,262,398명**
- 대상 동: **547/547개 모두 커버**
- 접근 선택지가 같은 원 프로필: **43,751개**
- 공개 집약 프로필: **13,068개**, 동별 최대 24개
- 동별 공개 가중치 합: 정확히 10,000
- 대표 통근값: 인구 누적 50% 지점의 중앙 통근시간

### 원자료 노출 최소화 변경

공개 버전은 `sgis-2024-100m-bus-v4`입니다.

```text
profile = [정규화 가중치, 역 접근 선택지 목록]
busRef  = [노선 id, 승차 순번, 하차 순번, 승차 정류장까지 도보시간]
```

- 공개 프로필 13,068개의 튜플 길이는 모두 2입니다.
- 원 셀 좌표, 군집 중심 좌표, 일반화 좌표를 **어떤 형태로도 직렬화하지 않습니다.**
- 원 인구수도 싣지 않고 동별 합 10,000의 정규화 가중치만 싣습니다.
- 내부 집약은 정렬된 입력과 인구 가중 중심을 사용하며, 입력 셀 순서를 뒤집어도
  결과가 같은 회귀 테스트가 있습니다.
- 버스 경로는 저장된 노선·순번·첫 도보시간으로 좌표 없이 복원합니다.
- 구 좌표 포함 번들은 타입·런타임에서 읽을 수 있게 유지했지만, v4 번들 검증기는
  좌표가 들어간 프로필을 거부합니다.

이 조치는 원 셀 좌표·인구수의 직접 공개를 막는 것이지 완전한 위치 익명화를
보장한다는 뜻은 아닙니다. 역 ID와 0.25분 단위 접근시간은 대표 생활권과 역의
거리 관계를 나타내므로 거친 위치를 추정할 수 있습니다. 다만 공개되는 것은 최대
24개로 집약한 대표 접근성 분포이고, 원 43,780개 셀의 좌표·개별 인구수는 아닙니다.
Claude는 이 잔여 추론 가능성이 SGIS 신청조건과 제품 목적에 적절한지도 검토해 주세요.

원자료와 로컬 정확 기준은 무시 상태이며 커밋하지 않습니다.

- `data/raw/_census_reqdoc_1786503689774`
- `data/raw/grid-population-100m-2024.json`

## 6. 집약 품질 검증

`npm run data:validate-access`는 로컬 SGIS 스냅샷으로 집약하지 않은 정확 기준을
다시 만들고, 고정된 28개 목적지 × 547개 동을 공개 집약 프로필과 비교합니다.

| 검증값 | 결과 | 게이트 |
| --- | ---: | ---: |
| 비교 건수 | 15,316 | 고정 |
| 평균 절대오차 | 0.292분 | ≤ 0.5분 |
| p95 절대오차 | 1.00분 | ≤ 1.5분 |
| 최대 절대오차 | 2.75분 | ≤ 3분 |
| 40분 필터 포함 여부 변화 | 0.35% | ≤ 1% |
| 55분 필터 포함 여부 변화 | 0.39% | ≤ 1% |
| 70분 필터 포함 여부 변화 | 0.33% | ≤ 1% |
| 경로 일반 버스 폴백 | 0건 | 0건 |
| 상세 구간 합 불일치 | 0건 | 0건 |

주의: 이 테스트는 무시된 SGIS 로컬 스냅샷이 있을 때만 실행됩니다. CI에는 원자료를
넣지 않으므로 해당 1개 테스트는 skip됩니다. 대신 CI에서도 생성 공개 번들의 v4
스키마·좌표 부재·가중치·버스 참조·공식·용량을 검증하는 테스트는 항상 실행됩니다.

## 7. 번들 크기와 런타임 확인

- `public/data/bundle.json`: **6,864,403 bytes**
- gzip: **1,903,279 bytes**
- JSON parse 후 측정 heap 증가: 약 **24.9MB**
- KV 단일 값 25MiB 한도 안

별도 `127.0.0.1:8790` Worker에서 확인한 응답:

```text
HTTP/1.1 200 OK
Content-Length: 6864403
X-Oneday-Source: assets
residential.version: sgis-2024-100m-bus-v4
profiles: 13068
profile tuple lengths: [2]
bus stops/routes: 41423 / 2943
```

로컬 assets 응답이므로 `X-Oneday-Source: assets`가 정상입니다. 운영 배포 때는
반드시 seed 후 배포하고 `X-Oneday-Source: kv`를 확인해야 합니다.

## 8. 변경 파일 지도

### 데이터 취득·정규화

- `scripts/prepare-bus-network.mjs`
- `scripts/lib/bus-sources.mjs`
- `scripts/prepare-population-grid.mjs`
- `scripts/lib/sgis-population.mjs`
- `scripts/6-bus-access.mjs`
- `scripts/lib/bus-access.mjs`
- `scripts/lib/population-access.mjs`
- `scripts/update-population-walk-metric.mjs`

### 기존 파이프라인 연결·검증

- `scripts/3-metrics.mjs`
- `scripts/4-score.mjs`
- `scripts/5-seed-kv.mjs`
- `scripts/lib/bundle-validation.mjs`
- `package.json`, `package-lock.json`, `.env.example`, `.gitignore`

### 브라우저 계산·표시

- `src/types.ts`
- `src/lib/constants.ts`
- `src/lib/bus.ts`
- `src/lib/commute.ts`
- `src/lib/data.ts`, `src/lib/dijkstra.ts`, `src/lib/explain.ts`, `src/lib/score.ts`
- `src/App.tsx`
- `src/components/DongDetail.tsx`
- `src/components/MapView.tsx`
- `src/components/Landing.tsx`
- `src/index.css`

### 생성 산출물

- `data/dist/bus-network.json`
- `data/dist/residential-access.json`
- `data/dist/metrics.json`
- `data/dist/scores.json`
- `public/data/bundle.json`

### 문서·테스트

- `README.md`, `CHANGELOG.md`, `CLAUDE.md`
- `docs/commute.md`, `docs/data.md`, `docs/development.md`, `docs/scoring.md`
- `scripts/lib/*bus*.test.*`, `scripts/lib/*population*.test.*`
- `scripts/lib/bundle-validation.test.mjs`
- `scripts/lib/residential-quality.test.ts`
- `src/lib/bus.test.ts`, `src/lib/commute.test.ts`, `src/lib/data.test.ts`

## 9. 최종 검증 결과

```text
npm run data:bus -- --offline     성공
npm run data:access               성공
npm run data:score                성공
npm run data:validate-access      1/1 통과
npm test                          16 files, 167/167 통과
npm run typecheck                 통과
npm run build                     통과
git diff --check                  통과
제출된 경기 인증키 문자열 검사    소스·문서에서 0건
로컬 Worker /api/data             HTTP 200, v4 assets 확인
```

빌드에는 기존과 같은 500kB 초과 청크 경고가 있지만 실패는 아닙니다.

## 10. 알려진 한계와 의도적인 선택

1. 실시간 버스 위치·정체는 반영하지 않습니다. 같은 링크의 결과를 결정적으로
   유지하고 런타임 외부 API 0회를 지키기 위한 선택입니다.
2. 서울 배차는 기본 15분입니다. 공개 원천에 현재 배차 필드가 없습니다.
3. BMS는 2023 스냅샷이고 현재 GBIS와 정확히 맞는 구간만 씁니다. 대부분의 구간은
   정류장 직선거리 × 1.25 근사입니다.
4. 버스 환승·버스 단독 전체 경로는 만들지 않습니다. 첫·마지막 무환승 접근만
   해결합니다.
5. 공개 거주 좌표 제거 때문에 첫 집 쪽 지도선은 없습니다. 시간을 그럴듯한 동
   중심선으로 그려 개인정보와 정확도를 동시에 오해시키는 것보다 의도적으로
   생략했습니다.
6. 공개 프로필의 역 ID·접근시간으로 대표 생활권의 거친 위치 관계를 추정할 수
   있습니다. 직접 좌표·원 셀 인구는 없지만 완전한 위치 익명화로 주장하지 않습니다.
7. SGIS 원자료가 없는 CI에서는 압축 전후 정확도 테스트가 skip됩니다. 공개 번들
   자체의 개인정보·공식·용량 검증은 skip되지 않습니다.

## 11. SGIS 출처·제출 의무

화면/README/번들 metadata에 다음 출처를 넣었습니다.

> 국가데이터처 통계지리정보서비스(SGIS), 2024년 인구 100m 격자

사용자가 동의한 자료신청 조건상 결과물이 완성되면 국가데이터처 SGIS의
`자료제공 활용결과`에 운영 URL 사본 1부를 제출해야 합니다. 운영 배포 전에는
제출할 최종 URL이 없으므로 아직 제출하지 않았습니다. Claude가 나중에 배포를
리뷰·승인할 때 아래를 체크해야 합니다.

1. 화면과 문서의 SGIS 출처표시 유지
2. `npm run data:seed` → `npm run cf:deploy` 순서
3. 운영 `/api/data` HTTP 200, `X-Oneday-Source: kv`, v4 확인
4. SGIS 활용결과에 최종 운영 URL 사본 제출

## 12. Claude에게 요청하는 리뷰 순서

```bash
cd /tmp/i-dont-know-seoul-bus-access
git status --short --branch
git diff --check
git diff -- scripts/lib/bus-access.mjs scripts/lib/bundle-validation.mjs
git diff -- src/lib/bus.ts src/lib/commute.ts src/types.ts
git diff -- scripts/3-metrics.mjs scripts/4-score.mjs scripts/5-seed-kv.mjs
git diff -- src/App.tsx src/components/DongDetail.tsx src/components/MapView.tsx
npm test
npm run typecheck
npm run build
```

특히 다음 질문에 답해 주세요.

- v4 공개 스키마에서 직접 좌표가 정말 남지 않고, 구 형식 호환 분기가 새 번들에
  좌표를 다시 주입하지 않는가? 역 접근시간을 통한 잔여 위치 추론은 허용 가능한가?
- 저장된 `busRef`로 복원한 상세 구간의 합이 계산 총시간과 항상 같은가?
- 파이프라인과 런타임의 버스 시간식·선택 가중치가 같은가?
- 15분·450m·15km/h·대기 2~8분이라는 제품 가정이 사용자 설명과 일치하는가?
- `walkToStationMin` 교체가 점수·설명·산출물에 일관되게 반영됐는가?
- 원자료·키·SGIS 조건이 커밋 및 향후 운영 절차에서 안전하게 처리되는가?

리뷰가 끝나기 전에는 커밋하지 말고, 발견사항을 사용자에게 먼저 보고해 주세요.
커밋·push·PR·seed·deploy는 각각 별도 승인입니다.
