// 면역 시뮬레이터 — 시뮬레이션 엔진 (DOM과 무관, Node에서도 실행 가능)
(function (G) {
  const IMM = G.IMM;
  const { W, Z } = IMM;
  const DPS = 0.4; // 1배속에서 실제 1초 = 0.4일
  const BLOOD_V = 70;
  const EPI_X0 = 12, EPI_DX = 20, EPI_COLS = 50, EPI_Y0 = 114, EPI_DY = 20, EPI_ROWS = 4;
  const EPI_YMAX = EPI_Y0 + EPI_DY * (EPI_ROWS - 1);
  const PATH_CAP = 900;

  const rnd = Math.random;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rr = (a, b) => a + rnd() * (b - a);
  const pr = (rate, dt) => rate > 0 && rnd() < 1 - Math.exp(-rate * dt);
  const dist2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };

  class Grid {
    constructor(cs) {
      this.cs = cs; this.cols = Math.ceil(W / cs) + 1; this.rows = Math.ceil(IMM.H / cs) + 1;
      this.b = []; for (let i = 0; i < this.cols * this.rows; i++) this.b.push([]);
    }
    clear() { for (const a of this.b) a.length = 0; }
    add(o) {
      const cx = clamp((o.x / this.cs) | 0, 0, this.cols - 1), cy = clamp((o.y / this.cs) | 0, 0, this.rows - 1);
      this.b[cx + cy * this.cols].push(o);
    }
    nearest(x, y, r, fn) {
      const cs = this.cs;
      const x0 = clamp(((x - r) / cs) | 0, 0, this.cols - 1), x1 = clamp(((x + r) / cs) | 0, 0, this.cols - 1);
      const y0 = clamp(((y - r) / cs) | 0, 0, this.rows - 1), y1 = clamp(((y + r) / cs) | 0, 0, this.rows - 1);
      let best = null, bd = r * r;
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const arr = this.b[cx + cy * this.cols];
        for (let i = 0; i < arr.length; i++) {
          const o = arr[i]; if (o.dead) continue;
          const dx = o.x - x, dy = o.y - y, d = dx * dx + dy * dy;
          if (d < bd && fn(o)) { bd = d; best = o; }
        }
      }
      return best;
    }
  }

  class Sim {
    constructor(opts) { this.reset(opts || {}); }

    reset(opts) {
      this.bloodType = opts.bloodType || 'O';
      this.rh = opts.rh !== false;
      this.selfAgs = new Set();
      if (this.bloodType.includes('A')) this.selfAgs.add('A');
      if (this.bloodType.includes('B')) this.selfAgs.add('B');
      if (this.rh) this.selfAgs.add('D');

      this.day = 0; this.time = 0;
      this.health = 100; this.temp = 36.5; this.inflam = 0; this.pyro = 0; this.ifn = 0; this.comp = 1;
      this.alive = true; this.deathReason = null; this.deathDay = 0;
      this.paths = []; this.cells = []; this.epi = []; this.rbcs = []; this.th = []; this.debris = [];
      this.fx = []; this.abp = []; this.sparks = []; this.log = []; this.exposures = []; this.hist = [];
      this.ag = {}; this.tit = {};
      this.variant = { flu: 1, hiv: 1, tryp: 1 };
      this.fluSeen = false;
      this.latentHerpes = 0; this.herpesNext = 1e9;
      this.cd4Base = 60; this.helpF = 1; this.hiv = null; this.hivEver = false; this.hivT = 1;
      this.nextOpp = 0; this.oppOn = false;
      this.flags = {}; this.fxCd = {}; this.histT = 0; this.abT = 0;
      this.dmgBy = { load: 0, hemo: 0, fever: 0, anemia: 0, inflam: 0 };
      this.grid = new Grid(60);
      this.stats = {};

      for (let r = 0; r < EPI_ROWS; r++) for (let c = 0; c < EPI_COLS; c++) {
        this.epi.push({ x: EPI_X0 + c * EPI_DX + (r % 2) * 6, y: EPI_Y0 + r * EPI_DY, st: 'ok', t: 0, def: null, ag: null, regen: 0 });
      }
      for (let i = 0; i < 60; i++) this.rbcs.push(this.newRbc(rr(0, W)));
      const tz = IMM.LN.tZone;
      for (let i = 0; i < this.cd4Base; i++) {
        this.th.push({ x: rr(tz.x0 + 14, tz.x1 - 14), y: rr(tz.y0 + 14, tz.y1 - 14), st: 'ok', t: 0, ag: null, latent: false, ph: rnd() * 6 });
      }
      for (let i = 0; i < 24; i++) this.addCell('neut', rr(0, W), rr(Z.bloodTop + 10, Z.bloodBot - 10), 'blood').age = rr(0, 5);
      for (let i = 0; i < 10; i++) this.addCell('macro', rr(20, 1000), rr(210, 400), 'tis');
      for (let i = 0; i < 8; i++) this.addCell('dc', rr(20, 1000), rr(200, 390), 'tis');
      for (let i = 0; i < 8; i++) this.addCell('nk', rr(0, W), rr(Z.bloodTop + 10, Z.bloodBot - 10), 'blood').age = rr(0, 8);
      this.mast = [];
      for (let i = 0; i < 7; i++) this.mast.push({ x: 60 + i * 140 + rr(-20, 20), y: rr(230, 330), cd: 0, fire: 0 });

      // 자연 항체: 자기에게 없는 A/B 항원에 대한 IgM이 태어날 때부터 존재
      for (const a of ['A', 'B']) {
        if (!this.selfAgs.has(a)) { const r = this.getAg(a); r.natural = true; r.igm = 3; }
      }
      this.addLog('info', `새 몸 준비 완료 · 혈액형 ${this.bloodType}형 Rh${this.rh ? '+' : '−'}` +
        (this.selfAgs.has('A') && this.selfAgs.has('B') ? ' (자연 항체 없음)' :
          ' · 혈장에 ' + ['A', 'B'].filter(a => !this.selfAgs.has(a)).map(a => '항-' + a).join(', ') + ' 자연 항체(IgM) 존재'));
    }

    newRbc(x) { return { x, y: rr(Z.bloodTop + 10, Z.bloodBot - 10), vx: 0, vy: 0, inf: null, dead: false, regen: 0, rot: rnd() * 6 }; }

    addCell(type, x, y, loc) {
      const c = { type, x, y, vx: 0, vy: 0, loc, age: 0, eaten: 0, busy: 0, tgt: null, dead: false, ph: rnd() * 6 };
      if (type === 'macro') { c.intra = 0; c.act = 0; c.gran = false; }
      this.cells.push(c);
      return c;
    }

    // ───────── 기록·효과 ─────────
    addLog(kind, text) {
      this.log.push({ day: this.day, kind, text });
      if (this.log.length > 300) this.log.shift();
    }
    once(key, kind, text) { if (!this.flags[key]) { this.flags[key] = true; this.addLog(kind, text); return true; } return false; }
    pop(x, y, txt, col, key, cd) {
      if (key) { const t = this.fxCd[key] || 0; if (this.time < t) return; this.fxCd[key] = this.time + (cd || 2.5); }
      if (this.fx.length > 28) return;
      this.fx.push({ x, y, txt, col: col || '#fff', t: 0 });
    }
    spark(x, y, col, n) { for (let i = 0; i < (n || 6) && this.sparks.length < 300; i++) this.sparks.push({ x, y, vx: rr(-40, 40), vy: rr(-40, 40), col, t: 0 }); }

    // ───────── 항원 기록 (적응 면역) ─────────
    getAg(id) {
      if (this.selfAgs.has(id)) return null;
      let r = this.ag[id];
      if (r) return r;
      const base = id.split(':')[0];
      r = this.ag[id] = {
        id, name: IMM.agName(id), color: IMM.agColor(id), stim: 0, stimI: 0, prime: 0, th: 0, ctl: 0, pm: 0, pg: 0, sw: 0,
        igm: 0, igg: 0, memB: 0, memT: 0, memC: 0, aff: 1, natural: false,
        intra: ['flu', 'rhino', 'noro', 'herpes', 'hiv', 'tb'].includes(base), ep: 0, active: false, peak: 0, cleared: true,
      };
      // 인플루엔자 변이형: 이전 형의 기억세포가 일부 교차 반응
      if (base === 'flu') {
        const v = parseInt(id.split(':')[1], 10);
        const prev = this.ag['flu:' + (v - 1)];
        if (prev) {
          r.memB = prev.memB * 0.3; r.memT = prev.memT * 0.6; r.memC = prev.memC * 0.6; r.igg = prev.igg * 0.25;
        }
      }
      return r;
    }
    titer(id) { return this.tit[id] || 0; }
    titOf(p) { let t = 0; for (const a of p.ags) { const v = this.tit[a]; if (v > t) t = v; } return t; }
    foreignAgs(p) { return p.ags.filter(a => !this.selfAgs.has(a)); }
    stimAg(id, amt, intra) {
      const r = this.getAg(id); if (!r) return;
      r.stim = Math.min(2, r.stim + amt);
      if (intra && r.intra) r.stimI = Math.min(2, r.stimI + amt);
    }

    // ───────── 항원 투입 ─────────
    gateAt(x, y) {
      if (y >= Z.bloodTop && y < Z.lnTop) return 'blood';
      if (y >= Z.lnTop) return 'blood';
      if (y >= Z.tisTop + 10) return 'tissue';
      for (const g of IMM.GATES) if (x >= g.x0 && x < g.x1) return g.id;
      return 'skin';
    }

    drop(defId, x, y, doseMult) {
      if (!this.alive) return;
      const def = IMM.DEF[defId];
      let gate = this.gateAt(x, y);
      if (def.beh === 'vaccine') {
        gate = 'tissue';
        if (y < Z.tisTop + 20 || y > Z.bloodTop) y = rr(220, 330);
        if (x > 1000) x = rr(100, 950);
      }
      const n = Math.max(1, Math.round(def.n * (doseMult || 1)));
      let ag = def.ag;
      if (defId === 'flu') {
        if (this.fluSeen && rnd() < def.drift) {
          this.variant.flu++;
          this.addLog('danger', `인플루엔자 항원 소변이 발생 → 새로운 HA-${this.variant.flu}형 (이전 기억세포는 일부만 교차 반응)`);
        }
        this.fluSeen = true;
      }
      if (ag === 'flu') ag = 'flu:' + this.variant.flu;
      if (ag === 'hiv') ag = 'hiv:' + this.variant.hiv;
      if (ag === 'tryp') ag = 'tryp:1';
      const ags = def.ags ? def.ags.slice() : [ag];
      this.exposures.push({ day: this.day, name: def.name, color: def.color || '#e5484d', id: defId });

      let pass = 0;
      const gname = IMM.ROUTE_NAMES[gate];
      for (let i = 0; i < n; i++) {
        const ok = rnd() < this.passChance(def, gate);
        const g = IMM.GATES.find(q => q.id === gate);
        const spread = 45 * Math.sqrt(Math.max(1, doseMult || 1));
        const px = clamp(x + rr(-spread, spread), g ? g.x0 + 6 : 6, g ? g.x1 - 6 : W - 6);
        const p = this.newPath(def, ags, px, 0);
        p.drop = this.exposures.length;
        if (!ok) {
          p.st = 'blocked'; p.y = rr(10, 50); p.mode = gate; p.t = rr(-0.4, 0);
          p.vy = 40; this.paths.push(p);
          continue;
        }
        pass++;
        if (gate === 'blood') { p.x = clamp(x + rr(-50, 50), 4, W - 4); p.y = rr(Z.bloodTop + 10, Z.bloodBot - 10); p.loc = 'blood'; }
        else if (gate === 'tissue') { p.x = clamp(x + rr(-40, 40), 6, 1000); p.y = clamp(y + rr(-30, 30), Z.tisTop + 10, Z.bloodTop - 10); p.loc = 'tis'; }
        else { p.y = rr(Z.tisTop + 2, Z.tisTop + 30); p.loc = 'tis'; }
        this.initBeh(p);
        this.paths.push(p);
      }
      const reason = {
        skin: '각질층·피지·땀 속 라이소자임이 막아냄',
        resp: '점액에 붙잡혀 섬모 운동으로 밖으로 배출됨',
        gut: '위산(pH 2)과 소화 효소에 파괴됨',
      }[gate];
      let msg = `${def.name} ${n}개 투입 → ${gname}: ${pass}개 통과`;
      if (pass < n && reason) msg += `, ${n - pass}개는 ${reason}`;
      this.addLog(pass === 0 ? 'barrier' : 'info', msg);
      if (pass === 0 && def.cat === 'rbc') this.addLog('barrier', '적혈구는 혈관(수혈)으로 직접 넣어야 몸 안에 들어감');
      if (gate === 'wound' && pass > 0) {
        this.inflam = Math.min(1, this.inflam + 0.25);
        this.once('wound' + Math.floor(this.day), 'innate', '상처 → 혈소판 응고와 비만세포 활성화로 국소 염증 시작');
      }
      if (def.beh === 'vaccine') { this.inflam = Math.min(1, this.inflam + 0.08); this.addLog('info', '백신 주사: 증식하지 않는 항원 + 면역 증강제 → 수지상세포가 항원을 수집'); }
      if (def.beh === 'rbc' && pass > 0) {
        const f = ags.filter(a => !this.selfAgs.has(a));
        if (f.length === 0) this.addLog('innate', '수혈 적합: 받는 사람에게도 있는 항원뿐 → 자기로 인식(면역 관용), 반응 없음');
        else {
          const nat = f.filter(a => this.ag[a] && this.ag[a].natural);
          const sens = f.filter(a => !(this.ag[a] && this.ag[a].natural) && this.ag[a] && (this.ag[a].memB > 1 || this.ag[a].igg > 0.5));
          if (nat.length) this.addLog('danger', `수혈 부적합! ${nat.map(a => '항-' + a).join('·')} 자연 항체가 곧바로 결합 → 응집·보체 용혈`);
          if (sens.length) this.addLog('danger', `이전 노출로 감작된 ${sens.map(a => IMM.agName(a)).join('·')} 기억 B세포 → 빠른 IgG 반응 예상`);
          if (f.length > nat.length + sens.length) this.addLog('info', `처음 보는 ${f.filter(a => !nat.includes(a) && !sens.includes(a)).map(a => IMM.agName(a)).join('·')} → 미리 만들어진 항체가 없어 1차 면역 반응(감작)이 천천히 진행`);
        }
      }
      if (defId === 'hiv' && pass > 0) {
        this.once('hiv1', 'danger', 'HIV가 혈액으로 침입 → 림프절의 보조 T세포(CD4)를 노림');
        if (!this.hiv) this.hiv = { T: this.helpF, I: 0, L: 0, V: 0, days: 0, cur: 'hiv:' + this.variant.hiv };
        this.hiv.V += 0.004 * pass; this.hivEver = true;
      }
      if (defId === 'malaria' && pass > 0) this.addLog('info', '말라리아 포자소체가 혈류를 타고 간으로 이동해 숨음 (간 단계)');
    }

    passChance(def, gate) {
      if (gate === 'blood' || gate === 'tissue' || gate === 'wound') return 1;
      if (def.cat === 'rbc') return 0;
      if (gate === 'skin') return def.skinPass != null ? def.skinPass : (def.beh === 'hiv' || def.cat === 'protist' ? 0 : 0.015);
      if (gate === 'resp') {
        if (def.cat === 'protist' || def.beh === 'hiv') return 0;
        if (def.id === 'tb') return 0.6;
        return def.cat === 'bact' ? 0.3 : 0.35;
      }
      if (gate === 'gut') {
        if (def.beh === 'hiv') return 0;
        if (def.acidRes) return 0.75;
        return def.cat === 'virus' ? 0.03 : 0.06;
      }
      return 1;
    }

    newPath(def, ags, x, y) {
      return { def, ags, x, y, vx: rr(-10, 10), vy: rr(-10, 10), st: 'free', loc: 'tis', age: 0, t: 0, coat: false, opso: false,
        dead: false, ph: rnd() * 6, life: def.life ? def.life * rr(0.7, 1.3) : 0, hp: 1, clump: false };
    }

    initBeh(p) {
      const b = p.def.beh;
      if (b === 'malaria') { p.st = 'spz'; p.loc = p.loc === 'tis' ? 'tis' : 'blood'; }
      if (b === 'amoeba') { p.st = 'free'; p.hp = 6; }
      if (b === 'rbc') { p.loc = 'blood'; p.y = clamp(p.y, Z.bloodTop + 10, Z.bloodBot - 10); p.life = 30; }
      if (b === 'vaccine') { p.life = 3.5; }
      if (b === 'bact' || b === 'tb' || b === 'trypano' || b === 'amoeba') p.t = rnd() * (p.def.dbl || 1);
    }

    // ───────── 메인 루프 ─────────
    step(ds) {
      this.updateFx(ds);
      if (!this.alive) return;
      let rem = ds;
      while (rem > 1e-6) { const h = Math.min(rem, 0.05); this._step(h); rem -= h; }
    }

    updateFx(ds) {
      for (const f of this.fx) { f.t += ds; f.y -= 14 * ds; }
      this.fx = this.fx.filter(f => f.t < 2);
      for (const s of this.sparks) { s.t += ds; s.x += s.vx * ds; s.y += s.vy * ds; }
      this.sparks = this.sparks.filter(s => s.t < 0.6);
      for (const a of this.abp) { a.t += ds; a.x += a.vx * ds; a.y += a.vy * ds; a.vx += rr(-30, 30) * ds; }
      this.abp = this.abp.filter(a => a.t < a.life);
    }

    _step(ds) {
      const dt = ds * DPS;
      this.day += dt; this.time += ds;
      this.ds = ds; this.dt = dt;
      if (this.helpF == null) this.helpF = 1;
      for (const id in this.ag) {
        const r = this.ag[id];
        this.tit[id] = r.igm * 0.6 + r.igg * r.aff;
      }
      // 격자
      this.grid.clear();
      this.tisList = []; this.counts = {}; this.agCount = {};
      for (const p of this.paths) {
        if (p.dead) continue;
        if (p.st !== 'blocked') {
          this.counts[p.def.id] = (this.counts[p.def.id] || 0) + 1;
          for (const a of p.ags) this.agCount[a] = (this.agCount[a] || 0) + 1;
        }
        if (p.st === 'free' || p.st === 'mero' || p.st === 'spz') {
          this.grid.add(p);
          if (p.loc === 'tis') this.tisList.push(p);
        }
      }
      for (const d of this.debris) this.grid.add(d);
      this.infList = this.epi.filter(c => c.st === 'inf');
      this.thInf = this.th.filter(t => t.st === 'inf' && !t.latent);
      this.macroInf = this.cells.filter(c => c.type === 'macro' && c.intra > 0 && !c.dead);

      this.dmg = 0;
      const n0 = this.paths.length;
      for (let i = 0; i < n0; i++) { const p = this.paths[i]; if (!p.dead) this.updatePath(p, ds, dt); }
      this.updateEpi(dt);
      this.updateHivModel(dt);
      if (this.hiv) this.hivT = this.hiv.T;
      this.updateTh(dt);
      this.updateRbc(ds, dt);
      for (let i = 0, n = this.cells.length; i < n; i++) { const c = this.cells[i]; if (!c.dead) this.updateCell(c, ds, dt); }
      for (const d of this.debris) { d.t += dt; if (d.t > 4) d.dead = true; }
      this.updateAdaptive(dt);
      this.updateInnate(ds, dt);
      this.recruit(dt);
      this.updateHealth(dt);

      this.paths = this.paths.filter(p => !p.dead);
      this.cells = this.cells.filter(c => !c.dead);
      this.debris = this.debris.filter(d => !d.dead);

      this.histT += dt;
      if (this.histT >= 0.25) { this.histT = 0; this.sample(); }
    }

    sample() {
      const tit = {};
      for (const id in this.ag) if (this.tit[id] > 0.02 || this.ag[id].natural) tit[id] = this.tit[id];
      const s = this.stats;
      this.hist.push({ day: this.day, tit, load: (s.virus || 0) + (s.bact || 0) + (s.protist || 0) * 2, cd4: this.helpF, temp: this.temp, health: this.health });
      if (this.hist.length > 800) this.hist.shift();
    }

    // ───────── 이동 ─────────
    wander(o, sp, ds, y0, y1) {
      o.vx += (rnd() - 0.5) * sp * 5 * ds; o.vy += (rnd() - 0.5) * sp * 5 * ds;
      const v = Math.hypot(o.vx, o.vy); if (v > sp) { o.vx *= sp / v; o.vy *= sp / v; }
      o.x += o.vx * ds; o.y += o.vy * ds;
      if (o.x < 4) { o.x = 4; o.vx = Math.abs(o.vx); } if (o.x > W - 4) { o.x = W - 4; o.vx = -Math.abs(o.vx); }
      if (o.y < y0) { o.y = y0; o.vy = Math.abs(o.vy); } if (o.y > y1) { o.y = y1; o.vy = -Math.abs(o.vy); }
    }
    wanderTis(o, sp, ds) { this.wander(o, sp, ds, Z.tisTop + 6, Z.bloodTop - 6); }
    flow(o, ds, mult) {
      o.x += (BLOOD_V * (mult || 1) + o.vx * 0.3) * ds;
      o.vy += (rnd() - 0.5) * 60 * ds; o.vy *= 0.98;
      o.y += o.vy * ds;
      if (o.y < Z.bloodTop + 6) { o.y = Z.bloodTop + 6; o.vy = Math.abs(o.vy); }
      if (o.y > Z.bloodBot - 6) { o.y = Z.bloodBot - 6; o.vy = -Math.abs(o.vy); }
      if (o.x > W + 8) o.x -= W + 16;
    }
    seek(o, tx, ty, sp, ds) {
      const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy) || 1;
      const s = Math.min(sp * ds, d);
      o.vx = dx / d * sp; o.vy = dy / d * sp;
      o.x += dx / d * s + rr(-0.6, 0.6); o.y += dy / d * s + rr(-0.6, 0.6);
      return d;
    }

    replF(def) {
      const t = this.temp;
      if (def.tempSens) return clamp(1 - (t - 37) * 0.45, 0.12, 1);
      return clamp(1 - (t - 37.2) * 0.12, 0.55, 1);
    }

    killPath(p, how, debris) {
      if (p.dead) return;
      p.dead = true;
      if (debris !== false && this.debris.length < 220) this.debris.push({ x: p.x, y: p.y, ag: this.foreignAgs(p)[0] || null, kind: 'frag', t: 0, dead: false });
    }

    // ───────── 병원체 ─────────
    updatePath(p, ds, dt) {
      p.age += dt;
      const def = p.def;
      if (p.st === 'blocked') { p.t += ds; if (p.t > 2.4) p.dead = true; return; }
      // 항체 결합
      if (!p.coat && p.st !== 'liver' && p.st !== 'latent' && p.st !== 'spz') {
        const t = this.titOf(p);
        if (t > 0 && pr(t * 0.9, dt)) {
          p.coat = true;
          if (def.cat === 'virus') this.pop(p.x, p.y - 8, '항체 중화', '#5eb1ef', 'neut' + def.id, 3);
          else if (def.cat === 'bact') this.pop(p.x, p.y - 8, '옵소닌화', '#5eb1ef', 'ops' + def.id, 3);
        }
      }
      switch (def.beh) {
        case 'lytic': return this.bLytic(p, ds, dt);
        case 'hiv': return this.bHiv(p, ds, dt);
        case 'bact': return this.bBact(p, ds, dt);
        case 'tb': return this.bBact(p, ds, dt);
        case 'malaria': return this.bMalaria(p, ds, dt);
        case 'trypano': return this.bTrypano(p, ds, dt);
        case 'amoeba': return this.bAmoeba(p, ds, dt);
        case 'rbc': return this.bRbc(p, ds, dt);
        case 'vaccine': return this.bVaccine(p, ds, dt);
      }
    }

    epiAt(x, y) {
      const r = Math.round((y - EPI_Y0) / EPI_DY);
      if (r < 0 || r >= EPI_ROWS) return null;
      const c = Math.round((x - EPI_X0 - (r % 2) * 6) / EPI_DX);
      if (c < 0 || c >= EPI_COLS) return null;
      const cell = this.epi[r * EPI_COLS + c];
      if (Math.abs(cell.x - x) > 11 || Math.abs(cell.y - y) > 11) return null;
      return cell;
    }

    bLytic(p, ds, dt) {
      const def = p.def;
      if (p.loc === 'blood') {
        // 바이러스혈증: 혈류를 타고 온몸으로 퍼짐
        this.flow(p, ds);
        this.dmg += def.tox * 4;
        if (p.age > p.life * 2 || (p.coat && pr(2, dt)) || pr(0.25, dt)) { p.dead = true; return; }
        if (pr(1.2, dt)) { p.loc = 'tis'; p.x = Math.min(990, p.x); p.y = Z.bloodTop - 12; p.vy = -30; }
        this.once('viremia' + this.getEp(p.ags[0]), 'danger', `${def.name}가 혈액으로 들어가 온몸으로 퍼짐 (바이러스혈증)`);
        return;
      }
      this.wanderTis(p, 40, ds);
      if (p.y > Z.bloodTop - 30 && pr(1.5, dt)) { p.loc = 'blood'; p.y = Z.bloodTop + 10; return; }
      p.vy -= 8 * ds;
      if (p.age > p.life * (p.coat ? 0.4 : 1)) { p.dead = true; return; }
      if (p.coat && pr(0.5 * this.comp, dt)) { this.killPath(p); return; }
      this.dmg += def.tox;
      if (!p.coat && p.y < EPI_YMAX + 10) {
        const c = this.epiAt(p.x, p.y);
        if (c && c.st === 'ok') {
          const av = Math.min(0.9, this.ifn * 0.55);
          const f = def.infect * (1 - av) * this.replF(def);
          if (pr(f * 40, dt)) {
            c.st = 'inf'; c.t = 0; c.def = def; c.ag = p.ags[0]; p.dead = true;
            this.once('inf' + def.id + this.getEp(c.ag), 'innate', `${def.name}가 상피세포에 침입해 증식 시작`);
          }
        }
      }
    }
    getEp(ag) { const r = this.ag[ag]; return r ? r.ep : 0; }

    updateEpi(dt) {
      let infected = 0;
      for (const c of this.epi) {
        if (c.st === 'inf') {
          infected++;
          const def = c.def;
          c.t += dt * this.replF(def);
          this.ifn += (def.ifn || 1) * 0.04 * dt;
          this.pyro += 0.004 * dt;
          if (c.t >= def.incub) this.burstEpi(c);
        } else if (c.st === 'dead') {
          c.regen += dt;
          if (c.regen > 2.5 && pr(0.8, dt)) { c.st = 'ok'; c.regen = 0; }
        }
      }
      this.stats.infected = infected;
    }

    burstEpi(c) {
      const def = c.def;
      const n = def.burst;
      for (let i = 0; i < n && this.paths.length < PATH_CAP; i++) {
        const p = this.newPath(def, [c.ag], c.x + rr(-6, 6), c.y + rr(-6, 6));
        p.vx = rr(-30, 30); p.vy = rr(-10, 30);
        this.paths.push(p);
      }
      if (def.latent && this.latentHerpes < 3 && rnd() < 0.12) {
        this.latentHerpes++;
        this.herpesNext = this.day + rr(10, 18);
        this.once('hlat', 'danger', '단순포진 바이러스 일부가 감각 신경을 타고 신경절에 잠복 (면역이 닿지 않음)');
      }
      this.cellDie(c, def.cellDmg || 0.05);
      this.pop(c.x, c.y - 10, '세포 파열', '#ff8b8b', 'burst', 2.5);
    }

    cellDie(c, dmg) {
      c.st = 'dead'; c.regen = 0;
      this.health -= dmg; this.dmgBy.load += dmg;
      this.inflam = Math.min(1, this.inflam + 0.006);
      if (c.ag && this.debris.length < 220) this.debris.push({ x: c.x, y: c.y + 6, ag: c.ag, kind: 'cell', t: 0, dead: false });
    }

    // HIV: 개별 입자는 시각화, 실제 동역학은 CD4·감염세포·잠복 저장소·바이러스량 모델로 계산
    bHiv(p, ds, dt) {
      if (p.age > p.life) { p.dead = true; return; }
      if (p.loc === 'tis') { this.wanderTis(p, 30, ds); p.y += 30 * ds; if (p.y > Z.bloodTop - 8) { p.loc = 'blood'; p.y = Z.bloodTop + 8; } return; }
      if (p.loc === 'blood') { this.flow(p, ds); if (pr(2, dt)) { p.loc = 'ln'; p.y = Z.lnTop + 30; } return; }
      this.wander(p, 40, ds, Z.lnTop + 10, Z.bot - 6);
      if (pr(1.2, dt)) { p.loc = 'blood'; p.y = Z.bloodBot - 10; }
    }

    updateHivModel(dt) {
      const h = this.hiv; if (!h) return;
      h.days += dt;
      const r = this.getAg(h.cur);
      const ctl = r ? r.ctl : 0;
      const ab = this.titer(h.cur);
      const damage = Math.min(0.95, h.days / 120); // 흉선·림프 조직 손상으로 보충 감소
      const k = 0.6, p = 6, c = 3, delta = 0.7, f = 0.05, a = 0.03;
      const inf = k * h.V * h.T;
      const dT = 0.03 * (1 - damage) - 0.03 * h.T - inf - 0.02 * Math.min(1, h.V) * h.T;
      const dI = (1 - f) * inf + a * h.L - delta * h.I - 0.03 * ctl * h.I;
      const dL = f * inf - a * h.L + 0.028 * h.L * (1 - h.L / 0.05); // 잠복 저장소는 스스로 유지됨
      const dV = p * h.I - c * h.V - 0.08 * ab * h.V;
      h.T = clamp(h.T + dT * dt, 0, 1.05); h.I = Math.max(0, h.I + dI * dt); h.L = Math.max(0, h.L + dL * dt); h.V = Math.max(0, h.V + dV * dt);
      if (h.V < 1e-4 && h.I < 1e-4 && h.L < 1e-4) {
        this.hiv = null; this.addLog('ok', 'HIV가 자리 잡기 전에 제거됨'); return;
      }
      // 항원 노출 → 현재 변이에 대한 적응 면역
      this.stimAg(h.cur, dt * Math.min(1.5, h.V * 3 + h.I * 5), true);
      // 역전사 오류로 인한 면역 회피 변이
      if (this.variant.hiv < 40 && pr(0.01 + 0.06 * Math.min(1, ctl / 10 + ab / 3), dt)) {
        this.variant.hiv++; const prev = h.cur; h.cur = 'hiv:' + this.variant.hiv;
        const nr = this.getAg(h.cur);
        const pr_ = this.ag[prev]; if (nr && pr_) { nr.memT = pr_.memT * 0.5; nr.memC = pr_.memC * 0.5; }
        if (this.variant.hiv <= 6 || this.variant.hiv % 4 === 0) this.addLog('danger', `HIV 역전사 오류 → 면역 회피 변이 ${this.variant.hiv}번 우세 (기존 항체·세포독성 T세포가 못 알아봄)`);
      }
      // 시각용 입자 수 맞추기
      const want = Math.min(90, Math.round(Math.sqrt(h.V) * 250));
      const have = this.counts.hiv || 0;
      if (have < want && this.paths.length < PATH_CAP) {
        const t = this.th[(rnd() * this.th.length) | 0];
        const q = this.newPath(IMM.DEF.hiv, [h.cur], t.x, t.y); q.loc = 'ln'; q.life = 1.5; this.paths.push(q);
      }
      if (h.T < 0.12) { this.health -= 0.6 * dt; this.dmgBy.load += 0.6 * dt; }
    }

    updateTh(dt) {
      const h = this.hiv;
      const n = this.th.length;
      let nOk = n, nInf = 0, nLat = 0;
      if (h) {
        nOk = Math.round(clamp(h.T, 0, 1) * n);
        nInf = Math.min(n - nOk, Math.round(h.I * n * 3));
        nLat = Math.min(n - nOk - nInf, h.L > 0.001 ? Math.max(1, Math.round(h.L * n * 20)) : 0);
      } else if (this.hivEver) {
        nOk = Math.round(clamp(this.hivT || 1, 0, 1) * n);
      }
      for (let i = 0; i < n; i++) {
        const t = this.th[i];
        const prev = t.st;
        if (i < nOk) { t.st = 'ok'; t.latent = false; t.ag = null; }
        else if (i < nOk + nInf) { t.st = 'inf'; t.latent = false; t.ag = h.cur; }
        else if (i < nOk + nInf + nLat) { t.st = 'inf'; t.latent = true; t.ag = h.cur; }
        else { t.st = 'dead'; t.ag = null; }
        if (prev === 'inf' && t.st === 'dead' && rnd() < 0.3) this.pop(t.x, t.y - 10, '보조 T 파괴', '#c084fc', 'thdie', 3);
        if (prev === 'ok' && t.st === 'inf' && rnd() < 0.3) this.pop(t.x, t.y - 10, 'CD4 감염', '#c084fc', 'hivinf', 3);
      }
      const frac = nOk / n;
      this.helpF = h ? clamp(h.T, 0, 1) : frac;
      this.stats.cd4 = Math.round(this.helpF * 1000);
      if (this.helpF < 0.5 && this.flags.hiv1) this.once('cd4_500', 'danger', 'CD4 수치 500 미만 → 면역력이 눈에 띄게 약해짐');
      if (this.helpF < 0.2 && this.flags.hiv1) {
        if (this.once('cd4_200', 'danger', 'CD4 수치 200 미만: AIDS 단계 → 보조 T세포가 부족해 새로운 적응 면역이 거의 작동하지 않음')) this.nextOpp = this.day + 2;
        this.oppOn = true;
      } else this.oppOn = false;
    }

    bBact(p, ds, dt) {
      const def = p.def;
      if (p.loc === 'tis') this.wanderTis(p, def.beh === 'tb' ? 7 : 14, ds); else this.flow(p, ds);
      this.dmg += def.tox * (p.loc === 'blood' ? 2 : 1);
      const cnt = this.counts[def.id] || 0;
      p.t += dt * this.replF(def) * Math.max(0, 1 - cnt / def.cap) * (def.beh === 'tb' ? 0.35 : 1) * (p.loc === 'blood' ? 0.35 : 1);
      if (p.t >= def.dbl && cnt < def.cap && this.paths.length < PATH_CAP) {
        p.t = rr(-0.15, 0.1) * def.dbl;
        const q = this.newPath(def, p.ags, p.x + rr(-4, 4), p.y + rr(-4, 4)); q.loc = p.loc; q.t = p.t;
        this.paths.push(q); this.counts[def.id] = cnt + 1;
      }
      if (p.loc === 'tis' && pr(def.lps ? 0.03 : 0.004, dt)) {
        p.loc = 'blood'; p.y = Z.bloodTop + 10;
        this.once('sepsis' + def.id + this.getEp(p.ags[0]), 'danger', `${def.name} 일부가 혈관으로 침입 (균혈증) → 비장과 혈중 호중구·보체가 대응`);
      }
      // 보체
      let k = (def.gram === '-' ? 0.5 : 0.04) * this.comp * (p.coat ? 5 : 1) * (def.capsule ? 0.3 : 1);
      if (def.beh === 'tb') k *= 0.2;
      if (pr(k, dt)) {
        this.comp = Math.max(0, this.comp - 0.004);
        if (def.lps) this.pyro += 0.012;
        this.spark(p.x, p.y, '#ff9f43', 5);
        this.pop(p.x, p.y - 8, '보체 MAC', '#ff9f43', 'mac', 3);
        this.once('mac' + def.id, 'innate', `보체가 ${def.name} 표면에 막공격복합체(MAC)를 만들어 구멍을 뚫음` + (def.gram === '-' ? ' (그람 음성균은 특히 취약)' : ''));
        this.killPath(p);
        return;
      }
      if (!p.opso && pr((def.capsule ? 0.06 : 0.7) * this.comp, dt)) p.opso = true;
      if (p.loc === 'blood' && pr(p.coat || p.opso ? 0.6 : 0.05, dt)) { this.killPath(p, 'spleen', false); }
    }

    bVaccine(p, ds, dt) {
      this.wanderTis(p, 10, ds);
      if (p.age > p.life) p.dead = true;
    }

    bRbc(p, ds, dt) {
      if (p.age > p.life) { p.dead = true; return; }
      const fAgs = this.foreignAgs(p);
      if (fAgs.length) for (const a of fAgs) this.stimAg(a, dt * 0.015, false);
      if (p.coat) {
        // 응집: 근처의 항체 결합 적혈구와 뭉침
        if (!p.mate || p.mate.dead || Math.abs(p.mate.x - p.x) > 200) p.mate = this.nearestCoatedRbc(p);
        if (p.mate) {
          const m = p.mate; const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy) || 1;
          if (d > 9) { p.x += dx / d * 40 * ds; p.y += dy / d * 40 * ds; }
          if (d < 14) {
            p.clump = true;
            if (!this.flags['agg' + p.drop]) {
              this.flags['agg' + p.drop] = true;
              const names = fAgs.filter(a => this.tit[a] > 0.05).map(a => '항-' + (a === 'D' ? 'D(Rh)' : a));
              this.addLog('danger', `${names.join('·')} 항체가 적혈구끼리 다리를 놓아 응집(덩어리) 발생`);
              this.pop(p.x, p.y - 12, '응집!', '#ff6b6b');
            }
          }
        }
        this.flow(p, ds, 0.85);
        // IgM(ABO)은 보체로 혈관 내 용혈, IgG(Rh)는 비장에서 제거
        let igm = 0, igg = 0;
        for (const a of fAgs) { const r = this.ag[a]; if (r) { if (a !== 'D') igm += r.igm; igg += r.igg * r.aff + (a === 'D' ? r.igm : 0); } }
        const lysis = (igm > 0.3 ? 1.6 : 0.15) * this.comp;
        if (pr(lysis, dt)) {
          p.dead = true; this.comp = Math.max(0, this.comp - 0.006);
          this.health -= 0.5; this.dmgBy.hemo += 0.5; this.pyro += 0.03;
          this.spark(p.x, p.y, '#e5484d', 8);
          this.pop(p.x, p.y - 10, '보체 용혈', '#ff6b6b', 'lys', 2);
          this.once('lysis' + p.drop, 'danger', '보체가 응집된 적혈구 막을 뚫어 혈관 내 용혈 → 헤모글로빈 방출, 발열·오한');
          return;
        }
        if (pr(igg > 0.3 ? 0.7 : 0.05, dt)) {
          p.dead = true; this.health -= 0.1; this.dmgBy.hemo += 0.1;
          this.pop(p.x, p.y - 10, '비장 제거', '#ffb3b3', 'spl', 2.5);
          this.once('spleen' + p.drop, 'adaptive', 'IgG가 붙은 적혈구를 비장 대식세포가 제거 (혈관 외 용혈)');
        }
      } else this.flow(p, ds);
    }
    nearestCoatedRbc(p) {
      let best = null, bd = 60 * 60;
      for (const q of this.paths) {
        if (q === p || q.dead || !q.coat || q.def.beh !== 'rbc') continue;
        const d = dist2(p, q); if (d < bd) { bd = d; best = q; }
      }
      return best;
    }

    bMalaria(p, ds, dt) {
      const L = IMM.LIVER;
      if (p.st === 'spz') {
        if (p.coat) { this.killPath(p, null, false); return; }
        const d = this.seek(p, L.x + rr(-30, 30), L.y + rr(-20, 20), 120, ds);
        if (d < 30) { p.st = 'liver'; p.t = 0; p.x = L.x + rr(-35, 35); p.y = L.y + rr(-28, 28);
          this.once('liver' + this.getEp(p.ags[0]), 'info', '말라리아 원충이 간세포 안에 숨어 증식 중 (면역 반응이 거의 없음)'); }
        return;
      }
      if (p.st === 'liver') {
        p.t += dt;
        if (p.t >= 3) {
          p.dead = true;
          for (let i = 0; i < 6 && this.paths.length < PATH_CAP; i++) {
            const m = this.newPath(p.def, p.ags, rr(1050, 1150), rr(Z.bloodTop + 10, Z.bloodBot - 10));
            m.st = 'mero'; m.loc = 'blood'; m.life = 0.8; this.paths.push(m);
          }
          this.once('mero' + this.getEp(p.ags[0]), 'danger', '간에서 분열소체(메로조이트)가 혈액으로 쏟아져 나와 적혈구를 침입하기 시작');
        }
        return;
      }
      // 분열소체
      this.flow(p, ds);
      this.dmg += p.def.tox * 0.3;
      if (p.age > p.life) { p.dead = true; return; }
      this.stimAg(p.ags[0], dt * 0.03, false);
      if (p.coat) { if (pr(3, dt)) this.killPath(p, null, false); return; }
      let best = null, bd = 140 * 140;
      for (const r of this.rbcs) { if (r.dead || r.inf) continue; const d = dist2(r, p); if (d < bd) { bd = d; best = r; } }
      if (best) {
        const d = this.seek(p, best.x, best.y, 110, ds);
        if (d < 8 && pr(40, dt)) { best.inf = { t: rr(0, 0.15), ag: p.ags[0] }; p.dead = true; }
      }
    }

    updateRbc(ds, dt) {
      let alive = 0, inf = 0;
      for (const r of this.rbcs) {
        if (r.dead) { r.regen += dt; if (r.regen > 1 && pr(0.35, dt)) { Object.assign(r, this.newRbc(rr(0, 40))); } continue; }
        alive++;
        this.flow(r, ds, 0.95); r.rot += ds;
        if (r.inf) {
          inf++;
          r.inf.t += dt;
          this.dmg += 0.012;
          this.stimAg(r.inf.ag, dt * 0.02, false);
          const t = this.titer(r.inf.ag);
          if (pr(0.1 + 0.25 * t, dt)) {
            r.dead = true; r.regen = 0; this.health -= 0.08; this.dmgBy.anemia += 0.08;
            this.pop(r.x, r.y - 10, '비장 제거', '#ffb3b3', 'mspl', 3);
            continue;
          }
          if (r.inf.t >= 2) {
            r.dead = true; r.regen = 0;
            for (let i = 0; i < 6 && this.paths.length < PATH_CAP; i++) {
              const m = this.newPath(IMM.DEF.malaria, [r.inf.ag], r.x + rr(-5, 5), r.y + rr(-5, 5));
              m.st = 'mero'; m.loc = 'blood'; m.life = 0.8; this.paths.push(m);
            }
            this.pyro += 0.06; this.health -= 0.1; this.dmgBy.anemia += 0.1;
            this.spark(r.x, r.y, '#e54666', 6);
            this.pop(r.x, r.y - 10, '적혈구 파열', '#ff6b8b', 'mburst', 2);
            this.once('mcycle', 'danger', '감염 적혈구가 한꺼번에 터지며 고열 발작 (약 2일 주기 반복) · 적혈구 속 원충은 항체가 닿지 않음');
          }
        }
      }
      this.stats.rbc = alive; this.stats.rbcInf = inf;
    }

    bTrypano(p, ds, dt) {
      const def = p.def;
      if (p.loc === 'tis') { p.y += 40 * ds; if (p.y > Z.bloodTop + 6) p.loc = 'blood'; return; }
      this.flow(p, ds, 0.7);
      p.vy += Math.sin(this.time * 8 + p.ph) * 30 * ds;
      this.dmg += def.tox;
      this.stimAg(p.ags[0], dt * 0.012, false);
      if (p.coat && pr(3 * this.comp + 0.5, dt)) {
        this.comp = Math.max(0, this.comp - 0.002);
        this.spark(p.x, p.y, '#ff9f43', 4);
        this.pop(p.x, p.y - 8, '항체+보체 용해', '#ff9f43', 'tryk', 3);
        this.killPath(p, null, false); return;
      }
      const cnt = this.counts[def.id] || 0;
      p.t += dt;
      if (p.t >= def.dbl && cnt < def.cap && this.paths.length < PATH_CAP) {
        p.t = rr(-0.1, 0.1);
        let ag = p.ags[0];
        if (rnd() < 0.0007 && this.variant.tryp < 14) {
          this.variant.tryp++; ag = 'tryp:' + this.variant.tryp;
          this.addLog('danger', `트리파노소마가 표면 단백질을 VSG-${this.variant.tryp}형으로 교체 (항원 변이) → 기존 항체로 인식 불가`);
        }
        const q = this.newPath(def, [ag], p.x - 4, p.y + rr(-4, 4)); q.loc = 'blood';
        this.paths.push(q); this.counts[def.id] = cnt + 1;
      }
    }

    bAmoeba(p, ds, dt) {
      const def = p.def;
      this.wanderTis(p, 6, ds);
      p.vy -= 2 * ds;
      this.dmg += def.tox * (p.coat ? 0.5 : 1);
      this.stimAg(p.ags[0], dt * 0.03, false);
      this.inflam = Math.min(1, this.inflam + 0.03 * dt);
      if (p.coat) { p.hp -= 1.5 * this.comp * dt; if (rnd() < 0.02) this.spark(p.x, p.y, '#ff9f43', 3); }
      // 접촉한 세포를 녹임
      const kill = p.coat ? 1 : 3;
      if (p.y < EPI_YMAX + 14) {
        const c = this.epiAt(p.x, p.y);
        if (c && c.st === 'ok' && pr(kill, dt)) { this.cellDie(c, 0.2); this.pop(c.x, c.y - 10, '세포 용해', '#12a594', 'amk', 3); }
      }
      const cnt = this.counts[def.id] || 0;
      p.t += dt * Math.max(0, 1 - cnt / def.cap);
      if (p.t >= def.dbl && cnt < def.cap && this.paths.length < PATH_CAP) {
        p.t = 0; const q = this.newPath(def, p.ags, p.x + rr(-10, 10), p.y + rr(-10, 10)); q.hp = 6; q.loc = 'tis';
        this.paths.push(q); this.counts[def.id] = cnt + 1;
      }
      if (p.hp <= 0) {
        this.killPath(p);
        this.spark(p.x, p.y, '#12a594', 10);
        this.once('amdead' + this.getEp(p.ags[0]), 'innate', '여러 면역세포·보체의 협공으로 이질아메바 영양체 파괴');
      }
    }

    // ───────── 면역 세포 ─────────
    ease(p) {
      const d = p.def;
      let e = 0;
      if (d.cat === 'bact') { e = 1; if (d.capsule && !p.coat) e = 0.035; if (p.coat) e *= 2.5; if (p.opso) e *= 2; }
      else if (d.cat === 'virus') e = p.coat ? 0.8 : 0.1;
      else if (d.beh === 'vaccine') e = 0.6;
      else if (d.beh === 'trypano') e = p.coat ? 1 : 0.04;
      else if (p.st === 'mero') e = p.coat ? 1 : 0.1;
      return e;
    }

    updateCell(c, ds, dt) {
      c.age += dt;
      switch (c.type) {
        case 'neut': return this.cNeut(c, ds, dt);
        case 'macro': return this.cMacro(c, ds, dt);
        case 'dc': return this.cDc(c, ds, dt);
        case 'nk': return this.cNk(c, ds, dt);
        case 'ctl': return this.cCtl(c, ds, dt);
      }
    }

    migrate(c, ds, sp) {
      const d = this.seek(c, c.tx, c.ty, sp, ds);
      if (d < 4) { c.loc = c.next; return true; }
      return false;
    }

    phago(c, p, dt, rate) {
      if (p.kind) { // 잔해
        if (pr(rate, dt)) {
          p.dead = true;
          if (p.ag && c.type === 'macro') this.stimAg(p.ag, 0.012, true);
          return true;
        }
        return false;
      }
      if (p.def.beh === 'amoeba') return false;
      const e = this.ease(p);
      if (e <= 0 || !pr(rate * e, dt)) return false;
      c.eaten++;
      this.spark(p.x, p.y, c.type === 'neut' ? '#f1f1f1' : '#f5d0a9', 4);
      if (p.def.beh === 'tb' && c.type === 'macro') {
        if (c.act > 0 && rnd() < 0.85) this.killPath(p, null, false);
        else {
          p.dead = true; c.intra += 1;
          this.once('tbin' + this.getEp(p.ags[0]), 'danger', '결핵균이 대식세포에 먹혔지만 식포 안에서 살아남아 증식 (세포내 기생)');
        }
      } else this.killPath(p, null, false);
      this.pop(p.x, p.y - 8, '탐식', c.type === 'neut' ? '#e8e8e8' : '#f5d0a9', 'phago' + c.type, 2.2);
      this.pyro += c.type === 'macro' ? 0.01 : 0.004;
      this.inflam = Math.min(1, this.inflam + (c.type === 'macro' ? 0.004 : 0.0015));
      if (c.type === 'macro') for (const a of this.foreignAgs(p)) this.stimAg(a, 0.03, p.def.cat === 'virus' || p.def.beh === 'tb');
      if (p.def.id === 'staph' && c.type === 'neut' && rnd() < p.def.toxNeutro) {
        c.dead = true;
        this.debris.push({ x: c.x, y: c.y, ag: null, kind: 'pus', t: 0, dead: false });
        this.once('pus' + this.getEp('staph'), 'innate', '포도상구균 독소(류코시딘)가 호중구를 죽임 → 죽은 호중구가 쌓여 고름(농양) 형성');
      }
      return true;
    }

    neutTarget(p) {
      if (p.kind) return false;
      const d = p.def;
      if (d.beh === 'amoeba') return true;
      if (d.beh === 'tb') return false; // 결핵균은 밀랍 같은 세포벽 때문에 호중구에 잘 죽지 않음
      return this.ease(p) > 0.03 && (d.cat !== 'virus' || p.coat) && d.beh !== 'vaccine';
    }

    cNeut(c, ds, dt) {
      if (c.loc === 'blood') {
        this.flow(c, ds, 0.9);
        const p = this.grid.nearest(c.x, c.y, 70, q => q.loc === 'blood' && this.neutTarget(q));
        if (p) { if (Math.hypot(p.x - c.x, p.y - c.y) < 10) this.phago(c, p, dt, 40); else this.seek(c, p.x, p.y, 50, ds); }
        if (this.tisList.length && this.inflam > 0.04 && pr(this.inflam * 5, dt)) {
          const q = this.tisList[(rnd() * this.tisList.length) | 0];
          c.loc = 'mig'; c.next = 'tis'; c.age = 0; c.tx = q.x + rr(-20, 20); c.ty = clamp(q.y + rr(-20, 20), Z.tisTop + 8, Z.bloodTop - 8); c.tgt = q;
          if (this.once('extrav' + Math.floor(this.day / 6), 'innate', '염증 신호(히스타민·사이토카인) → 혈관 확장, 호중구가 혈관 벽을 빠져나와 조직으로 이동')) this.pop(c.x, Z.bloodTop - 6, '혈관 밖 유출', '#e8e8e8');
        }
        if (c.age > 6) c.dead = true;
        return;
      }
      if (c.loc === 'mig') { this.migrate(c, ds, 110); return; }
      // 조직
      let p = c.tgt && !c.tgt.dead && (c.tgt.st === 'free') ? c.tgt : null;
      if (!p) {
        p = this.grid.nearest(c.x, c.y, 400, q => q.loc === 'tis' && this.neutTarget(q));
        if (!p && this.tisList.length) { const q = this.tisList[(rnd() * this.tisList.length) | 0]; if (this.neutTarget(q)) p = q; }
        c.tgt = p;
      }
      if (p) {
        const d = this.seek(c, p.x, p.y, 70, ds);
        if (d < (p.def.beh === 'amoeba' ? 14 : 9)) {
          if (p.def.beh === 'amoeba') {
            p.hp -= 1.5 * dt;
            if (pr(p.coat ? 0.3 : 1, dt)) {
              c.dead = true; this.pop(c.x, c.y - 8, '호중구 용해됨', '#12a594', 'amn', 3);
              this.debris.push({ x: c.x, y: c.y, ag: null, kind: 'pus', t: 0, dead: false });
            }
          } else this.phago(c, p, dt, 80);
        }
      } else this.wanderTis(c, 18, ds);
      if (c.age > 3 || c.eaten >= 10) {
        c.dead = true; this.debris.push({ x: c.x, y: c.y, ag: null, kind: 'pus', t: 0, dead: false });
      }
    }

    cMacro(c, ds, dt) {
      if (c.loc === 'blood') { // 단핵구
        this.flow(c, ds, 0.9);
        if (pr(2, dt)) { const q = this.tisList.length ? this.tisList[(rnd() * this.tisList.length) | 0] : null; c.loc = 'mig'; c.next = 'tis'; c.tx = q ? q.x + rr(-30, 30) : clamp(c.x + rr(-60, 60), 20, 1000); c.ty = q ? clamp(q.y + rr(-20, 30), Z.tisTop + 8, Z.bloodTop - 8) : rr(200, Z.bloodTop - 20); }
        return;
      }
      if (c.loc === 'mig') { this.migrate(c, ds, 60); return; }
      if (c.act > 0) c.act -= dt;
      const tbR = this.ag[this.tbAg()] ;
      // 결핵균 세포내 감염
      if (c.intra > 0) {
        if (tbR && tbR.th > 3 && c.act <= 0 && !c.gran && pr(tbR.th / 30, dt)) {
          c.act = 4;
          this.once('th1' + tbR.ep, 'adaptive', '보조 T세포(Th1)가 인터페론-γ로 감염 대식세포를 활성화 → 식포 속 결핵균 소화');
        }
        if (c.gran) {
          if (this.helpF < 0.3) { c.gran = false; this.addLog('danger', '보조 T세포 부족 → 육아종이 무너지며 잠복 결핵 재활성화'); }
          else { c.intra = Math.max(1, c.intra - c.intra * 0.4 * dt); this.tbLatent = true; }
        } else if (c.act > 0) {
          c.intra -= c.intra * 1.4 * dt;
          if (c.intra < 0.6) { c.intra = 0; this.pop(c.x, c.y - 10, '결핵균 소화', '#a18072', 'tbk', 3); }
        } else {
          c.intra *= Math.exp(dt * 0.63 / 1.1);
          if (tbR) tbR.stim = Math.min(3, tbR.stim + 0.04 * dt), tbR.stimI = Math.min(3, tbR.stimI + 0.04 * dt);
        }
        if (c.intra > 10 && !c.gran) {
          const n = Math.floor(c.intra);
          for (let i = 0; i < n && this.paths.length < PATH_CAP; i++) {
            const p = this.newPath(IMM.DEF.tb, [this.tbAg()], c.x + rr(-8, 8), c.y + rr(-8, 8)); this.paths.push(p);
          }
          c.dead = true; this.health -= 0.5; this.dmgBy.load += 0.5;
          this.debris.push({ x: c.x, y: c.y, ag: this.tbAg(), kind: 'cell', t: 0, dead: false });
          this.pop(c.x, c.y - 10, '대식세포 파열', '#a18072', 'mburst', 3);
          return;
        }
        // 육아종 형성 여부
        if (!c.gran && tbR && tbR.th > 3) {
          let nb = 0; for (const o of this.cells) if (o !== c && o.type === 'macro' && o.loc === 'tis' && !o.intra && dist2(o, c) < 36 * 36) nb++;
          if (nb >= 3) { c.gran = true; this.once('gran' + tbR.ep, 'adaptive', '대식세포들이 감염 대식세포를 둘러싸 육아종 형성 → 결핵균을 가둠 (잠복 결핵)'); }
        }
        this.wanderTis(c, 3, ds);
        return;
      }
      // 육아종 형성: 활성 Th1이 있으면 감염 대식세포 쪽으로 모임
      if (tbR && tbR.th > 3 && this.macroInf.length) {
        if (!c.granT || c.granT.dead || c.granT.intra <= 0) {
          c.granT = null;
          let best = null, bd = 260 * 260;
          for (const m of this.macroInf) {
            if (m.dead || m.gran) continue;
            const d = dist2(m, c); if (d >= bd) continue;
            let k = 0; for (const o of this.cells) if (o.granT === m) k++;
            if (k < 4) { bd = d; best = m; }
          }
          c.granT = best;
        }
        const g = c.granT;
        if (g && !g.gran) { if (dist2(g, c) > 22 * 22) this.seek(c, g.x, g.y, 22, ds); return; }
        if (g && g.gran) { if (dist2(g, c) > 26 * 26) this.seek(c, g.x, g.y, 22, ds); }
      }
      if (c.busy > 0) { c.busy -= dt; this.wanderTis(c, 5, ds); return; }
      let p = this.grid.nearest(c.x, c.y, 160, q => (q.kind ? true : q.loc === 'tis' && (this.ease(q) > 0 || q.def.beh === 'amoeba')));
      if (p) {
        const d = this.seek(c, p.x, p.y, 24, ds);
        if (d < (p.def && p.def.beh === 'amoeba' ? 16 : 12)) {
          if (p.def && p.def.beh === 'amoeba') {
            p.hp -= (c.act > 0 || p.coat ? 2 : 0.6) * dt;
            if (pr(0.4, dt)) { c.dead = true; this.pop(c.x, c.y - 8, '대식세포 용해됨', '#12a594', 'amm', 3); }
          } else if (this.phago(c, p, dt, p.kind ? 30 : 40)) c.busy = 0.03;
        }
      } else {
        // 화학 주성: 멀리 있는 병원체 쪽으로 천천히 이동
        if (!c.chase || c.chase.dead || c.chase.loc !== 'tis') c.chase = this.tisList.length && rnd() < 0.5 ? this.tisList[(rnd() * this.tisList.length) | 0] : null;
        if (c.chase && c.chase.def.beh !== 'vaccine') this.seek(c, c.chase.x, c.chase.y, 16, ds); else this.wanderTis(c, 9, ds);
      }
      if (c.eaten > 40) { c.dead = true; }
    }
    tbAg() { return 'tb'; }

    cDc(c, ds, dt) {
      if (c.loc === 'mig') { this.migrate(c, ds, 90); return; }
      if (c.loc === 'tolN') {
        const arrived = this.migrate(c, ds, 110);
        if (arrived) this.present(c);
        return;
      }
      if (c.loc === 'pres') { c.t += dt; if (c.t > 1.4) c.dead = true; return; }
      // 조직에서 항원 수집
      const p = this.grid.nearest(c.x, c.y, 130, q => q.kind ? !!q.ag : (q.loc === 'tis' && q.def.beh !== 'amoeba' && this.foreignAgs(q).length > 0));
      if (p) {
        const d = this.seek(c, p.x, p.y, 26, ds);
        if (d < 11 && pr(25, dt)) {
          if (p.kind) { c.cargo = p.ag; p.dead = true; }
          else { c.cargo = this.foreignAgs(p)[0]; if (p.def.beh !== 'tb') this.killPath(p, null, false); else p.dead = true; }
          c.loc = 'tolN';
          const tz = IMM.LN.tZone;
          c.tx = rr(tz.x0 + 30, tz.x1 - 30); c.ty = rr(tz.y0 + 30, tz.y1 - 30);
          this.pop(c.x, c.y - 10, '항원 포획 → 림프절로', '#ffd36e', 'dccap', 3);
          this.once('dccap' + this.getEp(c.cargo) + c.cargo, 'innate', `수지상세포가 ${IMM.agName(c.cargo)}을(를) 포획하고 림프관을 따라 림프절로 이동`);
        }
      } else this.wanderTis(c, 8, ds);
      if (c.age > 12) c.dead = true;
    }

    present(c) {
      c.loc = 'pres'; c.t = 0;
      const r = this.getAg(c.cargo); if (!r) return;
      this.stimAg(c.cargo, 0.9, true);
      const key = 'pres' + r.ep + r.id;
      if (!this.flags[key]) {
        this.flags[key] = true;
        this.addLog('adaptive', `수지상세포가 림프절에서 ${r.name} 조각을 MHC II에 얹어 보조 T세포에 제시` + (r.intra ? ' (MHC I으로 세포독성 T세포에도 교차 제시)' : ''));
        this.pop(c.x, c.y - 14, 'MHC II 항원 제시', '#ffd36e');
      }
    }

    cNk(c, ds, dt) {
      if (c.loc === 'blood') {
        this.flow(c, ds, 0.9);
        const need = this.infList.length > 0 && (this.ifn > 0.1 || this.infList.some(e => e.def.mhcDown));
        if (need && pr(1.2 * (this.ifn + 0.4), dt)) { const e = this.infList[(rnd() * this.infList.length) | 0]; c.loc = 'mig'; c.next = 'tis'; c.age = 0; c.tx = e.x; c.ty = e.y + 14; }
        if (c.age > 10) c.dead = true;
        return;
      }
      if (c.loc === 'mig') { this.migrate(c, ds, 70); return; }
      let best = null, bd = 400 * 400;
      for (const e of this.infList) { if (e.st !== 'inf') continue; const d = dist2(e, c); if (d < bd) { bd = d; best = e; } }
      if (best) {
        const d = this.seek(c, best.x, best.y + 8, 40, ds);
        if (d < 12) {
          const md = best.def.mhcDown;
          if (pr(md ? 8 : 1.2 * (1 + this.ifn), dt)) {
            this.cellDie(best, 0.05);
            this.spark(best.x, best.y, '#ff5fa2', 6);
            this.pop(best.x, best.y - 10, md ? 'NK: MHC I 없음 → 제거' : 'NK 세포 공격', '#ff5fa2', 'nk', 2.5);
            if (md) this.once('nkmhc' + this.getEp(best.ag), 'innate', 'NK세포가 MHC I이 사라진 감염 세포를 "자기 표지 상실"로 인식해 제거 (세포독성 T세포는 못 봄)');
            else this.once('nk1' + Math.floor(this.day / 10), 'innate', '인터페론으로 활성화된 NK세포가 바이러스 감염 세포를 공격');
          }
        }
      } else this.wanderTis(c, 15, ds);
      if (c.age > 5) c.dead = true;
    }

    ctlTargets(ag) {
      const out = [];
      for (const e of this.infList) if (e.st === 'inf' && e.ag === ag) out.push(e);
      for (const t of this.thInf) if (t.st === 'inf' && t.ag === ag && !t.latent) out.push(t);
      if (ag === 'tb') for (const m of this.macroInf) if (!m.dead && !m.gran) out.push(m);
      return out;
    }

    cCtl(c, ds, dt) {
      if (c.loc === 'mig') { this.migrate(c, ds, 80); return; }
      const r = this.ag[c.ag];
      if (!r || c.age > 6) { c.dead = true; return; }
      const tg = this.ctlTargets(c.ag);
      let best = null, bd = 1e9;
      for (const e of tg) { const d = dist2(e, c); if (d < bd) { bd = d; best = e; } }
      if (best) {
        const d = this.seek(c, best.x, best.y + (best.type ? 0 : 7), 75, ds);
        if (d < 11) {
          const md = best.def && best.def.mhcDown;
          if (pr(md ? 1 : 14, dt)) {
            this.spark(best.x, best.y, '#ff4d4d', 7);
            if (best.type === 'macro') { best.dead = true; this.debris.push({ x: best.x, y: best.y, ag: 'tb', kind: 'cell', t: 0, dead: false }); }
            else if (best.st === 'inf' && best.def) this.cellDie(best, 0.03);
            else if (best.st === 'inf') { best.st = 'dead'; best.ag = null; if (this.hiv) this.hiv.I *= 0.97; }
            this.pop(best.x, best.y - 10, md ? 'CTL (MHC I 부족)' : 'CTL: MHC I 인식 → 세포 자멸사', '#ff6b6b', 'ctl', 2.5);
            this.once('ctlk' + r.ep + r.id, 'adaptive', `세포독성 T세포가 감염 세포 표면 MHC I의 ${r.name} 조각을 인식 → 퍼포린·그랜자임으로 세포 자멸사 유도`);
          }
        }
      } else {
        if (c.y > Z.bloodTop) this.seek(c, c.x, Z.tisTop + 120, 60, ds); else this.wanderTis(c, 20, ds);
      }
    }

    // ───────── 적응 면역 ─────────
    updateAdaptive(dt) {
      const hf = this.helpF;
      // 림프 배액·비장을 통한 항원 노출
      for (const p of this.tisList) {
        if (p.def.beh === 'vaccine') continue;
        for (const a of p.ags) this.stimAg(a, dt * 0.004, p.def.cat === 'virus');
      }
      for (const t of this.thInf) if (t.st === 'inf' && t.ag) this.stimAg(t.ag, dt * 0.02, true);

      for (const id in this.ag) {
        const r = this.ag[id];
        r.stim -= r.stim * 0.45 * dt; r.stimI -= r.stimI * 0.45 * dt;
        const sens = r.memB >= 1 || r.memT > 1 ? 3 : 1; // 기억 세포는 적은 항원에도 반응
        const s = Math.min(1, r.stim * sens), sI = Math.min(1, r.stimI * sens);
        const on = s > 0.03;
        if (on && !r.active) {
          r.active = true; r.ep++;
          r.capPg = Math.min(150, 18 + r.memB * 8); r.capTh = 40 + r.memT * 3;
          r.sw = 0;
          if (r.memB > 1 || r.memT > 1) {
            this.addLog('memory', `${r.name}: 기억 세포가 즉시 반응 → 2차 면역 반응 (더 빠르고 강함)`);
          }
        }
        if (!on && r.active && r.th < 0.5 && r.pg < 0.5) { r.active = false; r.prime = 0; }
        if (r.natural) { r.igm = Math.max(r.igm, 3); }

        // 보조 T세포
        if (on && r.prime < 1) {
          r.prime += dt * s * 0.5 * (r.memT > 1 ? 5 : 1) * (0.2 + 0.8 * hf);
          if (r.prime >= 1) {
            r.th = Math.max(r.th, 1 + r.memT);
            if (r.memT > 1) this.addLog('memory', `기억 T세포가 ${r.name}을(를) 곧바로 알아봄 → 보조 T세포 빠르게 증식`);
            else this.addLog('adaptive', `${r.name} 특이 보조 T세포(CD4) 활성화 → 클론 선택·증식, 사이토카인 분비`);
          }
        }
        const thCap = (r.capTh || 40) * Math.max(0.05, hf);
        if (r.prime >= 1 && on) r.th += 1.5 * r.th * (1 - r.th / thCap) * s * dt;
        else r.th -= r.th * 0.4 * dt;
        if (r.th > thCap) r.th = thCap;

        // 세포독성 T세포
        if (r.intra) {
          const onI = sI > 0.03;
          if (onI && r.prime >= 1 && (r.th > 2 || r.memC > 1)) {
            if (r.ctl < 1) {
              r.ctl = 1 + r.memC;
              if (r.memC > 1) this.addLog('memory', `기억 세포독성 T세포가 ${r.name} 감염 세포를 바로 찾아 나섬`);
              else this.addLog('adaptive', `${r.name} 특이 세포독성 T세포(CD8) 활성화 → 클론 증식 후 감염 부위로 출동`);
            }
            r.ctl += 1.6 * r.ctl * (1 - r.ctl / (50 + r.memC * 2)) * sI * (0.25 + 0.75 * hf) * dt;
          } else r.ctl -= r.ctl * 0.4 * dt;
        }

        // B세포 → 형질세포
        if (on && r.th > 2) {
          if (r.pm < 1 && r.memB < 1) {
            r.pm = 1; this.addLog('adaptive', `보조 T세포의 도움으로 ${r.name} 특이 B세포 활성화 → 형질세포가 IgM 항체 분비 시작`);
          }
          if (r.pm >= 1) r.pm += 1.3 * r.pm * (1 - r.pm / 30) * s * dt;
          if (r.sw < 1) {
            r.sw += dt * 0.27 * Math.min(1, r.th / 8) * (r.memB >= 1 ? 6 : 1);
            if (r.sw >= 1) {
              r.pg = Math.max(r.pg, 1 + r.memB * 0.6);
              if (r.memB >= 1) this.addLog('memory', `기억 B세포가 곧바로 IgG 형질세포로 분화 → 항체가 빠르게 대량 생산`);
              else this.addLog('adaptive', `${r.name}: 클래스 전환(IgM→IgG)과 친화도 성숙 → IgG 항체 생산`);
            }
          }
        } else if (!on) {
          r.pm -= r.pm * 0.35 * dt;
        }
        if (r.sw >= 1 && on) {
          const help = Math.min(1, 0.3 + r.th / 10);
          r.pg += 1.5 * r.pg * (1 - r.pg / (r.capPg || 18)) * s * help * dt;
          r.aff = Math.min(2, r.aff + 0.04 * dt);
        } else r.pg -= r.pg * 0.35 * dt;
        if (r.pm < 0) r.pm = 0; if (r.pg < 0) r.pg = 0; if (r.th < 0) r.th = 0; if (r.ctl < 0) r.ctl = 0;

        // 항체
        r.igm += (r.pm * 0.12 - r.igm * 0.4) * dt;
        r.igg += (r.pg * 0.15 - r.igg * 0.22) * dt;
        if (r.igm < 0) r.igm = 0; if (r.igg < 0) r.igg = 0;

        // 기억 세포
        const mb = 0.35 * (r.pg + r.pm * 0.3);
        if (r.sw >= 1 && mb > r.memB) r.memB = Math.min(30, mb);
        if (r.th * 0.3 > r.memT) r.memT = Math.min(15, r.th * 0.3);
        if (r.ctl * 0.3 > r.memC) r.memC = Math.min(15, r.ctl * 0.3);
        if (r.memB >= 3 && !r.memLogged) { r.memLogged = true; this.addLog('memory', `${r.name} 기억 B세포·기억 T세포 형성 → 다음 침입 때 2차 면역 반응 준비`); }

        // 제거 완료 판정
        const live = (this.agCount[id] || 0) + this.infList.filter(e => e.ag === id).length + this.thInf.filter(t => t.ag === id).length + (id === 'tb' ? this.macroInf.length : 0) + (this.hiv && this.hiv.cur === id ? 1 : 0);
        if (live > 0) r.cleared = false;
        else if (!r.cleared) {
          r.cleared = true;
          if (!r.natural) this.addLog('ok', `${r.name} 보유 병원체·항원 모두 제거됨`);
        }
      }
      // 시각용 항체 입자
      let plasma = 0; let tops = [];
      for (const id in this.ag) { const r = this.ag[id]; const pl = r.pm + r.pg; plasma += pl; if (pl > 0.5) tops.push(r); }
      this.stats.plasma = plasma;
      this.abT += this.ds * Math.min(30, plasma * 0.6);
      const pz = IMM.LN.pZone;
      while (this.abT > 1 && tops.length) {
        this.abT -= 1;
        if (this.abp.length > 90) continue;
        const r = tops[(rnd() * tops.length) | 0];
        this.abp.push({ x: rr(pz.x0 + 10, pz.x1 - 10), y: rr(pz.y0 + 10, pz.y1 - 10), vx: rr(-30, 30), vy: rr(-110, -60), col: r.color, t: 0, life: rr(3, 5), rot: rnd() * 6 });
      }
      if (!tops.length) this.abT = 0;
    }

    // ───────── 선천 면역 전신 상태 ─────────
    updateInnate(ds, dt) {
      // 비만세포
      for (const m of this.mast) {
        m.cd -= dt; m.fire = Math.max(0, m.fire - ds);
        if (m.cd <= 0) {
          const p = this.grid.nearest(m.x, m.y, 110, q => q.loc === 'tis' && !q.kind && q.def.beh !== 'vaccine');
          if (p) {
            m.cd = 1; m.fire = 1.2;
            this.inflam = Math.min(1, this.inflam + 0.07);
            this.pop(m.x, m.y - 12, '히스타민', '#ff9f9f', 'hist', 3);
            this.once('mast' + Math.floor(this.day / 8), 'innate', '비만세포가 히스타민 분비 → 혈관 확장·투과성 증가 (발적·부기·열감)');
          }
        }
      }
      // 헤르페스 재활성화
      if (this.latentHerpes > 0 && this.day >= this.herpesNext) {
        this.herpesNext = this.day + rr(14, 24) * (this.helpF < 0.3 ? 0.4 : 1);
        const n = 3 + this.latentHerpes * 2;
        for (let i = 0; i < n; i++) { const p = this.newPath(IMM.DEF.herpes, ['herpes'], rr(40, 150), rr(EPI_Y0, EPI_YMAX)); this.paths.push(p); }
        this.addLog('danger', '신경절에 잠복해 있던 단순포진 바이러스 재활성화 → 피부·점막으로 다시 나옴');
        this.pop(IMM.GANGLION.x, IMM.GANGLION.y - 20, '재활성화', '#f76b15');
      }
      // 기회 감염
      if (this.oppOn && this.day >= this.nextOpp) {
        this.nextOpp = this.day + rr(4, 8);
        const opts = ['tb', 'pneumo', 'herpes', 'salm'];
        const id = opts[(rnd() * opts.length) | 0];
        const def = IMM.DEF[id];
        const n = Math.round(def.n * 0.6);
        for (let i = 0; i < n; i++) { const p = this.newPath(def, [def.ag], rr(40, 950), rr(Z.tisTop + 10, Z.tisTop + 80)); this.initBeh(p); this.paths.push(p); }
        this.addLog('danger', `기회 감염: 평소라면 쉽게 막았을 ${def.name}이(가) 약해진 면역을 틈타 증식`);
      }
      // 조직 손상·병원체 패턴(PAMP) 인식 → 염증
      this.inflam = Math.min(1, this.inflam + Math.min(0.5, this.tisList.length * 0.003) * dt);
      // 사이토카인·발열
      this.pyro += 0.12 * Math.min(2, this.ifn) * dt;
      this.pyro -= this.pyro * 0.7 * dt;
      const target = 36.5 + 4.8 * (1 - Math.exp(-this.pyro * 0.9));
      this.temp += (target - this.temp) * Math.min(1, 1.5 * dt);
      this.ifn -= this.ifn * 0.7 * dt;
      this.inflam -= this.inflam * 0.45 * dt;
      this.comp += (1 - this.comp) * 0.3 * dt;
      const t = this.temp;
      if (t > 38) this.once('fev38_' + Math.floor(this.day / 10), 'innate', `발열 ${t.toFixed(1)}℃: 대식세포의 사이토카인(IL-1·TNF)이 시상하부 체온 기준을 올림 → 병원체 증식 억제, 면역세포 활성 증가`);
      if (t > 40) this.once('fev40_' + Math.floor(this.day / 10), 'danger', `고열 ${t.toFixed(1)}℃: 몸 자체의 단백질과 조직도 손상되기 시작`);
      if (this.ifn > 0.35) this.once('ifn' + Math.floor(this.day / 10), 'innate', '감염 세포가 인터페론 분비 → 주변 세포가 항바이러스 상태가 되고 NK세포 활성화');
    }

    // ───────── 세포 보충 (골수·흉선) ─────────
    recruit(dt) {
      const cnt = { neut: 0, macro: 0, dc: 0, nk: 0, ctl: {} };
      for (const c of this.cells) {
        if (c.type === 'ctl') cnt.ctl[c.ag] = (cnt.ctl[c.ag] || 0) + 1;
        else if (c.type === 'dc') { if (c.loc === 'tis' || c.loc === 'mig') cnt.dc++; }
        else cnt[c.type]++;
      }
      const sepsis = this.paths.some(p => p.loc === 'blood' && p.def.cat === 'bact');
      const nT = 22 + 110 * this.inflam + (sepsis ? 30 : 0);
      if (cnt.neut < nT && pr(90, dt)) this.addCell('neut', rr(0, 200), rr(Z.bloodTop + 10, Z.bloodBot - 10), 'blood');
      const mT = 10 + 22 * this.inflam;
      if (cnt.macro < mT && pr(8, dt)) this.addCell('macro', rr(0, 200), rr(Z.bloodTop + 10, Z.bloodBot - 10), 'blood');
      const dT = 8 + 6 * this.inflam;
      if (cnt.dc < dT && pr(3, dt)) { const c = this.addCell('dc', rr(0, 1000), Z.bloodTop + 10, 'mig'); c.next = 'tis'; c.tx = c.x; c.ty = rr(200, 390); }
      const kT = 8 + 10 * Math.min(1, this.ifn);
      if (cnt.nk < kT && pr(4, dt)) this.addCell('nk', rr(0, 200), rr(Z.bloodTop + 10, Z.bloodBot - 10), 'blood');
      // 세포독성 T세포 출동
      for (const id in this.ag) {
        const r = this.ag[id]; if (!r.intra || r.ctl < 1) continue;
        const want = Math.min(26, Math.round(r.ctl * 0.6));
        const have = cnt.ctl[id] || 0;
        if (have < want && this.ctlTargets(id).length && pr(10, dt)) {
          const tz = IMM.LN.tZone;
          const c = this.addCell('ctl', rr(tz.x0, tz.x1), rr(tz.y0, tz.y1), 'mig');
          c.ag = id; c.next = 'tis';
          const tg = this.ctlTargets(id)[0];
          c.tx = tg.x; c.ty = tg.y + 10;
        }
      }
      this.stats.neut = cnt.neut; this.stats.macro = cnt.macro; this.stats.dc = cnt.dc; this.stats.nk = cnt.nk;
      let ctl = 0; for (const k in cnt.ctl) ctl += cnt.ctl[k]; this.stats.ctl = ctl;
    }

    // ───────── 건강 ─────────
    updateHealth(dt) {
      const s = this.stats;
      let v = 0, b = 0, pr_ = 0, rb = 0;
      for (const p of this.paths) {
        if (p.dead || p.st === 'blocked') continue;
        const c = p.def.cat;
        if (c === 'virus') v++; else if (c === 'bact') b++; else if (c === 'protist') pr_++; else if (c === 'rbc') rb++;
      }
      s.virus = v; s.bact = b; s.protist = pr_; s.donor = rb;
      s.tbIntra = this.cells.reduce((a, c) => a + (c.intra || 0), 0);
      // 병원체가 많아질수록 조직 손상이 가속 (독소 누적·장기 기능 저하)
      const loadMul = 1 + (v + b + pr_ * 3 + (s.infected || 0) * 2) / 50;
      let d = this.dmg * loadMul + s.tbIntra * 0.004;
      // 중증 바이러스 폐렴: 감염 세포가 너무 많으면 호흡 기능 저하
      const sev = this.infList.filter(c => c.def && c.def.severe).length;
      if (sev > 25) { d += (sev - 25) * 0.3; this.once('ards' + Math.floor(this.day / 20), 'danger', '상피세포가 대량으로 감염·파괴 → 중증 바이러스 폐렴 (호흡 기능 저하)'); }
      const bloodBact = this.paths.reduce((a, p) => a + (p.loc === 'blood' && p.def.cat === 'bact' && !p.dead ? 1 : 0), 0);
      if (bloodBact > 25) { d += 2.5; this.once('shock' + Math.floor(this.day / 20), 'danger', '혈액 속 세균이 폭증 → 패혈성 쇼크 (혈압 저하·다발성 장기 손상)'); }
      this.dmgBy.load += d * dt;
      const infl = this.inflam > 0.7 ? (this.inflam - 0.7) * 2.5 : 0;
      const fev = this.temp > 40 ? (this.temp - 40) * 4 : 0;
      const rbcFrac = (s.rbc || 60) / 60;
      const an = rbcFrac < 0.7 ? (0.7 - rbcFrac) * 14 : 0;
      this.dmgBy.inflam += infl * dt; this.dmgBy.fever += fev * dt; this.dmgBy.anemia += an * dt;
      d += infl + fev + an;
      this.health -= d * dt;
      const load = v + b + pr_ * 3 + (s.infected || 0) + this.thInf.length;
      if (load < 3 && this.inflam < 0.4) this.health += 1.5 * dt;
      this.health = Math.min(100, this.health);
      for (const k in this.dmgBy) this.dmgBy[k] -= this.dmgBy[k] * 0.15 * dt;
      if (this.health <= 0) this.die();
    }

    die() {
      this.health = 0; this.alive = false; this.deathDay = this.day;
      const db = this.dmgBy;
      let k = 'load', m = -1; for (const key in db) if (db[key] > m) { m = db[key]; k = key; }
      let reason;
      if (this.helpF < 0.25 && this.flags.hiv1) reason = 'HIV가 보조 T세포를 고갈시켜 적응 면역 전체가 무너졌고, 기회 감염을 막지 못함 (AIDS)';
      else reason = {
        load: '병원체가 면역 반응보다 빠르게 증식해 조직이 감당할 수 없을 만큼 파괴됨',
        hemo: '대량 용혈(수혈 부적합 반응)로 쇼크와 장기 손상이 일어남',
        fever: '지나친 고열로 몸의 단백질과 장기가 손상됨',
        anemia: '적혈구가 대량 파괴되어 산소 운반이 불가능해짐 (중증 빈혈)',
        inflam: '과도한 염증(사이토카인 폭풍)이 오히려 자기 조직을 파괴함',
      }[k];
      this.deathReason = reason;
      this.addLog('danger', '면역 체계 붕괴 — ' + reason);
    }
  }

  IMM.Sim = Sim;
  IMM.DPS = DPS;
  IMM.EPI = { X0: EPI_X0, DX: EPI_DX, Y0: EPI_Y0, DY: EPI_DY, ROWS: EPI_ROWS, COLS: EPI_COLS };
})(typeof window !== 'undefined' ? window : globalThis);
