# Ploom Mobile Booth Official

보고용 데일리 리포트(엑셀)만으로 만드는 공식 자료 사이트. 구글 시트와 연동하지 않으며 자동 갱신도 없다.

## 자료 갱신 (매일)
1. 새 보고용 파일을 `C:\Users\VRID\OneDrive\Desktop\2026 Ploom Project\D2C\데일리 리포트\보고용\<N월>\` 에 저장한다.
   파일 이름의 `_MMDD` 가 가장 큰 파일을 그 달의 최신으로 쓴다. (작년 파일은 `VRID\에이전트\2025\데일리리포트\`)
2. `py -3 scripts/convert.py` → `docs/data/*.json` 이 다시 만들어진다.
3. 커밋 후 푸시하면 깃허브 페이지에 반영된다.

## 넣지 않는 것
- 영업사원·에이전트·점주·확인자 이름, 비용 분석(Summary 탭의 Cost Analysis).

## 구성
- `scripts/convert.py` 엑셀 → JSON (탭별 머리글을 키워드로 맞추므로 달마다 열 이름이 조금 달라도 된다)
- `docs/index.html`, `docs/app.js` 화면과 집계 (브라우저에서 계산), `docs/dash.js`·`docs/style.css` 그래프 엔진과 스타일
- `docs/data/` daily(데일리 리포트), sales(판매 데이터), stores(진행 점포), cvs(차용), feedback(피드백), schedule(스케줄, 이름 제외), meta(파일 목록)

## 추가 자료
- `funnel.json`: `세일즈 데이터\Raw Data\*RRP Activation Data*.xlsx` 의 "(Raw) Activation" 시트에서 Channel = Ploom Agent 행만 (가장 최근 파일). 새 파일이 오면 convert.py 를 다시 돌리면 된다.
- `ops.json`: 내부 사이트(ploom-report)의 팀·일 활동 요약을 달별 평균으로만 옮긴 것(시작 시각·활동 시간·방문 점포). 팀 번호·이름은 없다.

## 디바이스 재고 (메뉴 "디바이스 재고")

- 출처: 데일리 리포트 메일의 [디바이스 재고] 표. 보고용 엑셀에는 없어서 메일을 보고 손으로 옮긴다.
- 자료: `scripts/inventory.py` 의 `ROWS` 에 하루 한 줄(야간은 따로 한 줄)을 추가한 뒤 `py -3 scripts/inventory.py` 실행 → `docs/data/inventory.json`.
  한 줄 = (일자, 주간/야간, [전일 4색], [입고 4색] 또는 None, [소진 4색], [마감 4색], 비고). 색상 순서는 제트 블랙·네이비 블루·로즈 골드·실버.
  실행하면 전일+입고−소진=마감이 안 맞는 줄을 알려 준다.
- 화면은 필터와 상관없이 전 기간(2026-10-08~)을 보여 주고, MPOS 결제 수량(판매 데이터 탭의 MPOS 경로 수량 합)과 소진을 날짜별로 비교한다. 소진은 곧 MPOS 결제 수량이다.
- 프런트 패널: 입고는 `scripts/inventory.py` 의 `PANEL_IN` 에 (일자, {색상: 수량}, 비고) 로 추가 → `docs/data/panel.json`. 지급은 판매 데이터 탭의 Front Panel Qty 열을 변환(`sales.json` 의 패널)해 날짜별로 더한다. 지급에는 색상이 없어 잔여는 총수량만 센다. 첫 입고일(2026-11-20) 이후 지급만 센다.
