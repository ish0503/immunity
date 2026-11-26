// 면역 시뮬레이터 — 캔버스 그리기
(function (G) {
  const IMM = G.IMM;
  const { W, H, Z } = IMM;
  const TAU = Math.PI * 2;

  // 고정 위치 (림프절의 CD8·B세포 장식용)
  function lcg(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
  const R = lcg(7);
  const CD8 = [], BCELL = [];
  { const t = IMM.LN.tZone; for (let i = 0; i < 26; i++) CD8.push({ x: t.x0 + 16 + R() * (t.x1 - t.x0 - 32), y: t.y0 + 16 + R() * (t.y1 - t.y0 - 32), ph: R() * 6 }); }
  { const b = IMM.LN.bZone; const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    for (let i = 0; i < 40; i++) { const a = R() * TAU, r = Math.sqrt(R()); BCELL.push({ x: cx + Math.cos(a) * r * 150, y: cy + Math.sin(a) * r * 70, ph: R() * 6 }); } }
  const TISSUE_DOTS = []; for (let i = 0; i < 140; i++) TISSUE_DOTS.push({ x: R() * W, y: Z.tisTop + 90 + R() * (Z.bloodTop - Z.tisTop - 100), r: 1 + R() * 2.5 });

  function circle(ctx, x, y, r, fill, stroke, lw) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
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
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, s * 0.35); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(0, 0); ctx.lineTo(-s * 0.75, -s * 0.8); ctx.moveTo(0, 0); ctx.lineTo(s * 0.75, -s * 0.8); ctx.stroke();
    ctx.restore();
  }
  function coatMarks(ctx, x, y, r, t, col) {
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + t * 0.5; ab(ctx, x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3), 2.6, a + Math.PI / 2, col || '#9ad0ff'); }
  }

  // ───────── 병원체 모양 ─────────
  function drawPathogen(ctx, p, t, sim) {
    const d = p.def, x = p.x, y = p.y;
    if (p.st === 'blocked') return drawBlocked(ctx, p, t);
    if (p.st === 'liver') { circle(ctx, x, y, 3 + Math.sin(t * 3 + p.ph) * 0.8, '#ff9db0'); return; }
    const col = d.color || '#ccc';
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
    const d = p.def;
    let x = p.x, y = Math.min(Z.barTop - 2, p.y + k * 35);
    if (p.mode === 'skin') { y = Math.min(Z.barTop - 3, p.y + k * 40); if (y >= Z.barTop - 3) y = Z.barTop - 3 - Math.abs(Math.sin(k * 6)) * 8; }
    if (p.mode === 'resp') { y = Math.max(4, Z.barTop + 10 - k * 30); x = p.x + Math.sin(k * 5 + p.ph) * 4; }
    if (p.mode === 'gut') { y = Math.min(Z.barTop + 18, p.y + k * 40); }
    const q = { ...p, x, y, st: 'free' };
    drawPathogen(ctx, q, t);
    if (p.mode === 'gut' && y > Z.barTop) circle(ctx, x, y, 4 + k * 3, null, 'rgba(220,240,100,0.7)', 1);
    if (p.mode === 'resp' && y < Z.barTop + 10) circle(ctx, x, y, 6, 'rgba(160,220,210,0.25)');
    ctx.globalAlpha = 1;
  }

  // ───────── 배경 ─────────
  function drawBackground(ctx, sim, t, opts) {
    // 바깥
    let g = ctx.createLinearGradient(0, 0, 0, Z.barTop);
    g.addColorStop(0, '#16233a'); g.addColorStop(1, '#1d2e4a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, Z.barTop);
    // 조직
    const inf = sim.inflam;
    g = ctx.createLinearGradient(0, Z.tisTop, 0, Z.bloodTop);
    g.addColorStop(0, `rgb(${52 + inf * 40},${30 - inf * 6},${38 - inf * 6})`);
    g.addColorStop(1, `rgb(${40 + inf * 30},${22},${30})`);
    ctx.fillStyle = g; ctx.fillRect(0, Z.tisTop, W, Z.bloodTop - Z.tisTop);
    ctx.fillStyle = 'rgba(255,200,200,0.05)';
    for (const d of TISSUE_DOTS) { ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill(); }
    // 결합 조직 섬유
    ctx.strokeStyle = 'rgba(255,220,220,0.05)'; ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) { ctx.beginPath(); const y0 = 220 + i * 18; ctx.moveTo(0, y0); for (let x = 0; x <= W; x += 60) ctx.lineTo(x, y0 + Math.sin(x * 0.01 + i) * 8); ctx.stroke(); }

    // 간
    const L = IMM.LIVER;
    blob(ctx, L.x, L.y, L.r, t * 0.2, 1, 'rgba(120,40,40,0.55)', 3, 0.08);
    // 신경절
    const Gg = IMM.GANGLION;
    ctx.strokeStyle = 'rgba(255,214,120,0.35)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(Gg.x, Gg.y); ctx.bezierCurveTo(Gg.x + 30, Gg.y - 80, Gg.x + 50, 220, 110, 180); ctx.stroke();
    circle(ctx, Gg.x, Gg.y, 16, 'rgba(255,214,120,0.22)', 'rgba(255,214,120,0.5)', 1.5);
    if (sim.latentHerpes > 0) for (let i = 0; i < sim.latentHerpes; i++) circle(ctx, Gg.x - 6 + i * 6, Gg.y, 2.4, '#f76b15');

    // 혈관
    const dil = 1 + inf * 4;
    g = ctx.createLinearGradient(0, Z.bloodTop, 0, Z.bloodBot);
    g.addColorStop(0, '#5a0f1b'); g.addColorStop(0.5, '#3a0a12'); g.addColorStop(1, '#5a0f1b');
    ctx.fillStyle = g; ctx.fillRect(0, Z.bloodTop, W, Z.bloodBot - Z.bloodTop);
    ctx.fillStyle = `rgba(${170 + inf * 80},40,60,${0.7})`;
    ctx.fillRect(0, Z.bloodTop - dil / 2, W, 3 + dil * 0.5); ctx.fillRect(0, Z.bloodBot - 2, W, 3 + dil * 0.5);
    if (inf > 0.15) { ctx.fillStyle = `rgba(255,80,80,${inf * 0.12})`; ctx.fillRect(0, Z.bloodTop - 14, W, 14); }
    ctx.strokeStyle = 'rgba(255,150,160,0.07)'; ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) { const x = ((t * 70 + i * 113) % (W + 80)) - 40; const y = Z.bloodTop + 15 + (i * 37) % 90; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 40, y); ctx.stroke(); }

    // 림프관 연결
    ctx.fillStyle = '#0c1220'; ctx.fillRect(0, Z.bloodBot + 1, W, Z.lnTop - Z.bloodBot);
    // 림프절
    g = ctx.createLinearGradient(0, Z.lnTop, 0, Z.bot);
    g.addColorStop(0, '#12203a'); g.addColorStop(1, '#0e1830');
    ctx.fillStyle = g; ctx.fillRect(0, Z.lnTop, W, Z.bot - Z.lnTop);
    const zones = [IMM.LN.tZone, IMM.LN.bZone, IMM.LN.pZone];
    const zc = ['rgba(94,177,239,0.07)', 'rgba(70,200,170,0.08)', 'rgba(255,200,120,0.07)'];
    zones.forEach((z, i) => {
      ctx.fillStyle = zc[i]; roundRect(ctx, z.x0, z.y0 - 18, z.x1 - z.x0, z.y1 - z.y0 + 18, 14); ctx.fill();
    });
    // B 여포
    const b = IMM.LN.bZone; ctx.beginPath(); ctx.ellipse((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2 + 4, 160, 76, 0, 0, TAU); ctx.strokeStyle = 'rgba(70,200,170,0.25)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);

    // 1차 방어벽
    for (const gt of IMM.GATES) drawGate(ctx, gt, sim, t, opts.hoverGate === gt.id);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  function drawGate(ctx, gt, sim, t, hover) {
    const x0 = gt.x0, x1 = gt.x1, y0 = Z.barTop, y1 = Z.tisTop;
    if (gt.id === 'skin') {
      for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? '#b78963' : '#c99c74'; ctx.fillRect(x0, y0 + i * 6, x1 - x0, 6); }
      ctx.fillStyle = '#8a5f42'; ctx.fillRect(x0, y1 - 8, x1 - x0, 8);
      ctx.fillStyle = 'rgba(255,240,180,0.5)'; for (let x = x0 + 20; x < x1; x += 55) { circle(ctx, x, y0 + 3, 2.2, 'rgba(255,240,180,0.6)'); }
    } else if (gt.id === 'wound') {
      for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? '#b78963' : '#c99c74'; ctx.fillRect(x0, y0 + i * 6, 40, 6); ctx.fillRect(x1 - 40, y0 + i * 6, 40, 6); }
      ctx.fillStyle = '#7a1520'; ctx.beginPath(); ctx.moveTo(x0 + 40, y0); ctx.lineTo(x1 - 40, y0); ctx.lineTo(x1 - 60, y1); ctx.lineTo(x0 + 60, y1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,120,120,0.5)'; for (let i = 0; i < 6; i++) circle(ctx, x0 + 60 + i * 9, y0 + 18 + (i % 2) * 8, 2, 'rgba(255,200,200,0.6)');
    } else if (gt.id === 'resp') {
      ctx.fillStyle = '#d58a96'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.fillStyle = 'rgba(170,230,215,0.55)'; ctx.fillRect(x0, y0, x1 - x0, 12);
      ctx.strokeStyle = 'rgba(255,230,235,0.8)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = x0 + 3; x < x1; x += 5) { const sw = Math.sin(t * 8 + x * 0.25) * 3; ctx.moveTo(x, y0 + 22); ctx.lineTo(x + sw, y0 + 12); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; for (let x = x0 + 30; x < x1; x += 70) { ctx.beginPath(); ctx.ellipse(x, y0 + 28, 5, 7, 0, 0, TAU); ctx.fill(); }
    } else if (gt.id === 'gut') {
      ctx.fillStyle = '#a25b6d'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.fillStyle = 'rgba(214,227,90,0.45)'; ctx.fillRect(x0, y0, x1 - x0, 16);
      for (let i = 0; i < 9; i++) { const bx = x0 + 15 + i * 25, by = y0 + 13 - ((t * 12 + i * 7) % 12); circle(ctx, bx, by, 1.8, null, 'rgba(240,255,150,0.8)', 1); }
      ctx.fillStyle = '#c47284'; for (let x = x0 + 6; x < x1; x += 16) { roundRect(ctx, x, y0 + 18, 10, 18, 4); ctx.fill(); }
    } else if (gt.id === 'blood') {
      ctx.fillStyle = '#2a3550'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      // 주사기 + 모기
      ctx.fillStyle = 'rgba(200,220,255,0.35)'; ctx.fillRect(x0 + 22, y0 + 2, 16, 20);
      ctx.strokeStyle = '#cfd8e8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0 + 30, y0 + 22); ctx.lineTo(x0 + 30, y1 + 6); ctx.moveTo(x0 + 30, y0 - 2); ctx.lineTo(x0 + 30, y0 + 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(200,220,255,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(x0 + 30, y1 + 6); ctx.lineTo(x0 + 30, Z.bloodTop); ctx.moveTo(x0 + 172, y0 + 26); ctx.lineTo(x0 + 172, Z.bloodTop); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#9aa7c0'; ctx.beginPath(); ctx.ellipse(x0 + 172, y0 + 14, 6, 3, 0.3, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#9aa7c0'; ctx.beginPath(); ctx.moveTo(x0 + 168, y0 + 16); ctx.lineTo(x0 + 172, y0 + 26); ctx.stroke();
      ctx.fillStyle = 'rgba(200,220,255,0.3)'; ctx.beginPath(); ctx.ellipse(x0 + 166, y0 + 8, 7, 3, -0.6 + Math.sin(t * 40) * 0.3, 0, TAU); ctx.ellipse(x0 + 178, y0 + 8, 7, 3, 0.6 - Math.sin(t * 40) * 0.3, 0, TAU); ctx.fill();
    }
    if (hover) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x0, 0, x1 - x0, y1);
      ctx.strokeStyle = '#ffd36e'; ctx.lineWidth = 2; ctx.strokeRect(x0 + 1, 1, x1 - x0 - 2, y1 - 2);
    }
    // 경계선
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x1 - 1, 0, 2, y1);
  }

  // ───────── 상피세포 ─────────
  function drawEpi(ctx, sim, t) {
    const E = IMM.EPI;
    for (const c of sim.epi) {
      const gate = c.x < 300 ? 'skin' : c.x < 470 ? 'wound' : c.x < 760 ? 'resp' : 'gut';
      let fill = gate === 'skin' ? '#b98a6a' : gate === 'wound' ? '#a86f68' : gate === 'resp' ? '#d999a3' : '#c78897';
      if (c.st === 'dead') { ctx.fillStyle = 'rgba(80,60,60,0.6)'; roundRect(ctx, c.x - 8, c.y - 8, 16, 16, 4); ctx.fill(); continue; }
      const av = c.st === 'ok' ? Math.min(1, sim.ifn * 0.55) : 0;
      ctx.fillStyle = fill; roundRect(ctx, c.x - 9, c.y - 9, 18, 18, 5); ctx.fill();
      if (av > 0.15) { ctx.strokeStyle = `rgba(120,190,255,${av * 0.8})`; ctx.lineWidth = 1.5; roundRect(ctx, c.x - 9, c.y - 9, 18, 18, 5); ctx.stroke(); }
      if (c.st === 'inf') {
        const k = Math.min(1, c.t / c.def.incub);
        ctx.fillStyle = c.def.color; ctx.globalAlpha = 0.35 + 0.5 * k; roundRect(ctx, c.x - 9, c.y - 9, 18, 18, 5); ctx.fill(); ctx.globalAlpha = 1;
        for (let i = 0; i < Math.floor(k * 5); i++) circle(ctx, c.x - 5 + (i % 3) * 5, c.y - 3 + Math.floor(i / 3) * 6, 1.5, '#fff');
        // MHC I 깃발
        if (!c.def.mhcDown) { ctx.fillStyle = '#ffe08a'; ctx.fillRect(c.x + 7, c.y - 12, 2, 6); ctx.fillRect(c.x + 7, c.y - 12, 5, 3); }
      } else circle(ctx, c.x, c.y, 3, 'rgba(90,40,50,0.55)');
    }
  }

  // ───────── 혈구·면역세포 ─────────
  function drawHostRbc(ctx, r, t) {
    ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(Math.sin(r.rot * 0.7) * 0.4);
    ctx.fillStyle = '#c92a3a'; ctx.beginPath(); ctx.ellipse(0, 0, 7, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(90,0,15,0.35)'; ctx.beginPath(); ctx.ellipse(0, 0, 3.2, 2.2, 0, 0, TAU); ctx.fill();
    if (r.inf) { ctx.strokeStyle = '#ffb3c6'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(1, 0, 2.2, 0, TAU); ctx.stroke(); circle(ctx, 3, -1, 1, '#ffb3c6');
      if (r.inf.t > 1.2) for (let i = 0; i < 4; i++) circle(ctx, -3 + i * 2, 2, 0.9, '#ffd6e0'); }
    ctx.restore();
  }

  function drawCell(ctx, c, t, sim) {
    const x = c.x, y = c.y;
    switch (c.type) {
      case 'neut': {
        circle(ctx, x, y, 7, '#e8e4f0');
        ctx.fillStyle = '#7a5aa8';
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
          // MHC II — 보조 T세포와 접촉
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

  // ───────── 림프절 ─────────
  function drawLN(ctx, sim, t) {
    const ags = Object.values(sim.ag).filter(r => !r.natural);
    // 보조 T세포 클론 색칠: 활성화된 항원별로 일부 점에 고리
    const okDots = sim.th.filter(d => d.st === 'ok');
    let idx = 0;
    const ring = new Map();
    for (const r of ags) {
      const n = Math.min(okDots.length - idx, Math.round(r.th / 40 * 14));
      for (let i = 0; i < n; i++) ring.set(okDots[idx++], r.color);
    }
    for (const d of sim.th) {
      const x = d.x + Math.sin(t * 0.8 + d.ph) * 2, y = d.y + Math.cos(t * 0.7 + d.ph) * 2;
      if (d.st === 'dead') { ctx.strokeStyle = 'rgba(150,120,170,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3); ctx.moveTo(x + 3, y - 3); ctx.lineTo(x - 3, y + 3); ctx.stroke(); continue; }
      if (d.st === 'inf') {
        if (d.latent) { circle(ctx, x, y, 5.5, 'rgba(94,177,239,0.25)', '#8e4ec6', 1.5); }
        else { circle(ctx, x, y, 6, '#8e4ec6'); circle(ctx, x, y, 8 + Math.sin(t * 5 + d.ph) * 1.5, null, 'rgba(192,132,252,0.6)', 1); }
        continue;
      }
      circle(ctx, x, y, 5.5, '#5eb1ef');
      circle(ctx, x, y, 2.4, '#1d4f7a');
      const rc = ring.get(d);
      if (rc) circle(ctx, x, y, 8 + Math.sin(t * 3 + d.ph), null, rc, 2);
    }
    // CD8
    let cIdx = 0; const cRing = [];
    for (const r of ags) { if (!r.intra) continue; const n = Math.min(CD8.length - cIdx, Math.round(r.ctl / 50 * 10)); for (let i = 0; i < n; i++) cRing[cIdx++] = r.color; }
    CD8.forEach((d, i) => {
      const x = d.x + Math.sin(t * 0.9 + d.ph) * 2, y = d.y + Math.cos(t * 0.6 + d.ph) * 2;
      circle(ctx, x, y, 4.5, '#ff8a8a'); circle(ctx, x, y, 2, '#7a1c1c');
      if (cRing[i]) circle(ctx, x, y, 7, null, cRing[i], 2);
    });
    // B세포
    let bIdx = 0; const bRing = [];
    for (const r of ags) { const n = Math.min(BCELL.length - bIdx, Math.round((r.pm + r.pg) / 30 * 10 + (r.active && r.th > 2 ? 2 : 0))); for (let i = 0; i < n; i++) bRing[bIdx++] = r.color; }
    BCELL.forEach((d, i) => {
      const pulse = bRing[i] ? 1 + Math.sin(t * 6 + d.ph) * 0.15 : 1;
      const x = d.x + Math.sin(t * 0.7 + d.ph) * 2, y = d.y + Math.cos(t * 0.5 + d.ph) * 2;
      circle(ctx, x, y, 5 * pulse, '#46c8aa'); circle(ctx, x, y, 2.2, '#0f5546');
      ab(ctx, x + 5, y - 5, 2, 0.6, '#b6f2e3');
      if (bRing[i]) circle(ctx, x, y, 7.5, null, bRing[i], 2);
    });
    // 형질세포·기억세포
    const pz = IMM.LN.pZone;
    let plasmaList = [];
    for (const r of ags) { const n = Math.round((r.pm + r.pg) / 5); for (let i = 0; i < n; i++) plasmaList.push(r.color); }
    plasmaList = plasmaList.slice(0, 24);
    plasmaList.forEach((col, i) => {
      const x = pz.x0 + 26 + (i % 8) * 32, y = pz.y0 + 22 + Math.floor(i / 8) * 30;
      ctx.beginPath(); ctx.ellipse(x, y, 10, 7.5, 0, 0, TAU); ctx.fillStyle = '#7fb8e6'; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      circle(ctx, x + 4, y, 3, '#20456a');
      ctx.strokeStyle = 'rgba(32,69,106,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(x - 1, y, 5, 1.8, 4.5); ctx.stroke();
    });
    // 기억세포
    let mi = 0;
    for (const r of ags) {
      const n = Math.min(6, Math.ceil(r.memB / 5)) + Math.min(3, Math.ceil(r.memT / 5));
      for (let i = 0; i < n && mi < 40; i++, mi++) {
        const x = pz.x0 + 18 + (mi % 13) * 20, y = pz.y1 - 14 - Math.floor(mi / 13) * 18;
        star(ctx, x, y, 6, 2.6, r.color);
      }
    }
  }
  function star(ctx, x, y, r1, r2, col) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2; const r = i % 2 ? r2 : r1; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  }

  // ───────── 라벨 ─────────
  function label(ctx, txt, x, y, opt) {
    opt = opt || {};
    ctx.font = (opt.bold ? '600 ' : '') + (opt.size || 12) + 'px "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    ctx.textAlign = opt.align || 'left'; ctx.textBaseline = 'middle';
    if (opt.bg) {
      const w = ctx.measureText(txt).width;
      const bx = opt.align === 'center' ? x - w / 2 - 5 : x - 5;
      ctx.fillStyle = opt.bg; roundRect(ctx, bx, y - 9, w + 10, 18, 6); ctx.fill();
    }
    ctx.fillStyle = opt.col || 'rgba(230,236,255,0.85)';
    ctx.fillText(txt, x, y);
  }

  function drawLabels(ctx, sim) {
    for (const g of IMM.GATES) {
      label(ctx, g.name, (g.x0 + g.x1) / 2, 16, { align: 'center', bold: true, size: 13, col: '#e9efff' });
      label(ctx, g.sub, (g.x0 + g.x1) / 2, 34, { align: 'center', size: 10.5, col: 'rgba(210,220,245,0.7)' });
    }
    label(ctx, '1차 방어: 물리·화학적 장벽', 8, Z.barTop - 8, { size: 10, col: 'rgba(255,230,200,0.7)' });
    label(ctx, '조직 — 선천 면역 (식세포·NK세포·비만세포·보체·인터페론)', 10, Z.tisTop + 104, { size: 11, bg: 'rgba(0,0,0,0.35)' });
    label(ctx, '간', IMM.LIVER.x, IMM.LIVER.y - IMM.LIVER.r - 8, { align: 'center', size: 11, col: 'rgba(255,190,190,0.8)' });
    label(ctx, '신경절', IMM.GANGLION.x, IMM.GANGLION.y + 26, { align: 'center', size: 10.5, col: 'rgba(255,214,120,0.8)' });
    label(ctx, '혈관 — 혈류', 10, Z.bloodTop + 12, { size: 11, bg: 'rgba(0,0,0,0.35)' });
    label(ctx, '림프절·비장 — 특이적(적응) 면역', 10, Z.lnTop + 14, { size: 12, bold: true, bg: 'rgba(0,0,0,0.35)' });
    const t = IMM.LN.tZone, b = IMM.LN.bZone, p = IMM.LN.pZone;
    label(ctx, 'T세포 영역: 보조 T(파랑) · 세포독성 T(빨강)', t.x0 + 8, t.y0 - 8, { size: 10.5, col: 'rgba(160,210,255,0.85)' });
    label(ctx, 'B세포 여포 (배중심)', b.x0 + 8, b.y0 - 8, { size: 10.5, col: 'rgba(150,235,210,0.85)' });
    label(ctx, '형질세포 → 항체 · ★ 기억세포', p.x0 + 8, p.y0 - 8, { size: 10.5, col: 'rgba(255,220,160,0.85)' });
  }

  // ───────── 메인 ─────────
  IMM.draw = function (ctx, sim, t, opts) {
    opts = opts || {};
    ctx.clearRect(0, 0, W, H);
    drawBackground(ctx, sim, t, opts);
    drawEpi(ctx, sim, t);
    for (const m of sim.mast) {
      blob(ctx, m.x, m.y, 9, t * 0.5, m.x, '#9a6ad0', 3, 0.1);
      for (let i = 0; i < 6; i++) { const a = i + m.x; const rr = m.fire > 0 ? 9 + (1.2 - m.fire) * 14 : 4; circle(ctx, m.x + Math.cos(a) * rr, m.y + Math.sin(a) * rr, 1.5, m.fire > 0 ? 'rgba(255,160,200,0.9)' : '#5a2a8a'); }
    }
    for (const d of sim.debris) {
      if (d.kind === 'pus') circle(ctx, d.x, d.y, 4, 'rgba(230,210,120,0.55)');
      else { ctx.fillStyle = d.kind === 'cell' ? 'rgba(150,110,110,0.6)' : 'rgba(180,170,150,0.5)'; ctx.fillRect(d.x - 2, d.y - 1.5, 4, 3); }
    }
    for (const r of sim.rbcs) if (!r.dead) drawHostRbc(ctx, r, t);
    drawLN(ctx, sim, t);
    for (const c of sim.cells) if (c.type === 'macro' || c.type === 'dc') drawCell(ctx, c, t, sim);
    for (const p of sim.paths) drawPathogen(ctx, p, t, sim);
    for (const c of sim.cells) if (c.type !== 'macro' && c.type !== 'dc') drawCell(ctx, c, t, sim);
    for (const a of sim.abp) { ctx.globalAlpha = Math.max(0, 1 - a.t / a.life); ab(ctx, a.x, a.y, 3.4, a.rot + a.t, a.col); }
    ctx.globalAlpha = 1;
    for (const s of sim.sparks) { ctx.globalAlpha = 1 - s.t / 0.6; circle(ctx, s.x, s.y, 1.6, s.col); }
    ctx.globalAlpha = 1;
    if (opts.labels !== false) drawLabels(ctx, sim);
    for (const f of sim.fx) {
      ctx.globalAlpha = Math.max(0, Math.min(1, 2 - f.t));
      label(ctx, f.txt, f.x, f.y, { align: 'center', size: 11, bold: true, col: f.col, bg: 'rgba(10,14,25,0.7)' });
    }
    ctx.globalAlpha = 1;
    if (opts.dropPreview) {
      const p = opts.dropPreview;
      circle(ctx, p.x, p.y, 26, 'rgba(255,211,110,0.12)', '#ffd36e', 1.5);
      label(ctx, p.text, p.x, p.y - 38, { align: 'center', size: 12, bold: true, col: '#ffd36e', bg: 'rgba(10,14,25,0.85)' });
    }
  };

  // 팔레트 아이콘
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
    else { if (type === 'macro') ctx.scale(0.85, 0.85); drawCell(ctx, c, 0, { th: [] }); }
    ctx.restore();
  };
})(typeof window !== 'undefined' ? window : globalThis);
