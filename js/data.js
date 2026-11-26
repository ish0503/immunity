// 면역 시뮬레이터 — 기본 데이터 (지형, 항원 종류)
(function (G) {
  const IMM = (G.IMM = G.IMM || {});

  IMM.W = 1200;
  IMM.H = 780;
  // 세로 구역
  IMM.Z = {
    outTop: 0,
    barTop: 62,   // 1차 방어벽(피부·점막) 시작
    tisTop: 100,  // 조직
    bloodTop: 420, // 혈관
    bloodBot: 540,
    lnTop: 560,   // 림프절·비장
    bot: 780,
  };

  IMM.GATES = [
    { id: 'skin', name: '피부', sub: '각질층 · 피지 · 땀(라이소자임)', x0: 0, x1: 300 },
    { id: 'wound', name: '상처', sub: '피부 장벽이 뚫린 곳', x0: 300, x1: 470 },
    { id: 'resp', name: '호흡기 점막', sub: '점액 · 섬모 · 라이소자임', x0: 470, x1: 760 },
    { id: 'gut', name: '소화관 (위)', sub: '위산 pH 2 · 장 점막', x0: 760, x1: 1000 },
    { id: 'blood', name: '혈관 직접', sub: '주사 · 수혈 · 모기', x0: 1000, x1: 1200 },
  ];

  // 특수 장소
  IMM.LIVER = { x: 1100, y: 300, r: 60 };
  IMM.GANGLION = { x: 75, y: 360 };
  IMM.LN = {
    tZone: { x0: 30, x1: 520, y0: 595, y1: 765 },
    bZone: { x0: 545, x1: 880, y0: 595, y1: 765 },
    pZone: { x0: 905, x1: 1180, y0: 595, y1: 765 },
  };

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
  };

  IMM.agName = function (ag) {
    if (IMM.AG_NAMES[ag]) return IMM.AG_NAMES[ag];
    const [base, v] = ag.split(':');
    if (base === 'flu') return '인플루엔자 HA-' + v + '형';
    if (base === 'hiv') return 'HIV 외피 변이 ' + v;
    if (base === 'tryp') return '트리파노소마 VSG-' + v;
    return ag;
  };

  // 항원별 그래프 색
  const AG_COLORS = {
    A: '#e5484d', B: '#3e63dd', D: '#d6409f', rhino: '#30a46c', noro: '#8db600', herpes: '#f76b15',
    pneumo: '#0090ff', staph: '#ffb224', salm: '#ab4aba', tb: '#a18072', mal: '#e54666', amoeba: '#12a594',
  };
  const VAR_PALETTE = ['#00a2c7', '#6e56cf', '#e93d82', '#29a383', '#d6a000', '#7c66dc', '#f2555a', '#5eb1ef'];
  IMM.agColor = function (ag) {
    if (AG_COLORS[ag]) return AG_COLORS[ag];
    const [base, v] = ag.split(':');
    const n = parseInt(v || '1', 10);
    if (base === 'flu') return ['#00a2c7', '#0d74ce', '#5eb1ef', '#113264'][(n - 1) % 4];
    if (base === 'hiv') return ['#8e4ec6', '#c084fc', '#6e56cf', '#b658c4', '#9a5cd0'][(n - 1) % 5];
    if (base === 'tryp') return VAR_PALETTE[(n - 1) % VAR_PALETTE.length];
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
      dbl: 0.55, tox: 0.02, skinPass: 0.05, toxNeutro: 0.15, cap: 260, color: '#ffb224',
      desc: '피부 상처로 들어오는 그람 양성 구균. 호중구를 죽이는 독소(류코시딘)를 내고 고름(농양)을 만듦. 상처 없는 피부는 거의 못 뚫음.' },
    { id: 'pneumo', cat: 'bact', name: '폐렴구균 (협막)', ag: 'pneumo', n: 16, beh: 'bact', route: 'resp', gram: '+',
      dbl: 0.6, tox: 0.02, capsule: true, cap: 260, color: '#0090ff',
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

    // 백신
    { id: 'vacFlu', cat: 'vaccine', name: '인플루엔자 백신', ag: 'flu', n: 22, beh: 'vaccine', route: 'tissue', color: '#5eb1ef',
      desc: '증식하지 않는 불활성화 바이러스 조각(현재 유행형 HA). 위험 없이 기억세포를 만들어 둠.' },
    { id: 'vacPneumo', cat: 'vaccine', name: '폐렴구균 백신', ag: 'pneumo', n: 22, beh: 'vaccine', route: 'tissue', color: '#70b8ff',
      desc: '협막 다당류를 단백질에 결합시킨 백신. 협막에 붙는 항체와 기억세포를 미리 만들어 둠.' },
  ];

  IMM.DEF = {};
  for (const d of IMM.DEFS) IMM.DEF[d.id] = d;

  IMM.CATS = [
    { id: 'rbc', name: '적혈구 (수혈)' },
    { id: 'virus', name: '바이러스' },
    { id: 'bact', name: '세균' },
    { id: 'protist', name: '원생생물' },
    { id: 'vaccine', name: '백신' },
  ];

  IMM.ROUTE_NAMES = { skin: '피부', wound: '상처', resp: '호흡기 점막', gut: '소화관', blood: '혈관', tissue: '근육 주사' };
})(typeof window !== 'undefined' ? window : globalThis);
