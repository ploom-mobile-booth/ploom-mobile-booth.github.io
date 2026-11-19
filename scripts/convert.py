# -*- coding: utf-8 -*-
"""보고용 데일리 리포트 엑셀 → docs/data/*.json  (Ploom Mobile Booth Official)
달마다 그날까지 누적된 파일이 날짜별로 쌓이므로, 달별로 파일 이름의 _MMDD 가 가장 큰 파일만 쓴다.
사람 이름(영업사원·에이전트·점주·확인자)과 비용 분석은 넣지 않는다.
사용: py -3 scripts/convert.py
"""
import os, re, sys, json, glob, datetime as dt
import openpyxl
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "data"); os.makedirs(OUT, exist_ok=True)
SOURCES = [  # (연도, 폴더, 달별 하위 폴더 여부)
    (2025, r"C:\Users\VRID\OneDrive\Desktop\VRID\에이전트\2025\데일리리포트", False),
    (2026, r"C:\Users\VRID\OneDrive\Desktop\2026 Ploom Project\D2C\데일리 리포트\보고용", True),
]
MON = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6, "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}

def pick_files():
    """달별 최신 파일: [(연도, 월, 경로, 기준일 'MMDD')]"""
    out = []
    for year, folder, sub in SOURCES:
        pat = os.path.join(folder, "*", "*.xlsx") if sub else os.path.join(folder, "*.xlsx")
        best = {}
        for f in glob.glob(pat):
            b = os.path.basename(f)
            if b.startswith("~$"): continue
            m = re.search(r"_(\d{4})", b); mm = re.match(r"(?:\d{4}\s+)?([A-Z][a-z]{2})\.", b)
            if not m or not mm: continue
            month = MON[mm.group(1)]; d = m.group(1)
            if month not in best or d > best[month][0]: best[month] = (d, f)
        for month, (d, f) in best.items(): out.append((year, month, f, d))
    return sorted(out)

# ---------- 공통 ----------
def s(v):
    if v is None: return ""
    if isinstance(v, float) and v != v: return ""
    return str(v).strip()
YEAR_HINT = [None]   # '10월 02일' 처럼 연도가 없는 날짜용 (파일의 연도)
def kdate(v):
    if isinstance(v, (dt.datetime, dt.date)): return v.strftime("%Y-%m-%d")
    t = s(v)
    m = re.match(r"(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})", t)
    if m: return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    m = re.match(r"(\d{1,2})월\s*(\d{1,2})일", t)
    if m and YEAR_HINT[0]: return f"{YEAR_HINT[0]}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
    return None
def hour(v):
    if isinstance(v, (dt.datetime, dt.time)): return v.hour
    m = re.match(r"(\d{1,2})", s(v)); return int(m.group(1)) if m else None
def num(v, default=0):
    try:
        x = float(s(v).replace(",", "")); return int(x) if x == int(x) else x
    except ValueError: return default
def yn(v, yes, no):
    t = s(v)
    if not t or t == "-": return None
    if no in t: return 0
    return 1 if yes in t else None
def brand(v):
    t = s(v).replace(" ", "")
    if not t or t == "-": return None
    if t.startswith("CU"): return "CU"
    if re.match(r"^GS\d*", t): return "GS25"
    if "세븐" in t: return "세븐일레븐"
    if "이마트" in t: return "이마트24"
    if t.upper().startswith("CSPACE") or t.upper().startswith("C-SPACE"): return "C-Space"
    return t
CODE_BRAND = {"03": "CU", "09": "세븐일레븐", "05": "GS25", "23": "이마트24"}
def brand_by_code(code, fallback):   # 점포 코드 KA_03-… → CU, 09 → 세븐일레븐, 05 → GS25, 23 → 이마트24 (코드가 없거나 다른 체계면 적힌 브랜드)
    m = re.match(r"^KA_(\d{2})", s(code))
    return CODE_BRAND.get(m.group(1), fallback) if m else fallback
def code_of(v, name):   # 점포 코드가 'KA_…' 꼴이 아니면(흡연구역, - 등) 점포명으로 대신 식별
    t = s(v)
    if re.match(r"^KA_", t): return t
    n = s(name)
    return ("명:" + n) if n and n != "-" else None
