# -*- coding: utf-8 -*-
"""1인 근무팀 vs 2인 근무팀 비교 → docs/data/solo.json
출처: 보고용 데일리 리포트만 (11월 스케줄 탭의 "1인 근무" 표시 + 판매 데이터 탭). 내부 자료는 쓰지 않는다.
달 폴더마다 _MMDD 가 가장 큰 파일을 읽고, 스케줄 탭에 "1인 근무" 표시가 있는 달만 집계한다. convert.py 가 끝에서 함께 실행한다.
이름(영업사원·에이전트)은 옮기지 않는다. 인력사는 팀 번호 범위로만 표시한다 (후킷 1~30, 토마스 31~68, 비욘드 69~106).
"""
import os, re, glob, json, warnings
import numpy as np, pandas as pd
warnings.filterwarnings("ignore")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "data", "solo.json")
BASE = r"C:\Users\VRID\OneDrive\Desktop\2026 Ploom Project\D2C\데일리 리포트\보고용"
def kd(v):
    if isinstance(v, pd.Timestamp): return v.strftime("%Y-%m-%d")
    m = re.match(r"(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})", str(v)); return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}" if m else None
def tnum(v): m = re.search(r"\d+", str(v)); return int(m.group()) if m else None
def agency(t): return "후킷" if t <= 30 else "토마스컴퍼니" if t <= 68 else "비욘드"
def hr(v):
    s = str(v)
    if ":" in s:
        h, m = s.split(":")[:2]; return int(h) + int(m) / 60
    return getattr(v, "hour", np.nan)
def r(x, n=2):
    try: return None if x is None or np.isnan(x) else round(float(x), n)
    except Exception: return x
def recs(df): return json.loads(df.to_json(orient="records", force_ascii=False))

