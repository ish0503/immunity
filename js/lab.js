// 돌연변이 실험실: 병원체 표면 단백질 유전자의 염기를 바꿔 변이주를 만든다
(function (G) {
  const IMM = G.IMM;
  const KEY = 'imm-mutants';
  const MAX = 12;

  // 저장해 둔 변이주 되살리기
  function loadSaved() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { list = []; }
    for (const m of list) if (m && IMM.GENES[m.key] && typeof m.seq === 'string' && m.seq.length === IMM.GENES[m.key].seq.length) IMM.makeMutant(m.key, m.seq);
  }
  function save() {
    const list = IMM.DEFS.filter(d => d.mutant).map(d => ({ key: d.mutKey, seq: d.seq }));
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* 저장 불가: 이번 화면에서만 유지 */ }
  }
  loadSaved();

  IMM.initLab = function (api) {
    const $ = (id) => document.getElementById(id);
    const dlg = $('lab');
    let key = 'flu', seq = IMM.GENES.flu.seq.split('');
    const NEXT = { A: 'T', T: 'G', G: 'C', C: 'A' };
    const show = (b, g) => (g.nuc === 'RNA' && b === 'T' ? 'U' : b);

    function buildPick() {
      const box = $('labPick'); box.innerHTML = '';
      for (const k in IMM.GENES) {
        const g = IMM.GENES[k], d = IMM.DEF[g.def];
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'lab-chip' + (k === key ? ' on' : ''); b.textContent = d.name.split(' (')[0];
        b.setAttribute('aria-pressed', String(k === key));
        b.addEventListener('click', () => { key = k; seq = g.seq.split(''); buildPick(); render(); });
        box.appendChild(b);
      }
    }

    function render() {
      const g = IMM.GENES[key], d = IMM.DEF[g.def];
      $('labGene').textContent = `${d.name} · ${g.gene}`;
      $('labNuc').textContent = g.nuc === 'RNA' ? 'RNA 유전체 (A·U·G·C)' : 'DNA 유전자 (A·T·G·C)';
      const box = $('labSeq'); box.innerHTML = '';
      const cur = seq.join(''), aa = IMM.translate(cur);
      for (let c = 0; c < g.aa.length; c++) {
        const a0 = g.aa[c], a1 = aa[c];
        const changedNt = [0, 1, 2].some(j => seq[c * 3 + j] !== g.seq[c * 3 + j]);
        const kind = !changedNt ? '' : a1 === '*' ? 'non' : a1 === a0 ? 'syn' : 'mis';
        const el = document.createElement('div'); el.className = 'codon ' + kind;
        const nts = document.createElement('div'); nts.className = 'nts';
        for (let j = 0; j < 3; j++) {
          const i = c * 3 + j;
          const b = document.createElement('button'); b.type = 'button';
          b.className = 'nt nt-' + seq[i] + (seq[i] !== g.seq[i] ? ' chg' : '');
          b.textContent = show(seq[i], g);
          b.title = `${i + 1}번째 염기 — 눌러서 바꾸기`;
          b.setAttribute('aria-label', `${i + 1}번째 염기 ${show(seq[i], g)}, 눌러서 바꾸기`);
          b.addEventListener('click', () => { seq[i] = NEXT[seq[i]]; render(); });
          nts.appendChild(b);
        }
        const lab = document.createElement('div'); lab.className = 'aa';
        lab.innerHTML = (a1 !== a0 ? `<s>${IMM.AA3[a0]}</s> → ` : '') + `<b>${IMM.AA3[a1]}</b><small>${IMM.AAKO[a1]}</small>`;
        const tag = document.createElement('div'); tag.className = 'tag';
        tag.textContent = kind === 'syn' ? '침묵' : kind === 'mis' ? '아미노산 바뀜' : kind === 'non' ? '종결!' : '';
        el.append(nts, lab, tag); box.appendChild(el);
      }
      summary(g, d, cur, aa);
    }

    function summary(g, d, cur, aa) {
      let nb = 0; for (let i = 0; i < cur.length; i++) if (cur[i] !== g.seq[i]) nb++;
      const nd = IMM.aaDiff(aa, g.aa);
      const stop = aa.includes('*');
      const sum = $('labSum');
      let h = '';
      if (nb === 0) h += '<p>아직 바꾼 염기가 없어요. 위의 염기(글자)를 눌러 다른 염기로 바꿔 보세요.</p>';
      else if (stop) h += `<p class="bad"><b>넌센스 돌연변이</b>: 종결 코돈이 생겨 단백질이 중간에 끊겨요. 이 표면 단백질 없이는 ${d.name.split(' (')[0]}이(가) 세포에 붙거나 살아남지 못해서 변이주를 만들 수 없어요.</p>`;
      else if (nd === 0) h += `<p><b>침묵 돌연변이</b>: 염기 ${nb}개가 바뀌었지만 유전 암호가 겹쳐(코돈 중복) 아미노산은 그대로예요. 단백질 모양이 같으니 면역계는 원래 병원체와 똑같이 알아봐요.</p>`;
      else h += `<p><b>미스센스 돌연변이</b>: 염기 ${nb}개 → 아미노산 ${nd}개가 바뀌었어요. 항원 결정부위의 모양이 달라져 기존 항체·기억 B세포가 덜 달라붙어요.</p>`;

      // 지금 몸의 기억으로 얼마나 알아볼까
      const sim = api.getSim();
      const fam = IMM.agBase(d.ag === 'flu' ? 'flu' : d.ag);
      const rows = [];
      if (!stop) for (const id in sim.ag) {
        const r = sim.ag[id];
        if (r.natural || IMM.agBase(id) !== fam) continue;
        const has = r.memB + r.igg + r.memT;
        if (has < 0.3) continue;
        const ep = IMM.epitope(id); if (!ep) continue;
        rows.push({ name: r.name, f: IMM.crossF(aa, ep), memB: r.memB });
      }
      if (stop) { /* 없음 */ }
      else if (!rows.length) h += `<p class="muted">이 몸은 아직 ${d.name.split(' (')[0]}에 대한 기억 세포가 없어요. 먼저 원래 병원체(또는 백신)를 넣고 회복한 다음, 변이주를 넣어 2차 반응이 어떻게 달라지는지 비교해 보세요.</p>`;
      else {
        rows.sort((a, b) => b.f - a.f);
        h += '<div class="lab-meter"><div class="muted">지금 이 몸의 항체·기억 B세포가 이 변이주에 붙는 정도</div>';
        for (const r of rows.slice(0, 3)) {
          const pct = Math.round(r.f * 100);
          const cls = r.f >= 0.6 ? 'ok' : r.f >= 0.3 ? 'warn' : 'bad';
          h += `<div class="mrow"><span>${r.name}</span><i><b class="${cls}" style="width:${Math.max(2, pct)}%"></b></i><em>${pct}%</em></div>`;
        }
        const best = rows[0].f;
        h += `<p class="muted">${best >= 0.6 ? '거의 그대로 알아봐요 → 빠른 2차 반응.' : best >= 0.3 ? '일부만 알아봐요 (교차 반응) → 2차 반응이 약해짐.' : '거의 못 알아봐요 → 면역 회피! 1차 반응에 가깝게 다시 싸워야 함. (보조·세포독성 T세포는 다른 부위도 보기 때문에 일부 도움이 남음)'}</p></div>`;
      }
      sum.innerHTML = h;
      const n = IMM.DEFS.filter(x => x.mutant).length;
      $('labMake').disabled = nb === 0 || stop || n >= MAX;
      $('labMake').textContent = n >= MAX ? `변이주는 ${MAX}개까지` : '변이주 만들기 → 항원 상자에 추가';
      $('labClear').hidden = n === 0;
    }

    $('labRandom').addEventListener('click', () => {
      const g = IMM.GENES[key];
      // 종결 코돈이 생기지 않는 점 돌연변이 하나
      for (let tries = 0; tries < 40; tries++) {
        const i = (Math.random() * seq.length) | 0;
        const opts = 'ACGT'.split('').filter(b => b !== seq[i]);
        const b = opts[(Math.random() * 3) | 0];
        const t = seq.slice(); t[i] = b;
        if (!IMM.translate(t.join('')).includes('*')) { seq = t; break; }
      }
      render();
      void g;
    });
    $('labResetSeq').addEventListener('click', () => { seq = IMM.GENES[key].seq.split(''); render(); });
    $('labMake').addEventListener('click', () => {
      const d = IMM.makeMutant(key, seq.join(''));
      save();
      api.rebuildPalette(d.id);
      dlg.close();
      api.hint(`‘${d.name}’이(가) 항원 상자 맨 아래에 추가됨 → 끌어서 몸에 넣어 보세요.`);
    });
    $('labClear').addEventListener('click', () => {
      for (let i = IMM.DEFS.length - 1; i >= 0; i--) if (IMM.DEFS[i].mutant) { delete IMM.DEF[IMM.DEFS[i].id]; IMM.DEFS.splice(i, 1); }
      save(); api.rebuildPalette(); render();
    });

    IMM.openLab = function (k) {
      if (k && IMM.GENES[k]) { key = k; seq = IMM.GENES[k].seq.split(''); }
      buildPick(); render();
      dlg.showModal();
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
