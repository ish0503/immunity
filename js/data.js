// 면역 시뮬레이터 — 기본 데이터 (지형, 항원 종류)
(function (G) {
  const IMM = (G.IMM = G.IMM || {});

  // ───────── 몸 지도 (단면) ─────────
  // 예전보다 가로 2.5배·세로 약 2배 넓은 지도. 세포 수는 K배로 늘리고,
  // 세포 하나하나가 몸 전체에 주는 영향(손상·염증·자극)은 1/K로 맞춰 균형을 유지한다.
  IMM.K = 4;
  IMM.W = 3000;
  IMM.H = 1500;
  // 세로 구역
  IMM.Z = {
    outTop: 0,
    barTop: 80,    // 1차 방어벽(피부·점막) 시작
    tisTop: 140,   // 조직(진피·점막 고유층)
    bloodTop: 740, // 큰 혈관
    bloodBot: 920,
    lnTop: 980,    // 깊은 기관: 림프절·비장·간
    bot: 1500,
  };
  IMM.TIS_X1 = 2520; // 상피가 덮는 구역의 오른쪽 끝 (그 오른쪽은 혈관 직접 투입 구역)

  IMM.GATES = [
    { id: 'skin', name: '피부', sub: '각질층 · 피지 · 땀(라이소자임) · 털집', x0: 0, x1: 760 },
    { id: 'wound', name: '상처', sub: '피부 장벽이 뚫린 곳 · 혈소판 응고', x0: 760, x1: 1180 },
    { id: 'resp', name: '호흡기 점막 (기관지)', sub: '점액 · 섬모 · 술잔세포 · 라이소자임', x0: 1180, x1: 1900 },
    { id: 'gut', name: '소화관 (위 → 작은창자)', sub: '위산 pH 2 · 소화 효소 · 융모', x0: 1900, x1: 2520 },
    { id: 'blood', name: '혈관 직접', sub: '주사 · 수혈 · 모기', x0: 2520, x1: 3000 },
  ];

  // 특수 장소
  IMM.LIVER = { x: 2760, y: 1240, r: 190 };
  IMM.SPLEEN = { x: 2265, y: 1240, rx: 200, ry: 210 };
  IMM.MARROW = { x: 2760, y: 520, rx: 190, ry: 130 }; // 뼈 속 골수: 새 혈구가 혈액으로 나옴
  IMM.GANGLION = { x: 200, y: 640 };
  IMM.LNODE = { x: 1010, y: 1240, rx: 965, ry: 235 }; // 림프절 외곽(피막)
  IMM.LN = {
    bZone: { x0: 200, x1: 1820, y0: 1035, y1: 1150 }, // 피질: B세포 여포
    tZone: { x0: 170, x1: 1490, y0: 1185, y1: 1440 }, // 부피질: T세포 영역
    pZone: { x0: 1530, x1: 1900, y0: 1185, y1: 1440 }, // 수질: 형질세포
  };
  // 조직에서 림프절로 가는 림프관(수지상세포가 이 길을 따라 이동)
  IMM.LYMPH_X = [330, 980, 1560, 2180];

  // 항원(에피토프) 이름
  IMM.AG_NAMES = {
    A: '혈액형 항원 A',
    B: '혈액형 항원 B',
    D: 'Rh(D) 항원',
    rhino: '리노바이러스 캡시드',
    noro: '노로바이러스 캡시드',
    herpes: '단순포진 바이러스 당단백질',
    pneumo: '폐렴구균 협막 다당류',
    staph: '포도상구균 표면 단백질',
    salm: '살모넬라 O·H 항원',
    tb: '결핵균 항원',
    mal: '말라리아 원충 표면 단백질',
    amoeba: '이질아메바 렉틴',
    cand: '칸디다 세포벽 만난·β-글루칸',
    asp: '아스페르길루스 갈락토만난',
    crypto: '크립토코쿠스 협막 다당류(GXM)',
  };

  IMM.agName = function (ag) {
    if (IMM.AG_NAMES[ag]) return IMM.AG_NAMES[ag];
    const [base, v] = ag.split(':');
    if (base === 'flu') return '인플루엔자 HA-' + v + '형';
    if (base === 'hiv') return 'HIV 외피 변이 ' + v;
    if (base === 'tryp') return '트리파노소마 VSG-' + v;
    if (IMM.MUT_AG && IMM.MUT_AG[ag]) { const m = IMM.MUT_AG[ag]; const b = m.base === 'flu' ? '인플루엔자 HA' : (IMM.AG_NAMES[m.base] || m.base); return b + ' 변이주 M' + m.n; }
    return ag;
  };

  // 항원별 그래프 색
  const AG_COLORS = {
    A: '#e5484d', B: '#3e63dd', D: '#d6409f', rhino: '#30a46c', noro: '#8db600', herpes: '#f76b15',
    pneumo: '#0090ff', staph: '#ffb224', salm: '#ab4aba', tb: '#a18072', mal: '#e54666', amoeba: '#12a594',
    cand: '#d9b44a', asp: '#6f9a55', crypto: '#a78bfa',
  };
  const VAR_PALETTE = ['#00a2c7', '#6e56cf', '#e93d82', '#29a383', '#d6a000', '#7c66dc', '#f2555a', '#5eb1ef'];
  IMM.agColor = function (ag) {
    if (AG_COLORS[ag]) return AG_COLORS[ag];
    const [base, v] = ag.split(':');
    const n = parseInt(v || '1', 10);
    if (base === 'flu') return ['#00a2c7', '#0d74ce', '#5eb1ef', '#113264'][(n - 1) % 4];
    if (base === 'hiv') return ['#8e4ec6', '#c084fc', '#6e56cf', '#b658c4', '#9a5cd0'][(n - 1) % 5];
    if (base === 'tryp') return VAR_PALETTE[(n - 1) % VAR_PALETTE.length];
    if (IMM.MUT_AG && IMM.MUT_AG[ag]) return ['#f2555a', '#29a383', '#d6a000', '#e93d82', '#7c66dc', '#00a2c7'][(IMM.MUT_AG[ag].n - 1) % 6];
    return '#888';
  };

  // ───────── 투입 가능한 항원 목록 ─────────
  // beh: 행동 방식, route: 주 감염 경로, n: 기본 투입 개수
  IMM.DEFS = [
    // 적혈구 (수혈)
    { id: 'rbcA', cat: 'rbc', name: 'A형 적혈구 (Rh+)', ags: ['A', 'D'], n: 26, beh: 'rbc', route: 'blood',
      desc: '표면에 A 항원과 Rh(D) 항원이 있는 적혈구. 받는 사람에게 없는 항원이면 항체가 달라붙어 응집·용혈이 일어남.' },
    { id: 'rbcB', cat: 'rbc', name: 'B형 적혈구 (Rh+)', ags: ['B', 'D'], n: 26, beh: 'rbc', route: 'blood',
      desc: '표면에 B 항원과 Rh(D) 항원이 있는 적혈구.' },
    { id: 'rbcAB', cat: 'rbc', name: 'AB형 적혈구 (Rh+)', ags: ['A', 'B', 'D'], n: 26, beh: 'rbc', route: 'blood',
      desc: 'A·B 항원을 모두 가진 적혈구. AB형이 아닌 사람 몸에서는 응집됨.' },
    { id: 'rbcO', cat: 'rbc', name: 'O형 적혈구 (Rh+)', ags: ['D'], n: 26, beh: 'rbc', route: 'blood',
      desc: 'A·B 항원이 없어 ABO 응집은 일어나지 않음. 단, Rh− 인 사람에게는 Rh(D) 항원이 낯선 항원.' },
    { id: 'rbcOn', cat: 'rbc', name: 'O형 적혈구 (Rh−)', ags: [], n: 26, beh: 'rbc', route: 'blood',
      desc: 'A·B·Rh(D) 항원이 모두 없는 적혈구. 누구에게 수혈해도 적혈구 항원 반응이 거의 없음.' },

    // 바이러스
    { id: 'rhino', cat: 'virus', name: '리노바이러스 (감기)', ag: 'rhino', n: 24, beh: 'lytic', route: 'resp',
      infect: 0.55, incub: 0.55, burst: 5, tox: 0.002, tempSens: true, ifn: 1.3, life: 1.4, color: '#30a46c',
      desc: '코·목 점막 상피세포를 감염. 33℃ 근처에서 잘 자라므로 발열에 약함. 인터페론을 강하게 유도.' },
    { id: 'flu', cat: 'virus', name: '인플루엔자 바이러스', ag: 'flu', n: 24, beh: 'lytic', route: 'resp',
      infect: 0.6, incub: 0.45, burst: 7, tox: 0.003, cellDmg: 0.12, severe: true, ifn: 1, life: 1.3, drift: 0.5, color: '#0d74ce',
      desc: '호흡기 상피를 빠르게 파괴. 다시 넣을 때마다 표면 HA 단백질이 바뀔 수 있어(항원 소변이) 기억세포가 일부만 통할 수 있음.' },
    { id: 'noro', cat: 'virus', name: '노로바이러스', ag: 'noro', n: 24, beh: 'lytic', route: 'gut', acidRes: true,
      infect: 0.6, incub: 0.35, burst: 6, tox: 0.004, cellDmg: 0.12, ifn: 1, life: 1.2, color: '#8db600',
      desc: '위산에 강해 위를 통과하고 장 상피를 감염하는 바이러스. 짧고 강한 급성 감염.' },
    { id: 'herpes', cat: 'virus', name: '단순포진 바이러스', ag: 'herpes', n: 20, beh: 'lytic', route: 'resp',
      infect: 0.5, incub: 0.7, burst: 6, tox: 0.004, ifn: 0.7, life: 1.5, mhcDown: true, latent: true, color: '#f76b15',
      desc: '감염 세포의 MHC I을 숨겨 세포독성 T세포를 피함 → NK세포가 "자기 표지 상실"을 감지해 제거. 신경절에 숨어 있다가 재활성화.' },
    { id: 'hiv', cat: 'virus', name: 'HIV (레트로바이러스)', ag: 'hiv', n: 18, beh: 'hiv', route: 'blood',
      infect: 0.35, incub: 1.1, burst: 5, tox: 0.002, life: 1.0, color: '#8e4ec6',
      desc: '보조 T세포(CD4)를 감염해 파괴. 역전사 오류로 변이가 잦아 항체·T세포를 회피하고 잠복 저장소를 만듦. 방치하면 면역 결핍(AIDS)으로 진행.' },

    // 세균
    { id: 'staph', cat: 'bact', name: '황색포도상구균', ag: 'staph', n: 16, beh: 'bact', route: 'wound', gram: '+',
      dbl: 0.55, tox: 0.023, skinPass: 0.05, toxNeutro: 0.15, cap: 260, color: '#ffb224',
      desc: '피부 상처로 들어오는 그람 양성 구균. 호중구를 죽이는 독소(류코시딘)를 내고 고름(농양)을 만듦. 상처 없는 피부는 거의 못 뚫음.' },
    { id: 'pneumo', cat: 'bact', name: '폐렴구균 (협막)', ag: 'pneumo', n: 16, beh: 'bact', route: 'resp', gram: '+',
      dbl: 0.6, tox: 0.027, capsule: true, cap: 260, color: '#0090ff',
      desc: '두꺼운 다당류 협막 때문에 그냥은 잘 잡아먹히지 않음. 항체가 붙어 옵소닌화되어야 효과적으로 탐식됨 → 항체의 중요성.' },
    { id: 'salm', cat: 'bact', name: '살모넬라균', ag: 'salm', n: 30, beh: 'bact', route: 'gut', gram: '-',
      dbl: 0.45, tox: 0.016, lps: true, cap: 260, color: '#ab4aba',
      desc: '음식으로 들어오는 그람 음성 간균. 대부분 위산에 죽음. 살아남으면 내독소(LPS)로 강한 발열을 일으키고, 보체의 막공격복합체(MAC)에 약함.' },
    { id: 'tb', cat: 'bact', name: '결핵균', ag: 'tb', n: 10, beh: 'tb', route: 'resp', acidRes: false,
      dbl: 1.1, tox: 0.008, cap: 120, color: '#a18072',
      desc: '대식세포에 먹혀도 그 안에서 살아남는 세포내 세균. 보조 T세포(Th1)가 대식세포를 활성화해야 죽고, 육아종에 갇혀 잠복함.' },

    // 원생생물
    { id: 'malaria', cat: 'protist', name: '말라리아 원충', ag: 'mal', n: 8, beh: 'malaria', route: 'blood', tox: 0.01, color: '#e54666',
      desc: '모기를 통해 혈액에 들어와 간에 숨었다가 적혈구 안으로 침입. 적혈구 속에서는 항체가 닿지 않고, 약 2일마다 적혈구를 터뜨려 주기적인 열을 일으킴.' },
    { id: 'trypano', cat: 'protist', name: '트리파노소마', ag: 'tryp', n: 10, beh: 'trypano', route: 'blood', tox: 0.0025,
      dbl: 0.5, cap: 160, color: '#00a2c7',
      desc: '혈액 속을 헤엄치는 편모충. 표면 단백질(VSG)을 계속 바꿔(항원 변이) 항체를 피하며 감염이 파도처럼 반복됨.' },
    { id: 'amoeba', cat: 'protist', name: '이질아메바', ag: 'amoeba', n: 8, beh: 'amoeba', route: 'gut', acidRes: true, tox: 0.025,
      dbl: 2.2, cap: 18, color: '#12a594',
      desc: '포낭 상태로 위산을 견딤. 너무 커서 탐식되지 않고 접촉한 세포(호중구 포함)를 녹여 죽임. 보체·항체·여러 면역세포의 협공이 필요.' },

    // 곰팡이 (진균)
    { id: 'candida', cat: 'fungus', name: '칸디다 (효모↔균사)', ag: 'cand', n: 14, beh: 'fungus', route: 'gut', form: 'yeast', hyphae: true,
      dbl: 0.8, tox: 0.004, cap: 200, hp: 3, color: '#efe0b8',
      desc: '평소 장·입·피부에 사는 효모. 몸 안에 들어오면 체온에서 균사로 바뀌어 상피를 뚫고(캔디다라이신 독소) 들어감. 균사는 너무 길어 탐식이 안 되고 호중구가 둘러싸 죽임. 보조 T세포의 Th17(IL-17)이 호중구를 불러 모으는 핵심 → AIDS에서 아구창·식도염.' },
    { id: 'asperg', cat: 'fungus', name: '아스페르길루스 (포자 흡입)', ag: 'asp', n: 28, beh: 'fungus', route: 'resp', form: 'conidia', hyphae: true, angio: true,
      dbl: 1.0, tox: 0.012, cap: 120, hp: 5, color: '#7fa36b',
      desc: '공기 중 포자(분생자)가 작아서 기도 깊숙이 들어옴. 대식세포가 포자를 잘 먹어 치우지만, 남은 포자가 발아하면 균사가 조직과 혈관벽을 뚫고 자람(혈관 침습). 호중구가 균사를 막는 주역이라 호중구가 부족하면 치명적.' },
    { id: 'crypto', cat: 'fungus', name: '크립토코쿠스 (협막 효모)', ag: 'crypto', n: 14, beh: 'fungus', route: 'resp', form: 'yeast', capsule: true,
      dbl: 1.0, tox: 0.012, cap: 150, hp: 3, color: '#c9b4ff',
      desc: '두꺼운 다당류 협막으로 탐식을 피하고, 대식세포에 먹혀도 다시 빠져나옴(vomocytosis). Th1 보조 T세포가 대식세포를 활성화해야 죽음. 혈액을 타고 퍼져 면역 결핍 환자에게 뇌수막염을 일으킴.' },

    // 백신
    { id: 'vacFlu', cat: 'vaccine', name: '인플루엔자 백신', ag: 'flu', n: 22, beh: 'vaccine', route: 'tissue', color: '#5eb1ef',
      desc: '증식하지 않는 불활성화 바이러스 조각(현재 유행형 HA). 위험 없이 기억세포를 만들어 둠.' },
    { id: 'vacPneumo', cat: 'vaccine', name: '폐렴구균 백신', ag: 'pneumo', n: 22, beh: 'vaccine', route: 'tissue', color: '#70b8ff',
      desc: '협막 다당류를 단백질에 결합시킨 백신. 협막에 붙는 항체와 기억세포를 미리 만들어 둠.' },
  ];

  IMM.DEF = {};
  for (const d of IMM.DEFS) { IMM.DEF[d.id] = d; d.kind = d.id; }

  IMM.CATS = [
    { id: 'rbc', name: '적혈구 (수혈)' },
    { id: 'virus', name: '바이러스' },
    { id: 'bact', name: '세균' },
    { id: 'protist', name: '원생생물' },
    { id: 'fungus', name: '곰팡이 (진균)' },
    { id: 'vaccine', name: '백신' },
    { id: 'mutant', name: '내가 만든 변이주 🧬' },
  ];

  // ───────── 돌연변이 실험실: 표면 항원 유전자의 항원 결정부위(에피토프) ─────────
  // 염기는 DNA 표기(T)로 저장하고, RNA 바이러스는 화면에 U로 보여 준다.
  const BASES = 'TCAG';
  const AA = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
  IMM.AA3 = { A: 'Ala', R: 'Arg', N: 'Asn', D: 'Asp', C: 'Cys', Q: 'Gln', E: 'Glu', G: 'Gly', H: 'His', I: 'Ile', L: 'Leu', K: 'Lys', M: 'Met', F: 'Phe', P: 'Pro', S: 'Ser', T: 'Thr', W: 'Trp', Y: 'Tyr', V: 'Val', '*': '종결' };
  IMM.AAKO = { A: '알라닌', R: '아르지닌', N: '아스파라진', D: '아스파트산', C: '시스테인', Q: '글루타민', E: '글루탐산', G: '글리신', H: '히스티딘', I: '아이소류신', L: '류신', K: '라이신', M: '메싸이오닌', F: '페닐알라닌', P: '프롤린', S: '세린', T: '트레오닌', W: '트립토판', Y: '타이로신', V: '발린', '*': '종결 코돈' };
  IMM.codonAA = function (c) {
    const i = BASES.indexOf(c[0]) * 16 + BASES.indexOf(c[1]) * 4 + BASES.indexOf(c[2]);
    return AA[i] || '?';
  };
  IMM.translate = function (seq) { let o = ''; for (let i = 0; i + 2 < seq.length; i += 3) o += IMM.codonAA(seq.substr(i, 3)); return o; };
  IMM.GENES = {
    flu: { def: 'flu', nuc: 'RNA', gene: 'HA(헤마글루티닌) 유전자 · 항원 결정부위 B', seq: 'TCAAAGTACAACGGCACATTCAAG' },
    rhino: { def: 'rhino', nuc: 'RNA', gene: 'VP1 캡시드 유전자 · 중화 항원 부위', seq: 'CCAACGGATGTGAACGGAAAAGAG' },
    noro: { def: 'noro', nuc: 'RNA', gene: 'VP1 캡시드 P2 돌출부 유전자', seq: 'ACCAATGACCGGGGACAACTCGTG' },
    herpes: { def: 'herpes', nuc: 'DNA', gene: 'gD 당단백질 유전자 · 수용체 결합 부위', seq: 'AAATACGCCCTGGCGGACCCCTCG' },
    staph: { def: 'staph', nuc: 'DNA', gene: 'ClfA 표면 단백질 유전자', seq: 'GATTCTGGAAGCGACTCAAATACA' },
    salm: { def: 'salm', nuc: 'DNA', gene: 'FliC 편모 단백질 유전자 (H 항원)', seq: 'AACATCCAGGCTCGTCTGGGTACC' },
    cand: { def: 'candida', nuc: 'DNA', gene: 'Als3 부착 단백질 유전자', seq: 'GGTGCTACTTGGTATTCTGTTCCA' },
  };
  for (const k in IMM.GENES) IMM.GENES[k].aa = IMM.translate(IMM.GENES[k].seq);
  IMM.agBase = (ag) => String(ag).split(/[:*]/)[0];
  IMM.MUT_AG = {}; // 변이주 항원 id → { aa, n, base }
  IMM.epitope = function (ag) {
    if (IMM.MUT_AG[ag]) return IMM.MUT_AG[ag].aa;
    const g = IMM.GENES[IMM.agBase(ag)];
    return g ? g.aa : null;
  };
  IMM.aaDiff = function (a, b) { let n = 0; for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) n++; return n; };
  // 항원 결정부위 아미노산이 하나 바뀔 때마다 항체·기억 B세포의 결합력이 약 절반 아래로 떨어진다고 가정
  IMM.crossF = function (a, b) { return Math.pow(0.45, IMM.aaDiff(a, b)); };
  IMM.mutCount = 0;
  IMM.makeMutant = function (key, seq) {
    const g = IMM.GENES[key], base = IMM.DEF[g.def];
    const aa = IMM.translate(seq);
    const n = ++IMM.mutCount;
    let ag = null;
    if (aa === g.aa) ag = base.ag; // 침묵 돌연변이: 단백질이 같으므로 원래 항원과 같음
    else for (const id in IMM.MUT_AG) { const m = IMM.MUT_AG[id]; if (m.base === key && m.aa === aa) ag = id; }
    if (!ag) { ag = key + '*' + n; IMM.MUT_AG[ag] = { aa, n, base: key }; }
    let nb = 0; for (let i = 0; i < seq.length; i++) if (seq[i] !== g.seq[i]) nb++;
    const nd = IMM.aaDiff(aa, g.aa);
    const short = base.name.split(' (')[0];
    const d = Object.assign({}, base, {
      id: g.def + '_m' + n, pal: 'mutant', name: `${short} 변이주 M${n}`, ag, mutant: true, mutKey: key, seq, aa,
      color: base.color,
      desc: `${base.name}의 ${g.gene}에서 염기 ${nb}개를 바꾼 변이주. ` + (nd === 0 ? '아미노산은 그대로(침묵 돌연변이) → 몸은 원래 병원체와 똑같이 인식.' : `항원 결정부위 아미노산 ${nd}개가 달라짐 → 원래 병원체의 기억 세포·항체가 덜 알아봄.`) + ' 나머지 성질은 원래 병원체와 같음.',
    });
    IMM.DEFS.push(d); IMM.DEF[d.id] = d;
    return d;
  };

  IMM.ROUTE_NAMES = { skin: '피부', wound: '상처', resp: '호흡기 점막', gut: '소화관', blood: '혈관', tissue: '근육 주사' };
})(typeof window !== 'undefined' ? window : globalThis);
