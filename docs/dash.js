const dash = (() => {
  const DATA = {}, draws = {}, after = [];
  return {
    colors: ['#1e3a6e', '#9fb3d6', '#64748b', '#3b82f6', '#f59e0b', '#8b5cf6', '#c4cbd8'],
    data: id => (id in DATA) ? { status: 'ok', data: DATA[id] } : { status: 'missing' },
    draw: (k, fn) => { draws[k] = fn; },
    set: (id, rows) => { DATA[id] = rows; },
    onData: fn => after.push(fn),
    async load() {
      const ids = new Set([...document.querySelectorAll('[data-source]')].map(e => e.dataset.source).filter(id => !/^(live_|ov_|x_|c_)/.test(id)));
      const v = Date.now();
      await Promise.all([...ids].map(async id => {
        try { const r = await fetch('data/' + id + '.json?v=' + v); if (!r.ok) throw new Error(r.status); const j = await r.json(); DATA[id] = j.rows || j; }
        catch (e) { console.warn('데이터 없음', id, e); }
      }));
      try { const u = await (await fetch('data/updated.json?v=' + v)).json(); document.getElementById('updated').textContent = u.updated + ' (' + u.range + ')'; } catch (e) {}
      this.render();
    },
    render() {
      for (const [k, fn] of Object.entries(draws)) document.querySelectorAll('[data-draw="' + k + '"]').forEach(el => { try { fn(el); } catch (e) { console.error(k, e); } });
      after.forEach(f => f());
    }
  };
})();

