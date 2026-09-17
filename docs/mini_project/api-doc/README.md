# API 명세서 PDF 만드는 법

`API.yml` 을 Swagger UI로 렌더링한 오프라인 문서입니다. 표를 손으로 만들지 않고
yml 원본에서 바로 뽑기 때문에 명세와 PDF가 어긋나지 않습니다.

`api-docs.html` **한 파일에 CSS·JS가 전부 들어 있습니다.** 이 파일 하나만 옮겨도(메일, 카톡, USB)
다른 파일 없이 열립니다 — swagger-ui.css/swagger-ui-bundle.js는 원본 보관용이라 없어도 됩니다.

## 1. 열기
`api-docs.html` 을 더블클릭 (인터넷 없어도 열립니다 — Swagger UI 자산이 같은 폴더에 있습니다)

## 2. PDF로 저장
1. `Cmd + P`
2. 대상: **PDF로 저장**
3. 용지: **A4**, 방향: **세로**
4. **더보기 → 배경 그래픽 체크** ← 켜야 Method 색·표 음영이 나옵니다
   (안 켜도 읽히도록 테두리를 넣어뒀지만, 켜는 쪽이 보기 좋습니다)
5. 저장 → 파일명 `PG7반_{개인별코드}_{이름}_{프로젝트명}_API.pdf`

## 3. 제출
`..._API.yml` 과 `..._API.pdf` 를 **한 세트로** 함께 냅니다. (yml만, 또는 pdf만 내면 점수 미인정)

## 담긴 내용
- 9 path / 12 operation (data 1 · geocode 1 · auth 4 · reviews 6)
- 15 스키마 (`$ref` 재사용)
- 각 operation description에 `REQ-FUNC-###` · `SCR-###` · 저장소/테이블 표기
- 응답 코드 200 / 201 / 204 / 302 / 400 / 401 / 403 / 404 / 409 / 500

## 갱신
`draft/API.yml` 을 고쳤으면 이 폴더의 html도 다시 만들어야 합니다 (Claude에게 "api-doc 다시 생성" 요청).