def kind(v):
    t = s(v)
    if not t: return None
    if "흡연" in t or "흠연" in t: return "흡연구역"
    if "점포" in t or "신규" in t: return "점포"
    return None   # 'All Day', '3' 같이 열이 밀린 값은 버림
def route(v):
    t = s(v)
    if not t: return None
    if "MPOS" in t or "현장" in t: return "MPOS : 현장 판매"
    if "CVS" in t: return "CVS : 고객 할인 쿠폰 사용" if "할인" in t else "CVS : 다회용 쿠폰 사용"
    if "카카오" in t or "자사몰" in t or "홈페이지" in t or "온라인" in t: return "자사몰 : 온라인 결제"
    return t
def color(v):
    t = re.sub(r"\s+", "", s(v))
    if not t or t == "-": return None
    return {"네이비블루": "네이비 블루", "슬레이트그레이": "슬레이트 그레이", "오라이토레드": "오라이토 레드", "아쿠아헤일로": "아쿠아 헤일로", "루나실버": "루나 실버", "제트블랙": "제트 블랙"}.get(t, t)
def sido(addr):
    t = s(addr).split()
    if not t: return None
    a = t[0]
    for k, v in {"서울": "서울", "경기": "경기", "인천": "인천", "부산": "부산", "대구": "대구", "대전": "대전", "광주": "광주", "울산": "울산", "세종": "세종", "강원": "강원", "충북": "충북", "충남": "충남", "전북": "전북", "전남": "전남", "경북": "경북", "경남": "경남", "제주": "제주"}.items():
        if a.startswith(k): return v
    return None

def header_map(ws, keys, must, max_scan=6):
    """머리글 행(must 키워드가 있는 행)을 찾아 {표준열: 열번호} 와 머리글 행 번호 반환"""
    for i, r in enumerate(ws.iter_rows(min_row=1, max_row=max_scan, values_only=True), start=1):
        cells = [s(x) for x in r]
        if not any(any(m in c for m in must) for c in cells): continue
        col = {}
        for std, pats in keys:
            for j, c in enumerate(cells):
                if c and j not in col.values() and any(re.search(p, c) for p in pats): col[std] = j; break
        return col, i
    return None, None

def rows_of(ws, col, hrow):
    for r in ws.iter_rows(min_row=hrow + 1, values_only=True):
        if not r or all(x is None for x in r): continue
        o = {k: (r[j] if j < len(r) else None) for k, j in col.items()}; o["_raw"] = r; yield o

# ---------- 탭별 변환 ----------
DAILY = [("일자", [r"^날짜$", r"^Date$"]), ("운영구분", [r"운영 구분"]), ("판매", [r"디바이스 판매 수", r"^Sales Qty"]), ("방문자", [r"방문자", r"Visitor"]),
         ("회원가입", [r"^회원가입 수", r"^Membership"]), ("카카오", [r"카카오 친구추가 수", r"^Kakao"]), ("개인정보", [r"Personal Info"]), ("기프트카드", [r"Gift Card"]), ("복수구매", [r"Multi-Item"])]
SALES = [("일자", [r"^날짜$", r"^Date$"]), ("운영구분", [r"운영 구분", r"주간/야간"]), ("시간", [r"판매 시간", r"Sales Time"]), ("구분", [r"점포 구분", r"^Store Type"]),
         ("코드", [r"점포 코드", r"Store Code"]), ("브랜드", [r"점포 타입", r"Store Chain"]), ("점포명", [r"^점포명", r"Store Name"]), ("경로", [r"판매 경로", r"Transaction"]),
         ("색상", [r"디바이스 컬러", r"디바이스 색상", r"Device Color"]), ("수량", [r"판매 수량", r"^Sales Qty"]), ("회원가입", [r"회원가입 여부", r"^Membership"]),
         ("카카오", [r"카카오", r"^Kakao"]), ("기프트카드", [r"기프트카드 제공 수량", r"Gift Card"])]
