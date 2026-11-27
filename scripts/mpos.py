# -*- coding: utf-8 -*-
"""MPOS 결제 내역 → docs/data/mpos.json (날짜별 승인 수량·건수·취소·색상별 수량)
출처: MPOS 폴더의 달별 최신 파일(그 달 모든 날이 탭으로 들어 있음). convert.py 가 끝에서 함께 실행한다.
개인 정보(승인번호·거래일련번호 등)는 옮기지 않고 날짜별 집계만 남긴다.
"""
import os, re, glob, json, collections
import openpyxl
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "data", "mpos.json")
MPOS = r"C:\Users\VRID\OneDrive\Desktop\2026 Ploom Project\D2C\MPOS\보고용"
CM = {"블랙": "제트 블랙", "블루": "네이비 블루", "골드": "로즈 골드", "실버": "루나 실버"}
def color(v):
    t = str(v or "")
    for k, c in CM.items():
        if k in t: return c
    return t or "(없음)"
def run():
    agg = collections.defaultdict(lambda: collections.Counter())
    for mdir in sorted(glob.glob(os.path.join(MPOS, "*월"))):
        fs = [f for f in glob.glob(os.path.join(mdir, "*.xlsx")) if re.search(r"_(\d{4})\.xlsx$", f) and not os.path.basename(f).startswith("~$")]
        if not fs: continue
        f = max(fs, key=lambda p: re.search(r"_(\d{4})\.xlsx$", p).group(1))
        wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
        for ws in wb.worksheets:
            rows = ws.iter_rows(values_only=True)
            h = next(rows, None)
            if not h: continue
            ix = {str(c): i for i, c in enumerate(h[:20]) if c}
            if "거래일자" not in ix or "수량" not in ix: continue
            for r in rows:
                t = str(r[ix["거래일자"]] or "")
                if not re.match(r"\d{4}-\d{2}-\d{2}", t): continue
                day = t[:10]; ok = r[ix.get("상태")] == "성공" if "상태" in ix else True; tr = r[ix.get("거래구분")] if "거래구분" in ix else "승인"
                q = r[ix["수량"]]
                if q in (None, ""): q = 1   # 수량 칸이 빈 승인 줄(4/21 루나 실버 1건)은 1대로 센다
                if ok and tr == "승인":
                    agg[day]["건수"] += 1; agg[day]["수량"] += q; agg[day]["금액"] += r[ix["승인금액"]] or 0 if "승인금액" in ix else 0
                    agg[day]["색:" + color(r[ix.get("상품")] if "상품" in ix else None)] += q
                else:
                    agg[day]["취소"] += 1
    out = []
    for day in sorted(agg):
        a = agg[day]
        out.append({"일자": day, "건수": a["건수"], "수량": a["수량"], "취소": a["취소"], "금액": a["금액"],
                    "색상": {k[2:]: v for k, v in a.items() if k.startswith("색:")}})
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"  mpos.json: {len(out)}일, 승인 {sum(r['수량'] for r in out)}대")
run()
