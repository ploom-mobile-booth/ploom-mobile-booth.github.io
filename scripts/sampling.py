# -*- coding: utf-8 -*-
"""야간 프리샘플링 MPOS 결제 내역 → docs/data/sampling.json (날짜별 승인 수량·건수·금액·색상별·활동 지역별)
출처: MPOS 폴더의 `… Free Sampling MPOS 결제내역_MMDD.xls` (달별로 가장 최근 날짜 파일 하나만, 그 달의 날들이 탭).
개인 정보(승인번호·거래일련번호 등)는 옮기지 않고 날짜별 집계만 남긴다. convert.py 가 끝에서 함께 실행한다.
"""
import os, re, glob, json, collections
import xlrd
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "data", "sampling.json")
MPOS = r"C:\Users\VRID\OneDrive\Desktop\2026 Ploom Project\D2C\MPOS"
SINCE = "2026-10-01"   # 9월 샘플링(9/17~19)은 입고 수량을 몰라 제외. 포함하려면 날짜를 앞당기고 DEVICE_IN 에 입고를 넣을 것
CM = {"블랙": "제트 블랙", "블루": "네이비 블루", "골드": "로즈 골드", "실버": "실버"}
def color(v):
    t = str(v or "")
    for k, c in CM.items():
        if k in t: return c
    return t or "(없음)"
def run():
    # 파일명의 달(Sep./Oct./Nov …)별로 가장 최근 _MMDD 파일만 (이름에 '전달'·'통합' 붙은 복사본은 제외)
    latest = {}
    for f in glob.glob(os.path.join(MPOS, "*Free Sampling MPOS 결제내역_*.xls")):
        b = os.path.basename(f)
        m = re.search(r"_(\d{4})(?:[^\d].*)?\.xls$", b)
        if not m or "통합" in b or "전달" in b or b.startswith("~$"): continue
        mon = re.search(r"\d{4}\s+([A-Za-z]+)", b); key = mon.group(1).lower()[:3] if mon else b
        if key not in latest or m.group(1) > latest[key][0]: latest[key] = (m.group(1), f)
    agg = collections.defaultdict(lambda: collections.Counter())
    for _, f in sorted(latest.values()):
        wb = xlrd.open_workbook(f)
        for sh in wb.sheets():
            hi = next((i for i in range(min(5, sh.nrows)) if "거래일자" in [str(c) for c in sh.row_values(i)]), None)
            if hi is None: continue
            ix = {str(c): i for i, c in enumerate(sh.row_values(hi)) if c}
            for i in range(hi + 1, sh.nrows):
                r = sh.row_values(i); t = str(r[ix["거래일자"]] or "")
                if not re.match(r"\d{4}-\d{2}-\d{2}", t): continue
                day = t[:10]
                if day < SINCE: continue
                ok = r[ix["상태"]] == "성공" if "상태" in ix else True; tr = r[ix["거래구분"]] if "거래구분" in ix else "승인"
                q = int(r[ix["수량"]] or 0)
                if ok and tr == "승인":
                    agg[day]["건수"] += 1; agg[day]["수량"] += q; agg[day]["금액"] += int(r[ix["승인금액"]] or 0) if "승인금액" in ix else 0
                    agg[day]["색:" + color(r[ix["상품"]] if "상품" in ix else None)] += q
                    if "활동 지역" in ix and r[ix["활동 지역"]]: agg[day]["지:" + str(r[ix["활동 지역"]]).strip()] += q
                else:
                    agg[day]["취소"] += 1
    out = []
    for day in sorted(agg):
        a = agg[day]
        out.append({"일자": day, "건수": a["건수"], "수량": a["수량"], "취소": a["취소"], "금액": a["금액"],
                    "색상": {k[2:]: v for k, v in a.items() if k.startswith("색:")},
                    "지역": {k[2:]: v for k, v in a.items() if k.startswith("지:")}})
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"  sampling.json: {len(out)}일, 승인 {sum(r['수량'] for r in out)}대 ({', '.join(os.path.basename(f) for _, f in sorted(latest.values()))})")
run()