STORES = [("일자", [r"^날짜$"]), ("시간대", [r"^시간$"]), ("구분", [r"점포 구분"]), ("코드", [r"점포 코드"]), ("브랜드", [r"점포 타입"]), ("점포명", [r"^점포명"]), ("판매", [r"^판매량"]), ("비고", [r"^비고"])]
CVS = [("일자", [r"^날짜$"]), ("코드", [r"점포 코드"]), ("브랜드", [r"점포 타입"]), ("점포명", [r"^점포명"]), ("출고일", [r"출고 일자"]), ("출고", [r"출고 수량"]), ("반납일", [r"반납 일자"]), ("반납", [r"반납 수량"])]
SCHED = [("팀", [r"^팀$"]), ("일자", [r"^날짜$"]), ("시간", [r"^시간$"]), ("신규", [r"^구분$"]), ("점포구분", [r"점포/흡연구역", r"^장소$"]),
         ("코드", [r"^점포코드$", r"^Account Code$", r"^Code$"]), ("브랜드", [r"^점포 타입$", r"^KA$", r"^Type$"]), ("점포명", [r"^점포명$", r"^Account Name$", r"^Name$"]),
         ("주소", [r"^주소$", r"^Address"]), ("구", [r"CTY_RGN_NM"]), ("권역", [r"Expansion_Re"]), ("지점", [r"^Depot$", r"^지점$", r"^DEPOT$"])]

def conv_daily(wb):
    ws = wb["데일리 리포트"]; col, h = header_map(ws, DAILY, ["No."]); out = []
    for r in rows_of(ws, col, h):
        d = kdate(r.get("일자"))
        if not d: continue
        o = {"일자": d, "운영구분": s(r.get("운영구분")) or None, "판매": num(r.get("판매")), "방문자": num(r.get("방문자"))}
        for k in ("회원가입", "카카오", "개인정보", "기프트카드", "복수구매"): o[k] = num(r.get(k), None) if k in col else None
        out.append(o)
    return out

def conv_sales(wb):
    ws = wb["판매 데이터"]; col, h = header_map(ws, SALES, ["No"]); out = []
    for r in rows_of(ws, col, h):
        d = kdate(r.get("일자"))
        if not d: continue
        out.append([d, hour(r.get("시간")), kind(r.get("구분")) if "구분" in col else None, code_of(r.get("코드"), r.get("점포명")), brand_by_code(r.get("코드"), brand(r.get("브랜드"))), s(r.get("점포명")) or None,
                    route(r.get("경로")), color(r.get("색상")), num(r.get("수량"), 1) or 1,
                    yn(r.get("회원가입"), "완료", "미완료") if "회원가입" in col else None, yn(r.get("카카오"), "완료", "미완료") if "카카오" in col else None,
                    num(r.get("기프트카드"), 0) if "기프트카드" in col else None, s(r.get("운영구분")) or None])
    return out
SALES_COLS = ["일자", "시", "구분", "점포코드", "브랜드", "점포명", "경로", "색상", "수량", "회원가입", "카카오", "기프트카드", "운영구분"]

def conv_stores(wb):
    ws = wb["프로그램 진행 완료 점포"]; col, h = header_map(ws, STORES, ["No."]); out = []
    for r in rows_of(ws, col, h):
        d = kdate(r.get("일자"))
        if not d or not s(r.get("코드")) and not s(r.get("점포명")): continue
        t = s(r.get("시간대")).replace(" ", "").lower(); t = "종일" if "all" in t or t in ("종일", "평일", "주말") else ("오전" if "오전" in t else "오후" if "오후" in t else "야간" if "야간" in t else (s(r.get("시간대")) or None))
        out.append([d, t, kind(r.get("구분")) if "구분" in col else None, code_of(r.get("코드"), r.get("점포명")), brand_by_code(r.get("코드"), brand(r.get("브랜드"))), s(r.get("점포명")) or None, num(r.get("판매")), 1 if s(r.get("비고")) else 0])
    return out
STORES_COLS = ["일자", "시간대", "구분", "점포코드", "브랜드", "점포명", "판매", "비고있음"]

def conv_cvs(wb):
    if "CVS 차용 데이터" not in wb.sheetnames: return []
    ws = wb["CVS 차용 데이터"]; col, h = header_map(ws, CVS, ["No."]); out = []
    if not col: return []
    for r in rows_of(ws, col, h):
        d = kdate(r.get("일자"))
        if not d: continue
        out.append([d, code_of(r.get("코드"), r.get("점포명")), brand_by_code(r.get("코드"), brand(r.get("브랜드"))), s(r.get("점포명")) or None, num(r.get("출고")), num(r.get("반납")), kdate(r.get("반납일")) if "반납일" in col else None])
    return out
