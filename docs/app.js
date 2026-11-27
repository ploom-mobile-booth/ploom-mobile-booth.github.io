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
  const D = { daily: [], sales: [], stores: [], cvs: [], feedback: [], sched: [], meta: null, funnel: [], ops: [] };
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
    const [daily, sales, stores, cvs, feedback, sched, meta, funnel, ops, inv, panel, mpos, gift, devIn, sampling] = await Promise.all([get('daily'), get('sales'), get('stores'), get('cvs'), get('feedback'), get('schedule'), get('meta'), get('funnel').catch(() => []), get('ops').catch(() => []), get('inventory').catch(() => []), get('panel').catch(() => []), get('mpos').catch(() => []), get('gift').catch(() => []), get('device_in').catch(() => []), get('sampling').catch(() => [])]);
    D.funnel = funnel; D.ops = ops; D.inv = inv; D.panel = panel; D.mpos = mpos; D.gift = gift; D.deviceIn = devIn; D.sampling = sampling;
    D.daily = daily; D.sales = decode(sales); D.stores = decode(stores); D.cvs = decode(cvs); D.feedback = feedback; D.sched = decode(sched); D.meta = meta;
    const addm = r => { r.월 = r.일자.slice(0, 7); r.연도 = r.일자.slice(0, 4); r.요일 = wday(r.일자); };
    D.daily.forEach(addm); D.sales.forEach(addm); D.stores.forEach(addm); D.cvs.forEach(addm); D.sched.forEach(addm);
    // 스케줄로 점포·일의 지역·신규 여부 보강
    const sk = new Map(); D.sched.forEach(r => { if (r.점포코드) sk.set(r.일자 + '|' + r.점포코드, r); });
    const codeInfo = new Map(); D.sched.forEach(r => { if (r.점포코드 && !codeInfo.has(r.점포코드)) codeInfo.set(r.점포코드, r); });
    const enrich = r => { const s = (r.점포코드 && (sk.get(r.일자 + '|' + r.점포코드) || codeInfo.get(r.점포코드))) || null; r.구 = s ? s.구 : null; r.시도 = s ? s.시도 : null; r.권역 = s ? s.권역 : null; r.지점 = s ? s.지점 : null; r.신규 = s ? (s.신규 || null) : null; };
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
    return { 판매, 일수, 방문자, 전환율: pct(판매, 방문자), 일평균: 일수 ? r1(판매 / 일수) : null, 점포일: st.점포일, 하루점포: 일수 ? r1(st.점포일 / 일수) : null, 점포일당: st.점포일당, 미판매율: st.미판매율,
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
    const SC = D.sched.filter(r => matchYM(r) && r.팀);
    const teamStat = g => { const days = group(g, r => r.일자); return { 팀수: uniq(g, r => r.팀), 하루팀수: days.size ? r1([...days.values()].reduce((a, x) => a + uniq(x, r => r.팀), 0) / days.size) : null }; };
    const mrows = months.map(m => { const s = summary(S.filter(r => r.월 === m), ST.filter(r => r.월 === m), DY.filter(r => r.월 === m)); return Object.assign({ 월: mlabel(m), 월키: m }, s, teamStat(SC.filter(r => r.월 === m))); });
    Object.assign(o, teamStat(SC)); dash.set('ov', [o]);
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
    const brands = [...new Set(ST.map(r => r.브랜드).filter(Boolean))].sort((a, b) => sum(ST.filter(r => r.브랜드 === b), r => r.판매) - sum(ST.filter(r => r.브랜드 === a), r => r.판매));
    dash.set('s_brand_month', months.map(m => { const g = ST.filter(r => r.월 === m && r.점포코드); const o = { 월: mlabel(m), 전체: uniq(g, r => r.점포코드), 점포일: g.length }; brands.forEach(b => o[b] = uniq(g.filter(r => r.브랜드 === b), r => r.점포코드)); return o; }));
    dash.set('s_brand_month_days', months.map(m => { const g = ST.filter(r => r.월 === m); const o = { 월: mlabel(m), 전체: g.length, 점포일: g.length }; brands.forEach(b => o[b] = g.filter(r => r.브랜드 === b).length); return o; }));
    ['s_brand_month', 's_brand_month_days'].forEach((id, i) => { const thead = document.querySelector('table[data-source=' + id + '] thead tr'), tbody = document.querySelector('table[data-source=' + id + '] tbody');
      if (thead) { thead.innerHTML = '<th data-field="월">월</th>' + brands.map(b => '<th class="n" data-field="' + b + '">' + b + '</th>').join('') + (i === 0 ? '<th class="n" data-field="전체">전체 점포</th><th class="n" data-field="점포일">점포·일</th>' : '<th class="n" data-field="전체">전체</th>'); tbody.dataset.cols = ['월'].concat(brands, i === 0 ? ['전체', '점포일'] : ['전체']).join(','); tbody.dataset.fmts = ''; } });
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
    dash.set('r_depot', [...group(ST.filter(r => r.지점), r => r.지점)].map(([k, g]) => Object.assign({ 지점: k, 점포수: uniq(g, r => r.점포코드) }, storeStats(g))).sort((a, b) => b.판매 - a.판매));
    dash.set('r_month_depot', months.map(m => { const g = ST.filter(r => r.월 === m); const o = { 월: mlabel(m), 판매: sum(g, r => r.판매) }; ['South Seoul', 'East Seoul', 'Incheon', 'Suwon'].forEach(z => o[z] = sum(g.filter(r => r.지점 === z), r => r.판매)); return o; }));
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
    funnel();
    // 작년 비교
    compare();
    inventory();
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


  // ---------- 활동 퍼널 (Activation 시트) · 운영 모습 (내부 활동 요약) ----------
  function funnel() {
    const inYM = r => (!F.year || r.월.slice(0, 4) === F.year) && (!F.month || r.월 === F.month);
    const Fm = D.funnel.filter(inYM);
    const agg = g => { const o = { 접촉: sum(g, r => r.접촉), 응대: sum(g, r => r.응대), 판매: sum(g, r => r.판매), 시용: sum(g, r => r.시용), 웹가입: sum(g, r => r.웹가입), 카카오: sum(g, r => r.카카오), 운영일: sum(g, r => r.운영일), 근무시간: sum(g, r => r.근무시간), 프로모터: g.length ? r1(sum(g, r => r.프로모터) / g.length) : null };
      o.응대율 = pct(o.응대, o.접촉); o.응대구매율 = pct(o.판매, o.응대); o.접촉구매율 = o.접촉 ? r2(o.판매 / o.접촉 * 100) : null; o.웹가입율 = pct(o.웹가입, o.판매); o.카카오율 = pct(o.카카오, o.판매); o.시용율 = pct(o.시용, o.판매); o.일당시간 = o.운영일 ? r1(o.근무시간 / o.운영일) : null; return o; };
    const k = agg(Fm); dash.set('f_kpi', [k]);
    const ym = m => m.slice(0, 4) + '년 ' + parseInt(m.slice(5, 7)) + '월';
    $('fn-sub').textContent = Fm.length ? ym(Fm[0].월) + ' ~ ' + ym(Fm[Fm.length - 1].월) + ' · RRP Activation Data 기준' : '해당 기간 자료 없음';
    dash.set('f_funnel', [{ 단계: '접촉 (노출)', 값: k.접촉, 비율: null }, { 단계: '1:1 응대', 값: k.응대, 비율: k.응대율 }, { 단계: '판매', 값: k.판매, 비율: k.응대구매율 }, { 단계: '웹 회원가입', 값: k.웹가입, 비율: k.웹가입율 }, { 단계: '카카오 구독', 값: k.카카오, 비율: k.카카오율 }]);
    const mrows = Fm.map(r => Object.assign({ 월: mlabel(r.월) }, agg([r]))); dash.set('f_month', mrows);
    const rate = [], reg = []; mrows.forEach(m => { rate.push({ 월: m.월, 지표: '응대율 (접촉 대비)', 값: m.응대율 }); rate.push({ 월: m.월, 지표: '구매율 (응대 대비)', 값: m.응대구매율 }); rate.push({ 월: m.월, 지표: '구매율 (접촉 대비)', 값: m.접촉구매율 }); reg.push({ 월: m.월, 지표: '웹 회원가입', 값: m.웹가입율 }); reg.push({ 월: m.월, 지표: '카카오 구독', 값: m.카카오율 }); });
    dash.set('f_rate', rate); dash.set('f_reg', reg);
    const years = [...new Set(D.funnel.map(r => r.월.slice(0, 4)))].sort(); const cur = years[years.length - 1], prev = years[years.length - 2];
    const cmp = []; for (let m = 1; m <= 12; m++) { const mm = String(m).padStart(2, '0'); const a = D.funnel.find(r => r.월 === cur + '-' + mm), b = prev && D.funnel.find(r => r.월 === prev + '-' + mm); if (!a && !b) continue; cmp.push({ 월: m + '월', 연도: '올해', 값: a ? pct(a.응대, a.접촉) : null }); cmp.push({ 월: m + '월', 연도: '작년', 값: b ? pct(b.응대, b.접촉) : null }); }
    dash.set('f_cmp', cmp);
    // 운영 모습
    const Om = D.ops.filter(inYM); const tot = sum(Om, r => r.팀일);
    const w = f => tot ? r2(sum(Om, r => (f(r) || 0) * r.팀일) / tot) : null;
    const dist = {}; Om.forEach(r => (r.시작분포 || []).forEach(d => { dist[d.시각] = (dist[d.시각] || 0) + d.비율 * r.팀일; }));
    dash.set('o_start', Object.keys(dist).sort().map(t => ({ 시각: t, 비율: r1(dist[t] / tot) })));
    const last = Om[Om.length - 1];
    dash.set('o_kpi', [Om.length ? { 시작중앙값: last.시작중앙값 + (Om.length > 1 ? ' (최근 달)' : ''), '10시30분전시작비율': w(r => r['10시30분전시작비율']), 평균활동시간: w(r => r.평균활동시간), 팀일: tot, 하루방문점포: w(r => r.하루방문점포), 이동팀일비율: w(r => r.이동팀일비율), 팀일당판매: w(r => r.팀일당판매), 미판매율: w(r => r.미판매율) } : {}]);
    dash.set('o_month', Om.map(r => Object.assign({}, r, { 월: mlabel(r.월) })));
  }

  // ---------- 작년 비교 ----------
  // ---------- 디바이스 재고 (메일의 재고 표, 필터와 무관하게 전 기간) ----------
  function inventory() {
    mposCheck();
    const I = D.inv || []; if (!I.length) return;
    const COLORS = ['제트 블랙', '네이비 블루', '로즈 골드', '실버'];
    const days = [...new Set(I.map(r => r.일자))].sort();
    const salesOf = new Map(); D.daily.forEach(r => salesOf.set(r.일자, (salesOf.get(r.일자) || 0) + (+r.판매 || 0)));
    const mposOf = new Map(); D.sales.forEach(r => { if (String(r.경로 || '').startsWith('MPOS')) mposOf.set(r.일자, (mposOf.get(r.일자) || 0) + (+r.수량 || 1)); });
    const daily = days.map(d => { const g = I.filter(r => r.일자 === d), dg = g.filter(r => r.구분 === '주간'), ng = g.filter(r => r.구분 === '야간');
      const inc = sum(g, r => r.입고), used = sum(g, r => r.소진), close = sum(g, r => r.마감), prev = sum(g, r => r.전일), sales = salesOf.has(d) ? salesOf.get(d) : null, mpos = mposOf.has(d) ? mposOf.get(d) : null;
      const memo = [...new Set(g.map(r => r.비고).filter(Boolean))].join(' · ');
      return { 일자: d, 전일: prev, 입고: inc, 소진: used, 마감: close, 주간마감: sum(dg, r => r.마감), 야간마감: ng.length ? sum(ng, r => r.마감) : null, MPOS: mpos, 판매: sales, 차이: mpos == null ? null : used - mpos, 비고: memo }; });
    dash.set('i_daily', daily);
    const last = daily[daily.length - 1], lastG = I.filter(r => r.일자 === last.일자);
    const usedTot = sum(I, r => r.소진);
    dash.set('i_color', COLORS.map(c => { const dg = lastG.find(r => r.구분 === '주간' && r.색상 === c), ng = lastG.find(r => r.구분 === '야간' && r.색상 === c); const u = sum(I.filter(r => r.색상 === c), r => r.소진); return { 색상: c, 주간: dg ? dg.마감 : 0, 야간: ng ? ng.마감 : 0, 합계: (dg ? dg.마감 : 0) + (ng ? ng.마감 : 0), 소진누계: u, 비중: usedTot ? r1(u / usedTot * 100) : null }; }));
    // 디바이스 입고 내역 (device_in.json): 날짜별 색상 열 + 합계
    const DI = D.deviceIn || [];
    if (DI.length) {
      const rowsIn = [...group(DI, r => r.일자 + '|' + r.구분)].map(([k, g]) => { const d = g[0].일자; const o = { 일자: d, 구분: g[0].구분, 합계: sum(g, r => r.입고), 비고: [...new Set(g.map(r => r.비고).filter(Boolean))].join(' · ') }; COLORS.forEach(c => o[c] = sum(g.filter(r => r.색상 === c), r => r.입고)); return o; }).sort((a, b) => a.일자 < b.일자 ? -1 : a.일자 > b.일자 ? 1 : a.구분 < b.구분 ? 1 : -1);
      const tot = { 일자: '합계', 구분: '', 합계: sum(rowsIn, r => r.합계), 비고: '' }; COLORS.forEach(c => tot[c] = sum(rowsIn, r => r[c]));
      dash.set('i_in', rowsIn.concat([tot]));
    }
    // 야간 프리샘플링: 입고(device_in 의 샘플링용) vs 샘플링 MPOS 승인(sampling.json)
    const SM = D.sampling || [];
    if (SM.length) {
      const sin = DI.filter(r => /샘플링/.test(r.구분 || '') || /샘플링/.test(r.비고 || ''));
      const inC = {}; COLORS.forEach(c => inC[c] = sum(sin.filter(r => r.색상 === c), r => r.입고));
      const outC = {}; COLORS.forEach(c => outC[c] = sum(SM, r => (r.색상 || {})[c] || 0));
      const tin = sum(Object.values(inC), v => v), tout = sum(SM, r => r.수량);
      dash.set('sm_sum', [{ 입고: tin, 판매: tout, 잔여: tin - tout, 건수: sum(SM, r => r.건수), 금액: sum(SM, r => r.금액), 일수: SM.length, 취소: sum(SM, r => r.취소), 첫날: SM[0].일자, 끝날: SM[SM.length - 1].일자 }]);
      dash.set('sm_color', COLORS.map(c => ({ 색상: c, 입고: inC[c], 판매: outC[c], 잔여: inC[c] - outC[c] })));
      let bal = tin; dash.set('sm_daily', SM.map(r => { bal -= r.수량; const o = { 일자: r.일자, 건수: r.건수, 수량: r.수량, 금액: r.금액, 잔여: bal, 취소: r.취소 }; COLORS.forEach(c => o[c] = (r.색상 || {})[c] || 0); return o; }).reverse());
      const reg = {}; SM.forEach(r => Object.entries(r.지역 || {}).forEach(([k, v]) => reg[k] = (reg[k] || 0) + v));
      dash.set('sm_region', Object.entries(reg).map(([k, v]) => ({ 지역: k, 수량: v, 비중: tout ? r1(v / tout * 100) : null })).sort((a, b) => b.수량 - a.수량));
      const sasof = document.getElementById('sm-asof'); if (sasof) sasof.textContent = SM.map(r => r.일자.slice(5).replace('-', '/')).join(' · ');
    }
    const withSales = daily.filter(r => r.MPOS != null);
    const first = I.filter(r => r.일자 === days[0]);
    dash.set('i_sum', [{ 기준일: last.일자.slice(5).replace('-', '/'), 마감: last.마감, 주간: last.주간마감, 야간: last.야간마감 || 0, 입고: sum(I.filter(r => r.입고 > 0 && !/이관|반출|DP|환불/.test(r.비고)), r => r.입고), 입고횟수: new Set(I.filter(r => r.입고 > 0 && !/이관|반출|DP|환불/.test(r.비고)).map(r => r.일자 + r.구분)).size, 시작: sum(first, r => r.전일), 소진: usedTot, MPOS: sum(withSales, r => r.MPOS), 판매: sum(withSales, r => r.판매), 차이: sum(withSales, r => r.차이), 차이일수: withSales.filter(r => r.차이 !== 0).length, 일수: withSales.length }]);
    // 프런트 패널: 입고(panel.json, 색상별) vs 지급(판매 데이터의 패널 수량, 총수량만)
    const P = D.panel || [];
    if (P.length) {
      const pin = new Map(); P.forEach(r => pin.set(r.일자, (pin.get(r.일자) || 0) + (+r.입고 || 0)));
      const p0 = [...pin.keys()].sort()[0] || ''; const pout = new Map(); D.sales.forEach(r => { if (+r.패널 > 0 && r.일자 >= p0) pout.set(r.일자, (pout.get(r.일자) || 0) + +r.패널); });
      const pdays = [...new Set([...pin.keys(), ...pout.keys()])].sort();
      let bal = 0; const prows = pdays.map(d => { const i = pin.get(d) || 0, o = pout.get(d) || 0; bal += i - o; return { 일자: d, 입고: i, 지급: o, 잔여: bal, 지급건수: D.sales.filter(r => r.일자 === d && +r.패널 > 0).length, 비고: [...new Set(P.filter(r => r.일자 === d).map(r => r.비고).filter(Boolean))].join(' · ') }; });
      dash.set('p_daily', prows.slice().reverse());
      const tin = sum(P, r => r.입고), tout = sum([...pout.values()], v => v);
      dash.set('p_sum', [{ 입고: tin, 지급: tout, 잔여: tin - tout, 입고횟수: new Set(P.map(r => r.일자)).size, 지급일수: pout.size, 마지막지급: pdays.length ? pdays[pdays.length - 1] : null }]);
      const pasof = document.getElementById('p-asof'); if (pasof) pasof.textContent = pdays.length ? pdays[pdays.length - 1].slice(5).replace('-', '/') : '—';
      // 입고일별 × 색상별 표 (열 = 입고일, 행 = 색상)
      const pt = document.getElementById('p-in-table');
      if (pt) { const dates = [...new Set(P.map(r => r.일자))].sort(); const colors = [...group(P, r => r.색상)].map(([c, g]) => ({ c, t: sum(g, r => r.입고) })).sort((a, b) => b.t - a.t);
        const t = document.createElement('table'); const thead = document.createElement('thead'); const hr = document.createElement('tr');
        ['색상', ...dates.map((d, i) => `${i + 1}차 ${d.slice(5).replace('-', '/')}`), '합계', '비중 %'].forEach((h, i) => { const th = document.createElement('th'); th.textContent = h; if (i) th.className = 'n'; hr.appendChild(th); });
        thead.appendChild(hr); t.appendChild(thead); const tb = document.createElement('tbody');
        const addRow = (label, vals, bold) => { const tr = document.createElement('tr'); if (bold) tr.style.fontWeight = '600'; const td0 = document.createElement('td'); td0.textContent = label; tr.appendChild(td0); vals.forEach(v => { const td = document.createElement('td'); td.className = 'n'; td.textContent = v == null ? '' : (typeof v === 'number' ? d3.format(',')(v) : v); tr.appendChild(td); }); tb.appendChild(tr); };
        colors.forEach(({ c, t: ct }) => addRow(c, [...dates.map(d => sum(P.filter(r => r.일자 === d && r.색상 === c), r => r.입고)), ct, tin ? r1(ct / tin * 100).toFixed(1) : '']));
        addRow('합계', [...dates.map(d => sum(P.filter(r => r.일자 === d), r => r.입고)), tin, '100.0'], true);
        t.appendChild(tb); pt.replaceChildren(t); }
      dash.set('p_color', [...group(P, r => r.색상)].map(([c, g]) => ({ 색상: c, 입고: sum(g, r => r.입고), 비중: tin ? r1(sum(g, r => r.입고) / tin * 100) : null })).sort((a, b) => b.입고 - a.입고));
    }
    // 스타벅스 기프트카드: 입고(gift.json) vs 사용(판매 데이터의 기프트카드 제공 수량)
    const G = D.gift || [];
    if (G.length) {
      const gin = new Map(); G.forEach(r => gin.set(r.일자, (gin.get(r.일자) || 0) + (+r.입고 || 0)));
      const g0 = [...gin.keys()].sort()[0] || '';
      const gout = new Map(); D.sales.forEach(r => { if (+r.기프트카드 > 0 && r.일자 >= g0) gout.set(r.일자, (gout.get(r.일자) || 0) + +r.기프트카드); });
      const gdays = [...new Set([...gin.keys(), ...gout.keys()])].sort();
      let gb = 0; const grows = gdays.map(d => { const i = gin.get(d) || 0, o = gout.get(d) || 0; gb += i - o; return { 일자: d, 입고: i, 사용: o, 잔여: gb, 비고: [...new Set(G.filter(r => r.일자 === d).map(r => r.비고).filter(Boolean))].join(' · ') }; });
      dash.set('g_daily', grows.slice().reverse());
      const gtin = sum(G, r => r.입고), gtout = sum([...gout.values()], v => v);
      dash.set('g_sum', [{ 입고: gtin, 사용: gtout, 잔여: gtin - gtout, 입고횟수: gin.size, 사용일수: gout.size }]);
      const gasof = document.getElementById('g-asof'); if (gasof) gasof.textContent = gdays.length ? gdays[gdays.length - 1].slice(5).replace('-', '/') : '—';
      dash.set('g_month', [...group(grows, r => r.일자.slice(0, 7))].map(([m, g]) => ({ 월: parseInt(m.slice(5)) + '월', 입고: sum(g, r => r.입고), 사용: sum(g, r => r.사용), 월말잔여: g[g.length - 1].잔여 })));
    }
    const asof = document.getElementById('i-asof'); if (asof) asof.textContent = last.일자.slice(5).replace('-', '/'); const asof2 = document.getElementById('i-asof2'); if (asof2) asof2.textContent = last.일자.slice(5).replace('-', '/');
    dash.set('i_color_daily', [...group(I, r => r.일자 + '|' + r.구분)].map(([k, g]) => { const o = { 일자: g[0].일자, 구분: g[0].구분, 소진: sum(g, r => r.소진), 마감: sum(g, r => r.마감) }; g.forEach(r => o[r.색상] = r.소진); return o; }).sort((a, b) => a.일자 < b.일자 ? 1 : a.일자 > b.일자 ? -1 : a.구분 < b.구분 ? -1 : 1));
  }

  // ---------- MPOS 결제 내역 vs 리포트 MPOS 판매 (날짜·색상별, 전 기간) ----------
  function mposCheck() {
    const M = D.mpos || []; if (!M.length) return;
    const COLORS = ['제트 블랙', '네이비 블루', '로즈 골드', '루나 실버'];
    const nc = v => { const t = String(v || '').replace(/\s/g, ''); for (const c of COLORS) { if (t.includes(c.replace(/\s/g, ''))) return c; } return t || '(없음)'; };
    const rep = new Map();
    D.sales.forEach(r => { if (!String(r.경로 || '').startsWith('MPOS')) return; let o = rep.get(r.일자); if (!o) rep.set(r.일자, o = { 건수: 0, 수량: 0, 색상: {} }); const q = +r.수량 || 1; o.건수++; o.수량 += q; const c = nc(r.색상); o.색상[c] = (o.색상[c] || 0) + q; });
    const inv = new Map(); (D.inv || []).forEach(r => inv.set(r.일자, (inv.get(r.일자) || 0) + (+r.소진 || 0)));
    const days = [...new Set([...M.map(r => r.일자), ...rep.keys()])].sort();
    const mm = new Map(M.map(r => [r.일자, r]));
    const rows = days.map(d => { const m = mm.get(d), r = rep.get(d); const mq = m ? m.수량 : 0, rq = r ? r.수량 : 0;
      const cd = COLORS.map(c => { const a = m ? (m.색상[c] || 0) : 0, b = r ? (r.색상[c] || 0) : 0; return a === b ? null : `${c} ${a - b > 0 ? '+' : ''}${a - b}`; }).filter(Boolean).join(', ');
      return { 일자: d, 월: d.slice(0, 7), MPOS건수: m ? m.건수 : null, MPOS수량: m ? mq : null, 취소: m ? m.취소 : null, 리포트건수: r ? r.건수 : null, 리포트수량: r ? rq : null, 차이: (m && r) ? mq - rq : null, 소진: inv.has(d) ? inv.get(d) : null, 색상차이: cd || (m && r ? '일치' : '한쪽만 있음'), 상태: !m ? '결제 내역 없음' : !r ? '리포트 없음' : (mq === rq ? (cd ? '색상만 다름' : '일치') : '수량 다름') }; });
    // 월별 × 색상별 MPOS 승인 수량 (전 기간)
    const MC = ['제트 블랙', '네이비 블루', '로즈 골드', '루나 실버'];
    const mrows = [...group(M, r => r.일자.slice(0, 7))].map(([m, g]) => { const o = { 월: parseInt(m.slice(5)) + '월', 합계: sum(g, r => r.수량), 건수: sum(g, r => r.건수) }; MC.forEach(c => o[c] = sum(g, r => (r.색상 || {})[c] || 0)); return o; }).sort((a, b) => parseInt(a.월) - parseInt(b.월));
    const mt = { 월: '합계', 합계: sum(mrows, r => r.합계), 건수: sum(mrows, r => r.건수) }; MC.forEach(c => mt[c] = sum(mrows, r => r[c]));
    const mtot = mt.합계 || 1; MC.forEach(c => mt[c + ' %'] = r1(mt[c] / mtot * 100));
    dash.set('x_mpos_color_month', mrows.concat([mt]));
    dash.set('x_mpos_color_chart', mrows);
    dash.set('x_mpos_color_tot', MC.map(c => ({ 색상: c, 판매: mt[c], 비중: r1(mt[c] / mtot * 100) })));
    dash.set('x_mpos_daily', rows.slice().reverse());
    const both = rows.filter(r => r.차이 != null);
    dash.set('x_mpos_sum', [{ 일수: both.length, 일치: both.filter(r => r.차이 === 0 && r.상태 === '일치').length, 수량다름: both.filter(r => r.차이 !== 0).length, 색상만: both.filter(r => r.상태 === '색상만 다름').length, MPOS수량: sum(both, r => r.MPOS수량), 리포트수량: sum(both, r => r.리포트수량), 차이: sum(both, r => r.차이), 취소: sum(rows, r => r.취소), 한쪽만: rows.length - both.length }]);
    dash.set('x_mpos_month', [...group(rows, r => r.월)].map(([m, g]) => { const b = g.filter(r => r.차이 != null); return { 월: parseInt(m.slice(5)) + '월', 일수: b.length, MPOS수량: sum(b, r => r.MPOS수량), 리포트수량: sum(b, r => r.리포트수량), 차이: sum(b, r => r.차이), 수량다름일: b.filter(r => r.차이 !== 0).length, 색상다름일: b.filter(r => r.상태 === '색상만 다름').length, 취소: sum(g, r => r.취소) }; }).sort((a, b) => parseInt(a.월) - parseInt(b.월)));
  }

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

  // ---------- 재고 관리 하위 탭 (h2 단위로 절을 나눠 하나씩 본다) ----------
  function setupSubTabs() {
    const panel = document.getElementById('p-inventory'); if (!panel || panel.dataset.subs) return; panel.dataset.subs = '1';
    const kids = [...panel.children]; const groups = [{ name: '디바이스', els: [] }];
    kids.forEach(el => { if (el.tagName === 'H2') groups.push({ name: el.textContent.replace(/\s*\(.*\)\s*$/, '').trim(), els: [el] }); else groups[groups.length - 1].els.push(el); });
    const bar = document.createElement('div'); bar.className = 'subtabs'; panel.prepend(bar);
    groups.forEach((g, i) => { const w = document.createElement('div'); w.className = 'sub'; w.dataset.sub = String(i); g.els.forEach(e => w.appendChild(e)); panel.appendChild(w);
      const b = document.createElement('button'); b.type = 'button'; b.textContent = g.name; b.dataset.sub = String(i); b.addEventListener('click', () => showSub(i)); bar.appendChild(b); });
    function showSub(i) { panel.querySelectorAll('.sub').forEach(w => { w.hidden = w.dataset.sub !== String(i); }); bar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.sub === String(i))); try { localStorage.setItem('inv-sub', String(i)); } catch (e) {} dash.render(); }
    let saved = 0; try { saved = +localStorage.getItem('inv-sub') || 0; } catch (e) {} showSub(Math.min(saved, groups.length - 1));
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

  load().then(() => { buildBar(); apply(); setupSubTabs(); showPanel(); }).catch(e => { console.error(e); $('badge').textContent = '자료를 읽지 못했습니다'; });
})();
