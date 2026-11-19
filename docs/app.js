// Ploom Mobile Booth Official — 보고용 데일리 리포트 자료를 화면에서 집계
(() => {
  const $ = id => document.getElementById(id);
  const WD = ['월', '화', '수', '목', '금', '토', '일'];
  const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  const sum = (a, f) => a.reduce((s, r) => s + (+f(r) || 0), 0);
  const uniq = (a, f) => new Set(a.map(f)).size;
  const group = (a, kf) => { const m = new Map(); a.forEach(r => { const k = kf(r); let g = m.get(k); if (!g) m.set(k, g = []); g.push(r); }); return m; };
  const pct = (a, b) => b ? r1(a / b * 100) : null, chg = (a, b) => b ? r1((a - b) / b * 100) : null;
  const wday = d => WD[(new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7];
  const weekStart = d => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - (t.getUTCDay() + 6) % 7); return t.toISOString().slice(0, 10); };
  const mlabel = m => parseInt(m.slice(5, 7)) + '월';
  const decode = j => { const cols = j.cols, dict = j.dict || {}; return j.rows.map(a => { const o = {}; cols.forEach((c, i) => { let v = a[i]; if (dict[c] && v != null) v = dict[c][v]; o[c] = v; }); return o; }); };
  const D = { daily: [], sales: [], stores: [], cvs: [], feedback: [], sched: [], meta: null };
  const F = { year: '', month: '', brand: '', kind: '' };

  // ---------- 열지도 그리기, 표 정렬 ----------
  dash.draw('heat', el => {
    const d = dash.data(el.dataset.source); el.replaceChildren(); if (d.status !== 'ok' || !d.data.length) return;
    const rows = d.data, R = el.dataset.row, C = el.dataset.col, V = el.dataset.value;
    const rk = [...new Set(rows.map(r => r[R]))], ck = [...new Set(rows.map(r => r[C]))].sort((a, b) => a - b);
    const max = Math.max(...rows.map(r => +r[V] || 0)) || 1;
    const t = document.createElement('table'); t.className = 'heat';
    const th = document.createElement('tr'); th.appendChild(document.createElement('th')); ck.forEach(c => { const x = document.createElement('th'); x.textContent = c + '시'; th.appendChild(x); }); t.appendChild(th);
    rk.forEach(rv => { const tr = document.createElement('tr'); const h = document.createElement('th'); h.textContent = rv + '요일'; tr.appendChild(h);
      ck.forEach(cv => { const r = rows.find(x => x[R] === rv && x[C] === cv); const v = r ? +r[V] : 0; const td = document.createElement('td'); const a = v / max; td.style.background = `rgba(30,58,110,${(0.06 + a * 0.9).toFixed(2)})`; td.style.color = a > 0.55 ? '#fff' : 'var(--color-fg)'; td.textContent = v ? (Number.isInteger(v) ? v : v.toFixed(1)) : ''; td.title = rv + '요일 ' + cv + '시: ' + v; tr.appendChild(td); });
      t.appendChild(tr); });
    el.appendChild(t);
  });
  const sortState = {};
  document.addEventListener('click', ev => {
    const th = ev.target.closest('.pl table[data-source] thead th[data-field]'); if (!th) return;
    const table = th.closest('table'), src = table.dataset.source, f = th.dataset.field;
    const d = dash.data(src); if (d.status !== 'ok') return;
    const key = src + '|' + f; const dir = sortState[key] === 'desc' ? 'asc' : 'desc'; Object.keys(sortState).forEach(k => { if (k.startsWith(src + '|')) delete sortState[k]; }); sortState[key] = dir;
    const rows = d.data.slice().sort((a, b) => { const x = a[f], y = b[f]; if (x == null) return 1; if (y == null) return -1; const n = (typeof x === 'number' && typeof y === 'number') ? x - y : String(x).localeCompare(String(y), 'ko'); return dir === 'asc' ? n : -n; });
    dash.set(src, rows); table.querySelectorAll('thead th').forEach(x => x.classList.remove('asc', 'desc')); th.classList.add(dir); dash.render();
  });

  // ---------- 자료 읽기 ----------
  async function load() {
    const v = Date.now(), get = n => fetch('data/' + n + '.json?v=' + v).then(r => r.json());
    const [daily, sales, stores, cvs, feedback, sched, meta] = await Promise.all([get('daily'), get('sales'), get('stores'), get('cvs'), get('feedback'), get('schedule'), get('meta')]);
    D.daily = daily; D.sales = decode(sales); D.stores = decode(stores); D.cvs = decode(cvs); D.feedback = feedback; D.sched = decode(sched); D.meta = meta;
    const addm = r => { r.월 = r.일자.slice(0, 7); r.연도 = r.일자.slice(0, 4); r.요일 = wday(r.일자); };
    D.daily.forEach(addm); D.sales.forEach(addm); D.stores.forEach(addm); D.cvs.forEach(addm); D.sched.forEach(addm);
    // 스케줄로 점포·일의 지역·신규 여부 보강
    const sk = new Map(); D.sched.forEach(r => { if (r.점포코드) sk.set(r.일자 + '|' + r.점포코드, r); });
    const codeInfo = new Map(); D.sched.forEach(r => { if (r.점포코드 && !codeInfo.has(r.점포코드)) codeInfo.set(r.점포코드, r); });
    const enrich = r => { const s = (r.점포코드 && (sk.get(r.일자 + '|' + r.점포코드) || codeInfo.get(r.점포코드))) || null; r.구 = s ? s.구 : null; r.시도 = s ? s.시도 : null; r.권역 = s ? s.권역 : null; r.신규 = s ? (s.신규 || null) : null; };
    D.stores.forEach(enrich); D.sales.forEach(enrich);
    $('updated').textContent = meta.latest + ' 파일'; $('updated2').textContent = '마지막 파일 ' + meta.latest_file;
  }

  // ---------- 필터 ----------
  function buildBar() {
    const years = [...new Set(D.daily.map(r => r.연도))].sort().reverse();
    $('f-year').innerHTML = years.map(y => `<option value="${y}">${y}년${y === years[0] ? ' (올해)' : ''}</option>`).join('');
    F.year = years[0];
    const brands = [...new Set(D.sales.map(r => r.브랜드).filter(Boolean))].sort(); brands.forEach(b => { const o = document.createElement('option'); o.textContent = b; $('f-brand').appendChild(o); });
    const kinds = [...new Set(D.stores.map(r => r.구분).filter(Boolean))].sort(); kinds.forEach(b => { const o = document.createElement('option'); o.textContent = b; $('f-kind').appendChild(o); });
    fillMonths();
    ['f-year', 'f-month', 'f-brand', 'f-kind'].forEach(id => $(id).addEventListener('change', () => { F.year = $('f-year').value; if (id === 'f-year') { fillMonths(); F.month = ''; } else F.month = $('f-month').value; F.brand = $('f-brand').value; F.kind = $('f-kind').value; apply(); }));
    $('f-reset').addEventListener('click', () => { F.year = $('f-year').options[0].value; $('f-year').value = F.year; fillMonths(); F.month = ''; F.brand = ''; F.kind = ''; $('f-brand').value = ''; $('f-kind').value = ''; apply(); });
    $('store-q').addEventListener('input', () => { storeSearch(); dash.render(); });
  }
  function fillMonths() {
    const months = [...new Set(D.daily.filter(r => r.연도 === F.year).map(r => r.월))].sort();
    $('f-month').innerHTML = '<option value="">전체</option>' + months.map(m => `<option value="${m}">${mlabel(m)}</option>`).join('');
  }
  const matchYM = r => (!F.year || r.연도 === F.year) && (!F.month || r.월 === F.month);
  const matchBK = r => (!F.brand || r.브랜드 === F.brand) && (!F.kind || r.구분 === F.kind);
  const bkActive = () => !!(F.brand || F.kind);

  // ---------- 집계 ----------
  const storeStats = g => { const z = g.filter(r => +r.판매 === 0).length; return { 점포일: g.length, 판매: sum(g, r => r.판매), 점포일당: g.length ? r2(sum(g, r => r.판매) / g.length) : null, 미판매율: g.length ? r1(z / g.length * 100) : null }; };
  const rate = (g, f) => { const h = g.filter(r => f(r) != null); return h.length ? r1(h.filter(r => f(r) === 1).length / h.length * 100) : null; };

  function summary(S, ST, DY) {
    const 판매 = sum(S, r => r.수량), 일수 = uniq(S, r => r.일자), 방문자 = sum(DY, r => r.방문자);
    const st = storeStats(ST);
    const gift = DY.some(r => r.기프트카드 != null) ? sum(DY, r => r.기프트카드) : (S.some(r => r.기프트카드 != null) ? sum(S, r => r.기프트카드) : null);
    return { 판매, 일수, 방문자, 전환율: pct(판매, 방문자), 일평균: 일수 ? r1(판매 / 일수) : null, 점포일: st.점포일, 점포일당: st.점포일당, 미판매율: st.미판매율,
      판매점포: uniq(S.filter(r => r.점포코드), r => r.점포코드), 진행점포: uniq(ST.filter(r => r.점포코드), r => r.점포코드),
      회원가입률: rate(S, r => r.회원가입), 카카오율: rate(S, r => r.카카오), 기프트카드: gift, 기프트카드대당: (gift != null && 판매) ? r2(gift / 판매) : null,
      복수구매: DY.some(r => r.복수구매 != null) ? sum(DY, r => r.복수구매) : null };
  }
  const share = (id, rows, key, kf, top) => { let a = [...group(rows.filter(r => kf(r)), kf)].map(([k, g]) => ({ [key]: k, 판매: sum(g, r => r.수량) })).sort((x, y) => y.판매 - x.판매); const t = sum(a, r => r.판매); if (top && a.length > top) a = a.slice(0, top - 1).concat([{ [key]: '기타', 판매: sum(a.slice(top - 1), r => r.판매) }]); a.forEach(r => r.비중 = pct(r.판매, t)); dash.set(id, a); return a; };

  function apply() {
    const S = D.sales.filter(r => matchYM(r) && matchBK(r)), ST = D.stores.filter(r => matchYM(r) && matchBK(r)), DY = D.daily.filter(matchYM);
    const o = summary(S, ST, DY); dash.set('ov', [o]);
    document.querySelectorAll('.card.nofilter').forEach(c => c.classList.remove('nofilter'));
    // 머리말
    const ym = F.month ? mlabel(F.month) : (F.year + '년 누적'); $('ov-title').textContent = ym;
    const days = DY.map(r => r.일자).sort(); $('ov-sub').textContent = days.length ? days[0].slice(5).replace('-', '/') + ' ~ ' + days[days.length - 1].slice(5).replace('-', '/') + ' · 보고용 리포트 ' + (D.meta.latest || '') + ' 파일까지' : '자료 없음';
    renderChips();
    share('ov_route', S, '경로', r => r.경로); share('ov_brand', S, '브랜드', r => r.브랜드); share('ov_color', S, '색상', r => r.색상, 6);
    // 월별
    const months = [...new Set(DY.map(r => r.월).concat(S.map(r => r.월)))].sort();
    const mrows = months.map(m => { const s = summary(S.filter(r => r.월 === m), ST.filter(r => r.월 === m), DY.filter(r => r.월 === m)); return Object.assign({ 월: mlabel(m), 월키: m }, s); });
    dash.set('m_month', mrows);
    // 일별 (한눈에 보기: 월 필터가 없으면 가장 최근 달)
    const lastM = F.month || months[months.length - 1];
    const drows = [...new Set(DY.map(r => r.일자).concat(S.map(r => r.일자)))].sort().map(d => { const s = S.filter(r => r.일자 === d), st = ST.filter(r => r.일자 === d), dy = DY.filter(r => r.일자 === d); const x = storeStats(st);
      return { 일자: d, 요일: wday(d), 판매: sum(s, r => r.수량), 방문자: sum(dy, r => r.방문자) || null, 전환율: pct(sum(s, r => r.수량), sum(dy, r => r.방문자)), 점포일: x.점포일, 점포일당: x.점포일당, 미판매: st.filter(r => +r.판매 === 0).length, 회원가입: dy.some(r => r.회원가입 != null) ? sum(dy, r => r.회원가입) : s.filter(r => r.회원가입 === 1).length || null, 카카오: dy.some(r => r.카카오 != null) ? sum(dy, r => r.카카오) : s.filter(r => r.카카오 === 1).length || null, 기프트카드: dy.some(r => r.기프트카드 != null) ? sum(dy, r => r.기프트카드) : (s.some(r => r.기프트카드 != null) ? sum(s, r => r.기프트카드) : null) }; });
    dash.set('m_daily', drows.slice().reverse());
    dash.set('ov_daily', drows.filter(r => r.일자.slice(0, 7) === lastM)); $('ov-daily-title').textContent = (lastM ? mlabel(lastM) + ' ' : '') + '일별 판매 (대)';
    $('ov-month-title').textContent = F.year + '년 월별 판매 (대)';
    dash.set('m_week', [...group(S, r => weekStart(r.일자))].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([w, g]) => { const st = ST.filter(r => weekStart(r.일자) === w); return { 주: w, 판매: sum(g, r => r.수량), 점포일당: st.length ? r2(sum(st, r => r.판매) / st.length) : null }; }));
    dash.set('ov_hour', [...group(S.filter(r => r.시 != null && r.시 >= 9 && r.시 <= 20), r => +r.시)].sort((a, b) => a[0] - b[0]).map(([h, g]) => ({ 시간: h, 판매: sum(g, r => r.수량) })));
    dash.set('ov_wday', WD.map(w => { const g = S.filter(r => r.요일 === w), d = uniq(g, r => r.일자); return d ? { 요일: w, 판매: sum(g, r => r.수량), 일평균: r1(sum(g, r => r.수량) / d) } : null; }).filter(Boolean));
    const heat = []; WD.forEach(w => { const g = S.filter(r => r.요일 === w), d = uniq(g, r => r.일자); if (!d) return; for (let h = 9; h <= 19; h++) heat.push({ 요일: w, 시간: h, 일평균: r1(sum(g.filter(r => +r.시 === h), r => r.수량) / d) }); }); dash.set('m_heat', heat);
    dash.set('ov_kind', [...group(ST.filter(r => r.구분), r => r.구분)].map(([k, g]) => Object.assign({ 구분: k }, storeStats(g))).sort((a, b) => b.점포일당 - a.점포일당));
    // 점포
    dash.set('s_brand_kind', [...group(ST.filter(r => r.브랜드), r => r.브랜드 + '|' + (r.구분 || '미구분'))].map(([k, g]) => Object.assign({ 브랜드: g[0].브랜드, 구분: g[0].구분 || '미구분' }, storeStats(g))).sort((a, b) => b.점포일당 - a.점포일당));
    dash.set('s_brand', [...group(ST.filter(r => r.브랜드), r => r.브랜드)].map(([k, g]) => Object.assign({ 브랜드: k, 점포수: uniq(g, r => r.점포코드) }, storeStats(g))).sort((a, b) => b.판매 - a.판매));
    dash.set('s_slot', [...group(ST.filter(r => r.시간대), r => r.시간대)].map(([k, g]) => Object.assign({ 시간대: k }, storeStats(g))).sort((a, b) => b.점포일 - a.점포일));
    dash.set('s_new', [...group(ST.filter(r => r.신규), r => r.신규)].map(([k, g]) => Object.assign({ 구분: k }, storeStats(g))).sort((a, b) => b.점포일 - a.점포일));
    const visits = new Map(); ST.filter(r => r.점포코드).slice().sort((a, b) => a.일자 < b.일자 ? -1 : 1).forEach(r => { const n = (visits.get(r.점포코드) || 0) + 1; visits.set(r.점포코드, n); r._n = n; });
    dash.set('s_visit', [1, 2, 3, 4, 5].map(n => { const g = ST.filter(r => n < 5 ? r._n === n : r._n >= 5); return g.length ? { 차수: n < 5 ? n : '5+', 점포일당: r2(sum(g, r => r.판매) / g.length), 점포일: g.length } : null; }).filter(Boolean));
    dash.set('s_dist', [['0대', v => v === 0], ['1~2대', v => v >= 1 && v <= 2], ['3~5대', v => v >= 3 && v <= 5], ['6~9대', v => v >= 6 && v <= 9], ['10대 이상', v => v >= 10]].map(([k, t]) => { const g = ST.filter(r => t(+r.판매)); return { 구간: k, 점포일: g.length, 비중: pct(g.length, ST.length) }; }));
    STORES = [...group(ST.filter(r => r.점포코드), r => r.점포코드)].map(([k, g]) => { const d = g.map(r => r.일자).sort(); return { 점포코드: k, 점포명: g[0].점포명, 브랜드: g[0].브랜드, 구분: g[0].구분, 구: g[0].구, 판매: sum(g, r => r.판매), 진행일: g.length, 일당: r2(sum(g, r => r.판매) / g.length), 미판매일: g.filter(r => +r.판매 === 0).length, 첫진행: d[0], 마지막진행: d[d.length - 1] }; }).sort((a, b) => b.판매 - a.판매);
    storeSearch();
    // 지역
    const sido = r => r.시도 || '미상';
    dash.set('r_sido', [...group(ST, sido)].map(([k, g]) => ({ 시도: k, 판매: sum(g, r => r.판매) })).sort((a, b) => b.판매 - a.판매));
    dash.set('r_zone', [...group(ST.filter(r => r.권역), r => r.권역)].map(([k, g]) => ({ 권역: k, 판매: sum(g, r => r.판매), 점포일: g.length })).sort((a, b) => b.판매 - a.판매));
    dash.set('r_gu', [...group(ST.filter(r => r.구), r => (r.시도 || '') + '|' + r.구)].map(([k, g]) => Object.assign({ 시도: g[0].시도 || '', 구: g[0].구, 점포수: uniq(g, r => r.점포코드) }, storeStats(g))).sort((a, b) => b.판매 - a.판매));
    dash.set('r_month_sido', months.map(m => { const g = ST.filter(r => r.월 === m); const o = { 월: mlabel(m), 판매: sum(g, r => r.판매) }; ['서울', '경기', '인천'].forEach(s => o[s] = sum(g.filter(r => r.시도 === s), r => r.판매)); o.기타 = o.판매 - o.서울 - o.경기 - o.인천; return o; }));
    // 상품·고객
    share('x_color', S, '색상', r => r.색상); share('x_route', S, '경로', r => r.경로);
    const topColors = share('x_color', S, '색상', r => r.색상).slice(0, 6).map(r => r.색상);
    const cm = []; months.forEach(m => { const g = S.filter(r => r.월 === m), t = sum(g, r => r.수량); topColors.forEach(c => cm.push({ 월: mlabel(m), 색상: c, 비중: pct(sum(g.filter(r => r.색상 === c), r => r.수량), t) })); }); dash.set('x_color_month', cm);
    const lg = $('x-color-legend'); lg.innerHTML = topColors.map((c, i) => `<span><i data-c="${i}"></i>${c}</span>`).join('');
    const conv = []; mrows.forEach(m => { conv.push({ 월: m.월, 지표: '회원가입 완료율', 값: m.회원가입률 }); conv.push({ 월: m.월, 지표: '카카오 채널 추가율', 값: m.카카오율 }); conv.push({ 월: m.월, 지표: '방문자 대비 판매', 값: m.전환율 }); }); dash.set('x_conv', conv);
    // CVS 차용 (브랜드 필터만 적용)
    const C = D.cvs.filter(r => matchYM(r) && (!F.brand || r.브랜드 === F.brand));
    dash.set('c_sum', [{ 출고: sum(C, r => r.출고), 반납: sum(C, r => r.반납), 미반납: sum(C, r => r.출고) - sum(C, r => r.반납), 건수: C.length, 점포수: uniq(C.filter(r => r.점포코드 || r.점포명), r => r.점포코드 || r.점포명) }]);
    dash.set('c_month', [...group(C, r => r.월)].sort().map(([m, g]) => ({ 월: mlabel(m), 출고: sum(g, r => r.출고), 반납: sum(g, r => r.반납) })));
    dash.set('c_brand', [...group(C.filter(r => r.브랜드), r => r.브랜드)].map(([k, g]) => ({ 브랜드: k, 출고: sum(g, r => r.출고), 반납: sum(g, r => r.반납) })).sort((a, b) => b.출고 - a.출고));
    dash.set('c_rows', C.slice().sort((a, b) => a.일자 < b.일자 ? 1 : -1).map(r => ({ 일자: r.일자, 점포명: r.점포명, 브랜드: r.브랜드, 출고: r.출고, 반납: r.반납, 반납일: r.반납일 || '', 상태: r.반납 >= r.출고 && r.출고 ? '반납 완료' : (r.반납 ? '일부 반납' : '미반납') })));
    // 피드백
    const fb = D.feedback.filter(r => (!F.year || String(r.연도) === F.year) && (!F.month || r.월 === parseInt(F.month.slice(5, 7))));
    const byW = group(fb, r => r.연도 + '-' + String(r.월).padStart(2, '0') + '|' + r.주차);
    $('fb-list').innerHTML = [...byW].sort((a, b) => a[0] < b[0] ? 1 : -1).map(([k, g]) => `<div class="card fb-week"><h3>${parseInt(k.slice(5, 7))}월 ${g[0].주차}</h3>${g.map(r => `<div class="fb-item"><b>${r.유형}</b><div>${r.내용.replace(/</g, '&lt;')}</div></div>`).join('')}</div>`).join('') || '<p class="note">해당 기간 피드백이 없습니다.</p>';
    // 작년 비교
    compare();
    markNoFilter(); dash.render();
  }
  let STORES = [];
  function storeSearch() {
    const q = ($('store-q').value || '').trim().toLowerCase();
    const list = q ? STORES.filter(o => [o.점포명, o.브랜드, o.구, o.점포코드].some(v => v && String(v).toLowerCase().includes(q))) : STORES;
    dash.set('s_stores', list.slice(0, q ? 200 : 60)); $('store-count').textContent = (q ? list.length + '곳 중 ' + Math.min(200, list.length) + '곳' : '판매 순 60곳 · 전체 ' + STORES.length + '곳');
  }
  function markNoFilter() {
    // 방문자·기프트카드는 데일리 리포트 기준이라 브랜드·구분 필터가 적용되지 않음
    const on = bkActive(); ['ov-sub'].forEach(() => {});
    document.querySelectorAll('[data-field="방문자"],[data-field="전환율"],[data-field="기프트카드"],[data-field="복수구매"]').forEach(el => { const c = el.closest('.kpi, .card, .hero-stats > div'); if (c) c.classList.toggle('nofilter', on && !c.classList.contains('hero')); });
  }
  function renderChips() {
    const parts = [F.year + '년', F.month ? mlabel(F.month) : '전체 달', F.brand, F.kind].filter(Boolean);
    $('chips').textContent = parts.join(' · ') + (bkActive() ? ' (방문자·기프트카드는 브랜드·구분 필터 미적용)' : '');
  }

  // ---------- 작년 비교 ----------
  function compare() {
    const years = [...new Set(D.daily.map(r => r.연도))].sort(); if (years.length < 2) { $('cmp-range').textContent = '비교할 작년 자료가 없습니다.'; return; }
    const cur = years[years.length - 1], prev = years[years.length - 2];
    const mm = r => r.일자.slice(5, 7);
    const monthOk = r => !F.month || mm(r) === F.month.slice(5, 7);
    const Sc = D.sales.filter(r => r.연도 === cur && monthOk(r) && matchBK(r)), Sp = D.sales.filter(r => r.연도 === prev && monthOk(r) && matchBK(r));
    const Tc = D.stores.filter(r => r.연도 === cur && monthOk(r) && matchBK(r)), Tp = D.stores.filter(r => r.연도 === prev && monthOk(r) && matchBK(r));
    const Dc = D.daily.filter(r => r.연도 === cur && monthOk(r)), Dp = D.daily.filter(r => r.연도 === prev && monthOk(r));
    const both = [...new Set(Sc.map(mm))].filter(m => Sp.some(r => mm(r) === m)).sort();
    $('cmp-range').textContent = both.length ? '비교 달: ' + both.map(m => parseInt(m) + '월').join(', ') : '겹치는 달이 없습니다.';
    const inB = r => both.includes(mm(r));
    const a = summary(Sc.filter(inB), Tc.filter(inB), Dc.filter(inB)), b = summary(Sp.filter(inB), Tp.filter(inB), Dp.filter(inB));
    dash.set('k_kpi', [{ 올해판매: a.판매, 작년판매: b.판매, 판매증감: chg(a.판매, b.판매), 올해일평균: a.일평균, 작년일평균: b.일평균, 올해점포일당: a.점포일당, 작년점포일당: b.점포일당, 올해전환율: a.전환율, 작년전환율: b.전환율 }]);
    const allM = [...new Set(Sc.map(mm).concat(Sp.map(mm)))].sort();
    const rows = allM.map(m => { const x = summary(Sc.filter(r => mm(r) === m), Tc.filter(r => mm(r) === m), Dc.filter(r => mm(r) === m)), y = summary(Sp.filter(r => mm(r) === m), Tp.filter(r => mm(r) === m), Dp.filter(r => mm(r) === m));
      const hx = x.판매 > 0, hy = y.판매 > 0; return { 월: parseInt(m) + '월', 올해판매: hx ? x.판매 : null, 작년판매: hy ? y.판매 : null, 증감: (hx && hy) ? chg(x.판매, y.판매) : null, 올해일수: hx ? x.일수 : null, 작년일수: hy ? y.일수 : null, 올해일평균: x.일평균, 작년일평균: y.일평균, 올해점포일당: x.점포일당, 작년점포일당: y.점포일당, 올해전환율: x.전환율, 작년전환율: y.전환율 }; });
    dash.set('k_month', rows);
    const l1 = [], l2 = []; rows.forEach(r => { l1.push({ 월: r.월, 연도: '올해', 값: r.올해판매 }); l1.push({ 월: r.월, 연도: '작년', 값: r.작년판매 }); l2.push({ 월: r.월, 연도: '올해', 값: r.올해점포일당 }); l2.push({ 월: r.월, 연도: '작년', 값: r.작년점포일당 }); }); dash.set('k_line', l1); dash.set('k_line2', l2);
    const Rb = Sc.filter(inB), Pb = Sp.filter(inB);
    const specs = [['k_brand', '브랜드 비중', '브랜드', r => r.브랜드], ['k_kind', '점포 구분 비중', '구분', r => r.구분], ['k_route', '판매 경로 비중', '경로', r => r.경로], ['k_color', '색상 비중', '색상', r => r.색상], ['k_hour', '시간대 비중', '시간대', r => r.시 != null && r.시 >= 9 && r.시 <= 19 ? r.시 + '시' : null], ['k_wday', '요일 비중', '요일', r => r.요일]];
    const box = $('k-shares');
    if (!box.children.length) box.innerHTML = specs.map(([id, title, label]) => `<div class="card"><h3>${title}</h3><div class="tw"><table data-source="${id}"><thead><tr><th data-field="항목">${label}</th><th class="n" data-field="올해">올해</th><th class="n" data-field="올해비중">비중 %</th><th class="n" data-field="작년">작년</th><th class="n" data-field="작년비중">비중 %</th><th class="n" data-field="차이">차이 p</th></tr></thead><tbody data-draw="tbl" data-cols="항목,올해,올해비중,작년,작년비중,차이" data-fmts=",,.1f,,.1f,+.1f"></tbody></table></div></div>`).join('');
    specs.forEach(([id, , , kf]) => { const ra = Rb.filter(r => kf(r) != null), rb = Pb.filter(r => kf(r) != null); const ga = group(ra, kf), gb = group(rb, kf), ta = sum(ra, r => r.수량), tb = sum(rb, r => r.수량);
      const keys = [...new Set([...ga.keys(), ...gb.keys()])].sort((x, y) => sum(ga.get(y) || [], r => r.수량) - sum(ga.get(x) || [], r => r.수량));
      dash.set(id, keys.map(k => { const va = sum(ga.get(k) || [], r => r.수량), vb = sum(gb.get(k) || [], r => r.수량), pa = pct(va, ta), pb = pct(vb, tb); return { 항목: k, 올해: va, 올해비중: pa, 작년: vb, 작년비중: pb, 차이: (pa != null && pb != null) ? r1(pa - pb) : null }; })); });
  }

  // ---------- 화면 전환 ----------
  function showPanel() {
    const id = (location.hash || '#overview').slice(1);
    const a = document.querySelector('#tabs a[href="#' + id + '"]') || document.querySelector('#tabs a');
    document.querySelectorAll('.pl .panel').forEach(p => { p.hidden = p.id !== a.dataset.panel; });
    document.querySelectorAll('#tabs a').forEach(x => x.classList.toggle('on', x === a));
    $('page-title').textContent = a.dataset.title; window.scrollTo(0, 0); dash.render();
  }
  addEventListener('hashchange', showPanel);

  load().then(() => { buildBar(); apply(); showPanel(); }).catch(e => { console.error(e); $('badge').textContent = '자료를 읽지 못했습니다'; });
})();