(function(){
  const fmtOf = (f) => (v) => (v == null || v === '' || isNaN(+v)) ? '—' : d3.format(f || ',')(+v);
  const rowsOf = (id) => { const r = dash.data(id); return r.status === 'ok' && Array.isArray(r.data) ? r.data : null; };
  const color = (i) => dash.colors[i % dash.colors.length];
  const prefersMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: no-preference)').matches;

  // 문장·타일 속 숫자
  dash.draw('num', (el) => {
    const rows = rowsOf(el.dataset.source);
    if (!rows) { el.textContent = '—'; return; }
    let row = null;
    if (el.dataset.row != null) row = rows[+el.dataset.row];
    else if (el.dataset.where) { const conds = el.dataset.where.split('&').map(p => p.split('=')); row = rows.find(r => conds.every(([k, v]) => String(r[k]) === v)); }
    el.textContent = row ? fmtOf(el.dataset.fmt)(row[el.dataset.field]) : '—';
  });

  // 표 본문
  dash.draw('tbl', (tb) => {
    const table = tb.closest('table'); const src = table && table.dataset.source;
    const rows = rowsOf(src); tb.replaceChildren();
    if (!rows) return;
    const cols = tb.dataset.cols.split(','); const fmts = (tb.dataset.fmts || '').split(',');
    const keyCols = (table.dataset.rowKey || '').split(',');
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.dataset.key = keyCols.map(k => encodeURIComponent(String(r[k] ?? ''))).join(',');
      cols.forEach((c, i) => {
        const td = document.createElement('td'); const v = r[c];
        if (typeof v === 'number') { td.className = 'n'; td.textContent = fmtOf(fmts[i] || ',')(v); }
        else { td.textContent = v == null ? '' : String(v); }
        if (c === '추천점포') { td.innerHTML = ''; const s = document.createElement('span'); s.className = 'pill ' + (v === '예' ? 'ok' : ''); s.textContent = v; td.appendChild(s); }
        if (c === '상태') { td.innerHTML = ''; const s = document.createElement('span'); s.className = 'pill ' + (v === '정상' ? 'ok' : v === '종료' ? '' : 'bad'); s.textContent = v; td.appendChild(s); }
        if (c === '판매' && v === 0) { td.innerHTML = ''; const s = document.createElement('span'); s.className = 'pill bad'; s.textContent = '0'; td.appendChild(s); }
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
  });

  function tipIn(el) {
    let t = el.querySelector('.tip'); if (!t) { t = document.createElement('div'); t.className = 'tip'; t.hidden = true; el.appendChild(t); } return t;
  }
  function showTip(el, t, ev, html) {
    t.replaceChildren(...html); t.hidden = false;
    const b = el.getBoundingClientRect(); let x = ev.clientX - b.left + 12, y = ev.clientY - b.top - 10;
    if (x + t.offsetWidth > b.width) x = ev.clientX - b.left - t.offsetWidth - 12;
    t.style.left = x + 'px'; t.style.top = Math.max(0, y) + 'px';
  }
  const line = (label, val, cls) => { const d = document.createElement('div'); if (cls) d.className = cls; d.textContent = label + (val != null ? ' ' + val : ''); return d; };

  // 가로 막대
  dash.draw('hbar', (el) => {
    const rows = rowsOf(el.dataset.source);
    el.querySelectorAll('svg').forEach(s => s.remove());
    const t = tipIn(el); t.hidden = true;
    if (!rows || !rows.length) { el.dataset.empty = '1'; return; }
    const L = el.dataset.label, L2 = el.dataset.label2, V = el.dataset.value, S = el.dataset.sub;
    const f = fmtOf(el.dataset.fmt), fs = fmtOf(el.dataset.subfmt || ','), unit = el.dataset.subunit || '';
    const W = el.clientWidth || 320, rh = 24, mT = 4, mB = 4, H = rows.length * rh + mT + mB;
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', `${V} 가로 막대, ${rows.length}개 항목`);
    const lab = svg.append('g');
    const labels = rows.map(r => L2 ? `${r[L2]} · ${r[L]}` : String(r[L]));
    const tx = lab.selectAll('text').data(labels).join('text').attr('x', 0).attr('y', (d, i) => mT + i * rh + rh / 2 + 4).text(d => d);
    let lw = 0; tx.each(function () { lw = Math.max(lw, this.getComputedTextLength()); });
    const vals = rows.map(r => `${f(r[V])}${S ? ` (${fs(r[S])}${unit})` : ''}`);
    const vt = svg.append('g').selectAll('text').data(vals).join('text').attr('class', 'val').text(d => d);
    let vw = 0; vt.each(function () { vw = Math.max(vw, this.getComputedTextLength()); });
    const x0 = Math.min(lw + 10, W * 0.45), x1 = W - vw - 8;
    const x = d3.scaleLinear().domain([0, d3.max(rows, r => +r[V] || 0) || 1]).range([0, Math.max(10, x1 - x0)]);
    lab.selectAll('text').attr('x', x0 - 10).attr('text-anchor', 'end');
    const bars = svg.append('g').selectAll('rect').data(rows).join('rect')
      .attr('x', x0).attr('y', (d, i) => mT + i * rh + 5).attr('height', rh - 10).attr('rx', 3)
      .style('fill', color(0)).attr('width', prefersMotion && !el.dataset.drawn ? 0 : d => x(+d[V] || 0));
    if (prefersMotion && !el.dataset.drawn) bars.transition().duration(500).attr('width', d => x(+d[V] || 0));
    el.dataset.drawn = '1';
    vt.attr('x', d => 0).attr('y', (d, i) => mT + i * rh + rh / 2 + 4).attr('x', (d, i) => x0 + x(+rows[i][V] || 0) + 6);
    svg.append('g').selectAll('rect').data(rows).join('rect').attr('x', 0).attr('y', (d, i) => mT + i * rh).attr('width', W).attr('height', rh).attr('fill', 'transparent')
      .on('mousemove', (ev, d) => { const i = rows.indexOf(d); showTip(el, t, ev, [line(labels[i]), line(V, f(d[V]), 's'), S ? line(S, fs(d[S]) + unit, 's') : line('')]); })
      .on('mouseleave', () => { t.hidden = true; });
  });

  // 세로 막대 (단일·누적·묶음)
  dash.draw('vbar', (el) => {
    const rows = rowsOf(el.dataset.source);
    el.querySelectorAll('svg').forEach(s => s.remove());
    const t = tipIn(el); t.hidden = true;
    if (!rows || !rows.length) return;
    const X = el.dataset.x, f = fmtOf(el.dataset.fmt), grouped = el.dataset.grouped === '1';
    let series, data;
    if (el.dataset.series) {
      const S = el.dataset.series, Y = el.dataset.y;
      series = el.dataset.order ? el.dataset.order.split(',') : [...new Set(rows.map(r => r[S]))];
      const xs = [...new Set(rows.map(r => r[X]))];
      data = xs.map(xv => { const o = { [X]: xv }; series.forEach(s => { const m = rows.find(r => r[X] === xv && r[S] === s); o[s] = m ? +m[Y] : 0; }); return o; });
    } else { series = el.dataset.y.split(','); data = rows.map(r => { const o = { [X]: r[X] }; series.forEach(s => o[s] = +r[s] || 0); if (el.dataset.sub) o.__sub = r[el.dataset.sub]; return o; }); }
    const xl = (v) => el.dataset.xfmt === 'date' ? d3.utcFormat('%-m/%-d')(new Date(v)) : String(v) + (el.dataset.xsuffix || '');
    const W = el.clientWidth || 320, H = 220, mL = 34, mR = 6, mT = 18, mB = 24;
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', `${X}별 ${series.join(', ')} 세로 막대`);
    const x = d3.scaleBand().domain(data.map(d => d[X])).range([mL, W - mR]).padding(0.25);
    const tot = d => grouped ? d3.max(series, s => d[s]) : d3.sum(series, s => d[s]);
    const y = d3.scaleLinear().domain([0, d3.max(data, tot) || 1]).nice().range([H - mB, mT]);
    svg.append('g').attr('class', 'grid').selectAll('line').data(y.ticks(4)).join('line').attr('x1', mL).attr('x2', W - mR).attr('y1', y).attr('y2', y);
    svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('x', mL - 6).attr('y', d => y(d) + 4).attr('text-anchor', 'end').text(d => d3.format(',')(d));
    const n = data.length, every = Math.max(1, Math.ceil(n / Math.floor((W - mL) / 42)));
    svg.append('g').selectAll('text').data(data).join('text').attr('x', d => x(d[X]) + x.bandwidth() / 2).attr('y', H - mB + 14).attr('text-anchor', 'middle').text((d, i) => i % every === 0 ? xl(d[X]) : '');
    const g = svg.append('g');
    data.forEach(d => {
      let acc = 0; const bw = grouped ? x.bandwidth() / series.length : x.bandwidth();
      series.forEach((s, si) => {
        const v = d[s]; const y0 = grouped ? y(0) : y(acc), y1 = grouped ? y(v) : y(acc + v);
        const h = Math.max(0, y0 - y1 - (grouped || si === series.length - 1 ? 0 : 2));
        g.append('rect').attr('x', x(d[X]) + (grouped ? si * bw : 0)).attr('y', y1).attr('width', grouped ? bw - 2 : bw).attr('height', h).attr('rx', 2).style('fill', color(si))
          .on('mousemove', (ev) => showTip(el, t, ev, [line(xl(d[X])), line(series.length > 1 ? s : el.dataset.y, f(v), 's'), ...(series.length > 1 && !grouped ? [line('합계', f(tot(d)), 's')] : [])]))
          .on('mouseleave', () => { t.hidden = true; });
        if (!grouped) acc += v;
      });
      if (grouped) series.forEach((s, si) => g.append('text').attr('class', 'val').attr('x', x(d[X]) + si * bw + (bw - 2) / 2).attr('y', y(d[s]) - 4).attr('text-anchor', 'middle').text(f(d[s])));
      else g.append('text').attr('class', 'val').attr('x', x(d[X]) + x.bandwidth() / 2).attr('y', y(tot(d)) - 4).attr('text-anchor', 'middle').text(n > 12 ? '' : f(tot(d)) + (d.__sub != null ? ` (${d.__sub})` : ''));
    });
  });

  // 선 그래프 (여러 계열, 와이드 열 또는 롱 데이터)
  dash.draw('line', (el) => {
    const rows = rowsOf(el.dataset.source);
    el.querySelectorAll('svg').forEach(s => s.remove());
    const t = tipIn(el); t.hidden = true;
    if (!rows || !rows.length) return;
    const X = el.dataset.x, fmts = (el.dataset.fmt || ',').split(','), scales = (el.dataset.scale || '').split(',').map(v => +v || 1);
    let series, data;
    const xs = [...new Set(rows.map(r => r[X]))];
    if (el.dataset.series) {
      const S = el.dataset.series, Y = el.dataset.y;
      series = el.dataset.order ? el.dataset.order.split(',') : [...new Set(rows.map(r => r[S]))];
      data = xs.map(xv => { const o = { [X]: xv }; series.forEach(s => { const m = rows.find(r => r[X] === xv && r[S] === s); o[s] = m ? +m[Y] : null; }); return o; });
    } else { series = el.dataset.y.split(','); data = rows.map(r => { const o = { [X]: r[X] }; series.forEach(s => o[s] = r[s] == null || r[s] === '' ? null : +r[s]); return o; }); }
    const f = (si, v) => fmtOf(fmts[si] || fmts[0])(v);
    const sc = (si) => scales[si] || 1;
    const xl = (v) => el.dataset.xfmt === 'date' ? d3.utcFormat('%-m/%-d')(new Date(v)) : String(v);
    const dots = el.dataset.dots !== '0';
    const W = el.clientWidth || 320, H = 224, mL = 36, mR = 44, mT = 14, mB = 28;
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', `${X}별 ${series.join(', ')} 선 그래프`);
    const x = d3.scalePoint().domain(data.map(d => d[X])).range([mL + 14, W - mR]);
    const ymax = d3.max(data, d => d3.max(series, (s, si) => d[s] == null ? 0 : d[s] * sc(si))) || 1;
    const y = d3.scaleLinear().domain([0, ymax]).nice().range([H - mB, mT]);
    svg.append('g').attr('class', 'grid').selectAll('line').data(y.ticks(4)).join('line').attr('x1', mL).attr('x2', W - mR).attr('y1', y).attr('y2', y);
    svg.append('g').selectAll('text').data(y.ticks(4).filter(d => d > 0)).join('text').attr('x', mL - 6).attr('y', d => y(d) + 4).attr('text-anchor', 'end').text(d => d3.format(',')(d));
    const n = data.length, every = Math.max(1, Math.ceil(n / Math.floor((W - mL - mR) / 48)));
    svg.append('g').selectAll('text').data(data).join('text').attr('x', d => x(d[X])).attr('y', H - mB + 18).attr('text-anchor', 'middle').text((d, i) => i % every === 0 ? xl(d[X]) : '');
    const ends = [];
    series.forEach((s, si) => {
      const pts = data.filter(d => d[s] != null);
      const curve = d3.curveMonotoneX;
      if (series.length === 1) svg.append('path').datum(pts).attr('fill', color(si)).attr('fill-opacity', 0.12)
        .attr('d', d3.area().curve(curve).x(d => x(d[X])).y0(y(0)).y1(d => y(d[s] * sc(si))));
      svg.append('path').datum(pts).attr('fill', 'none').attr('stroke-width', 2.2).style('stroke', color(si))
        .attr('d', d3.line().curve(curve).x(d => x(d[X])).y(d => y(d[s] * sc(si))));
      if (dots) svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', d => x(d[X])).attr('cy', d => y(d[s] * sc(si))).attr('r', 4).style('fill', color(si)).style('stroke', 'var(--color-panel)').attr('stroke-width', 2);
      const last = pts[pts.length - 1];
      if (last) ends.push({ x: x(last[X]) + 6, y: y(last[s] * sc(si)), label: f(si, last[s]) });
    });
    // 끝 값 표시가 겹치지 않게 최소 13px 간격으로 벌림
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
    for (let i = ends.length - 2; i >= 0; i--) if (ends[i + 1].y - ends[i].y < 13) ends[i].y = ends[i + 1].y - 13;
    svg.append('g').selectAll('text').data(ends).join('text').attr('class', 'val').attr('x', d => d.x).attr('y', d => d.y + 4).text(d => d.label);
    const guide = svg.append('line').attr('y1', mT).attr('y2', H - mB).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '3 3').style('opacity', 0);
    svg.append('rect').attr('x', mL).attr('y', mT).attr('width', W - mL - mR).attr('height', H - mB - mT).attr('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [mx] = d3.pointer(ev); let bi = 0, bd = Infinity;
        data.forEach((d, i) => { const dd = Math.abs(x(d[X]) - mx); if (dd < bd) { bd = dd; bi = i; } });
        const d = data[bi]; guide.attr('x1', x(d[X])).attr('x2', x(d[X])).style('opacity', 1);
        showTip(el, t, ev, [line(xl(d[X])), ...series.map((s, si) => line(s, d[s] == null ? '—' : f(si, d[s]), 's'))]);
      })
      .on('mouseleave', () => { t.hidden = true; guide.style('opacity', 0); });
  });

  // 도넛 (비중)
  dash.draw('donut', (el) => {
    const rows = rowsOf(el.dataset.source);
    el.replaceChildren();
    if (!rows || !rows.length) return;
    const L = el.dataset.label, V = el.dataset.value;
    const data = rows.map(r => ({ label: String(r[L]), value: +r[V] || 0 })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
    const total = d3.sum(data, d => d.value) || 1;
    const R = 75, svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${R * 2} ${R * 2}`).attr('role', 'img').attr('aria-label', `${L}별 ${V} 비중`);
    const g = svg.append('g').attr('transform', `translate(${R},${R})`);
    const arc = d3.arc().innerRadius(R * 0.58).outerRadius(R).cornerRadius(3).padAngle(0.02);
    const t = tipIn(el);
    g.selectAll('path').data(d3.pie().value(d => d.value).sort(null)(data)).join('path').attr('d', arc).style('fill', (d, i) => color(i))
      .on('mousemove', (ev, d) => showTip(el, t, ev, [line(d.data.label), line(V, fmtOf(',')(d.data.value) + ` (${(d.data.value / total * 100).toFixed(0)}%)`, 's')]))
      .on('mouseleave', () => { t.hidden = true; });
    g.append('text').attr('text-anchor', 'middle').attr('y', -2).attr('class', 'val').style('font-size', '18px').style('font-weight', '700').text(fmtOf(',')(total));
    g.append('text').attr('text-anchor', 'middle').attr('y', 16).style('font-size', '11px').text('합계');
    const dl = document.createElement('div'); dl.className = 'dl';
    data.forEach((d, i) => { const s = document.createElement('span'); const ic = document.createElement('i'); ic.style.background = color(i); const b = document.createElement('b'); b.textContent = (d.value / total * 100).toFixed(0) + '%'; s.append(ic, document.createTextNode(d.label), b); dl.appendChild(s); });
    el.appendChild(dl);
  });

  // 범례 색
  dash.onData(() => { document.querySelectorAll('.pl .legend i[data-c]').forEach(i => { i.style.background = color(+i.dataset.c); }); });
})();
