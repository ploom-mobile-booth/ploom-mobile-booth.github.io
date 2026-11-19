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
