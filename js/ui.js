// 면역 시뮬레이터 — 화면 조작
(function () {
  const IMM = window.IMM;
  const $ = (id) => document.getElementById(id);
  const canvas = $('world'), ctx = canvas.getContext('2d');
  const chart = $('chart'), cctx = chart.getContext('2d');

  let sim = new IMM.Sim(parseBlood($('blood').value));
  let running = true, speed = 1, labels = true;
  let selected = null; // 클릭으로 고른 항원
  let drag = null;     // 끌고 있는 항원
  let hoverPos = null;
  let logShown = 0;
  const view = { s: 1, ox: 0, oy: 0 }; // 확대 배율과 화면 왼쪽 위의 세계 좌표
  let big = false, paletteOn = true;
  let baseK = 1; // 캔버스 픽셀 / 세계 좌표

  function parseBlood(v) { return { bloodType: v.replace(/[+−-]/g, ''), rh: v.includes('+') }; }

  // ───────── 고해상도 캔버스 ─────────
  function fitCanvas() {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const wrap = $('canvasWrap');
    let cssW;
    if (big) {
      const r = wrap.getBoundingClientRect();
      // 항원 상자가 아래 띠면 그만큼 높이를 빼고, 옆 띠(낮은 가로 화면)면 레이아웃 여백이 이미 처리함
      const dock = $('paletteDock'), bottomDock = paletteOn && dock.getBoundingClientRect().top > window.innerHeight / 2;
      const avW = wrap.parentElement.clientWidth, avH = Math.max(120, window.innerHeight - r.top - (bottomDock ? dock.offsetHeight : 0) - 6);
      cssW = Math.min(avW, avH * IMM.W / IMM.H);
      canvas.style.width = cssW + 'px'; canvas.style.height = (cssW * IMM.H / IMM.W) + 'px';
    } else {
      canvas.style.width = ''; canvas.style.height = '';
      cssW = wrap.clientWidth || IMM.W;
    }
    // 확대해도 선명하도록 화면 크기 × 확대율에 맞춘 해상도 (최대 2400px)
    const px = Math.min(2400, Math.max(IMM.W, Math.round(cssW * dpr * Math.min(view.s, 2))));
    canvas.width = px; canvas.height = Math.round(px * IMM.H / IMM.W);
    baseK = canvas.width / IMM.W;
    applyView();
    const cw = chart.clientWidth || 300;
    chart.width = cw * dpr; chart.height = Math.round(cw * 0.46) * dpr;
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function applyView() {
    const k = baseK * view.s;
    ctx.setTransform(k, 0, 0, k, -view.ox * k, -view.oy * k);
  }
  function clampView() {
    view.s = Math.max(1, Math.min(4, view.s));
    view.ox = Math.max(0, Math.min(IMM.W - IMM.W / view.s, view.ox));
    view.oy = Math.max(0, Math.min(IMM.H - IMM.H / view.s, view.oy));
  }
  // 화면 위 한 점(세계 좌표 wx, wy)을 고정한 채 배율 변경
  function zoomAt(wx, wy, ns) {
    const old = view.s; ns = Math.max(1, Math.min(4, ns));
    view.ox = wx - (wx - view.ox) * old / ns;
    view.oy = wy - (wy - view.oy) * old / ns;
    view.s = ns; clampView();
    if (Math.abs(ns - old) > 0.3 || ns === 1) fitCanvas(); else applyView();
    $('zFit').disabled = view.s === 1;
  }
  let resizeT = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { fitCanvas(); drawChart(); }, 80); });

  // ───────── 팔레트 ─────────
  function buildPalette() {
    const list = $('paletteList');
    for (const cat of IMM.CATS) {
      const sec = document.createElement('div'); sec.className = 'cat';
      sec.innerHTML = `<h3>${cat.name}</h3>`;
      const grid = document.createElement('div'); grid.className = 'agents';
      for (const d of IMM.DEFS.filter(x => x.cat === cat.id)) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'agent'; b.dataset.id = d.id; b.title = d.desc;
        const cv = document.createElement('canvas'); cv.width = 68; cv.height = 68;
        const ic = cv.getContext('2d'); ic.scale(2, 2); IMM.drawIcon(ic, d, 34);
        const txt = document.createElement('div');
        txt.innerHTML = `<div class="nm">${d.name}</div><div class="rt">주 경로: ${IMM.ROUTE_NAMES[d.route]}</div>`;
        b.append(cv, txt);
        b.addEventListener('pointerdown', (e) => startDrag(e, d, b));
        b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(d, b); } });
        grid.appendChild(b);
      }
      sec.appendChild(grid); list.appendChild(sec);
    }
  }

  function select(d, el) {
    document.querySelectorAll('.agent.sel').forEach(x => x.classList.remove('sel'));
    if (selected && selected.id === d.id) { selected = null; setHint(''); return; }
    selected = d; el.classList.add('sel');
    setHint(`‘${d.name}’ 선택됨 → 화면에서 넣을 곳을 누르세요. (추천 경로: ${IMM.ROUTE_NAMES[d.route]})`);
  }
  function setHint(t) { $('hint').textContent = t; }

  // ───────── 드래그 ─────────
  function startDrag(e, d, el) {
    if (e.pointerType === 'mouse') e.preventDefault();
    const lift = e.pointerType === 'touch' ? 46 : 0; // 손가락에 가리지 않게 위로 띄움
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    const ghost = $('ghost');
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 6) {
        moved = true; drag = d; ghost.hidden = false; ghost.textContent = d.name;
      }
      if (moved) {
        ghost.style.left = ev.clientX + 'px'; ghost.style.top = (ev.clientY - lift) + 'px';
        hoverPos = toWorld(ev.clientX, ev.clientY - lift);
      }
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel);
      ghost.hidden = true; drag = null; hoverPos = null;
    };
    // 가로 스크롤 등으로 브라우저가 터치를 가져가면 아무것도 하지 않음
    const cancel = () => cleanup();
    const up = (ev) => {
      cleanup();
      if (moved) {
        const p = toWorld(ev.clientX, ev.clientY - lift);
        if (p) doDrop(d, p);
      } else select(d, el);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
  }

  function toWorld(cx, cy) {
    const r = canvas.getBoundingClientRect();
    if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null;
    return { x: view.ox + (cx - r.left) / r.width * IMM.W / view.s, y: view.oy + (cy - r.top) / r.height * IMM.H / view.s };
  }

  function routeText(d, p) {
    let g = sim.gateAt(p.x, p.y);
    if (d.beh === 'vaccine') return '근육 주사';
    const n = { skin: '피부', wound: '상처', resp: '호흡기 점막', gut: '소화관(위)', blood: '혈관(주사·수혈)', tissue: '조직 직접(상처 깊숙이)' }[g];
    return n + (g === d.route || (g === 'tissue' && d.route === 'wound') ? ' ✓' : '');
  }

  function doDrop(d, p) {
    if (!sim.alive) return;
    sim.drop(d.id, p.x, p.y, parseFloat($('dose').value));
    if (!running) setHint('일시정지 중입니다. ▶ 재생을 누르면 반응이 진행됩니다.');
  }

  // 캔버스: 탭(투입·설명), 한 손가락/마우스 끌기(확대 상태에서 이동), 두 손가락 핀치(확대)
  const ptrs = new Map();
  let gesture = null, tipTimer = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) gesture = { type: 'tap', sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy, t: performance.now() };
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const mid = toWorld((a.x + b.x) / 2, (a.y + b.y) / 2) || { x: IMM.W / 2, y: IMM.H / 2 };
      gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: view.s, mid };
      $('tooltip').hidden = true;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture && gesture.type === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      zoomAt(gesture.mid.x, gesture.mid.y, gesture.s0 * Math.hypot(a.x - b.x, a.y - b.y) / gesture.d0);
      return;
    }
    if (gesture && (gesture.type === 'tap' || gesture.type === 'pan') && ptrs.size === 1) {
      const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
      if (gesture.type === 'tap' && Math.hypot(dx, dy) > 8 && view.s > 1) gesture.type = 'pan';
      if (gesture.type === 'pan') {
        const r = canvas.getBoundingClientRect();
        view.ox = gesture.ox - dx / r.width * IMM.W / view.s;
        view.oy = gesture.oy - dy / r.height * IMM.H / view.s;
        clampView(); applyView();
        return;
      }
    }
    if (e.pointerType === 'mouse') {
      const p = toWorld(e.clientX, e.clientY);
      hoverPos = drag || selected ? p : null;
      showTip(p, e);
    }
  });
  const endPtr = (e) => {
    const g = gesture;
    ptrs.delete(e.pointerId);
    if (ptrs.size === 0) {
      gesture = null;
      if (g && g.type === 'tap' && e.type === 'pointerup' && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) <= 8) {
        const p = toWorld(e.clientX, e.clientY);
        if (!p) return;
        if (selected) doDrop(selected, p);
        else if (e.pointerType !== 'mouse') {
          showTip(p, e);
          clearTimeout(tipTimer); tipTimer = setTimeout(() => { $('tooltip').hidden = true; }, 4000);
        }
      }
    } else if (ptrs.size === 1 && g && g.type === 'pinch') {
      const [a] = [...ptrs.values()];
      gesture = { type: 'pan', sx: a.x, sy: a.y, ox: view.ox, oy: view.oy };
    }
  };
  canvas.addEventListener('pointerup', endPtr);
  canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('wheel', (e) => {
    // 크게 보기에서는 휠만으로, 평소에는 Ctrl(⌘)+휠로 확대 (페이지 스크롤 방해 안 함)
    if (!big && !e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const p = toWorld(e.clientX, e.clientY); if (!p) return;
    zoomAt(p.x, p.y, view.s * Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  $('zIn').addEventListener('click', () => zoomAt(view.ox + IMM.W / view.s / 2, view.oy + IMM.H / view.s / 2, view.s * 1.5));
  $('zOut').addEventListener('click', () => zoomAt(view.ox + IMM.W / view.s / 2, view.oy + IMM.H / view.s / 2, view.s / 1.5));
  $('zFit').addEventListener('click', () => zoomAt(0, 0, 1));
  $('zFit').disabled = true;

  // ───────── 크게 보기 ─────────
  function setBig(on) {
    big = on;
    document.body.classList.toggle('big', on);
    $('btnBig').textContent = on ? '✕ 크게 보기 끝내기' : '⛶ 크게 보기';
    $('btnBig').setAttribute('aria-pressed', String(on));
    const fs = document.fullscreenElement;
    if (on && !fs && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    if (!on && fs && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    requestAnimationFrame(() => { fitCanvas(); drawChart(); });
  }
  $('btnBig').addEventListener('click', () => setBig(!big));
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && big) setBig(false); });
  $('btnPalette').addEventListener('click', () => {
    paletteOn = !paletteOn;
    document.body.classList.toggle('no-palette', !paletteOn);
    $('btnPalette').textContent = paletteOn ? '항원 상자 숨기기' : '항원 상자 보이기';
    $('btnPalette').setAttribute('aria-pressed', String(paletteOn));
    requestAnimationFrame(fitCanvas);
  });

  canvas.addEventListener('pointerleave', () => { $('tooltip').hidden = true; if (!drag) hoverPos = null; });

  // ───────── 설명 풍선 ─────────
  const CELL_INFO = {
    neut: ['호중구', '가장 많은 백혈구. 염증 신호를 따라 혈관 밖으로 나와 세균을 잡아먹고(탐식), 몇 번 먹고 나면 죽어 고름이 됨.'],
    macro: ['대식세포', '조직에 머무는 큰 식세포. 병원체와 죽은 세포를 먹어 치우고, 사이토카인으로 염증·발열을 일으키며 항원 조각을 림프로 보냄.'],
    mono: ['단핵구', '혈액 속 대식세포 전구 세포. 염증 부위로 이동해 대식세포가 됨.'],
    dc: ['수지상세포', '항원을 붙잡아 림프절로 이동한 뒤 MHC II(그리고 MHC I)에 얹어 T세포에 제시하는 연결 고리. 선천 면역과 적응 면역을 잇는다.'],
    nk: ['NK세포 (자연 살해 세포)', '항원 제시 없이도 MHC I이 사라지거나 스트레스를 받은 감염 세포를 찾아 죽임. 인터페론으로 활성화됨.'],
    ctl: ['세포독성 T세포 (CD8⁺)', 'MHC I에 얹힌 바이러스 조각을 인식해 감염된 세포만 골라 퍼포린·그랜자임으로 자멸사시킴.'],
  };
  function showTip(p, e) {
    const tip = $('tooltip');
    if (!p || drag) { tip.hidden = true; return; }
    const info = pick(p);
    if (!info) { tip.hidden = true; return; }
    tip.innerHTML = `<b>${info[0]}</b>${info[1]}`;
    const wrap = $('canvasWrap').getBoundingClientRect();
    let x = e.clientX - wrap.left + 14, y = e.clientY - wrap.top + 14;
    tip.hidden = false;
    if (x + tip.offsetWidth > wrap.width - 4) x = e.clientX - wrap.left - tip.offsetWidth - 14;
    if (y + tip.offsetHeight > wrap.height - 4) y = e.clientY - wrap.top - tip.offsetHeight - 14;
    tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px';
  }
  function pick(p) {
    let best = null, bd = 16 * 16;
    const near = (o, r) => { const d = (o.x - p.x) ** 2 + (o.y - p.y) ** 2; if (d < (r || 16) ** 2 && d < bd) { bd = d; return true; } return false; };
    for (const c of sim.cells) if (near(c, c.type === 'macro' ? 16 : 12)) {
      const k = c.type === 'macro' && c.loc === 'blood' ? 'mono' : c.type;
      const inf = CELL_INFO[k];
      let extra = '';
      if (c.type === 'macro' && c.intra > 0) extra = c.gran ? ' · 지금: 결핵균을 품은 채 육아종에 갇힘(잠복)' : ' · 지금: 결핵균이 안에서 증식 중';
      if (c.type === 'macro' && c.act > 0) extra += ' · Th1(인터페론-γ)으로 활성화됨';
      if (c.type === 'dc' && c.cargo) extra = ` · 운반 중: ${IMM.agName(c.cargo)}`;
      if (c.type === 'ctl') extra = ` · 표적: ${IMM.agName(c.ag)}`;
      best = [inf[0], inf[1] + extra];
    }
    for (const q of sim.paths) if (q.st !== 'blocked' && near(q, 12)) {
      const d = q.def;
      let s = d.desc;
      if (q.st === 'liver') s = '간세포 안에 숨어 증식 중인 말라리아 원충 (간 단계).';
      if (q.st === 'mero') s = '적혈구를 노리는 말라리아 분열소체(메로조이트). 혈액에 나와 있는 짧은 순간에만 항체가 닿음.';
      const st = [];
      if (q.coat) st.push(d.cat === 'rbc' ? '항체가 결합해 응집됨' : d.cat === 'virus' ? '항체로 중화됨' : '항체가 붙음(옵소닌화)');
      else if (q.opso) st.push('보체 C3b가 붙음(옵소닌화)');
      if (q.ags.length) st.push('항원: ' + q.ags.map(a => sim.selfAgs.has(a) ? IMM.agName(a) + '(자기)' : IMM.agName(a)).join(', '));
      best = [d.name, s + (st.length ? ' · ' + st.join(' · ') : '')];
    }
    for (const c of sim.epi) if (near(c, 10)) {
      if (c.st === 'inf') best = ['감염된 상피세포', `${c.def.name}가 안에서 증식 중. ` + (c.def.mhcDown ? 'MHC I을 숨겨 세포독성 T세포는 못 보지만 NK세포가 알아챔.' : '노란 깃발 = MHC I에 얹힌 바이러스 조각 → 세포독성 T세포의 표적.') + ' 인터페론을 분비해 이웃 세포에 경고함.'];
      else if (c.st === 'dead') best = ['죽은 상피세포', '바이러스·면역 공격으로 파괴됨. 며칠 뒤 다시 채워짐.'];
      else best = ['상피세포', '몸 표면을 덮는 세포. 파란 테두리는 인터페론으로 항바이러스 상태가 된 것.'];
    }
    for (const t of sim.th) if (near(t, 9)) {
      best = t.st === 'inf' ? (t.latent ? ['잠복 감염된 보조 T세포', 'HIV 유전자가 숨어 있어 항체·T세포가 알아보지 못하는 잠복 저장소. 나중에 다시 바이러스를 만든다.'] : ['HIV에 감염된 보조 T세포', '바이러스를 대량 생산하다가 죽는다. CD4 수치가 떨어지는 원인.'])
        : t.st === 'dead' ? ['빈 자리', '죽은 보조 T세포 자리. 흉선에서 새로 보충되지만 HIV가 오래 머물면 보충이 줄어듦.']
        : ['보조 T세포 (CD4⁺)', 'MHC II로 제시된 항원을 알아보고 사이토카인을 분비해 B세포·세포독성 T세포·대식세포를 돕는 면역의 지휘관. 색 고리 = 특정 항원에 활성화된 클론.'];
    }
    for (const r of sim.rbcs) if (!r.dead && near(r, 9)) best = r.inf ? ['말라리아에 감염된 적혈구', '적혈구에는 MHC I이 없어 세포독성 T세포가 알아보지 못함. 약 2일 후 터지며 열이 난다.'] : ['적혈구 (내 몸)', `내 혈액형(${sim.bloodType}형 Rh${sim.rh ? '+' : '−'})의 항원을 가진 자기 세포 → 면역 관용으로 공격받지 않음.`];
    for (const m of sim.mast) if (near(m, 12)) best = ['비만세포', '조직에 박혀 있다가 병원체·손상을 감지하면 히스타민을 뿜어 혈관을 넓히고 투과성을 높여 염증을 시작.'];
    if (!best) {
      const L = IMM.LIVER, Gg = IMM.GANGLION, ln = IMM.LN;
      if ((p.x - L.x) ** 2 + (p.y - L.y) ** 2 < L.r * L.r) return ['간', '말라리아 원충이 혈액에 퍼지기 전 며칠 동안 숨어 증식하는 곳.'];
      if ((p.x - Gg.x) ** 2 + (p.y - Gg.y) ** 2 < 400) return ['감각 신경절', `단순포진 바이러스가 잠복하는 곳 (현재 잠복: ${sim.latentHerpes}).`];
      const inZ = (z) => p.x > z.x0 && p.x < z.x1 && p.y > z.y0 - 18 && p.y < z.y1;
      if (inZ(ln.bZone)) return ['B세포 여포', '항원을 알아본 B세포가 보조 T세포의 도움을 받아 증식하고(배중심), 클래스 전환·친화도 성숙을 거쳐 형질세포와 기억 B세포가 됨.'];
      if (inZ(ln.pZone)) return ['형질세포 · 기억세포', '형질세포는 초당 수천 개의 항체를 분비. 별(★)은 오래 남는 기억 B·T세포로, 다음 침입 때 2차 면역 반응을 일으킴.'];
      if (inZ(ln.tZone)) return ['T세포 영역', '수지상세포가 가져온 항원을 보조 T세포·세포독성 T세포가 확인하는 곳. 빨간 점 = 세포독성 T세포(CD8).'];
      if (p.y < IMM.Z.tisTop) { const g = IMM.GATES.find(q => p.x >= q.x0 && p.x < q.x1); if (g) return [g.name + ' (1차 방어)', {
        skin: '죽은 각질세포가 겹겹이 쌓인 물리적 장벽. 피지와 땀의 산성·라이소자임이 세균을 억제. 대부분의 병원체가 통과하지 못함.',
        wound: '피부가 찢어져 장벽이 없는 곳. 병원체가 바로 조직으로 들어오고 혈소판·비만세포가 염증을 시작.',
        resp: '끈끈한 점액이 입자를 붙잡고, 섬모가 이를 목 쪽으로 쓸어 올려 내보냄. 점액 속 라이소자임이 세균 세포벽을 분해.',
        gut: '위산(pH 1~2)과 소화 효소가 대부분의 세균과 바이러스를 파괴. 산에 강한 노로바이러스·아메바 포낭은 통과하기 쉬움.',
        blood: '주사·수혈·모기 물림처럼 장벽을 건너뛰고 혈액으로 바로 들어가는 경로.' }[g.id]]; }
    }
    return best;
  }

  // ───────── 조작 버튼 ─────────
  $('btnPlay').addEventListener('click', () => { running = !running; $('btnPlay').textContent = running ? '⏸ 일시정지' : '▶ 재생'; });
  $('speedSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    speed = +b.dataset.speed;
    document.querySelectorAll('#speedSeg button').forEach(x => x.classList.toggle('on', x === b));
  });
  function reset() {
    sim = new IMM.Sim(parseBlood($('blood').value));
    logShown = 0; $('log').innerHTML = ''; $('over').hidden = true;
    running = true; $('btnPlay').textContent = '⏸ 일시정지';
  }
  $('btnReset').addEventListener('click', reset);
  $('btnRestart').addEventListener('click', reset);
  $('blood').addEventListener('change', () => setHint('혈액형은 ‘새 몸으로 시작’을 누르면 적용됩니다.'));
  $('btnLabels').addEventListener('click', () => {
    labels = !labels; $('btnLabels').textContent = labels ? '라벨 끄기' : '라벨 켜기'; $('btnLabels').setAttribute('aria-pressed', String(labels));
  });
  $('btnHelp').addEventListener('click', () => $('help').showModal());
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.code === 'Space' && !e.target.matches('button')) { e.preventDefault(); $('btnPlay').click(); }
    if (e.key === 'Escape' && big && !selected) setBig(false);
    if (e.key === 'Escape' && selected) { selected = null; document.querySelectorAll('.agent.sel').forEach(x => x.classList.remove('sel')); setHint(''); }
  });

  // ───────── 범례 ─────────
  function buildLegend() {
    const items = [['neut', '호중구'], ['macro', '대식세포'], ['dc', '수지상세포'], ['nk', 'NK세포'], ['mast', '비만세포'], ['epi', '상피세포'], ['rbc', '적혈구'],
      ['th', '보조 T'], ['cd8', '세포독성 T'], ['b', 'B세포'], ['plasma', '형질세포'], ['mem', '기억세포'], ['ab', '항체']];
    const el = $('legend');
    for (const [k, n] of items) {
      const s = document.createElement('span');
      const cv = document.createElement('canvas'); cv.width = 44; cv.height = 44;
      const c2 = cv.getContext('2d'); c2.scale(2, 2); IMM.drawCellIcon(c2, k, 22);
      s.append(cv, document.createTextNode(n)); el.appendChild(s);
    }
  }

  // ───────── 패널 ─────────
  function fmtDay(d) { return d.toFixed(1) + '일'; }
  function updatePanel() {
    const s = sim.stats;
    $('dayLabel').textContent = sim.day.toFixed(1) + '일째';
    $('mini').textContent = `건강 ${Math.round(Math.max(0, sim.health))} · ${sim.temp.toFixed(1)}℃` + (sim.hivEver ? ` · CD4 ${s.cd4}` : '') + ((s.virus || s.bact || s.protist) ? ` · 병원체 ${(s.virus || 0) + (s.bact || 0) + (s.protist || 0)}` : '');
    const h = Math.max(0, sim.health);
    $('vHealth').textContent = Math.round(h);
    const bh = $('bHealth'); bh.style.width = h + '%';
    bh.style.background = h > 60 ? 'var(--ok)' : h > 30 ? 'var(--warn)' : 'var(--bad)';
    const t = sim.temp;
    const vt = $('vTemp'); vt.textContent = t.toFixed(1) + '℃'; vt.style.color = t > 39.5 ? 'var(--bad)' : t > 37.7 ? 'var(--warn)' : '';
    $('vInflam').textContent = Math.round(sim.inflam * 100) + '%';
    $('vIfn').textContent = Math.round(Math.min(1, sim.ifn) * 100) + '%';
    $('vComp').textContent = Math.round(sim.comp * 100) + '%';
    const cd4 = s.cd4 == null ? 1000 : s.cd4;
    const vc = $('vCd4'); vc.textContent = cd4 + '/µL'; vc.style.color = cd4 < 200 ? 'var(--bad)' : cd4 < 500 ? 'var(--warn)' : '';
    const rbc = Math.round((s.rbc || 60) / 60 * 100);
    const vr = $('vRbc'); vr.textContent = rbc + '%'; vr.style.color = rbc < 70 ? 'var(--bad)' : '';
    $('cVirus').textContent = s.virus || 0; $('cBact').textContent = (s.bact || 0) + (s.tbIntra ? ` (+세포 안 ${Math.round(s.tbIntra)})` : '');
    $('cProt').textContent = (s.protist || 0) + (s.rbcInf ? ` (+적혈구 속 ${s.rbcInf})` : '');
    $('cInf').textContent = s.infected || 0; $('cNeut').textContent = s.neut || 0; $('cMacro').textContent = s.macro || 0;
    $('cNk').textContent = s.nk || 0; $('cCtl').textContent = s.ctl || 0;

    // 상태
    const st = $('statusLabel');
    let txt = '정상', cls = 'ok';
    const load = (s.virus || 0) + (s.bact || 0) + (s.protist || 0) + (s.infected || 0) + (s.rbcInf || 0) + (s.donor && sim.paths.some(p => p.coat) ? 1 : 0);
    if (!sim.alive) { txt = '사망 — 면역 체계 붕괴'; cls = 'bad'; }
    else if (sim.flags.hiv1 && cd4 < 200) { txt = '면역 결핍 (AIDS)'; cls = 'bad'; }
    else if (h < 30) { txt = '위독'; cls = 'bad'; }
    else if (t > 39.5) { txt = '고열'; cls = 'bad'; }
    else if (load > 0) { txt = '감염과 싸우는 중'; cls = 'warn'; }
    else if (sim.inflam > 0.15 || t > 37.5) { txt = '회복 중'; cls = 'warn'; }
    else if (sim.hiv || sim.tbLatent || sim.latentHerpes) { txt = '겉보기 정상 (잠복 감염 있음)'; cls = 'warn'; }
    st.textContent = txt; st.className = 'status ' + cls;

    // 기록
    const log = $('log');
    while (logShown < sim.log.length) {
      const l = sim.log[logShown++];
      const li = document.createElement('li'); li.className = l.kind;
      li.innerHTML = `<time>${fmtDay(l.day)}</time>`; li.appendChild(document.createTextNode(l.text));
      log.prepend(li);
      while (log.children.length > 150) log.lastChild.remove();
    }
    if (logShown > sim.log.length) logShown = sim.log.length;

    // 기억세포
    const mems = Object.values(sim.ag).filter(r => r.memB >= 1 || r.memT >= 1);
    const ml = $('memList');
    const key = mems.map(r => r.id + Math.round(r.memB) + Math.round(r.memT) + Math.round(r.memC)).join('|');
    if (ml.dataset.key !== key) {
      ml.dataset.key = key;
      ml.innerHTML = mems.length ? '' : '<p class="muted">아직 없음. 항원을 넣고 면역 반응이 끝나면 기억 세포가 남습니다.</p>';
      for (const r of mems) {
        const d = document.createElement('div'); d.className = 'mem';
        d.innerHTML = `<i style="background:${r.color}"></i><span></span><small>B ${Math.round(r.memB)} · T ${Math.round(r.memT)}${r.intra ? ' · CTL ' + Math.round(r.memC) : ''}</small>`;
        d.querySelector('span').textContent = r.name;
        ml.appendChild(d);
      }
    }

    if (!sim.alive && $('over').hidden) {
      $('overReason').textContent = sim.deathReason;
      $('overDay').textContent = `${sim.deathDay.toFixed(1)}일째에 몸이 버티지 못했습니다.`;
      $('over').hidden = false;
    }
  }

  // ───────── 항체 그래프 ─────────
  function drawChart() {
    const w = chart.clientWidth || 300, h = Math.round(w * 0.46);
    const c = cctx; c.clearRect(0, 0, w, h);
    const css = getComputedStyle(document.documentElement);
    const muted = css.getPropertyValue('--muted').trim() || '#888', line = css.getPropertyValue('--line').trim() || '#ddd';
    const pad = { l: 30, r: 8, t: 10, b: 20 };
    const span = 60;
    const t1 = Math.max(span, sim.day), t0 = t1 - span;
    const hist = sim.hist.filter(p => p.day >= t0);
    let max = 4;
    const ids = new Set();
    for (const p of hist) for (const k in p.tit) { ids.add(k); if (p.tit[k] > max) max = p.tit[k]; }
    max = Math.ceil(max / 5) * 5;
    const X = (d) => pad.l + (d - t0) / span * (w - pad.l - pad.r);
    const Y = (v) => h - pad.b - v / max * (h - pad.t - pad.b);
    c.font = '10px "Noto Sans KR", sans-serif'; c.fillStyle = muted; c.strokeStyle = line; c.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const v = max * i / 4; const y = Y(v); c.beginPath(); c.moveTo(pad.l, y); c.lineTo(w - pad.r, y); c.stroke(); c.textAlign = 'right'; c.fillText(v.toFixed(0), pad.l - 4, y + 3); }
    c.textAlign = 'center';
    for (let d = Math.ceil(t0 / 10) * 10; d <= t1; d += 10) c.fillText(d + '일', X(d), h - 6);
    // 병원체 양 (회색 영역)
    let lmax = 1; for (const p of hist) if (p.load > lmax) lmax = p.load;
    c.beginPath(); c.moveTo(X(hist.length ? hist[0].day : t0), Y(0));
    for (const p of hist) c.lineTo(X(p.day), Y(p.load / lmax * max * 0.6));
    c.lineTo(X(hist.length ? hist[hist.length - 1].day : t0), Y(0)); c.closePath();
    c.fillStyle = 'rgba(140,140,160,0.18)'; c.fill();
    // 노출 표시
    for (const e of sim.exposures) {
      if (e.day < t0) continue;
      const x = X(e.day); c.strokeStyle = e.color; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(x, pad.t); c.lineTo(x, h - pad.b); c.stroke(); c.setLineDash([]);
      c.fillStyle = e.color; c.beginPath(); c.moveTo(x - 4, pad.t); c.lineTo(x + 4, pad.t); c.lineTo(x, pad.t + 6); c.fill();
    }
    // 항체 곡선
    c.lineWidth = 2;
    for (const id of ids) {
      c.strokeStyle = IMM.agColor(id); c.beginPath(); let first = true;
      for (const p of hist) { const v = p.tit[id] || 0; const x = X(p.day), y = Y(v); if (first) { c.moveTo(x, y); first = false; } else c.lineTo(x, y); }
      c.stroke();
    }
    // 범례
    const lg = $('chartLegend');
    const key = [...ids].join('|');
    if (lg.dataset.key !== key) {
      lg.dataset.key = key; lg.innerHTML = '';
      for (const id of ids) { const s = document.createElement('span'); s.innerHTML = `<i style="background:${IMM.agColor(id)}"></i>`; s.appendChild(document.createTextNode('항-' + IMM.agName(id))); lg.appendChild(s); }
      const s = document.createElement('span'); s.innerHTML = '<i style="background:rgba(140,140,160,0.4)"></i>병원체 양'; lg.appendChild(s);
      const s2 = document.createElement('span'); s2.innerHTML = '<i style="background:transparent;border:1px dashed currentColor"></i>투입 시점'; lg.appendChild(s2);
    }
  }

  // ───────── 루프 ─────────
  let last = performance.now(), panelT = 0, chartT = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (running) sim.step(dt * speed);
    else sim.updateFx(0);
    let preview = null;
    const cur = drag || selected;
    if (cur && hoverPos) preview = { x: hoverPos.x, y: hoverPos.y, text: `${cur.name} → ${routeText(cur, hoverPos)}` };
    const hg = cur && hoverPos && hoverPos.y < IMM.Z.tisTop ? sim.gateAt(hoverPos.x, hoverPos.y) : null;
    applyView();
    IMM.draw(ctx, sim, now / 1000, { labels, dropPreview: preview, hoverGate: hg, zoom: view.s });
    panelT += dt; chartT += dt;
    if (panelT > 0.2) { panelT = 0; updatePanel(); }
    if (chartT > 0.5) { chartT = 0; drawChart(); }
    requestAnimationFrame(frame);
  }

  IMM.app = { get sim() { return sim; } }; // 디버깅용
  buildPalette(); buildLegend(); fitCanvas(); updatePanel(); drawChart();
  if (window.ResizeObserver) new ResizeObserver(() => { if (!big) fitCanvas(); }).observe($('canvasWrap'));
  // 좁은 화면에서는 기록·기억 패널을 접어서 시작
  if (window.matchMedia('(max-width: 820px)').matches) document.querySelectorAll('details[data-k="log"], details[data-k="mem"]').forEach(d => { d.open = false; });
  document.querySelectorAll('details[data-k="chart"]').forEach(d => d.addEventListener('toggle', () => { if (d.open) { fitCanvas(); drawChart(); } }));
  requestAnimationFrame(frame);
  try { if (!localStorage.getItem('imm-help-seen')) { $('help').showModal(); localStorage.setItem('imm-help-seen', '1'); } } catch (e) { $('help').showModal(); }
})();