CVS_COLS = ["일자", "점포코드", "브랜드", "점포명", "출고", "반납", "반납일"]

def conv_feedback(wb, year, month):
    if "소비자 피드백 데이터" not in wb.sheetnames: return []
    ws = wb["소비자 피드백 데이터"]; out = []; period = ""; week = ""
    for r in ws.iter_rows(min_row=1, values_only=True):
        c = [s(x) for x in r[:4]] + ["", "", "", ""]
        if c[2].startswith("□") or (c[2] and c[3] and "문의" not in c[2]):
            if c[1]: period = c[1].replace("\n", " "); week = c[0] or week
            typ = c[2].replace("□", "").strip(); txt = c[3]
            if txt and txt != "-": out.append({"연도": year, "월": month, "주차": period, "유형": typ, "내용": txt})
    return out

def conv_schedule(wb):
    out = []
    sheets = [ws for ws in wb.worksheets if "스케" in ws.title]
    if not sheets: sheets = [ws for ws in wb.worksheets if "대상 점포" in ws.title]   # 스케줄 탭이 없는 달(2025-05)은 대상 점포 리스트에 팀·날짜가 있다
    for ws in sheets:
        col, h = header_map(ws, SCHED, ["팀"], max_scan=3)
        if not col or "일자" not in col: continue
        prev_team, prev_date = None, None   # 팀·날짜가 병합 셀이라 아래 줄이 빈 경우(2025-04 등) 바로 위 값을 이어받는다
        for r in rows_of(ws, col, h):
            raw0 = [s(x) for x in r["_raw"]]
            is_store = any(re.match(r"^KA_[\dA-Z]", x) for x in raw0) or s(r.get("점포명"))
            if s(r.get("팀")): prev_team = r.get("팀")
            elif is_store: r["팀"] = prev_team
            d = kdate(r.get("일자"))
            if d: prev_date = d
            elif is_store and prev_date: d = prev_date
            if not d: continue
            # 머리글과 자료가 어긋난 달(2025-09 등): 점포 코드(KA_…) 위치를 기준으로 열을 다시 잡는다
            raw = [s(x) for x in r["_raw"]]
            if not re.match(r"^KA_", s(r.get("코드"))):
                ci = next((i for i, x in enumerate(raw) if re.match(r"^KA_[\dA-Z]", x)), None)
                if ci is not None:
                    r["코드"], r["브랜드"], r["점포명"], r["주소"] = raw[ci], raw[ci + 1] if ci + 1 < len(raw) else "", raw[ci + 2] if ci + 2 < len(raw) else "", raw[ci + 3] if ci + 3 < len(raw) else ""
                    r["점포구분"] = raw[ci - 1] if ci >= 1 and ("점포" in raw[ci - 1] or "흡연" in raw[ci - 1]) else None
                    r["신규"] = raw[ci - 2] if ci >= 2 and raw[ci - 2] in ("기존", "신규") else None
                    r["구"] = next((x for x in raw[ci + 4:ci + 7] if re.match(r"^[가-힣]{1,4}(구|시|군)$", x)), None)
                    col.setdefault("주소", 0); col.setdefault("점포구분", 0)
            if not re.match(r"^[가-힣]{1,4}(구|시|군)$", s(r.get("구"))): r["구"] = None
            team = re.sub(r"\D", "", s(r.get("팀")))
            nk = s(r.get("신규")); nk = "신규" if "신규" in nk or nk.startswith("신") else ("기존" if "기존" in nk else None)
            out.append([d, int(team) if team else None, s(r.get("시간")) or None, nk, kind(r.get("점포구분")) if "점포구분" in col else None,
                        code_of(r.get("코드"), r.get("점포명")), brand_by_code(r.get("코드"), brand(r.get("브랜드"))), s(r.get("점포명")) or None, s(r.get("구")) or None, sido(r.get("주소")) if "주소" in col else None,
                        zone(r.get("권역")), depot(r.get("지점"))])
    return out
SCHED_COLS = ["일자", "팀", "시간", "신규", "점포구분", "점포코드", "브랜드", "점포명", "구", "시도", "권역", "지점"]
def zone(v):
    t = s(v)
    if not t: return None
    return {"Seoul": "서울", "Incheon": "인천", "1st Expansion": "1차 확장", "2nd Expansion": "2차 확장"}.get(t, t)