def one_month(f):
    wb_sheets = pd.ExcelFile(f).sheet_names
    sch_name = next((s for s in wb_sheets if "스케줄" in s), None)
    if not sch_name or "판매 데이터" not in wb_sheets: return None
    sc = pd.read_excel(f, sheet_name=sch_name, header=0); sc.columns = [str(c).strip() for c in sc.columns]
    if "비고" not in sc.columns or not sc["비고"].astype(str).str.contains("1인").any(): return None
    sc["일자"] = sc["날짜"].map(kd); sc["팀번호"] = sc["팀"].map(tnum); sc["1인"] = sc["비고"].astype(str).str.contains("1인")
    sc = sc[sc.일자.notna() & sc.팀번호.notna()]
    sd = sc.groupby(["일자", "팀번호"]).agg(일인=("1인", "max"), 지점=("지점", "first"), 신규=("구분", "first")).reset_index()
    sd["유형"] = sd.일인.map({True: "1인", False: "2인"}); sd["인력사"] = sd.팀번호.map(agency); sd["인원"] = sd.유형.map({"1인": 1, "2인": 2})
    sa = pd.read_excel(f, sheet_name="판매 데이터", header=0); sa.columns = [str(c).strip() for c in sa.columns]
    col = lambda *names: next((c for c in sa.columns if any(re.search(p, c) for p in names)), None)
    C = dict(date=col(r"^Date$", r"^날짜$"), team=col(r"Team ID", r"^팀"), shift=col(r"주간/야간", r"운영 구분"), time=col(r"Sales Time", r"판매 시간"), stype=col(r"Store Type", r"점포 구분"),
             chain=col(r"Store Chain", r"점포 타입"), method=col(r"Transaction", r"판매 경로"), color=col(r"Device Color", r"디바이스 컬러"), qty=col(r"^Sales Qty", r"판매 수량"),
             member=col(r"^Membership", r"회원가입"), kakao=col(r"Kakao", r"카카오"), gift=col(r"Gift Card", r"기프트카드"), panel=col(r"Front Panel Qty", r"프런트 패널 (지급 )?수량"),
             remarks=col(r"^Remarks$"), ast=col(r"Activity Start", r"활동 시작"), aen=col(r"Activity End", r"활동 종료"))
    if not C["team"]: return None
    sa["일자"] = sa[C["date"]].map(kd); sa["팀번호"] = sa[C["team"]].map(tnum)
    sa["수량"] = pd.to_numeric(sa[C["qty"]], errors="coerce").fillna(1)
    sa["야간"] = sa[C["shift"]].astype(str).str.contains("야간") if C["shift"] else False
    sa["MPOS"] = sa[C["method"]].astype(str).str.contains("MPOS")
    mem = sa[C["member"]].astype(str); sa["회원"] = mem.str.contains("완료") & ~mem.str.contains("미완료"); sa["회원응답"] = mem.str.contains("완료")
    kk = sa[C["kakao"]].astype(str); sa["카카오"] = kk.str.contains("완료") & ~kk.str.contains("미완료"); sa["카카오응답"] = kk.str.contains("완료")
    sa["기프트"] = pd.to_numeric(sa[C["gift"]], errors="coerce").fillna(0) if C["gift"] else 0
    def pq(v):
        t = str(v)
        if t in ("nan", "-", ""): return 0
        return sum((pd.to_numeric(x.strip(), errors="coerce") or 0) for x in t.split("/"))
    sa["패널"] = sa[C["panel"]].map(pq) if C["panel"] else 0
    sa["복수"] = sa[C["remarks"]].astype(str).str.contains(r"1인 [2-9]개") if C["remarks"] else False
    sa["시"] = sa[C["time"]].map(lambda v: int(hr(v)) if pd.notna(hr(v)) else np.nan)
    sa["활동시작"] = sa[C["ast"]].map(hr) if C["ast"] else np.nan; sa["활동종료"] = sa[C["aen"]].map(hr) if C["aen"] else np.nan
    sa["흡연구역"] = sa[C["stype"]].astype(str).str.contains("흡연")
    noteam_days = sorted(sa[sa.팀번호.isna() & sa.일자.notna()].일자.unique())
    day = sa[(~sa.야간) & sa.팀번호.notna() & sa.일자.notna()].copy(); day["팀번호"] = day.팀번호.astype(int)
    g = day.groupby(["일자", "팀번호"]).agg(판매=("수량", "sum"), 건수=("수량", "size"), MPOS=("MPOS", "sum"), 회원=("회원", "sum"), 카카오=("카카오", "sum"), 회원응답=("회원응답", "sum"), 카카오응답=("카카오응답", "sum"),
                                         기프트=("기프트", "sum"), 패널=("패널", "sum"), 복수=("복수", "sum"), 흡연구역판매=("흡연구역", "sum"), 첫판매시=("시", "min"), 마지막판매시=("시", "max"), 활동시작=("활동시작", "min"), 활동종료=("활동종료", "max")).reset_index()
    teamdays = sorted(g.일자.unique()); win = teamdays[0] if teamdays else None
    d0 = sd.merge(g, on=["일자", "팀번호"], how="left")
    for c in ["판매", "건수", "MPOS", "회원", "카카오", "회원응답", "카카오응답", "기프트", "패널", "복수", "흡연구역판매"]: d0[c] = d0[c].fillna(0)
    d0["인당판매"] = d0.판매 / d0.인원; d0["활동시간"] = d0.활동종료 - d0.활동시작
    d0["요일"] = pd.to_datetime(d0.일자).dt.dayofweek.map({0: "월", 1: "화", 2: "수", 3: "목", 4: "금"}); d0["주차"] = pd.to_datetime(d0.일자).dt.isocalendar().week.astype(int)
    d = d0[d0.일자 >= win].copy() if win else d0.iloc[0:0]
    month = d0.일자.min()[:7]
    def summ(gr):
        s = gr[gr.판매 > 0]
        return {"유형": gr.유형.iloc[0] if len(gr) else None, "배정": int(len(gr)), "판매발생": int(len(s)), "판매발생비율": r(len(s) / max(len(gr), 1) * 100, 1), "판매": int(gr.판매.sum()),
                "배정당판매": r(gr.판매.mean()), "발생당판매": r(s.판매.mean()), "인당배정": r(gr.인당판매.mean()), "인당발생": r(s.인당판매.mean()), "중앙값": r(s.판매.median(), 1),
                "삼대이상": r((s.판매 >= 3).mean() * 100, 1), "오대이상": r((s.판매 >= 5).mean() * 100, 1), "최대": int(gr.판매.max()) if len(gr) else 0,
                "MPOS비중": r(gr.MPOS.sum() / max(gr.건수.sum(), 1) * 100, 1), "회원가입율": r(gr.회원.sum() / max(gr.회원응답.sum(), 1) * 100, 1), "카카오율": r(gr.카카오.sum() / max(gr.카카오응답.sum(), 1) * 100, 1),
                "기재비율": r(gr.회원응답.sum() / max(gr.건수.sum(), 1) * 100, 1), "복수구매": r(gr.복수.sum() / max(gr.건수.sum(), 1) * 100, 1), "기프트": r(gr.기프트.sum() / max(gr.판매.sum(), 1)), "패널": r(gr.패널.sum() / max(gr.판매.sum(), 1)),
                "흡연구역비중": r(gr.흡연구역판매.sum() / max(gr.건수.sum(), 1) * 100, 1), "활동시작": r(s.활동시작.mean()), "활동종료": r(s.활동종료.mean()), "활동시간": r(s.활동시간.mean()), "첫판매": r(s.첫판매시.mean()), "마지막판매": r(s.마지막판매시.mean())}
    cmp = d[d.인력사.isin(sorted(set(d[d.유형 == "1인"].인력사)))]   # 1인 팀이 있는 인력사만
    out = {"월": month, "파일": os.path.basename(f), "비교시작": win, "비교끝": d.일자.max() if len(d) else None, "팀없는날": noteam_days,
           "배정": {k: int(v) for k, v in d0.groupby("유형").size().items()}, "일수": int(d0.일자.nunique()), "비교일수": int(d.일자.nunique()),
           "일인팀수": int(d0[d0.유형 == "1인"].팀번호.nunique()), "일인인력사": sorted(set(d[d.유형 == "1인"].인력사)),
           "전체": [summ(gr) for _, gr in d.groupby("유형")], "같은인력사": [summ(gr) for _, gr in cmp.groupby("유형")],
           "인력사별": [dict(인력사=a, **summ(gr)) for (a, _), gr in d.groupby(["인력사", "유형"])]}
    bins = [-1, 0, 1, 2, 3, 4, 5, 7, 9, 999]; labels = ["0", "1", "2", "3", "4", "5", "6~7", "8~9", "10+"]
    dist = d.groupby("유형").apply(lambda gr: pd.cut(gr.판매, bins=bins, labels=labels).value_counts(normalize=True).sort_index() * 100).T.round(1)
    out["분포"] = [{"판매": str(i), **{c: r(v, 1) for c, v in row.items()}} for i, row in dist.iterrows()]
    def pivot2(df, key, label):
        rows = []
        for k, gr in df.groupby(key):
            o = {label: k if not isinstance(k, (np.integer,)) else int(k)}
            for t in ("1인", "2인"):
                x = gr[gr.유형 == t]; o[t + "배정"] = int(len(x)); o[t + "판매"] = int(x.판매.sum()); o[t + "평균"] = r(x.판매.mean()); o[t + "인당"] = r(x.인당판매.mean())
            rows.append(o)
        return rows
    out["주차별"] = pivot2(d0, "주차", "주차"); out["일별"] = pivot2(d0, "일자", "일자"); out["요일별"] = [o for w in ["월", "화", "수", "목", "금"] for o in pivot2(d, "요일", "요일") if o["요일"] == w]
    out["지점별"] = pivot2(d, "지점", "지점"); out["신규기존"] = pivot2(d, "신규", "구분")
    sday = day.merge(d[["일자", "팀번호", "유형"]], on=["일자", "팀번호"], how="inner"); n = d.groupby("유형").size()
    hb = sday.groupby(["유형", "시"]).수량.sum().unstack(0).fillna(0); share = (hb / hb.sum() * 100).round(1); per = hb.div(n, axis=1).round(3)
    out["시간대별"] = [{"시": int(i), "일인팀일당": r(per.loc[i].get("1인", 0), 3), "이인팀일당": r(per.loc[i].get("2인", 0), 3), "일인비중": r(share.loc[i].get("1인", 0), 1), "이인비중": r(share.loc[i].get("2인", 0), 1)} for i in hb.index if not np.isnan(i)]
    def shares(key, label):
        x = sday.groupby(["유형", key]).수량.sum().unstack(0).fillna(0); x = (x / x.sum() * 100).round(1)
        return [{label: str(i), "일인": r(row.get("1인", 0), 1), "이인": r(row.get("2인", 0), 1)} for i, row in x.iterrows()]
    out["점포유형"] = shares(C["stype"], "구분"); out["브랜드"] = shares(C["chain"], "브랜드"); out["색상"] = shares(C["color"], "색상")
    tr = d.groupby(["인력사", "팀번호", "유형"]).agg(배정=("판매", "size"), 판매발생=("판매", lambda x: int((x > 0).sum())), 평균=("판매", "mean"), 인당=("인당판매", "mean")).round(2).reset_index().sort_values("인당", ascending=False).reset_index(drop=True)
    tr["순위"] = tr.index + 1; tr["팀번호"] = tr.팀번호.astype(int); out["팀순위"] = recs(tr)
    a = d[d.유형 == "1인"].판매.values; b = cmp[cmp.유형 == "2인"].판매.values
    if len(a) and len(b):
        rng = np.random.default_rng(0)
        diffs = [rng.choice(a, len(a)).mean() - rng.choice(b, len(b)).mean() for _ in range(3000)]; pdf = [rng.choice(a, len(a)).mean() - rng.choice(b, len(b)).mean() / 2 for _ in range(3000)]
        out["신뢰구간"] = [{"항목": "배정 팀·일 판매 (1인 − 2인)", "일인": r(a.mean()), "이인": r(b.mean()), "차이": r(a.mean() - b.mean()), "하한": r(np.percentile(diffs, 2.5)), "상한": r(np.percentile(diffs, 97.5))},
                       {"항목": "인당 판매 (1인 − 2인)", "일인": r(a.mean()), "이인": r(b.mean() / 2), "차이": r(a.mean() - b.mean() / 2), "하한": r(np.percentile(pdf, 2.5)), "상한": r(np.percentile(pdf, 97.5))}]
        one, two = a.mean(), b.mean()
        out["인력환산"] = [{"시나리오": "2인 팀 1개 (2명)", "판매": r(two), "인당": r(two / 2), "비율": 100.0}, {"시나리오": "1인 팀 2개 (2명)", "판매": r(one * 2), "인당": r(one), "비율": r(one * 2 / two * 100, 1)}, {"시나리오": "1인 팀 1개 (1명)", "판매": r(one), "인당": r(one), "비율": r(one / two * 100, 1)}]
    return out

def run():
    months = []
    for mdir in sorted(glob.glob(os.path.join(BASE, "*월"))):
        fs = [f for f in glob.glob(os.path.join(mdir, "*.xlsx")) if re.search(r"_(\d{4})\.xlsx$", f) and not os.path.basename(f).startswith("~$")]
        if not fs: continue
        f = max(fs, key=lambda p: re.search(r"_(\d{4})\.xlsx$", p).group(1))
        try:
            o = one_month(f)
        except Exception as e:
            print("  solo 건너뜀", os.path.basename(f), e); o = None
        if o: months.append(o)
    months.sort(key=lambda o: o["월"])
    json.dump(months, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"  solo.json: {len(months)}달 ({', '.join(o['월'] + ' 1인 ' + str(o['배정'].get('1인', 0)) + '팀·일' for o in months)})")
run()
