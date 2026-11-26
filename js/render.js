// 면역 시뮬레이터 — 캔버스 그리기 (넓은 몸 지도)
// 움직이지 않는 조직·기관은 타일로 미리 그려 두고(확대 단계별로 선명하게), 세포와 병원체는 화면에 보이는 것만 매 프레임 그린다.
(function (G) {
  const IMM = G.IMM;
  const { W, H, Z, K } = IMM;
  const TAU = Math.PI * 2;
  const TX1 = IMM.TIS_X1;
  const TY = (f) => Z.tisTop + 90 + f * (Z.bloodTop - Z.tisTop - 100);
  const EPI_BOT = Z.tisTop + 12 + 15 * 4 + 10; // 기저막

  function lcg(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }

  // ───────── 기본 도형 ─────────
  function circle(ctx, x, y, r, fill, stroke, lw) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  function ell(ctx, x, y, rx, ry, rot, fill, stroke, lw) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  function blob(ctx, x, y, r, t, ph, fill, k, amp) {
    ctx.beginPath();
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = i / n * TAU;
      const rr = r * (1 + (amp || 0.12) * Math.sin(a * (k || 3) + t * 1.3 + ph) + 0.06 * Math.sin(a * 5 - t * 0.9 + ph));
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  function ab(ctx, x, y, s, rot, col) {
    const c = Math.cos(rot), n = Math.sin(rot);
    const P = (u, v) => [x + u * c - v * n, y + u * n + v * c];
    const a = P(0, s), b = P(-s * 0.75, -s * 0.8), d = P(s * 0.75, -s * 0.8);
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, s * 0.35); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(x, y); ctx.lineTo(b[0], b[1]); ctx.moveTo(x, y); ctx.lineTo(d[0], d[1]); ctx.stroke();
  }
  function coatMarks(ctx, x, y, r, t, col) {
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + t * 0.5; ab(ctx, x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3), 2.6, a + Math.PI / 2, col || '#9ad0ff'); }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function star(ctx, x, y, r1, r2, col) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2; const r = i % 2 ? r2 : r1; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  }
  const gateOf = (x) => { for (const g of IMM.GATES) if (x < g.x1) return g.id; return 'blood'; };
  // 같은 색 원을 한 번에 그리기 (세포가 아주 많을 때)
  const BF = new Map(), BS = new Map();
  function bc(col, x, y, r) { let a = BF.get(col); if (!a) BF.set(col, (a = [])); a.push(x, y, r); }
  function bring(col, x, y, r) { let a = BS.get(col); if (!a) BS.set(col, (a = [])); a.push(x, y, r); }
  function flush(ctx) {
    for (const [col, a] of BF) { if (!a.length) continue; ctx.beginPath(); for (let i = 0; i < a.length; i += 3) { ctx.moveTo(a[i] + a[i + 2], a[i + 1]); ctx.arc(a[i], a[i + 1], a[i + 2], 0, TAU); } ctx.fillStyle = col; ctx.fill(); a.length = 0; }
    for (const [col, a] of BS) { if (!a.length) continue; ctx.beginPath(); for (let i = 0; i < a.length; i += 3) { ctx.moveTo(a[i] + a[i + 2], a[i + 1]); ctx.arc(a[i], a[i + 1], a[i + 2], 0, TAU); } ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke(); a.length = 0; }
  }
  const MID_R = { virus: 3.6, bact: 4, protist: 5, rbc: 6.5, vaccine: 3.5 };
  function midPathogen(p, sim) {
    const d = p.def;
    const col = d.beh === 'trypano' ? IMM.agColor(p.ags[0]) : (d.color || '#ccc');
    const r = d.beh === 'amoeba' ? 10 : MID_R[d.cat] || 4;
    bc(p.coat && d.beh === 'rbc' ? '#c23a4a' : col, p.x, p.y, r);
    if (p.coat) bring(d.beh === 'rbc' ? '#ffe08a' : '#9ad0ff', p.x, p.y, r + 2.6);
  }
  const MID_CELL = { neut: ['#e8e4f0', 7, '#7a5aa8'], macro: ['#f0c9a0', 11, '#8a5a3a'], dc: ['#ffd36e', 6, null], nk: ['#ff8fbf', 7, '#7a0f3d'], ctl: ['#ff6b6b', 6.5, '#8a1c1c'] };
  function midCell(c) {
    const m = MID_CELL[c.type]; const big = c.type === 'macro' && c.loc !== 'blood';
    bc(c.type === 'macro' && c.act > 0 ? '#ffd9a0' : m[0], c.x, c.y, big ? m[1] : Math.min(m[1], 7));
    if (m[2]) bc(m[2], c.x + (big ? 2 : 0), c.y, big ? 4 : 2.4);
    if (c.type === 'macro' && c.gran) bring('rgba(220,190,170,0.6)', c.x, c.y, 28);
    if (c.type === 'ctl') bring(IMM.agColor(c.ag), c.x, c.y, 7.5);
  }

  // ═════════ 움직이지 않는 몸 구조 (조직학 단면을 단순화) ═════════
  // 각 항목: { x0, y0, x1, y1, d(ctx) } — 타일에 걸치는 것만 그린다.
  const ITEMS = [];
  const add = (x0, y0, x1, y1, d) => ITEMS.push({ x0, y0, x1, y1, d });
  const Rs = lcg(11);
  const rnd = (a, b) => a + Rs() * (b - a);

  // 바닥 층 (영역별 단색·그라데이션) — 항상 먼저
  function drawBase(ctx, x0, y0, x1, y1) {
    const fillBand = (ya, yb, style) => { const a = Math.max(ya, y0), b = Math.min(yb, y1); if (b > a) { ctx.fillStyle = style; ctx.fillRect(x0, a, x1 - x0, b - a); } };
    let g = ctx.createLinearGradient(0, 0, 0, Z.barTop); g.addColorStop(0, '#101b30'); g.addColorStop(1, '#1b2c48');
    fillBand(0, Z.barTop, g);
    g = ctx.createLinearGradient(0, Z.tisTop, 0, Z.bloodTop); g.addColorStop(0, '#3a1f2e'); g.addColorStop(0.5, '#331a29'); g.addColorStop(1, '#2b1523');
    fillBand(Z.barTop, Z.bloodTop, g);
    g = ctx.createLinearGradient(0, Z.bloodTop, 0, Z.bloodBot); g.addColorStop(0, '#5a0f1b'); g.addColorStop(0.5, '#3c0a13'); g.addColorStop(1, '#5a0f1b');
    fillBand(Z.bloodTop, Z.bloodBot, g);
    g = ctx.createLinearGradient(0, Z.bloodBot, 0, H); g.addColorStop(0, '#141a2a'); g.addColorStop(1, '#0c111d');
    fillBand(Z.bloodBot, H, g);
  }

  // ── 1차 방어벽 ──
  // 피부: 납작한 죽은 각질세포가 벽돌처럼 쌓인 각질층
  for (const gt of IMM.GATES) {
    const { x0, x1 } = gt, y0 = Z.barTop, y1 = Z.tisTop;
    if (gt.id === 'skin' || gt.id === 'wound') {
      const segs = gt.id === 'skin' ? [[x0, x1]] : [[x0, x0 + 70], [x1 - 70, x1]];
      for (const [a, b] of segs) {
        add(a, y0, b, y1, (ctx) => {
          ctx.fillStyle = '#7d5640'; ctx.fillRect(a, y0, b - a, y1 - y0);
          for (let r = 0; r < 7; r++) {
            const yy = y0 + 3 + r * 7.6;
            for (let x = a - (r % 2) * 18; x < b; x += 36) {
              const xa = Math.max(a, x), xb = Math.min(b, x + 33); if (xb - xa < 4) continue;
              ctx.fillStyle = r < 3 ? 'rgba(228,196,160,0.9)' : r < 5 ? 'rgba(206,164,126,0.9)' : 'rgba(178,128,98,0.95)';
              roundRect(ctx, xa, yy, xb - xa, 6, 3); ctx.fill();
            }
          }
          // 땀구멍·피지
          for (let x = a + 30; x < b; x += 95) { ctx.fillStyle = 'rgba(255,245,200,0.45)'; ctx.beginPath(); ctx.ellipse(x, y0 + 2, 6, 2.4, 0, 0, TAU); ctx.fill(); }
        });
      }
      if (gt.id === 'wound') {
        // 피떡: 섬유소 그물 + 혈소판 + 갇힌 적혈구
        add(x0 + 60, y0 - 4, x1 - 60, Z.tisTop + 120, (ctx) => {
          ctx.fillStyle = '#5d0e19';
          ctx.beginPath(); ctx.moveTo(x0 + 70, y0); ctx.lineTo(x1 - 70, y0); ctx.quadraticCurveTo(x1 - 100, y1 + 40, (x0 + x1) / 2, Z.tisTop + 110); ctx.quadraticCurveTo(x0 + 100, y1 + 40, x0 + 70, y0); ctx.fill();
          const R2 = lcg(5);
          ctx.strokeStyle = 'rgba(255,215,200,0.35)'; ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 0; i < 70; i++) { const x = x0 + 90 + R2() * (x1 - x0 - 180), y = y0 + 6 + R2() * 90; ctx.moveTo(x, y); ctx.lineTo(x + (R2() - 0.5) * 60, y + (R2() - 0.5) * 30); }
          ctx.stroke();
          for (let i = 0; i < 30; i++) { const x = x0 + 100 + R2() * (x1 - x0 - 200), y = y0 + 8 + R2() * 80; ell(ctx, x, y, 6, 4.4, R2() * 3, '#b52a3a'); }
          for (let i = 0; i < 50; i++) circle(ctx, x0 + 90 + R2() * (x1 - x0 - 180), y0 + 6 + R2() * 90, 1.8, 'rgba(200,170,255,0.8)');
        });
      }
    } else if (gt.id === 'resp') {
      add(x0, y0, x1, y1, (ctx) => {
        ctx.fillStyle = '#6a3b4e'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        // 점액층(겔) + 그 아래 묽은 섬모 주위액
        let g = ctx.createLinearGradient(0, y0, 0, y0 + 30); g.addColorStop(0, 'rgba(150,225,205,0.75)'); g.addColorStop(1, 'rgba(150,225,205,0.25)');
        ctx.fillStyle = g; ctx.fillRect(x0, y0, x1 - x0, 30);
        ctx.fillStyle = 'rgba(200,240,230,0.25)'; for (let x = x0 + 10; x < x1; x += 46) { ctx.beginPath(); ctx.ellipse(x, y0 + 10, 14, 5, 0, 0, TAU); ctx.fill(); }
      });
    } else if (gt.id === 'gut') {
      add(x0, y0, x1, y1, (ctx) => {
        ctx.fillStyle = '#4a2a3a'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        const g = ctx.createLinearGradient(0, y0, 0, y0 + 26); g.addColorStop(0, 'rgba(214,227,90,0.6)'); g.addColorStop(1, 'rgba(214,227,90,0.08)');
        ctx.fillStyle = g; ctx.fillRect(x0, y0, x1 - x0, 26);
        // 융모: 손가락 모양 돌기
        for (let x = x0 + 8; x < x1 - 10; x += 30) {
          ctx.fillStyle = '#a7667a'; ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y0 + 30); ctx.quadraticCurveTo(x + 11, y0 + 14, x + 22, y0 + 30); ctx.lineTo(x + 22, y1); ctx.fill();
          ctx.strokeStyle = 'rgba(255,190,200,0.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + 11, y1); ctx.lineTo(x + 11, y0 + 30); ctx.stroke();
        }
      });
    } else if (gt.id === 'blood') {
      add(x0, y0, x1, y1, (ctx) => {
        ctx.fillStyle = '#2a3550'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        // 주사기
        ctx.fillStyle = 'rgba(200,220,255,0.35)'; ctx.fillRect(x0 + 60, y0 - 56, 34, 58);
        ctx.fillStyle = 'rgba(120,150,200,0.5)'; ctx.fillRect(x0 + 60, y0 - 64, 34, 8);
        ctx.strokeStyle = '#cfd8e8'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x0 + 77, y0 + 2); ctx.lineTo(x0 + 77, y1 + 30); ctx.stroke();
        // 모기
        const mx = x0 + 360, my = y0 + 18;
        ctx.fillStyle = '#9aa7c0'; ctx.beginPath(); ctx.ellipse(mx, my, 13, 5, 0.3, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#9aa7c0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(mx - 8, my + 4); ctx.lineTo(mx - 2, y1 + 20); ctx.stroke();
        ctx.fillStyle = 'rgba(200,220,255,0.3)'; ctx.beginPath(); ctx.ellipse(mx - 10, my - 10, 15, 5, -0.6, 0, TAU); ctx.ellipse(mx + 12, my - 10, 15, 5, 0.6, 0, TAU); ctx.fill();
      });
    }
    add(gt.x1 - 1, 0, gt.x1 + 1, Z.tisTop, (ctx) => { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(gt.x1 - 1, 0, 2, Z.tisTop); });
  }
  // 기저막
  add(0, EPI_BOT - 3, TX1, EPI_BOT + 3, (ctx) => { ctx.fillStyle = 'rgba(255,200,220,0.25)'; ctx.fillRect(0, EPI_BOT - 1, TX1, 2); });

  // ── 결합 조직: 콜라겐 섬유 ──
  for (let i = 0; i < 1300; i++) {
    const x = rnd(0, W), y = rnd(EPI_BOT + 8, Z.bloodTop - 6), len = rnd(50, 150), a = rnd(-0.45, 0.45), w = rnd(1.5, 3.5), ph = rnd(0, 6);
    if (x > TX1 && y > IMM.MARROW.y - IMM.MARROW.ry - 40) continue;
    add(x - len, y - len * 0.5 - 8, x + len, y + len * 0.5 + 8, (ctx) => {
      ctx.strokeStyle = 'rgba(255,175,200,0.075)'; ctx.lineWidth = w; ctx.lineCap = 'round';
      ctx.beginPath();
      const ca = Math.cos(a), sa = Math.sin(a);
      for (let s = -1; s <= 1.001; s += 0.25) { const u = s * len / 2, v = Math.sin(s * 5 + ph) * 5; const px = x + u * ca - v * sa, py = y + u * sa + v * ca; if (s === -1) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      ctx.stroke();
    });
  }
  // 섬유아세포 (방추형)
  for (let i = 0; i < 1500; i++) {
    const x = rnd(0, W), y = rnd(EPI_BOT + 10, Z.bloodTop - 8), a = rnd(-0.6, 0.6);
    if (x > TX1 && y > IMM.MARROW.y - IMM.MARROW.ry - 40) continue;
    add(x - 12, y - 12, x + 12, y + 12, (ctx) => { ell(ctx, x, y, 10, 2.6, a, 'rgba(235,170,195,0.16)'); ell(ctx, x, y, 4.5, 1.6, a, 'rgba(120,60,130,0.5)'); });
  }

  // ── 모세혈관 고리: 큰 혈관에서 올라와 상피 바로 아래까지 ──
  for (let x = 70; x < TX1 - 40; x += rnd(120, 190)) {
    const top = EPI_BOT + rnd(10, 40), x2 = x + rnd(30, 60), mid = rnd(-40, 40);
    const pts = [];
    for (let i = 0; i <= 16; i++) { const s = i / 16; const yy = Z.bloodTop - s * (Z.bloodTop - top); pts.push([x + Math.sin(s * 7 + x) * 10 + mid * Math.sin(s * Math.PI), yy]); }
    for (let i = 16; i >= 0; i--) { const s = i / 16; const yy = Z.bloodTop - s * (Z.bloodTop - top); pts.push([x2 + Math.sin(s * 6 + x2) * 10 + mid * Math.sin(s * Math.PI), yy]); }
    add(x - 70, top - 12, x2 + 70, Z.bloodTop, (ctx) => {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.strokeStyle = 'rgba(150,25,45,0.75)'; ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = 'rgba(235,90,110,0.45)'; ctx.lineWidth = 2.5; ctx.stroke();
      for (let i = 2; i < pts.length - 2; i += 3) ell(ctx, pts[i][0], pts[i][1], 2.6, 1.8, i, 'rgba(230,60,80,0.9)');
    });
  }

  // ── 림프관: 조직의 막힌 끝에서 시작해 림프절로 ──
  for (const lx of IMM.LYMPH_X) {
    const top = EPI_BOT + 40, bot = IMM.LN.bZone.y0 - 26;
    add(lx - 60, top - 10, lx + 60, bot + 10, (ctx) => {
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(150,235,195,0.22)'; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(lx, top); ctx.lineTo(lx, bot); ctx.stroke();
      ctx.strokeStyle = 'rgba(170,245,210,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(lx - 8, top); ctx.lineTo(lx - 8, bot); ctx.moveTo(lx + 8, top); ctx.lineTo(lx + 8, bot); ctx.stroke();
      // 판막
      ctx.beginPath(); for (let y = top + 50; y < bot - 20; y += 70) { ctx.moveTo(lx - 8, y); ctx.lineTo(lx, y + 9); ctx.lineTo(lx + 8, y); } ctx.stroke();
      // 곁가지
      ctx.strokeStyle = 'rgba(150,235,195,0.2)'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(lx, top + 120); ctx.quadraticCurveTo(lx - 40, top + 80, lx - 55, top + 20); ctx.moveTo(lx, top + 220); ctx.quadraticCurveTo(lx + 40, top + 170, lx + 55, top + 60); ctx.stroke();
    });
  }

  // ── 피부 구역: 털집·피지샘·땀샘·지방층·신경 ──
  for (const hx of [170, 560]) {
    const top = Z.barTop, bot = TY(0.62);
    add(hx - 90, top - 90, hx + 90, bot + 40, (ctx) => {
      ctx.fillStyle = 'rgba(205,150,110,0.55)'; roundRect(ctx, hx - 17, top, 34, bot - top, 14); ctx.fill();
      ctx.fillStyle = 'rgba(140,90,70,0.6)'; roundRect(ctx, hx - 9, top, 18, bot - top - 10, 8); ctx.fill();
      ell(ctx, hx, bot, 30, 24, 0, 'rgba(205,150,110,0.7)');
      ell(ctx, hx, bot + 4, 12, 10, 0, 'rgba(120,50,70,0.8)'); // 진피 유두
      // 털
      ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx, bot - 10); ctx.lineTo(hx, top); ctx.quadraticCurveTo(hx + 4, top - 50, hx + 40, top - 80); ctx.stroke();
      // 피지샘
      for (let i = 0; i < 5; i++) circle(ctx, hx + 32 + (i % 2) * 14, TY(0.02) + i * 12, 10, 'rgba(250,225,160,0.45)', 'rgba(250,225,160,0.7)', 1);
      // 털세움근
      ctx.strokeStyle = 'rgba(220,110,120,0.45)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(hx + 14, TY(0.3)); ctx.lineTo(hx + 80, EPI_BOT + 14); ctx.stroke();
    });
  }
  { // 땀샘 (뒤엉킨 관)
    const sx = 380, sy = TY(0.66);
    add(sx - 60, Z.barTop, sx + 60, sy + 60, (ctx) => {
      ctx.strokeStyle = 'rgba(160,200,240,0.5)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(sx, Z.barTop); for (let y = Z.barTop; y < sy - 30; y += 8) ctx.lineTo(sx + Math.sin(y * 0.08) * 7, y); ctx.stroke();
      for (let i = 0; i < 9; i++) circle(ctx, sx + Math.cos(i * 1.9) * 22, sy + Math.sin(i * 1.9) * 16, 9, 'rgba(160,200,240,0.12)', 'rgba(160,200,240,0.5)', 2);
    });
  }
  // 피하 지방
  for (let x = 20; x < 740; x += 42) for (let y = TY(0.76); y < Z.bloodTop - 18; y += 40) {
    const cx = x + rnd(-6, 6) + ((y / 40) % 2) * 21, cy = y + rnd(-5, 5), r = rnd(16, 21);
    add(cx - r, cy - r, cx + r, cy + r, (ctx) => { circle(ctx, cx, cy, r, 'rgba(250,235,210,0.09)', 'rgba(255,225,205,0.32)', 1.4); circle(ctx, cx + r * 0.7, cy + r * 0.3, 2.2, 'rgba(120,60,130,0.55)'); });
  }
  { // 감각 신경
    const g = IMM.GANGLION;
    add(0, EPI_BOT, 520, g.y + 40, (ctx) => {
      ctx.strokeStyle = 'rgba(255,214,120,0.35)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, g.y + 10); ctx.lineTo(g.x, g.y);
      ctx.moveTo(g.x, g.y); ctx.bezierCurveTo(g.x + 40, g.y - 120, g.x + 90, TY(0.2), 300, EPI_BOT + 10);
      ctx.moveTo(g.x + 40, g.y - 100); ctx.bezierCurveTo(g.x + 10, TY(0.3), 120, TY(0.1), 90, EPI_BOT + 8);
      ctx.stroke();
      circle(ctx, g.x, g.y, 24, 'rgba(255,214,120,0.18)', 'rgba(255,214,120,0.55)', 1.5);
      for (let i = 0; i < 6; i++) circle(ctx, g.x + Math.cos(i) * 12, g.y + Math.sin(i) * 10, 4, 'rgba(255,230,170,0.4)');
    });
  }

  // ── 기도 구역: 점막하샘·평활근·연골 ──
  for (let gx = 1260; gx < 1880; gx += 150) {
    const gy = TY(0.3);
    add(gx - 40, EPI_BOT, gx + 40, gy + 40, (ctx) => {
      ctx.strokeStyle = 'rgba(230,240,255,0.25)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(gx, EPI_BOT); ctx.lineTo(gx + 6, gy - 20); ctx.stroke();
      for (let i = 0; i < 7; i++) circle(ctx, gx + Math.cos(i * 0.9) * 20, gy + Math.sin(i * 0.9) * 15, 9, 'rgba(210,220,250,0.12)', 'rgba(210,220,250,0.4)', 1.2);
    });
  }
  add(1190, TY(0.5) - 14, 1890, TY(0.5) + 14, (ctx) => { for (let x = 1195; x < 1885; x += 18) ell(ctx, x, TY(0.5) + Math.sin(x) * 4, 9, 2.4, 0.1, 'rgba(230,120,140,0.25)'); });
  add(1240, TY(0.68), 1840, TY(0.95), (ctx) => {
    const cx = 1540, cy = TY(0.84);
    ell(ctx, cx, cy, 290, 52, 0, 'rgba(150,185,220,0.16)', 'rgba(170,200,235,0.45)', 2);
    const R2 = lcg(3); for (let i = 0; i < 70; i++) { const a = R2() * TAU, r = Math.sqrt(R2()); ell(ctx, cx + Math.cos(a) * r * 260, cy + Math.sin(a) * r * 40, 5, 3.5, 0, 'rgba(200,220,245,0.3)', 'rgba(220,235,255,0.35)', 0.8); }
  });

  // ── 소화관 구역: 샘창자(움) · 파이어판 · 근육층 ──
  for (let x = 1914; x < 2510; x += 30) {
    add(x - 10, EPI_BOT, x + 10, TY(0.32), (ctx) => {
      ctx.fillStyle = 'rgba(200,120,150,0.18)'; roundRect(ctx, x - 8, EPI_BOT, 16, TY(0.32) - EPI_BOT, 8); ctx.fill();
      for (let y = EPI_BOT + 12; y < TY(0.3); y += 16) circle(ctx, x, y, 3, 'rgba(240,240,255,0.35)');
    });
  }
  { const px = 2210, py = TY(0.55);
    add(px - 130, py - 70, px + 130, py + 70, (ctx) => {
      ell(ctx, px, py, 125, 62, 0, 'rgba(70,150,200,0.13)', 'rgba(120,190,240,0.35)', 1.5);
      ell(ctx, px, py, 60, 34, 0, 'rgba(110,210,190,0.14)');
      const R2 = lcg(9); for (let i = 0; i < 170; i++) { const a = R2() * TAU, r = Math.sqrt(R2()); circle(ctx, px + Math.cos(a) * r * 118, py + Math.sin(a) * r * 56, 2.2, 'rgba(120,180,235,0.45)'); }
    }); }
  add(1900, TY(0.8), 2520, TY(1) + 4, (ctx) => {
    ctx.fillStyle = 'rgba(200,90,110,0.12)'; ctx.fillRect(1900, TY(0.8), 620, TY(1) - TY(0.8));
    for (let x = 1906; x < 2516; x += 14) ell(ctx, x, TY(0.85), 5, 5, 0, 'rgba(225,120,140,0.25)');
    for (let x = 1906; x < 2516; x += 30) ell(ctx, x + 10, TY(0.95), 14, 3, 0, 'rgba(225,120,140,0.25)');
  });

  // ── 혈관 직접 구역 아래: 골격근과 뼈(골수) ──
  { const M = IMM.MARROW;
    for (let y = EPI_BOT - 70; y < M.y - M.ry - 40; y += 26) {
      add(TX1, y, W, y + 22, (ctx) => {
        ctx.fillStyle = 'rgba(190,80,100,0.22)'; roundRect(ctx, TX1 + 10, y, W - TX1 - 20, 20, 10); ctx.fill();
        ctx.strokeStyle = 'rgba(255,170,180,0.18)'; ctx.lineWidth = 1; ctx.beginPath(); for (let x = TX1 + 16; x < W - 14; x += 6) { ctx.moveTo(x, y + 3); ctx.lineTo(x, y + 17); } ctx.stroke();
        circle(ctx, TX1 + 60 + (y * 7) % 300, y + 10, 2.4, 'rgba(110,50,120,0.6)');
      });
    }
    add(M.x - M.rx - 40, M.y - M.ry - 40, M.x + M.rx + 40, M.y + M.ry + 40, (ctx) => {
      ell(ctx, M.x, M.y, M.rx + 32, M.ry + 30, 0, '#cbbfa6');
      const R2 = lcg(21);
      for (let i = 0; i < 40; i++) { const a = R2() * TAU; ell(ctx, M.x + Math.cos(a) * (M.rx + 16), M.y + Math.sin(a) * (M.ry + 15), 3, 1.6, a, 'rgba(90,70,50,0.5)'); }
      ell(ctx, M.x, M.y, M.rx, M.ry, 0, '#5a2433');
      for (let i = 0; i < 14; i++) circle(ctx, M.x + (R2() - 0.5) * M.rx * 1.6, M.y + (R2() - 0.5) * M.ry * 1.6, rnd(8, 14), 'rgba(250,235,210,0.18)');
      const cols = ['rgba(230,70,90,0.85)', 'rgba(190,120,230,0.8)', 'rgba(240,200,220,0.7)', 'rgba(255,150,170,0.8)'];
      for (let i = 0; i < 520; i++) {
        const a = R2() * TAU, r = Math.sqrt(R2()) * 0.94; const x = M.x + Math.cos(a) * r * M.rx, y = M.y + Math.sin(a) * r * M.ry;
        circle(ctx, x, y, 2 + R2() * 2.2, cols[(R2() * cols.length) | 0]);
      }
      for (let i = 0; i < 7; i++) { const a = R2() * TAU, r = Math.sqrt(R2()) * 0.8; blob(ctx, M.x + Math.cos(a) * r * M.rx, M.y + Math.sin(a) * r * M.ry, 9, 0, i, 'rgba(210,160,240,0.75)', 4, 0.2); }
      // 골수에서 혈관으로 나가는 정맥굴
      ctx.strokeStyle = 'rgba(150,25,45,0.85)'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(M.x - 40, M.y + M.ry - 10); ctx.quadraticCurveTo(M.x - 60, M.y + M.ry + 60, M.x - 30, Z.bloodTop); ctx.stroke();
    });
  }

  // ── 큰 혈관 벽 ──
  for (let x = 0; x < W; x += 200) {
    add(x, Z.bloodTop - 14, x + 200, Z.bloodTop + 4, (ctx) => {
      ctx.fillStyle = 'rgba(190,70,90,0.55)'; ctx.fillRect(x, Z.bloodTop - 12, 200, 9);
      for (let xx = x + 4; xx < x + 200; xx += 16) ell(ctx, xx, Z.bloodTop - 7.5, 7, 2, 0, 'rgba(255,150,165,0.35)');
      ctx.fillStyle = 'rgba(255,200,210,0.6)'; ctx.fillRect(x, Z.bloodTop - 2, 200, 2);
    });
    add(x, Z.bloodBot - 4, x + 200, Z.bloodBot + 14, (ctx) => {
      ctx.fillStyle = 'rgba(190,70,90,0.55)'; ctx.fillRect(x, Z.bloodBot + 3, 200, 9);
      for (let xx = x + 12; xx < x + 200; xx += 16) ell(ctx, xx, Z.bloodBot + 7.5, 7, 2, 0, 'rgba(255,150,165,0.35)');
      ctx.fillStyle = 'rgba(255,200,210,0.6)'; ctx.fillRect(x, Z.bloodBot, 200, 2);
    });
  }

  // ── 림프절 ──
  { const L = IMM.LNODE, ln = IMM.LN;
    add(L.x - L.rx - 10, L.y - L.ry - 10, L.x + L.rx + 10, L.y + L.ry + 10, (ctx) => {
      ell(ctx, L.x, L.y, L.rx, L.ry, 0, '#16243f', 'rgba(175,195,235,0.6)', 5);
      ell(ctx, L.x, L.y, L.rx - 14, L.ry - 12, 0, null, 'rgba(160,200,240,0.18)', 10); // 피막밑굴
      // 부피질 (T세포 영역)
      ctx.fillStyle = 'rgba(94,177,239,0.06)'; roundRect(ctx, ln.tZone.x0, ln.tZone.y0 - 10, ln.tZone.x1 - ln.tZone.x0, ln.tZone.y1 - ln.tZone.y0 + 10, 40); ctx.fill();
      // 수질 (형질세포 끈)
      ctx.strokeStyle = 'rgba(255,200,120,0.12)'; ctx.lineWidth = 16; ctx.lineCap = 'round';
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const y = ln.pZone.y0 + 20 + i * 42; ctx.moveTo(ln.pZone.x0 + 10, y); ctx.quadraticCurveTo((ln.pZone.x0 + ln.pZone.x1) / 2, y + 20, ln.pZone.x1 + 60, L.y); } ctx.stroke();
      // 문(hilum)과 날림프관
      ctx.strokeStyle = 'rgba(150,235,195,0.35)'; ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(L.x + L.rx - 20, L.y); ctx.lineTo(L.x + L.rx + 40, L.y + 90); ctx.stroke();
      // 높은 내피 세정맥
      const R2 = lcg(31);
      for (let i = 0; i < 16; i++) { const x = ln.tZone.x0 + 40 + R2() * (ln.tZone.x1 - ln.tZone.x0 - 80), y = ln.tZone.y0 + 20 + R2() * (ln.tZone.y1 - ln.tZone.y0 - 40); circle(ctx, x, y, 9, null, 'rgba(255,140,160,0.45)', 3); }
      // 쉬고 있는 림프구 (배경)
      for (let i = 0; i < 1700; i++) { const x = ln.tZone.x0 + R2() * (ln.tZone.x1 - ln.tZone.x0), y = ln.tZone.y0 + R2() * (ln.tZone.y1 - ln.tZone.y0); circle(ctx, x, y, 2.1, 'rgba(120,170,230,0.28)'); }
      // 여포 (B세포) — 바깥 외투층 + 배중심
      for (const f of FOLLICLES) {
        for (let i = 0; i < 160; i++) { const a = R2() * TAU, r = 0.62 + R2() * 0.38; circle(ctx, f.x + Math.cos(a) * r * f.r, f.y + Math.sin(a) * r * f.r * 0.82, 2, 'rgba(70,200,170,0.42)'); }
        ell(ctx, f.x, f.y, f.r * 0.6, f.r * 0.5, 0, 'rgba(110,220,190,0.10)', 'rgba(110,220,190,0.3)', 1);
      }
    });
  }
  // 여포 위치 (B세포 장식에도 사용)
  var FOLLICLES = [];
  { const b = IMM.LN.bZone; const n = 7; for (let i = 0; i < n; i++) FOLLICLES.push({ x: b.x0 + (i + 0.5) * (b.x1 - b.x0) / n, y: (b.y0 + b.y1) / 2 + (i % 2 ? 6 : -4), r: Math.min(80, (b.x1 - b.x0) / n / 2 - 8) }); }

  // ── 비장 ──
  { const S = IMM.SPLEEN;
    add(S.x - S.rx - 10, S.y - S.ry - 10, S.x + S.rx + 10, S.y + S.ry + 10, (ctx) => {
      ctx.save(); ctx.beginPath(); ctx.ellipse(S.x, S.y, S.rx, S.ry, 0.15, 0, TAU); ctx.fillStyle = '#4b1222'; ctx.fill(); ctx.clip();
      const R2 = lcg(41);
      for (let i = 0; i < 1100; i++) circle(ctx, S.x + (R2() - 0.5) * S.rx * 2, S.y + (R2() - 0.5) * S.ry * 2, 2.2, 'rgba(225,70,90,0.55)');
      ctx.strokeStyle = 'rgba(230,200,200,0.18)'; ctx.lineWidth = 3; ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = R2() * TAU; ctx.moveTo(S.x + Math.cos(a) * S.rx, S.y + Math.sin(a) * S.ry); ctx.lineTo(S.x + Math.cos(a) * S.rx * 0.3, S.y + Math.sin(a) * S.ry * 0.3); } ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU + 0.4, r = 0.55; const x = S.x + Math.cos(a) * r * S.rx, y = S.y + Math.sin(a) * r * S.ry;
        circle(ctx, x, y, 34, 'rgba(90,140,220,0.25)');
        for (let j = 0; j < 40; j++) { const b = R2() * TAU, q = Math.sqrt(R2()) * 30; circle(ctx, x + Math.cos(b) * q, y + Math.sin(b) * q, 2, 'rgba(130,180,240,0.55)'); }
        circle(ctx, x, y, 5, 'rgba(200,40,60,0.9)', 'rgba(255,190,200,0.6)', 1.5); // 중심 소동맥
      }
      ctx.restore();
      ell(ctx, S.x, S.y, S.rx, S.ry, 0.15, null, 'rgba(230,180,190,0.55)', 4);
    });
  }
  // ── 간 ──
  { const L = IMM.LIVER;
    add(L.x - L.r - 30, L.y - L.r - 30, L.x + L.r + 30, L.y + L.r + 30, (ctx) => {
      ctx.save(); ctx.beginPath(); ctx.ellipse(L.x, L.y, L.r + 20, L.r + 10, 0, 0, TAU); ctx.fillStyle = '#4a1d1f'; ctx.fill(); ctx.clip();
      const hr = 46;
      for (let row = -6; row <= 6; row++) for (let col = -6; col <= 6; col++) {
        const cx = L.x + col * hr * 1.5, cy = L.y + row * hr * 1.732 + (col % 2 ? hr * 0.866 : 0);
        if ((cx - L.x) ** 2 + (cy - L.y) ** 2 > (L.r + 60) ** 2) continue;
        ctx.strokeStyle = 'rgba(255,190,170,0.2)'; ctx.lineWidth = 1;
        ctx.beginPath(); for (let i = 0; i <= 6; i++) { const a = i / 6 * TAU; const px = cx + Math.cos(a) * hr, py = cy + Math.sin(a) * hr; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.stroke();
        // 간세포 판 (중심 정맥 방향으로 방사)
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; for (let s = 0.3; s < 0.95; s += 0.16) circle(ctx, cx + Math.cos(a) * hr * s, cy + Math.sin(a) * hr * s, 2.7, 'rgba(225,150,130,0.55)'); }
        circle(ctx, cx, cy, 6, 'rgba(60,10,20,0.9)', 'rgba(255,170,170,0.4)', 1);
        for (let i = 0; i < 6; i += 2) { const a = i / 6 * TAU; const px = cx + Math.cos(a) * hr, py = cy + Math.sin(a) * hr; circle(ctx, px - 3, py, 2, 'rgba(90,200,120,0.7)'); circle(ctx, px + 3, py, 2, 'rgba(230,60,70,0.8)'); circle(ctx, px, py + 3, 2.4, 'rgba(90,120,220,0.8)'); }
      }
      ctx.restore();
      ell(ctx, L.x, L.y, L.r + 20, L.r + 10, 0, null, 'rgba(240,170,160,0.5)', 4);
    });
  }

  // 공간 색인
  const TS = 256;
  const TCOLS = Math.ceil(W / TS), TROWS = Math.ceil(H / TS);
  const BUCKET = [];
  for (let i = 0; i < TCOLS * TROWS; i++) BUCKET.push([]);
  ITEMS.forEach((it) => {
    const a = Math.max(0, Math.floor(it.x0 / TS)), b = Math.min(TCOLS - 1, Math.floor(it.x1 / TS));
    const c = Math.max(0, Math.floor(it.y0 / TS)), d = Math.min(TROWS - 1, Math.floor(it.y1 / TS));
    for (let ty = c; ty <= d; ty++) for (let tx = a; tx <= b; tx++) BUCKET[tx + ty * TCOLS].push(it);
  });

  function drawStatic(ctx, tx, ty) {
    const x0 = tx * TS, y0 = ty * TS, x1 = x0 + TS, y1 = y0 + TS;
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, TS, TS); ctx.clip();
    drawBase(ctx, x0, y0, x1, y1);
    for (const it of BUCKET[tx + ty * TCOLS]) it.d(ctx);
    ctx.restore();
  }

  // ───────── 타일 캐시 ─────────
  const tiles = new Map();
  let tilePx = 0, useTick = 0;
  const MAX_PX = 30e6;
  const LODS = [0.25, 0.5, 1, 2, 3];
  function mkCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  function getTile(tx, ty, l, budget) {
    const key = tx + ',' + ty + ',' + l;
    let t = tiles.get(key);
    if (t) { t.use = ++useTick; return t.c; }
    if (budget.n <= 0) return null;
    budget.n--;
    const px = Math.ceil(TS * l);
    const c = mkCanvas(px, px), g = c.getContext('2d');
    g.scale(l, l); g.translate(-tx * TS, -ty * TS);
    drawStatic(g, tx, ty);
    tiles.set(key, { c, use: ++useTick, px: px * px });
    tilePx += px * px;
    if (tilePx > MAX_PX) {
      const arr = [...tiles.entries()].filter(([k]) => !k.endsWith(',0.25')).sort((a, b) => a[1].use - b[1].use);
      for (const [k, v] of arr) { if (tilePx < MAX_PX * 0.7) break; tiles.delete(k); tilePx -= v.px; }
    }
    return c;
  }
  // 전체 모습 (미니맵 겸 확대 중 빈 타일 대체)
  let overview = null;
  const OV = 0.2;
  function getOverview() {
    if (overview) return overview;
    overview = mkCanvas(Math.ceil(W * OV), Math.ceil(H * OV));
    const g = overview.getContext('2d');
    for (let ty = 0; ty < TROWS; ty++) for (let tx = 0; tx < TCOLS; tx++) {
      const c = getTile(tx, ty, 0.25, { n: 1 });
      g.drawImage(c, tx * TS * OV, ty * TS * OV, TS * OV, TS * OV);
    }
    return overview;
  }

  function drawBg(ctx, v) {
    const s = v.k * v.dpr; // 장치 픽셀 / 세계 좌표
    let l = LODS[LODS.length - 1]; for (const q of LODS) if (q >= s * 0.95) { l = q; break; }
    const ov = getOverview();
    const budget = { n: 6 };
    const ax = Math.max(0, Math.floor(v.x0 / TS)), bx = Math.min(TCOLS - 1, Math.floor(v.x1 / TS));
    const ay = Math.max(0, Math.floor(v.y0 / TS)), by = Math.min(TROWS - 1, Math.floor(v.y1 / TS));
    const pad = 1 / s;
    for (let ty = ay; ty <= by; ty++) for (let tx = ax; tx <= bx; tx++) {
      let c = getTile(tx, ty, l, budget);
      if (!c) { for (let i = LODS.indexOf(l) - 1; i >= 0 && !c; i--) { const t = tiles.get(tx + ',' + ty + ',' + LODS[i]); if (t) c = t.c; } }
      if (c) ctx.drawImage(c, tx * TS, ty * TS, TS + pad, TS + pad);
      else ctx.drawImage(ov, tx * TS * OV, ty * TS * OV, TS * OV, TS * OV, tx * TS, ty * TS, TS + pad, TS + pad);
    }
    return budget.n < 6; // 아직 그릴 타일이 남았는지
  }

  // ═════════ 움직이는 것들 ═════════
  // 장식용 혈구 (시뮬레이션과 무관하게 흐르는 적혈구·혈소판)
  const R = lcg(7);
  const DECO_RBC = [], PLATE = [];
  for (let i = 0; i < 700; i++) DECO_RBC.push({ x: R() * W, y: Z.bloodTop + 8 + R() * (Z.bloodBot - Z.bloodTop - 16), f: 0.85 + R() * 0.3, rot: R() * 6 });
  for (let i = 0; i < 260; i++) PLATE.push({ x: R() * W, y: Z.bloodTop + 8 + R() * (Z.bloodBot - Z.bloodTop - 16), f: 0.9 + R() * 0.2 });
  // 림프절 장식 세포 (CD8 T세포, B세포)
  const CD8 = [], BCELL = [];
  { const t = IMM.LN.tZone; for (let i = 0; i < 26 * K; i++) CD8.push({ x: t.x0 + 16 + R() * (t.x1 - t.x0 - 32), y: t.y0 + 16 + R() * (t.y1 - t.y0 - 32), ph: R() * 6 }); }
  for (let i = 0; i < 40 * K; i++) { const f = FOLLICLES[i % FOLLICLES.length]; const a = R() * TAU, r = Math.sqrt(R()) * 0.55; BCELL.push({ x: f.x + Math.cos(a) * r * f.r, y: f.y + Math.sin(a) * r * f.r * 0.8, ph: R() * 6 }); }

  // ───────── 병원체 모양 ─────────
  function drawPathogen(ctx, p, t, sim, far) {
    const d = p.def, x = p.x, y = p.y;
    if (p.st === 'blocked') return drawBlocked(ctx, p, t);
    if (p.st === 'liver') { circle(ctx, x, y, 3.5 + Math.sin(t * 3 + p.ph) * 0.8, '#ff9db0', 'rgba(255,255,255,0.6)', 1); return; }
    const col = d.color || '#ccc';
    if (far) { ctx.fillStyle = d.beh === 'trypano' && sim ? IMM.agColor(p.ags[0]) : col; const s = d.cat === 'protist' ? 8 : 6; ctx.fillRect(x - s / 2, y - s / 2, s, s); return; }
    switch (d.beh) {
      case 'lytic': case 'hiv': drawVirus(ctx, p, t, col); break;
      case 'bact': case 'tb': drawBact(ctx, p, t, col); break;
      case 'malaria':
        if (p.st === 'spz') { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(p.vy, p.vx)); ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(0, 6, 7, -2.3, -0.8); ctx.stroke(); ctx.restore(); }
        else { ctx.beginPath(); ctx.ellipse(x, y, 3.2, 2.2, p.ph, 0, TAU); ctx.fillStyle = col; ctx.fill(); }
        break;
      case 'trypano': {
        ctx.save(); ctx.translate(x, y);
        ctx.strokeStyle = sim ? IMM.agColor(p.ags[0]) : col; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i <= 8; i++) { const px = -9 + i * 2.2, py = Math.sin(i * 0.9 + t * 9 + p.ph) * 2.2; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
        ctx.stroke(); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(14, Math.sin(t * 12 + p.ph) * 3); ctx.stroke();
        ctx.restore(); break;
      }
      case 'amoeba': {
        blob(ctx, x, y, 11, t, p.ph, 'rgba(18,165,148,0.75)', 4, 0.22);
        circle(ctx, x + 2, y - 1, 3.2, '#0b5e55');
        if (p.hp < 6) { ctx.fillStyle = '#ff6b6b'; ctx.fillRect(x - 8, y - 16, 16 * Math.max(0, p.hp / 6), 2); }
        break;
      }
      case 'rbc': drawDonorRbc(ctx, p, t, sim); break;
      case 'vaccine': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(t + p.ph); ctx.fillStyle = col; ctx.fillRect(-3, -3, 6, 6); ctx.restore(); break;
      }
    }
    if (p.coat && d.beh !== 'rbc') coatMarks(ctx, x, y, d.cat === 'protist' ? 6 : 4, t + p.ph, '#9ad0ff');
    else if (p.opso && d.cat === 'bact') { circle(ctx, x + 4, y - 3, 1.2, '#ffb366'); circle(ctx, x - 4, y + 2, 1.2, '#ffb366'); }
  }

  function drawVirus(ctx, p, t, col) {
    const x = p.x, y = p.y, id = p.def.id;
    if (id === 'flu' || id === 'hiv') {
      const r = id === 'hiv' ? 3.6 : 3.4;
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + p.ph; ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.lineTo(x + Math.cos(a) * (r + 2.4), y + Math.sin(a) * (r + 2.4)); }
      ctx.stroke();
      circle(ctx, x, y, r, col);
      if (id === 'hiv') circle(ctx, x, y, 1.4, '#2a0f3d');
    } else {
      const r = id === 'herpes' ? 4.4 : id === 'noro' ? 2.8 : 3.4;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + p.ph; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.closePath(); ctx.fillStyle = col; ctx.fill();
      if (id === 'herpes') circle(ctx, x, y, r + 2, null, col, 1);
    }
  }

  function drawBact(ctx, p, t, col) {
    const x = p.x, y = p.y, id = p.def.id;
    if (id === 'staph') { circle(ctx, x, y, 3.6, col); circle(ctx, x - 1, y - 1, 1.2, 'rgba(255,255,255,0.35)'); }
    else if (id === 'pneumo') {
      if (!p.coat) circle(ctx, x, y, 7, 'rgba(0,144,255,0.18)', 'rgba(120,190,255,0.5)', 1);
      ctx.save(); ctx.translate(x, y); ctx.rotate(p.ph);
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(-2.4, 0, 2.6, 3.2, 0, 0, TAU); ctx.ellipse(2.4, 0, 2.6, 3.2, 0, 0, TAU); ctx.fill(); ctx.restore();
    } else {
      const len = id === 'tb' ? 7 : 6, w = id === 'tb' ? 1.8 : 2.6;
      ctx.save(); ctx.translate(x, y); ctx.rotate(p.ph + (id === 'salm' ? Math.atan2(p.vy, p.vx) : 0));
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, len, w, 0, 0, TAU); ctx.fill();
      if (id === 'salm') { ctx.strokeStyle = 'rgba(200,150,220,0.7)'; ctx.lineWidth = 0.8; ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(-len, (i - 1) * 2); ctx.quadraticCurveTo(-len - 4, (i - 1) * 2 + Math.sin(t * 10 + i) * 3, -len - 8, (i - 1) * 3); } ctx.stroke(); }
      ctx.restore();
    }
  }

  function drawDonorRbc(ctx, p, t, sim) {
    const x = p.x, y = p.y;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = p.coat ? '#c23a4a' : '#e5484d';
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 5.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(80,0,10,0.35)'; ctx.beginPath(); ctx.ellipse(0, 0, 3.2, 2.4, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffd1d6'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, 0, 7, 5.5, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lab = p.ags.filter(a => a !== 'D').join('') || 'O';
    ctx.fillText(lab + (p.ags.includes('D') ? '+' : '−'), 0, 0.5);
    ctx.restore();
    if (p.coat) coatMarks(ctx, x, y, 6, t + p.ph, '#ffe08a');
  }

  function drawBlocked(ctx, p, t) {
    const k = Math.max(0, p.t);
    const a = Math.max(0, 1 - k / 2.4);
    ctx.globalAlpha = a;
    let x = p.x, y = Math.min(Z.barTop - 2, p.y + k * 35);
    if (p.mode === 'skin') { y = Math.min(Z.barTop - 3, p.y + k * 40); if (y >= Z.barTop - 3) y = Z.barTop - 3 - Math.abs(Math.sin(k * 6)) * 8; }
    if (p.mode === 'resp') { y = Math.max(4, Z.barTop + 16 - k * 30); x = p.x + Math.sin(k * 5 + p.ph) * 4; }
    if (p.mode === 'gut') { y = Math.min(Z.barTop + 22, p.y + k * 40); }
    const q = { ...p, x, y, st: 'free' };
    drawPathogen(ctx, q, t);
    if (p.mode === 'gut' && y > Z.barTop) circle(ctx, x, y, 4 + k * 3, null, 'rgba(220,240,100,0.7)', 1);
    if (p.mode === 'resp' && y < Z.barTop + 16) circle(ctx, x, y, 6, 'rgba(160,220,210,0.25)');
    ctx.globalAlpha = 1;
  }

  // ───────── 상피세포 ─────────
  const EPI_COL = { skin: '#b98a6a', wound: '#a86f68', resp: '#d999a3', gut: '#c78897' };
  function drawEpi(ctx, sim, t, v, far) {
    for (const c of sim.epi) {
      if (c.x < v.x0 - 12 || c.x > v.x1 + 12 || c.y < v.y0 - 12 || c.y > v.y1 + 12) continue;
      const gate = gateOf(c.x);
      if (c.st === 'dead') { ctx.fillStyle = 'rgba(80,60,60,0.6)'; ctx.fillRect(c.x - 6, c.y - 6, 12, 12); continue; }
      const tall = gate === 'resp' || gate === 'gut';
      const w = 15, h = tall ? 14.5 : 13;
      ctx.fillStyle = c.st === 'inf' ? c.def.color : EPI_COL[gate];
      if (far) { ctx.fillRect(c.x - w / 2, c.y - h / 2, w, h); continue; }
      roundRect(ctx, c.x - w / 2, c.y - h / 2, w, h, 4); ctx.fill();
      if (c.st === 'inf') {
        const k = Math.min(1, c.t / c.def.incub);
        ctx.fillStyle = 'rgba(255,255,255,' + (0.15 + 0.2 * k) + ')'; roundRect(ctx, c.x - w / 2, c.y - h / 2, w, h, 4); ctx.fill();
        for (let i = 0; i < Math.floor(k * 5); i++) circle(ctx, c.x - 4 + (i % 3) * 4, c.y - 2 + Math.floor(i / 3) * 5, 1.3, '#fff');
        if (!c.def.mhcDown) { ctx.fillStyle = '#ffe08a'; ctx.fillRect(c.x + 5, c.y - 10, 2, 5); ctx.fillRect(c.x + 5, c.y - 10, 4.5, 2.5); }
      } else {
        circle(ctx, c.x, c.y + (tall ? 2 : 0), 2.6, 'rgba(90,40,70,0.6)');
        if (gate === 'resp' && (c.x * 7) % 5 < 1) ell(ctx, c.x, c.y - 2, 3.5, 4.5, 0, 'rgba(255,255,255,0.45)'); // 술잔세포
        const av = Math.min(1, sim.ifn * 0.55);
        if (av > 0.15) { ctx.strokeStyle = `rgba(120,190,255,${av * 0.8})`; ctx.lineWidth = 1.5; roundRect(ctx, c.x - w / 2, c.y - h / 2, w, h, 4); ctx.stroke(); }
      }
    }
  }

  // ───────── 혈구·면역세포 ─────────
  function drawHostRbc(ctx, r, t, far) {
    if (far) { ctx.fillStyle = r.inf ? '#ff8fb0' : '#c92a3a'; ctx.fillRect(r.x - 5, r.y - 4, 10, 8); return; }
    ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(Math.sin(r.rot * 0.7) * 0.4);
    ctx.fillStyle = '#c92a3a'; ctx.beginPath(); ctx.ellipse(0, 0, 7, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(90,0,15,0.35)'; ctx.beginPath(); ctx.ellipse(0, 0, 3.2, 2.2, 0, 0, TAU); ctx.fill();
    if (r.inf) { ctx.strokeStyle = '#ffb3c6'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(1, 0, 2.2, 0, TAU); ctx.stroke(); circle(ctx, 3, -1, 1, '#ffb3c6');
      if (r.inf.t > 1.2) for (let i = 0; i < 4; i++) circle(ctx, -3 + i * 2, 2, 0.9, '#ffd6e0'); }
    ctx.restore();
  }

  const CELL_FAR = { neut: '#e8e4f0', macro: '#f0c9a0', dc: '#ffd36e', nk: '#ff8fbf', ctl: '#ff6b6b' };
  function drawCell(ctx, c, t, sim, far) {
    const x = c.x, y = c.y;
    if (far) { circle(ctx, x, y, c.type === 'macro' && c.loc !== 'blood' ? 10 : 6.5, CELL_FAR[c.type]); if (c.type === 'macro' && c.gran) circle(ctx, x, y, 28, null, 'rgba(220,190,170,0.5)', 3); return; }
    switch (c.type) {
      case 'neut': {
        circle(ctx, x, y, 7, '#e8e4f0');
        for (let i = 0; i < 3; i++) { const a = i * 2.1 + c.ph; circle(ctx, x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 2, '#7a5aa8'); }
        break;
      }
      case 'macro': {
        if (c.loc === 'blood') { circle(ctx, x, y, 7, '#f0c9a0'); ctx.beginPath(); ctx.ellipse(x, y, 3.5, 2.4, 0.5, 0, TAU); ctx.fillStyle = '#8a5a3a'; ctx.fill(); break; }
        if (c.gran) circle(ctx, x, y, 30, 'rgba(161,128,114,0.12)', 'rgba(220,190,170,0.4)', 2);
        blob(ctx, x, y, 12, t, c.ph, c.act > 0 ? '#ffd9a0' : '#f0c9a0', 3, 0.18);
        ctx.beginPath(); ctx.ellipse(x + 2, y, 4.5, 3.2, 0.4, 0, TAU); ctx.fillStyle = '#8a5a3a'; ctx.fill();
        if (c.act > 0) circle(ctx, x, y, 14.5, null, 'rgba(255,210,80,0.7)', 1.5);
        if (c.intra > 0) for (let i = 0; i < Math.min(10, Math.ceil(c.intra)); i++) { const a = i * 0.7 + c.ph; ctx.save(); ctx.translate(x + Math.cos(a) * 6, y + Math.sin(a) * 6); ctx.rotate(a); ctx.fillStyle = '#7a5a48'; ctx.fillRect(-2.5, -0.8, 5, 1.6); ctx.restore(); }
        break;
      }
      case 'dc': {
        const col = '#ffd36e';
        ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + c.ph + Math.sin(t + i) * 0.15; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12); }
        ctx.stroke();
        circle(ctx, x, y, 5, col);
        if (c.cargo) circle(ctx, x, y, 2.6, IMM.agColor(c.cargo));
        if (c.loc === 'pres') {
          let n = 0;
          for (const th of sim.th) { if (th.st !== 'ok') continue; const d = Math.hypot(th.x - x, th.y - y); if (d < 55) { ctx.strokeStyle = 'rgba(255,211,110,0.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(th.x, th.y); ctx.stroke(); if (++n > 4) break; } }
          circle(ctx, x, y, 16 + Math.sin(t * 4) * 2, null, 'rgba(255,211,110,0.4)', 1);
        }
        break;
      }
      case 'nk': {
        circle(ctx, x, y, 7, '#ff8fbf');
        for (let i = 0; i < 4; i++) { const a = i * 1.6 + c.ph; circle(ctx, x + Math.cos(a) * 3.5, y + Math.sin(a) * 3.5, 1.2, '#7a0f3d'); }
        break;
      }
      case 'ctl': {
        circle(ctx, x, y, 6.5, '#ff6b6b', IMM.agColor(c.ag), 2);
        circle(ctx, x, y, 3.5, '#8a1c1c');
        break;
      }
    }
  }

  // ───────── 림프절 (움직이는 부분) ─────────
  function drawLN(ctx, sim, t, v, far) {
    const ln = IMM.LN;
    if (v.y1 < ln.bZone.y0 - 30 || v.x0 > ln.pZone.x1 + 20) return;
    const ags = Object.values(sim.ag).filter(r => !r.natural);
    const inV = (x, y) => x > v.x0 - 10 && x < v.x1 + 10 && y > v.y0 - 10 && y < v.y1 + 10;
    const okDots = sim.th.filter(d => d.st === 'ok');
    let idx = 0;
    const ring = new Map();
    for (const r of ags) {
      const n = Math.min(okDots.length - idx, Math.round(r.th / 40 * 14 * K));
      for (let i = 0; i < n; i++) ring.set(okDots[idx++], r.color);
    }
    for (const d of sim.th) {
      const x = d.x + Math.sin(t * 0.8 + d.ph) * 2, y = d.y + Math.cos(t * 0.7 + d.ph) * 2;
      if (!inV(x, y)) continue;
      if (d.st === 'dead') { ctx.strokeStyle = 'rgba(150,120,170,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3); ctx.moveTo(x + 3, y - 3); ctx.lineTo(x - 3, y + 3); ctx.stroke(); continue; }
      if (d.st === 'inf') {
        if (d.latent) { circle(ctx, x, y, 5.5, 'rgba(94,177,239,0.25)', '#8e4ec6', 1.5); }
        else { circle(ctx, x, y, 6, '#8e4ec6'); if (!far) circle(ctx, x, y, 8 + Math.sin(t * 5 + d.ph) * 1.5, null, 'rgba(192,132,252,0.6)', 1); }
        continue;
      }
      circle(ctx, x, y, 5.5, '#5eb1ef');
      if (!far) circle(ctx, x, y, 2.4, '#1d4f7a');
      const rc = ring.get(d);
      if (rc) circle(ctx, x, y, 8 + Math.sin(t * 3 + d.ph), null, rc, 2);
    }
    let cIdx = 0; const cRing = [];
    for (const r of ags) { if (!r.intra) continue; const n = Math.min(CD8.length - cIdx, Math.round(r.ctl / 50 * 10 * K)); for (let i = 0; i < n; i++) cRing[cIdx++] = r.color; }
    CD8.forEach((d, i) => {
      const x = d.x + Math.sin(t * 0.9 + d.ph) * 2, y = d.y + Math.cos(t * 0.6 + d.ph) * 2;
      if (!inV(x, y)) return;
      circle(ctx, x, y, 4.5, '#ff8a8a'); if (!far) circle(ctx, x, y, 2, '#7a1c1c');
      if (cRing[i]) circle(ctx, x, y, 7, null, cRing[i], 2);
    });
    let bIdx = 0; const bRing = [];
    for (const r of ags) { const n = Math.min(BCELL.length - bIdx, Math.round(((r.pm + r.pg) / 30 * 10 + (r.active && r.th > 2 ? 2 : 0)) * K)); for (let i = 0; i < n; i++) bRing[bIdx++] = r.color; }
    BCELL.forEach((d, i) => {
      const pulse = bRing[i] ? 1 + Math.sin(t * 6 + d.ph) * 0.15 : 1;
      const x = d.x + Math.sin(t * 0.7 + d.ph) * 2, y = d.y + Math.cos(t * 0.5 + d.ph) * 2;
      if (!inV(x, y)) return;
      circle(ctx, x, y, 5 * pulse, '#46c8aa');
      if (!far) { circle(ctx, x, y, 2.2, '#0f5546'); ab(ctx, x + 5, y - 5, 2, 0.6, '#b6f2e3'); }
      if (bRing[i]) circle(ctx, x, y, 7.5, null, bRing[i], 2);
    });
    const pz = ln.pZone;
    let plasmaList = [];
    for (const r of ags) { const n = Math.round((r.pm + r.pg) / 5 * 2.5); for (let i = 0; i < n; i++) plasmaList.push(r.color); }
    const cols = Math.floor((pz.x1 - pz.x0 - 20) / 30);
    plasmaList = plasmaList.slice(0, cols * 6);
    plasmaList.forEach((col, i) => {
      const x = pz.x0 + 22 + (i % cols) * 30, y = pz.y0 + 22 + Math.floor(i / cols) * 28;
      if (!inV(x, y)) return;
      ctx.beginPath(); ctx.ellipse(x, y, 10, 7.5, 0, 0, TAU); ctx.fillStyle = '#7fb8e6'; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      if (!far) { circle(ctx, x + 4, y, 3, '#20456a'); ctx.strokeStyle = 'rgba(32,69,106,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(x - 1, y, 5, 1.8, 4.5); ctx.stroke(); }
    });
    let mi = 0;
    const mcols = Math.floor((pz.x1 - pz.x0 - 20) / 20);
    for (const r of ags) {
      const n = Math.min(10, Math.ceil(r.memB / 3)) + Math.min(5, Math.ceil(r.memT / 3));
      for (let i = 0; i < n && mi < mcols * 4; i++, mi++) {
        const x = pz.x0 + 16 + (mi % mcols) * 20, y = pz.y1 - 12 - Math.floor(mi / mcols) * 18;
        if (inV(x, y)) star(ctx, x, y, 6, 2.6, r.color);
      }
    }
  }

  // ───────── 라벨 (화면 좌표로 그려 확대와 상관없이 읽기 쉽게) ─────────
  // 글자는 한 번만 그려 두고 이미지로 재사용 (한글 글꼴 처리가 매 프레임 반복되면 느림)
  const LCACHE = new Map();
  let LDPR = 1;
  function labelImg(txt, opt) {
    const key = txt + '|' + (opt.size || 12) + (opt.bold ? 'b' : '') + '|' + (opt.col || '') + '|' + (opt.bg || '') + '|' + LDPR;
    let im = LCACHE.get(key);
    if (im) return im;
    const font = (opt.bold ? '600 ' : '') + (opt.size || 12) + 'px "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    const m = mkCanvas(1, 1).getContext('2d'); m.font = font;
    const tw = Math.ceil(m.measureText(txt).width), h = (opt.size || 12) + 7, w = tw + 10;
    const c = mkCanvas(Math.ceil(w * LDPR), Math.ceil(h * LDPR)), g = c.getContext('2d');
    g.scale(LDPR, LDPR);
    if (opt.bg) { g.fillStyle = opt.bg; roundRect(g, 0, 0, w, h, 6); g.fill(); }
    g.font = font; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillStyle = opt.col || 'rgba(230,236,255,0.85)'; g.fillText(txt, 5, h / 2 + 0.5);
    im = { c, w, h };
    if (LCACHE.size > 400) LCACHE.clear();
    LCACHE.set(key, im);
    return im;
  }
  function label(ctx, txt, x, y, opt) {
    opt = opt || {};
    const im = labelImg(txt, opt);
    const bx = opt.align === 'center' ? x - im.w / 2 : x - 5;
    ctx.drawImage(im.c, Math.round(bx), Math.round(y - im.h / 2), im.w, im.h);
  }
  // 웹 글꼴이 늦게 도착하면 다시 그리기
  if (typeof document !== 'undefined' && document.fonts) document.fonts.ready.then(() => LCACHE.clear());
  // [글, x, y, 보이는 최소 배율, 스타일]
  const ORGAN_LABELS = [
    ['털집 · 피지샘', 170, TY(0.66) + 36, 0.45], ['털집', 560, TY(0.66) + 36, 0.45], ['땀샘', 380, TY(0.66) + 40, 0.45],
    ['피하 지방', 640, TY(0.9), 0.45], ['감각 신경절', IMM.GANGLION.x, IMM.GANGLION.y + 36, 0.35],
    ['피떡: 섬유소 그물 · 혈소판', 970, Z.tisTop + 128, 0.45],
    ['점막하샘', 1560, TY(0.3) + 36, 0.5], ['평활근', 1540, TY(0.5) + 20, 0.5], ['기관지 연골', 1540, TY(0.84), 0.45],
    ['샘창자 움', 2210, TY(0.34), 0.5], ['파이어판 (장 림프 조직)', 2210, TY(0.55) - 70, 0.45], ['근육층', 2210, TY(0.9), 0.5],
    ['골격근 (근육 주사 자리)', 2760, TY(0.08), 0.45], ['뼈 속 골수 — 혈구가 만들어지는 곳', IMM.MARROW.x, IMM.MARROW.y - IMM.MARROW.ry - 44, 0.3],
    ['모세혈관', 140, Z.bloodTop - 30, 0.6], ['림프관 → 림프절', IMM.LYMPH_X[1] + 14, TY(0.62), 0.45, 'left'],
    ['간 — 말라리아 간 단계 · 쿠퍼세포', IMM.LIVER.x, IMM.LIVER.y - IMM.LIVER.r - 26, 0.25],
    ['비장 — 혈액을 거르고 늙은 적혈구·항체 붙은 세포 제거', IMM.SPLEEN.x, IMM.SPLEEN.y - IMM.SPLEEN.ry - 16, 0.25],
  ];
  function drawLabels(ctx, sim, v) {
    const k = v.k;
    const sx = (x) => (x - v.x0) * k, sy = (y) => (y - v.y0) * k;
    const vw = (v.x1 - v.x0) * k;
    // 침입 경로 이름
    for (const g of IMM.GATES) {
      const cx = Math.max(sx(g.x0) + 60, Math.min(sx(g.x1) - 60, vw / 2));
      if (sx(g.x1) < 0 || sx(g.x0) > vw) continue;
      const y = sy(Z.barTop - 44);
      if (y < -30) continue;
      label(ctx, g.name, cx, Math.max(12, y), { align: 'center', bold: true, size: 13, col: '#e9efff', bg: 'rgba(10,14,25,0.55)' });
      if (k > 0.45) label(ctx, g.sub, cx, Math.max(32, y + 20), { align: 'center', size: 10.5, col: 'rgba(210,220,245,0.8)' });
    }
    // 구역 이름 — 화면 왼쪽에 붙어 따라다님
    const sticky = (txt, yw, opt) => { const y = sy(yw); if (y > 0 && y < (v.y1 - v.y0) * k) label(ctx, txt, 10, y, Object.assign({ size: 11.5, bg: 'rgba(0,0,0,0.45)' }, opt)); };
    sticky('1차 방어: 물리·화학적 장벽', Z.barTop + 10, { size: 10.5, col: 'rgba(255,230,200,0.85)' });
    sticky('조직 — 선천 면역 (식세포 · NK세포 · 비만세포 · 보체 · 인터페론)', EPI_BOT + 18);
    sticky('혈관 — 혈류 (온몸을 도는 혈구)', Z.bloodTop + 14);
    sticky('깊은 기관 — 림프절 · 비장 · 간: 특이적(적응) 면역', (Z.bloodBot + Z.lnTop) / 2 + 2, { bold: true, size: 12 });
    // 림프절 영역
    const ln = IMM.LN;
    if (k > 0.3) {
      const zl = (z, txt, col) => { const x = Math.max(sx(z.x0) + 6, 8), y = sy(z.y0) - 10; if (sx(z.x1) > 0 && x < vw && y > 0) label(ctx, txt, x, y, { size: 10.5, col, bg: 'rgba(10,14,25,0.5)' }); };
      zl(ln.bZone, '피질: B세포 여포 (배중심)', 'rgba(150,235,210,0.95)');
      zl(ln.tZone, '부피질: T세포 영역 — 보조 T(파랑) · 세포독성 T(빨강)', 'rgba(160,210,255,0.95)');
      zl(ln.pZone, '수질: 형질세포 → 항체 · ★ 기억세포', 'rgba(255,220,160,0.95)');
      const L = IMM.LNODE; const lx = sx(L.x - L.rx * 0.97), ly = sy(L.y);
      if (ly > 0 && lx > -40 && lx < vw) label(ctx, '림프절', lx + 4, ly, { bold: true, size: 12, col: 'rgba(200,215,245,0.95)', bg: 'rgba(10,14,25,0.5)' });
    }
    for (const [txt, x, y, mk, al] of ORGAN_LABELS) {
      if (k < mk) continue;
      const X = sx(x), Y = sy(y); if (X < -200 || X > vw + 200 || Y < 0 || Y > (v.y1 - v.y0) * k) continue;
      label(ctx, txt, X, Y, { align: al || 'center', size: 10.5, col: 'rgba(240,230,220,0.9)', bg: 'rgba(10,14,25,0.45)' });
    }
  }

  // ───────── 메인 ─────────
  // opts.view = { x0, y0, x1, y1 (보이는 세계 영역), k (CSS px / 세계), dpr }
  IMM.draw = function (ctx, sim, t, opts) {
    opts = opts || {};
    const v = opts.view || { x0: 0, y0: 0, x1: W, y1: H, k: 1, dpr: 1 };
    const far = v.k < 0.42;
    const IN = (x, y, m) => x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m;
    ctx.setTransform(v.k * v.dpr, 0, 0, v.k * v.dpr, -v.x0 * v.k * v.dpr, -v.y0 * v.k * v.dpr);
    ctx.fillStyle = '#0a0e18'; ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
    const pending = drawBg(ctx, v);

    // 염증: 조직이 붉어지고 혈관이 넓어짐
    const inf = sim.inflam;
    if (inf > 0.02) {
      ctx.fillStyle = `rgba(255,70,80,${Math.min(0.22, inf * 0.22)})`;
      const a = Math.max(v.y0, Z.tisTop), b = Math.min(v.y1, Z.bloodTop);
      if (b > a) ctx.fillRect(v.x0, a, v.x1 - v.x0, b - a);
      ctx.fillStyle = `rgba(255,90,100,${inf * 0.5})`; ctx.fillRect(v.x0, Z.bloodTop - 3 - inf * 6, v.x1 - v.x0, inf * 6);
    }
    // 섬모 운동
    const rg = IMM.GATES[2];
    if (!far && v.x1 > rg.x0 && v.x0 < rg.x1 && v.y0 < Z.tisTop) {
      ctx.strokeStyle = 'rgba(255,230,235,0.75)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = Math.max(rg.x0 + 3, Math.floor(v.x0 / 5) * 5 + 3); x < Math.min(rg.x1, v.x1 + 5); x += 5) { const sw = Math.sin(t * 8 + x * 0.25) * 3; ctx.moveTo(x, Z.tisTop + 4); ctx.lineTo(x + sw, Z.barTop + 34); }
      ctx.stroke();
    }
    // 위산 거품
    const gg = IMM.GATES[3];
    if (!far && v.x1 > gg.x0 && v.x0 < gg.x1 && v.y0 < Z.tisTop) for (let i = 0; i < 26; i++) { const bx = gg.x0 + 12 + i * 23, by = Z.barTop + 22 - ((t * 12 + i * 7) % 20); circle(ctx, bx, by, 2, null, 'rgba(240,255,150,0.8)', 1); }
    // 혈류
    if (v.y1 > Z.bloodTop && v.y0 < Z.bloodBot) {
      ctx.beginPath();
      for (const r of DECO_RBC) {
        const x = (r.x + t * 66 * r.f) % (W + 20) - 10; if (x < v.x0 - 10 || x > v.x1 + 10) continue;
        ctx.moveTo(x + 6.4, r.y); ctx.ellipse(x, r.y, 6.4, 4.4, 0, 0, TAU);
      }
      ctx.fillStyle = 'rgba(165,30,48,0.92)'; ctx.fill();
      if (!far) {
        ctx.beginPath();
        for (const r of DECO_RBC) { const x = (r.x + t * 66 * r.f) % (W + 20) - 10; if (x < v.x0 - 10 || x > v.x1 + 10) continue; ctx.moveTo(x + 2.8, r.y); ctx.ellipse(x, r.y, 2.8, 1.8, 0, 0, TAU); }
        ctx.fillStyle = 'rgba(90,0,15,0.35)'; ctx.fill();
        ctx.beginPath();
        for (const p of PLATE) { const x = (p.x + t * 66 * p.f) % (W + 20) - 10; if (x > v.x0 - 5 && x < v.x1 + 5) { ctx.moveTo(x + 2.2, p.y); ctx.ellipse(x, p.y, 2.2, 1.4, 0, 0, TAU); } }
        ctx.fillStyle = 'rgba(210,180,255,0.8)'; ctx.fill();
      }
    }
    // 잠복 헤르페스
    const Gg = IMM.GANGLION;
    if (sim.latentHerpes > 0) for (let i = 0; i < sim.latentHerpes; i++) circle(ctx, Gg.x - 8 + i * 8, Gg.y, 3, '#f76b15');
    // 문지르는 효과: 침입 경로 강조
    if (opts.hoverGate) {
      const g = IMM.GATES.find(q => q.id === opts.hoverGate);
      if (g) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(g.x0, 0, g.x1 - g.x0, Z.tisTop); ctx.strokeStyle = '#ffd36e'; ctx.lineWidth = 3 / v.k; ctx.strokeRect(g.x0 + 2, 2, g.x1 - g.x0 - 4, Z.tisTop - 4); }
    }

    drawEpi(ctx, sim, t, v, far);
    for (const m of sim.mast) {
      if (!IN(m.x, m.y, 30)) continue;
      if (far) { circle(ctx, m.x, m.y, 8, m.fire > 0 ? '#ff9fd0' : '#9a6ad0'); continue; }
      blob(ctx, m.x, m.y, 9, t * 0.5, m.x, '#9a6ad0', 3, 0.1);
      for (let i = 0; i < 6; i++) { const a = i + m.x; const rr = m.fire > 0 ? 9 + (1.2 - m.fire) * 14 : 4; circle(ctx, m.x + Math.cos(a) * rr, m.y + Math.sin(a) * rr, 1.5, m.fire > 0 ? 'rgba(255,160,200,0.9)' : '#5a2a8a'); }
    }
    for (const d of sim.debris) {
      if (!IN(d.x, d.y, 6)) continue;
      if (d.kind === 'pus') circle(ctx, d.x, d.y, 4, 'rgba(230,210,120,0.55)');
      else { ctx.fillStyle = d.kind === 'cell' ? 'rgba(150,110,110,0.6)' : 'rgba(180,170,150,0.5)'; ctx.fillRect(d.x - 2, d.y - 1.5, 4, 3); }
    }
    // 화면에 보이는 세포·병원체가 아주 많으면 단순한 모양으로 한꺼번에 그림
    let nv = 0;
    for (const p of sim.paths) if (IN(p.x, p.y, 16)) nv++;
    for (const c of sim.cells) if (IN(c.x, c.y, 16)) nv++;
    const mid = far || opts.lowQ || nv > 700 || v.k < 0.6 && nv > 350;
    if (mid) { for (const r of sim.rbcs) if (!r.dead && IN(r.x, r.y, 10)) bc(r.inf ? '#ff8fb0' : '#c92a3a', r.x, r.y, 5.5); flush(ctx); }
    else for (const r of sim.rbcs) if (!r.dead && IN(r.x, r.y, 10)) drawHostRbc(ctx, r, t, false);
    drawLN(ctx, sim, t, v, far || mid);
    if (mid) {
      for (const c of sim.cells) if ((c.type === 'macro' || c.type === 'dc') && IN(c.x, c.y, 34)) midCell(c);
      flush(ctx);
      for (const p of sim.paths) if (IN(p.x, p.y, 16)) { if (p.st === 'blocked' || p.st === 'liver') drawPathogen(ctx, p, t, sim, false); else midPathogen(p, sim); }
      flush(ctx);
      for (const c of sim.cells) if (c.type !== 'macro' && c.type !== 'dc' && IN(c.x, c.y, 10)) midCell(c);
      flush(ctx);
    } else {
      for (const c of sim.cells) if ((c.type === 'macro' || c.type === 'dc') && IN(c.x, c.y, 34)) drawCell(ctx, c, t, sim, far);
      for (const p of sim.paths) if (IN(p.x, p.y, 16)) drawPathogen(ctx, p, t, sim, far);
      for (const c of sim.cells) if (c.type !== 'macro' && c.type !== 'dc' && IN(c.x, c.y, 10)) drawCell(ctx, c, t, sim, far);
    }
    for (const a of sim.abp) { if (!IN(a.x, a.y, 6)) continue; ctx.globalAlpha = Math.max(0, 1 - a.t / a.life); ab(ctx, a.x, a.y, 3.4, a.rot + a.t, a.col); }
    ctx.globalAlpha = 1;
    for (const s of sim.sparks) { if (!IN(s.x, s.y, 4)) continue; ctx.globalAlpha = 1 - s.t / 0.6; circle(ctx, s.x, s.y, 1.6, s.col); }
    ctx.globalAlpha = 1;
    if (opts.dropPreview) {
      const p = opts.dropPreview;
      circle(ctx, p.x, p.y, 26 / Math.min(1, v.k), 'rgba(255,211,110,0.12)', '#ffd36e', 1.5 / v.k);
    }

    // ── 화면 좌표 ──
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    LDPR = v.dpr;
    if (opts.labels !== false) drawLabels(ctx, sim, v);
    for (const f of sim.fx) {
      if (!IN(f.x, f.y, 40)) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, 2 - f.t));
      label(ctx, f.txt, (f.x - v.x0) * v.k, (f.y - v.y0) * v.k - 6, { align: 'center', size: 11, bold: true, col: f.col, bg: 'rgba(10,14,25,0.7)' });
    }
    ctx.globalAlpha = 1;
    if (opts.dropPreview) {
      const p = opts.dropPreview;
      label(ctx, p.text, (p.x - v.x0) * v.k, (p.y - v.y0) * v.k - 40, { align: 'center', size: 12, bold: true, col: '#ffd36e', bg: 'rgba(10,14,25,0.85)' });
    }
    return pending;
  };

  // ───────── 미니맵 ─────────
  IMM.drawMini = function (ctx, w, h, sim, v) {
    const ov = getOverview();
    const s = Math.min(w / W, h / H);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(ov, 0, 0, W * s, H * s);
    // 병원체 분포
    ctx.fillStyle = '#ff5d6c';
    let n = 0;
    for (const p of sim.paths) { if (p.st === 'blocked' || p.dead) continue; if (++n % 2) ctx.fillRect(p.x * s - 1, p.y * s - 1, 2, 2); }
    ctx.fillStyle = '#ffffff';
    for (const c of sim.cells) if (c.type === 'ctl' || c.loc === 'mig') ctx.fillRect(c.x * s - 0.5, c.y * s - 0.5, 1.5, 1.5);
    if (v) { ctx.strokeStyle = '#ffd36e'; ctx.lineWidth = 1.5; ctx.strokeRect(Math.max(0.75, v.x0 * s), Math.max(0.75, v.y0 * s), Math.min(W, v.x1 - Math.max(0, v.x0)) * s - 1.5, Math.min(H, v.y1 - Math.max(0, v.y0)) * s - 1.5); }
  };

  // 지도 바로가기 구역
  IMM.REGIONS = [
    { id: 'skin', name: '피부', x0: 0, y0: 0, x1: 760, y1: Z.bloodTop + 40 },
    { id: 'wound', name: '상처', x0: 640, y0: 0, x1: 1300, y1: Z.bloodTop - 120 },
    { id: 'resp', name: '기관지', x0: 1150, y0: 0, x1: 1930, y1: Z.bloodTop + 40 },
    { id: 'gut', name: '위·장', x0: 1880, y0: 0, x1: 2540, y1: Z.bloodTop + 40 },
    { id: 'marrow', name: '근육·골수', x0: 2500, y0: 0, x1: W, y1: Z.bloodBot },
    { id: 'blood', name: '혈관', x0: 0, y0: Z.bloodTop - 120, x1: 1400, y1: Z.bloodBot + 60 },
    { id: 'ln', name: '림프절', x0: 40, y0: Z.lnTop - 10, x1: 1990, y1: H },
    { id: 'spleen', name: '비장·간', x0: 2020, y0: Z.lnTop - 10, x1: W, y1: H },
    { id: 'all', name: '몸 전체', x0: 0, y0: 0, x1: W, y1: H },
  ];

  // ───────── 아이콘 ─────────
  IMM.drawIcon = function (ctx, def, size) {
    ctx.clearRect(0, 0, size, size);
    ctx.save(); ctx.translate(size / 2, size / 2); ctx.scale(size / 24, size / 24);
    const p = { def, ags: def.ags || [def.ag], x: 0, y: 0, vx: 1, vy: 0, st: def.beh === 'malaria' ? 'spz' : 'free', ph: 0.4, hp: 6, coat: false };
    if (def.beh === 'malaria') { drawHostRbc(ctx, { x: 0, y: 0, rot: 0, inf: { t: 1.5 } }, 0); }
    else if (def.beh === 'amoeba') { ctx.scale(0.8, 0.8); drawPathogen(ctx, p, 0); }
    else { ctx.scale(def.cat === 'virus' ? 1.6 : 1.3, def.cat === 'virus' ? 1.6 : 1.3); drawPathogen(ctx, p, 0); }
    ctx.restore();
  };
  IMM.drawCellIcon = function (ctx, type, size, sim) {
    ctx.clearRect(0, 0, size, size);
    ctx.save(); ctx.translate(size / 2, size / 2); ctx.scale(size / 30, size / 30);
    const c = { type, x: 0, y: 0, ph: 0.3, loc: 'tis', act: 0, intra: 0, ag: 'flu:1', cargo: null };
    if (type === 'rbc') drawHostRbc(ctx, { x: 0, y: 0, rot: 0, inf: null }, 0);
    else if (type === 'th') { circle(ctx, 0, 0, 5.5, '#5eb1ef'); circle(ctx, 0, 0, 2.4, '#1d4f7a'); }
    else if (type === 'cd8') { circle(ctx, 0, 0, 5, '#ff8a8a'); circle(ctx, 0, 0, 2, '#7a1c1c'); }
    else if (type === 'b') { circle(ctx, 0, 0, 5, '#46c8aa'); circle(ctx, 0, 0, 2.2, '#0f5546'); ab(ctx, 5, -5, 2, 0.6, '#b6f2e3'); }
    else if (type === 'plasma') { ctx.beginPath(); ctx.ellipse(0, 0, 10, 7.5, 0, 0, TAU); ctx.fillStyle = '#7fb8e6'; ctx.fill(); circle(ctx, 4, 0, 3, '#20456a'); }
    else if (type === 'mem') star(ctx, 0, 0, 7, 3, '#ffd36e');
    else if (type === 'ab') ab(ctx, 0, 2, 6, 0, '#9ad0ff');
    else if (type === 'mast') { blob(ctx, 0, 0, 9, 0, 0, '#9a6ad0', 3, 0.1); for (let i = 0; i < 6; i++) circle(ctx, Math.cos(i) * 4, Math.sin(i) * 4, 1.5, '#5a2a8a'); }
    else if (type === 'epi') { ctx.fillStyle = '#d999a3'; roundRect(ctx, -9, -9, 18, 18, 5); ctx.fill(); circle(ctx, 0, 0, 3, 'rgba(90,40,50,0.55)'); }
    else if (type === 'plt') { ell(ctx, 0, 0, 5, 3, 0, 'rgba(210,180,255,0.9)'); }
    else { if (type === 'macro') ctx.scale(0.85, 0.85); drawCell(ctx, c, 0, { th: [] }); }
    ctx.restore();
  };
})(typeof window !== 'undefined' ? window : globalThis);