def depot(v):   # 지점 이름만 받고(열이 밀려 사람 이름이 들어온 경우는 버림) 표기를 통일
    t = s(v).upper()
    for k, name in [("SOUTH SEOUL", "South Seoul"), ("EAST SEOUL", "East Seoul"), ("INCHEON", "Incheon"), ("SUWON", "Suwon"), ("HQ", "HQ")]:
        if k in t: return name
    return None

def pack(cols, rows, dict_cols):
    dicts, enc = {}, {}
    for c in dict_cols:
        i = cols.index(c); vals = sorted({str(r[i]) for r in rows if r[i] is not None and r[i] != ""})
        dicts[c] = vals; enc[c] = {v: k for k, v in enumerate(vals)}
    packed = []
    for r in rows:
        packed.append([(enc[c].get(str(v)) if v is not None and v != "" else None) if c in enc else v for c, v in zip(cols, r)])
    return {"cols": cols, "dict": dicts, "rows": packed}

def save(name, obj):
    p = os.path.join(OUT, name); json.dump(obj, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    n = len(obj["rows"]) if isinstance(obj, dict) and "rows" in obj else len(obj)
    print(f"  {name}: {n}행, {os.path.getsize(p)//1024}KB")

# ---------- 실행 ----------
files = pick_files()
daily, sales, stores, cvs, feedback, sched, meta = [], [], [], [], [], [], []
for year, month, f, d in files:
    YEAR_HINT[0] = year
    wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
    a, b_, c, e, g, h = conv_daily(wb), conv_sales(wb), conv_stores(wb), conv_cvs(wb), conv_feedback(wb, year, month), conv_schedule(wb)
    ym = f"{year}-{month:02d}"
    keep = lambda rows, i=0: [r for r in rows if (r[i] if isinstance(r, list) else r["일자"])[:7] == ym]   # 그 달 자료만 (앞달 복사본 섞임 방지)
    a, b_, c, e, h = keep(a), keep(b_), keep(c), keep(e), keep(h)
    daily += a; sales += b_; stores += c; cvs += e; feedback += g; sched += h
    meta.append({"연도": year, "월": month, "파일": os.path.basename(f), "기준일": f"{year}-{d[:2]}-{d[2:]}", "판매": sum(r[8] for r in b_), "일수": len(a)})
    print(f"{ym} {os.path.basename(f)}: 일 {len(a)}, 판매 {len(b_)}건 {sum(r[8] for r in b_)}대, 점포일 {len(c)}, 차용 {len(e)}, 피드백 {len(g)}, 스케줄 {len(h)}")
daily.sort(key=lambda r: r["일자"]); sales.sort(key=lambda r: (r[0], r[1] or 0))
save("daily.json", daily)
save("sales.json", pack(SALES_COLS, sales, ["일자", "구분", "점포코드", "브랜드", "점포명", "경로", "색상", "운영구분"]))
save("stores.json", pack(STORES_COLS, stores, ["일자", "시간대", "구분", "점포코드", "브랜드", "점포명"]))
save("cvs.json", pack(CVS_COLS, cvs, ["일자", "점포코드", "브랜드", "점포명", "반납일"]))
save("feedback.json", feedback)
save("schedule.json", pack(SCHED_COLS, sched, ["일자", "시간", "신규", "점포구분", "점포코드", "브랜드", "점포명", "구", "시도", "권역", "지점"]))
latest = max(meta, key=lambda m: m["기준일"])
json.dump({"files": meta, "updated": dt.datetime.now().strftime("%Y-%m-%d %H:%M"), "latest": latest["기준일"], "latest_file": latest["파일"]}, open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("기준:", latest["기준일"], latest["파일"])

# ---------- Activation 시트: Channel = Ploom Agent 행 → funnel.json ----------
ACTIVATION = r"C:\Users\VRID\OneDrive\Desktop\2026 Ploom Project\D2C\세일즈 데이터\Raw Data"   # 2025~26 RRP Activation Data_*.xlsx (가장 최근 파일)
TEAM_DAY = r"C:\Users\VRID\ploom-report\docs\data\team_day.json"   # 내부 사이트의 팀·일 활동 요약 (시작 시각·활동 시간·방문 점포)
def conv_activation():
    fs = sorted(glob.glob(os.path.join(ACTIVATION, "*RRP Activation Data*.xlsx")), key=os.path.getmtime)
    if not fs: print("Activation 파일 없음"); return
    wb = openpyxl.load_workbook(fs[-1], read_only=True, data_only=True)
    ws = next((w for w in wb.worksheets if "Activation" in w.title), wb.worksheets[1])
    rows = list(ws.iter_rows(values_only=True))
    hi = next(i for i, r in enumerate(rows) if r and s(r[0]) == "Commercial Engine"); hdr = rows[hi]
    R = {s(r[1]): r for r in rows[hi + 1:] if r and s(r[2]) == "Ploom Agent"}
    KEY = {"접촉": "# of contacts (exposure)", "응대": "# of 1-2-1 engagements", "판매": "# of device sold", "시용": "# of trials", "카카오": "# of subscription to Kakao",
           "웹가입": "# of subscription to Ploom Website", "프로모터": "# of promotors", "스팟": "# of execution spots/events (per month)", "운영일": "# of operation days", "근무시간": "# of working hours (operation days*working hours)"}
    out = []
    for i in range(3, len(hdr)):
        h = hdr[i]
        if isinstance(h, (dt.datetime, dt.date)): ym = h.strftime("%Y-%m")
        else:
            m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", s(h))
            if not m: continue
            ym = f"{m.group(3)}-{int(m.group(1)):02d}"
        o = {"월": ym}
        for k, src in KEY.items():
            v = R[src][i] if src in R and i < len(R[src]) else None
            o[k] = num(v, 0) if v not in (None, "") else 0
        if o["접촉"] or o["판매"]: out.append(o)
    json.dump(out, open(os.path.join(OUT, "funnel.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print(f"  funnel.json: {len(out)}달 ({os.path.basename(fs[-1])})")

# ---------- 내부 활동 요약 → ops.json (팀 번호·이름 없이 달별 요약만) ----------
def conv_ops():
    if not os.path.exists(TEAM_DAY): print("team_day 없음"); return
    j = json.load(open(TEAM_DAY, encoding="utf-8")); cols = j["cols"]; d = j["dict"]
    rows = [{c: (d[c][v] if c in d and v is not None else v) for c, v in zip(cols, r)} for r in j["rows"]]
    rows = [r for r in rows if r.get("팀") and r["팀"] < 900]
    hm = lambda t: (int(t[:2]) + int(t[3:5]) / 60) if t else None
    bym = {}
    for r in rows: bym.setdefault(r["일자"][:7], []).append(r)
    out = []
    for m, g in sorted(bym.items()):
        st = sorted(hm(r["활동시작"]) for r in g if r.get("활동시작")); hrs = [r["활동시간"] for r in g if r.get("활동시간") is not None]
        dist = {}
        for v in st: k = int(v * 2) / 2; dist[k] = dist.get(k, 0) + 1
        o = {"월": m, "팀일": len(g), "시작중앙값": None, "시작평균": None, "10시30분전시작비율": None, "평균활동시간": round(sum(hrs) / len(hrs), 2) if hrs else None,
             "하루방문점포": round(sum(r["방문점포"] for r in g) / len(g), 2), "이동팀일비율": round(sum(1 for r in g if r["이동"] > 0) / len(g) * 100, 1), "팀일당판매": round(sum(r["판매"] for r in g) / len(g), 2),
             "미판매율": round(sum(1 for r in g if r["판매"] == 0) / len(g) * 100, 1),
             "시작분포": [{"시각": "%02d:%02d" % (int(k), int((k % 1) * 60)), "비율": round(v / len(st) * 100, 1)} for k, v in sorted(dist.items()) if 9 <= k <= 12] if st else []}
        if st:
            med = st[len(st) // 2]; mean = sum(st) / len(st)
            o["시작중앙값"] = "%02d:%02d" % (int(med), int((med % 1) * 60)); o["시작평균"] = "%02d:%02d" % (int(mean), int((mean % 1) * 60)); o["10시30분전시작비율"] = round(sum(1 for v in st if v <= 10.5) / len(st) * 100, 1)
        out.append(o)
    json.dump(out, open(os.path.join(OUT, "ops.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print(f"  ops.json: {len(out)}달")

conv_activation(); conv_ops()
