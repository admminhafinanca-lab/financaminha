// ══════════════════════════════════════════
      //  ESTADO GLOBAL
      // ══════════════════════════════════════════
      const DB_KEY = 'financaminha_v3';

      const MEMBROS_DEFAULT = [{ id: 'm1', nome: 'Titular', tipo: 'adulto', idade: 30 }];
      // Expõe state no window para acesso entre scripts
      window.state = {
        membros: [...MEMBROS_DEFAULT],
        rendas: [],
        essenciais: [],
        naoEssenciais: [],
        cartoes: [],
        dividas: [],
        investimentos: [],
        emergAtual: 0,
        beneficios: { va: 0, vr: 0, vt: 0, vhome: 0, vsaude: 0, voutra: 0 },
        metas: [],
        lastResetMonth: '',
        onboardingDone: false,
      };
      const state = window.state;

      var charts = {};
      var _nextId = 100;
      function uid(p) { return p + (++_nextId); }

      function syncNextId() {
        const allIds = [
          ...state.rendas, ...state.essenciais, ...state.naoEssenciais,
          ...state.cartoes, ...state.dividas, ...state.investimentos,
          ...state.metas, ...state.membros
        ].map(x => parseInt((x.id || '').replace(/\D/g, ''))).filter(n => !isNaN(n));
        if (allIds.length) _nextId = Math.max(...allIds) + 1;
      }

      // ── helpers ──
      function esc(str) {
        return String(str == null ? '' : str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }
      function fmt(v) { return 'R$ ' + Math.round(v).toLocaleString('pt-BR'); }
      function g(id) { const el = document.getElementById(id); return el ? +el.value || 0 : 0; }
      function gStr(id) { const el = document.getElementById(id); return el ? el.value : ''; }
      function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
      function membroNome(id) { const m = state.membros.find(x => x.id === id); return m ? m.nome : id; }

      // ── CONFIG GLOBAL (carregada do Supabase via loadConfig()) ──
      window.CFG = window.CFG || {};

      // Aliases reativos: qualquer parte do código que usava as constantes antigas
      // continua funcionando sem modificação (lêem do CFG em tempo de execução)
      const _cfgProxy = {
        get CAT_LABEL()     { return CFG.cat_label     || {}; },
        get CATS_ESS()      { return CFG.cats_ess      || []; },
        get CATS_NE()       { return CFG.cats_ne       || []; },
        get CATS_DIV()      { return CFG.cats_div      || []; },
        get CATS_DIV_LABEL(){ return CFG.cats_div_label|| {}; },
        get BANDEIRAS()     { return CFG.bandeiras     || []; },
        get BANCOS()        { return CFG.bancos        || []; },
        get TIPOS_CC()      { return CFG.tipos_cc      || []; },
        get TIPOS_INV()     { return CFG.tipos_inv     || []; },
      };

      // Expõe como variáveis globais (window) para compatibilidade total
      Object.defineProperties(window, {
        CAT_LABEL:      { get: () => CFG.cat_label      || {}, configurable: true },
        CATS_ESS:       { get: () => CFG.cats_ess       || [], configurable: true },
        CATS_NE:        { get: () => CFG.cats_ne        || [], configurable: true },
        CATS_DIV:       { get: () => CFG.cats_div       || [], configurable: true },
        CATS_DIV_LABEL: { get: () => CFG.cats_div_label || {}, configurable: true },
        BANDEIRAS:      { get: () => CFG.bandeiras      || [], configurable: true },
        BANCOS:         { get: () => CFG.bancos         || [], configurable: true },
        TIPOS_CC:       { get: () => CFG.tipos_cc       || [], configurable: true },
        TIPOS_INV:      { get: () => CFG.tipos_inv      || [], configurable: true },
      });

      async function loadConfig() {
        try {
          const rows = await sbFetch('app_config?select=chave,valor');
          if (!rows || !Array.isArray(rows)) throw new Error('sem dados');
          rows.forEach(row => { CFG[row.chave] = row.valor; });
        } catch (err) {
          console.error('[FinançaMinha] Erro ao carregar app_config:', err);
          // Fallback com valores padrão para não travar o app
          window.CFG = {
            cat_label:      { moradia:'Moradia', alimentacao:'Alimentação', utilidades:'Utilidades', saude:'Saúde', educacao:'Educação', investimentos:'Investimentos', transporte:'Transporte', lazer:'Lazer', pessoal:'Pessoal', credito:'Crédito', outros:'Outros', pet:'Pets' },
            cats_ess:       ['moradia','alimentacao','utilidades','saude','educacao','investimentos','pet','outros'],
            cats_ne:        ['transporte','lazer','pessoal','credito','alimentacao','educacao','outros'],
            cats_div:       ['credito','pessoal','financ','consig','fgts','outro'],
            cats_div_label: { credito:'Cartão de crédito', pessoal:'Empréstimo pessoal', financ:'Financiamento', consig:'Consignado', fgts:'Antecipação FGTS', outro:'Outro' },
            bandeiras:      ['Visa','Mastercard','Elo','American Express','Hipercard'],
            bancos:         ['Nubank','Itaú','Bradesco','Santander','Caixa','Banco do Brasil','Inter','C6 Bank','BTG','XP','PicPay','Mercado Pago','Next','Outro'],
            tipos_cc:       ['Básico','Gold','Platinum','Black/Infinite','Empresarial'],
            tipos_inv:      [{v:'poupanca',l:'Poupança',taxa:0.005,ir:false},{v:'cdb100',l:'CDB 100% CDI',taxa:0.00843,ir:true},{v:'cdb110',l:'CDB 110% CDI',taxa:0.00927,ir:true},{v:'lci',l:'LCI/LCA (isento IR)',taxa:0.0082,ir:false},{v:'tesouro',l:'Tesouro Selic',taxa:0.0087,ir:true},{v:'fii',l:'FIIs',taxa:0.008,ir:false},{v:'acoes',l:'Ações BR',taxa:0.011,ir:true},{v:'cripto',l:'Cripto (alto risco)',taxa:0.015,ir:true},{v:'custom',l:'Taxa personalizada',taxa:0.01,ir:true}],
          };
        }
      }
      const AVATAR_BG = ['rgba(200,255,87,.15)', 'rgba(96,165,250,.15)', 'rgba(167,139,250,.15)', 'rgba(251,191,36,.15)', 'rgba(248,113,113,.15)', 'rgba(34,211,238,.15)'];
      const AVATAR_C = ['var(--acc)', 'var(--blue)', 'var(--purple)', 'var(--yellow)', 'var(--red)', 'var(--cyan)'];

      // CC_BENEFITS_DB agora vem do Supabase via CFG.cc_benefits
      Object.defineProperty(window, 'CC_BENEFITS_DB', {
        get: () => CFG.cc_benefits || {},
        configurable: true
      });

      // ── TOTALS ──
      function getTotRenda() { return state.rendas.reduce((s, r) => s + r.valor, 0); }
      function getTotBenef() { return Object.values(state.beneficios).reduce((s, v) => s + v, 0); }
      function getTotEss() { return state.essenciais.reduce((s, e) => s + e.valor, 0); }
      function getTotNE() { return state.naoEssenciais.reduce((s, n) => s + n.valor, 0); }
      function getTotDivMin() { return state.dividas.reduce((s, d) => s + d.minimo, 0) + state.cartoes.reduce((s, c) => s + c.fatura, 0); }
      function getTotDiv() { return state.dividas.reduce((s, d) => s + d.total, 0) + state.cartoes.reduce((s, c) => s + c.fatura, 0); }
      function getTotInv() { return state.investimentos.reduce((s, i) => s + i.valor, 0); }
      function getTotAporteInv() { return state.investimentos.reduce((s, i) => s + i.aporte, 0); }

      function getBenefCov() {
        const { va, vt, vhome, vr } = state.beneficios;
        const superVal = state.essenciais.filter(e => e.cat === 'alimentacao').reduce((s, e) => s + e.valor, 0);
        const combVal = state.naoEssenciais.filter(n => n.cat === 'transporte').reduce((s, n) => s + n.valor, 0);
        const netVal = state.essenciais.filter(e => e.nome.toLowerCase().includes('internet')).reduce((s, e) => s + e.valor, 0);
        const superCov = Math.min(va, superVal);
        const combCov = Math.min(vt, combVal);
        const netCov = Math.min(vhome, netVal);
        return { superCov, combCov, netCov, vrCov: vr, total: superCov + combCov + netCov + vr };
      }

      function somaAteDia(dia) {
        return [...state.essenciais, ...state.naoEssenciais].filter(x => x.dia <= dia).reduce((s, x) => s + x.valor, 0);
      }
      function rendaAteDia(dia) { return state.rendas.filter(r => r.dia <= dia).reduce((s, r) => s + r.valor, 0); }

      // ── sync beneficios from inputs ──
      function syncBeneficios() {
        ['va', 'vr', 'vt', 'vhome', 'vsaude', 'voutra'].forEach(k => {
          const el = document.getElementById(k);
          if (el) state.beneficios[k] = +el.value || 0;
        });
      }
      // ── sync emerg ──
      function syncEmerg() {
        const el = document.getElementById('emerg-atual');
        if (el) state.emergAtual = +el.value || 0;
      }

      // ══ NAV ══
      function nav(id, btn) {
        const pageEl = document.getElementById('page-' + id);
        // Se a página não existe no DOM, esta é uma SPA fragmentada — redireciona
        if (!pageEl) {
          location.href = id + '.html';
          return;
        }
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        pageEl.classList.add('active');
        if (btn) btn.classList.add('active');
        closeSidebar();
        if (id === 'calendario') { renderCalendario(); return; }
        setTimeout(() => calcular(), 50);
      }
      function openSidebar() {
        document.getElementById('sidebar').classList.add('open');
        document.getElementById('overlay').classList.add('show');
        document.body.style.overflow = 'hidden';
      }
      function closeSidebar() {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('overlay').classList.remove('show');
        document.body.style.overflow = '';
      }

      // ══════════════════════════════════════════
      //  MAIN CALCULAR
      // ══════════════════════════════════════════
      var _saveTimer;

      function debounceAutoSave() {
        clearTimeout(_saveTimer);
        _saveTimer = setTimeout(() => {
          if (typeof persistSave === 'function') {
            persistSave().then(() => { if (typeof showSaveIndicator === 'function') showSaveIndicator(); }).catch(e => console.error('[autoSave]', e));
          }
        }, 1200);
      }
      // Salva imediatamente sem depender do calcular() — usado nas páginas fragmentadas
      function saveNow() {
        if (typeof persistSave === 'function') {
          clearTimeout(_saveTimer);
          persistSave().then(() => { if (typeof showSaveIndicator === 'function') showSaveIndicator(); }).catch(e => console.error('[saveNow]', e));
        }
      }
      function calcular() { try { _calcularInterno(); } catch(e) { console.error('[calcular] erro:', e); debounceAutoSave(); } }
      function _calcularInterno() {
        syncBeneficios();
        syncEmerg();

        const renda = getTotRenda();
        const benef = getTotBenef();
        const cov = getBenefCov();
        const ess = getTotEss();
        const ne = getTotNE();
        const minDiv = getTotDivMin();
        const essLiq = Math.max(0, ess - cov.superCov - cov.netCov);
        const neLiq  = Math.max(0, ne  - cov.combCov);
        // Benefícios que sobram após cobrir despesas (VA cobre alimentação, VT transporte, etc.)
        // Só entra no saldo o que não foi "consumido" cobrindo despesas
        const benefLivre = Math.max(0, benef - cov.total);
        const total = essLiq + neLiq + minDiv;
        const saldo = renda + benefLivre - total;
        const reserva = Math.max(100, Math.min(300, saldo * 0.2));
        const lazer = Math.max(0, saldo * 0.05);
        const extra = Math.max(0, saldo - reserva - lazer);

        renderDashMetrics(renda, benef, ess, ne, minDiv, saldo);
        renderDashCharts(essLiq, neLiq, minDiv);
        renderDashVencimentos();
        renderSaldo(saldo, reserva, extra, lazer, renda, benef, essLiq, neLiq, minDiv);
        renderRendaMetrics(renda);
        renderBenefCov(cov);
        renderResumoEss(ess, cov);
        renderResumoNE(ne, cov);
        renderCCRecomendacao();
        renderDebtFromCC();
        renderDebtStrategy(saldo, extra);
        renderDebtMetrics();
        renderFamiliaTotais();
        renderInvMetrics();
        renderInvSugestoes(renda + benef);
        renderEmergencia(ess);
        renderIdeal();
        renderPlano(extra, minDiv);
        simular();
        const _tsEl = document.getElementById('topbar-saldo'); if (_tsEl) _tsEl.textContent = fmt(saldo);

        // Calendário no dashboard
        if (document.getElementById('dash-cal-mes-label')) renderDashCalendario();
        // auto-save debounced
        debounceAutoSave();
      }

      // ══════════════════════════════════════════
      //  MEMBROS — reescrito sem re-render no oninput
      // ══════════════════════════════════════════
      function addMembro() {
        const id = uid('m');
        state.membros.push({ id, nome: 'Novo membro', tipo: 'adulto', idade: 0 });
        renderMembros();
      }
      function removeMembro(id) {
        if (state.membros.length <= 1) { showToast('Precisa ter ao menos um membro', 'yellow'); return; }
        state.membros = state.membros.filter(m => m.id !== id);
        renderMembros(); calcular();
      }

      // ── Calcula custo de um membro somando suas despesas do state ──
      function getCustoMembro(membroId) {
        const despAll = [...state.essenciais, ...state.naoEssenciais];
        const total = despAll.filter(d => d.membro === membroId).reduce((s, d) => s + d.valor, 0);
        // breakdown por cat
        const cats = {};
        despAll.filter(d => d.membro === membroId).forEach(d => {
          cats[d.cat] = (cats[d.cat] || 0) + d.valor;
        });
        return { total, cats };
      }

      function renderMembros() {
        const el = document.getElementById('lista-membros');
        if (!el) return;
        el.innerHTML = '';
        state.membros.forEach((m, i) => {
          const ci = i % AVATAR_BG.length;
          const ini = (m.nome.split(' ').map(w => w[0] || '').join('').toUpperCase() || '?').slice(0, 2);
          const custo = getCustoMembro(m.id);

          // Build category breakdown HTML
          const catRows = Object.entries(custo.cats).map(([cat, val]) =>
            `<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid var(--b0)">
        <span style="color:var(--muted)">${CAT_LABEL[cat] || cat}</span>
        <span style="color:var(--text);font-weight:500">${fmt(val)}</span>
      </div>`
          ).join('');

          const tipoOpts = ['adulto', 'criança', 'bebê', 'idoso'].map(t =>
            `<option value="${t}" ${m.tipo === t ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
          ).join('');

          el.innerHTML += `
    <div class="item-card" id="card-membro-${m.id}">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <div style="width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--ff);font-size:14px;font-weight:700;background:${AVATAR_BG[ci]};color:${AVATAR_C[ci]};flex-shrink:0">${ini}</div>
        <div style="flex:1">
          <input
            id="nome-membro-${m.id}"
            type="text"
            value="${esc(m.nome)}"
            placeholder="Nome do membro"
            onchange="atualizarMembro('${m.id}','nome',this.value)"
            style="width:100%;background:var(--s3);border:1px solid var(--b1);border-radius:8px;padding:7px 10px;color:var(--text);font-size:15px;font-weight:600;font-family:var(--ff);outline:none;transition:border-color .15s"
            onfocus="this.style.borderColor='var(--acc)'"
            onblur="this.style.borderColor='var(--b1)'"
          >
        </div>
        ${i > 0 ? `<button class="rm-btn" onclick="removeMembro('${m.id}')">remover</button>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        <div class="ifield">
          <label>Tipo</label>
          <select onchange="atualizarMembro('${m.id}','tipo',this.value)">${tipoOpts}</select>
        </div>
        <div class="ifield">
          <label>Idade</label>
          <input type="number" value="${m.idade}" min="0" max="120"
            onchange="atualizarMembro('${m.id}','idade',+this.value)"
            style="width:100%;padding:6px 8px;background:var(--s1);border:1px solid var(--b1);border-radius:6px;color:var(--text);font-size:13px">
        </div>
      </div>
      <div style="background:var(--s3);border-radius:8px;padding:10px 12px">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Despesas vinculadas</div>
        ${catRows || '<div style="font-size:12px;color:var(--dim)">Nenhuma despesa vinculada a este membro ainda.</div>'}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid var(--b1)">
          <span style="font-size:13px;color:var(--muted)">Total mensal</span>
          <span style="font-family:var(--ff);font-size:18px;font-weight:700;color:var(--orange)">${fmt(custo.total)}</span>
        </div>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:8px">
        💡 Para vincular gastos a ${esc(m.nome.split(' ')[0])}, edite cada despesa e selecione o membro.
      </div>
    </div>`;
        });
      }

      function atualizarMembro(id, campo, valor) {
        const m = state.membros.find(x => x.id === id);
        if (m) { m[campo] = valor; }
        // re-render avatar initials without full re-render
        if (campo === 'nome') {
          const card = document.getElementById('card-membro-' + id);
          if (card) {
            const ini = (valor.split(' ').map(w => w[0] || '').join('').toUpperCase() || '?').slice(0, 2);
            const avatar = card.querySelector('div[style*="border-radius:50%"]');
            if (avatar) avatar.textContent = ini;
          }
          // Atualiza nome na sidebar se for o titular (primeiro membro)
          if (state.membros[0]?.id === id) updateSidebarUser();
        }
        renderFamiliaTotais();
        debounceAutoSave();
      }

      function renderFamiliaTotais() {
        const el = document.getElementById('familia-totais');
        if (!el) return;
        if (!state.membros.length) { el.innerHTML = '<div class="hbox hbox-blue">Nenhum membro.</div>'; return; }

        const custos = state.membros.map(m => ({ m, c: getCustoMembro(m.id) }));
        const totGeral = custos.reduce((s, x) => s + x.c.total, 0);

        el.innerHTML = custos.map(({ m, c }) => {
          const pct = totGeral > 0 ? clamp(c.total / totGeral * 100, 0, 100) : 0;
          return `<div class="card-row">
      <label>${esc(m.nome)} <span style="font-size:10px;color:var(--muted)">(${esc(m.tipo)})</span></label>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-weight:600;color:var(--orange)">${fmt(c.total)}</span>
        <span style="font-size:10px;color:var(--muted)">${Math.round(pct)}%</span>
        <div class="prog" style="width:80px"><div class="prog-fill" style="width:${pct}%;background:var(--orange)"></div></div>
      </div>
    </div>`;
        }).join('') + `<div class="card-row" style="border-top:1px solid var(--b2);padding-top:10px;margin-top:4px">
    <label style="font-weight:600;color:var(--text)">Total família/mês</label>
    <span style="color:var(--orange);font-weight:700;font-size:16px;font-family:var(--ff)">${fmt(totGeral)}</span>
  </div>`;

        // chart
        const cats = ['Moradia', 'Alimentação', 'Saúde', 'Transporte', 'Educação', 'Lazer', 'Pessoal', 'Outros'];
        const catKeys = ['moradia', 'alimentacao', 'saude', 'transporte', 'educacao', 'lazer', 'pessoal', 'outros'];
        const vals = catKeys.map(k => [...state.essenciais, ...state.naoEssenciais].filter(d => d.cat === k).reduce((s, d) => s + d.valor, 0));
        const nonZero = cats.map((c, i) => ({ c, v: vals[i] })).filter(x => x.v > 0);

        const fCtx = document.getElementById('chart-familia');
        if (fCtx && nonZero.length) {
          if (charts.familia) charts.familia.destroy();
          charts.familia = new Chart(fCtx, {
            type: 'bar',
            data: {
              labels: nonZero.map(x => x.c), datasets: [{
                data: nonZero.map(x => x.v),
                backgroundColor: ['rgba(96,165,250,.7)', 'rgba(74,222,128,.7)', 'rgba(248,113,113,.7)', 'rgba(251,191,36,.7)', 'rgba(167,139,250,.7)', 'rgba(251,146,60,.7)', 'rgba(244,114,182,.7)', 'rgba(122,127,150,.7)'],
                borderRadius: 6, borderSkipped: false
              }]
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmt(c.parsed.y) } } },
              scales: {
                x: { ticks: { color: '#7a7f96', font: { size: 11 } }, grid: { display: false } },
                y: { ticks: { color: '#7a7f96', font: { size: 11 }, callback: v => fmt(v) }, grid: { color: 'rgba(255,255,255,.04)' } }
              }
            }
          });
        }
      }

      // membrosOptions for selects
      function membrosOptions(selected = '') {
        return state.membros.map(m => `<option value="${esc(m.id)}" ${m.id === selected ? 'selected' : ''}>${esc(m.nome)}</option>`).join('');
      }

      // ══════════════════════════════════════════
      //  RENDAS
      // ══════════════════════════════════════════
      function addRenda() {
        const hoje = new Date();
        const comp = hoje.getFullYear() + '-' + String(hoje.getMonth()+1).padStart(2,'0');
        state.rendas.push({ id: uid('r'), nome: 'Nova renda', valor: 0, dia: 5, membro: state.membros[0]?.id || 'm1', tipo: 'fixo', competencia: comp });
        renderRendas(); try { calcular(); } catch(e) { saveNow(); }
      }
      function removeRenda(id) { state.rendas = state.rendas.filter(r => r.id !== id); renderRendas(); try { calcular(); } catch(e) { saveNow(); } }
      function renderRendas() {
        const el = document.getElementById('lista-rendas'); if (!el) return;
        el.innerHTML = '';
        state.rendas.forEach((r, i) => {
          el.innerHTML += `<div class="item-card">
      <div class="item-top">
        <span style="font-size:20px">💰</span>
        <input class="item-name-inp" value="${esc(r.nome)}" onchange="state.rendas[${i}].nome=this.value;try{calcular()}catch(e){saveNow()}">
        <span class="badge ${r.tipo === 'fixo' ? 'b-green' : 'b-yellow'}">${r.tipo}</span>
        <button class="rm-btn" onclick="removeRenda('${r.id}')">remover</button>
      </div>
      <div class="item-fields if-auto">
        <div class="ifield"><label>Valor (R$)</label><input type="number" value="${r.valor}" oninput="state.rendas[${i}].valor=+this.value;try{calcular()}catch(e){saveNow()}"></div>
        <div class="ifield"><label>Dia recebimento</label><input type="number" value="${r.dia}" min="1" max="31" oninput="state.rendas[${i}].dia=+this.value;try{calcular()}catch(e){saveNow()}"></div>
        <div class="ifield"><label>Competência</label><input type="month" value="${r.competencia||''}" oninput="state.rendas[${i}].competencia=this.value;try{calcular()}catch(e){saveNow()}" style="color-scheme:dark"></div>
        <div class="ifield"><label>Membro</label><select onchange="state.rendas[${i}].membro=this.value">${membrosOptions(r.membro)}</select></div>
        <div class="ifield"><label>Tipo</label>
          <select onchange="state.rendas[${i}].tipo=this.value;renderRendas()">
            <option value="fixo" ${r.tipo === 'fixo' ? 'selected' : ''}>Fixo</option>
            <option value="variavel" ${r.tipo === 'variavel' ? 'selected' : ''}>Variável</option>
            <option value="extra" ${r.tipo === 'extra' ? 'selected' : ''}>Extra</option>
          </select>
        </div>
      </div>
    </div>`;
        });
      }
      function renderRendaMetrics(renda) {
        const el = document.getElementById('renda-metrics'); if (!el) return;
        const fixo = state.rendas.filter(r => r.tipo === 'fixo').reduce((s, r) => s + r.valor, 0);
        const varv = renda - fixo;
        el.innerHTML = `
    <div class="metric" style="--mc:var(--acc)"><div class="metric-label">Renda total</div><div class="metric-value" style="color:var(--acc)">${fmt(renda)}</div></div>
    <div class="metric" style="--mc:var(--green)"><div class="metric-label">Renda fixa</div><div class="metric-value" style="color:var(--green)">${fmt(fixo)}</div></div>
    <div class="metric" style="--mc:var(--yellow)"><div class="metric-label">Renda variável</div><div class="metric-value" style="color:var(--yellow)">${fmt(varv)}</div></div>
    <div class="metric" style="--mc:var(--blue)"><div class="metric-label">Fontes</div><div class="metric-value" style="color:var(--blue)">${state.rendas.length}</div></div>`;
      }

      // ══════════════════════════════════════════
      //  ESSENCIAIS
      // ══════════════════════════════════════════
      function addEssencial() {
        const hoje = new Date();
        const comp = hoje.getFullYear() + '-' + String(hoje.getMonth()+1).padStart(2,'0');
        state.essenciais.push({ id: uid('e'), nome: 'Nova despesa', valor: 0, dia: 10, membro: state.membros[0]?.id || 'm1', cat: 'outros', fixo: true, pago: false, competencia: comp });
        renderEssenciais(); calcular();
      }
      function removeEssencial(id) { state.essenciais = state.essenciais.filter(e => e.id !== id); renderEssenciais(); calcular(); }
      function renderPagoBar(elId, items) {
        const el = document.getElementById(elId); if (!el || !items.length) { if(el) el.innerHTML=''; return; }
        const total = items.length;
        const pagas = items.filter(x => x.pago).length;
        const pct = Math.round(pagas / total * 100);
        const valPago = items.filter(x => x.pago).reduce((s,x) => s + x.valor, 0);
        const valTotal = items.reduce((s,x) => s + x.valor, 0);
        const cor = pct === 100 ? 'var(--green)' : pct >= 50 ? 'var(--acc)' : 'var(--yellow)';
        el.innerHTML = `<div class="card" style="padding:1rem 1.25rem">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:13px;font-weight:600;color:var(--text)">${pagas === total ? '🎉' : '💳'} Contas pagas</span>
              <span style="font-size:12px;color:var(--muted)">${pagas} de ${total}</span>
            </div>
            <div style="display:flex;align-items:center;gap:12px">
              <span style="font-size:12px;color:var(--green)">${fmt(valPago)} pago</span>
              <span style="font-size:12px;color:var(--muted)">/ ${fmt(valTotal)} total</span>
              <span style="font-family:var(--ff);font-size:17px;font-weight:700;color:${cor}">${pct}%</span>
            </div>
          </div>
          <div style="background:var(--s3);border-radius:99px;height:8px;overflow:hidden">
            <div style="height:100%;border-radius:99px;width:${pct}%;background:${cor};transition:width .5s cubic-bezier(.4,0,.2,1)"></div>
          </div>
          ${pct === 100 ? '<div style="margin-top:8px;font-size:12px;color:var(--green);text-align:center">✅ Todas as contas pagas este mês!</div>' : ''}
        </div>`;
      }

      function togglePagoEss(id) {
        const e = state.essenciais.find(x => x.id === id);
        if (e) { e.pago = !e.pago; renderEssenciais(); debounceAutoSave(); }
      }
      function togglePagoNE(id) {
        const n = state.naoEssenciais.find(x => x.id === id);
        if (n) { n.pago = !n.pago; renderNE(); debounceAutoSave(); }
      }
      function renderEssenciais() {
        const el = document.getElementById('lista-essenciais'); if (!el) return;
        el.innerHTML = '';
        state.essenciais.forEach((e, i) => {
          el.innerHTML += `<div class="item-card${e.pago ? ' pago' : ''}">
      <div class="item-top">
        <label class="chk-pago${e.pago ? ' pago' : ''}" onclick="togglePagoEss('${e.id}')">
          <div class="chk-pago-box">${e.pago ? '✓' : ''}</div>
          ${e.pago ? 'Pago' : 'Marcar pago'}
        </label>
        <input class="item-name-inp" value="${esc(e.nome)}" onchange="state.essenciais[${i}].nome=this.value;calcular()">
        <span class="badge ${e.fixo ? 'b-blue' : 'b-yellow'}">${e.fixo ? 'Fixo' : 'Variável'}</span>
        <div class="venc-dot ${getDotClass(e.dia)}"></div>
        <button class="rm-btn" onclick="removeEssencial('${e.id}')">remover</button>
      </div>
      <div class="item-fields if-auto">
        <div class="ifield"><label>Valor (R$)</label><input type="number" value="${e.valor}" oninput="state.essenciais[${i}].valor=+this.value;calcular()"></div>
        <div class="ifield"><label>Vencimento (dia)</label><input type="number" value="${e.dia}" min="1" max="31" oninput="state.essenciais[${i}].dia=+this.value;calcular()"></div>
        <div class="ifield"><label>Competência</label><input type="month" value="${e.competencia||''}" oninput="state.essenciais[${i}].competencia=this.value" style="color-scheme:dark"></div>
        <div class="ifield"><label>Membro</label><select onchange="state.essenciais[${i}].membro=this.value;renderMembros();renderFamiliaTotais()">${membrosOptions(e.membro)}</select></div>
        <div class="ifield"><label>Categoria</label>
          <select onchange="state.essenciais[${i}].cat=this.value;calcular()">
            ${CATS_ESS.map(c => `<option value="${c}" ${e.cat === c ? 'selected' : ''}>${CAT_LABEL[c] || c}</option>`).join('')}
          </select>
        </div>
        <div class="ifield"><label>Fixo?</label>
          <select onchange="state.essenciais[${i}].fixo=this.value==='1';renderEssenciais()">
            <option value="1" ${e.fixo ? 'selected' : ''}>Sim</option>
            <option value="0" ${!e.fixo ? 'selected' : ''}>Não</option>
          </select>
        </div>
      </div>
    </div>`;
        });
        renderPagoBar('pago-bar-ess', state.essenciais);
      }
      function renderResumoEss(tot, cov) {
        const el = document.getElementById('resumo-essenciais'); if (!el) return;
        const liq = Math.max(0, tot - cov.superCov - cov.netCov);
        el.innerHTML = `
    <div class="card-row"><label>Total bruto</label><span>${fmt(tot)}</span></div>
    <div class="card-row"><label>Coberto por benefícios</label><span style="color:var(--green)">– ${fmt(cov.superCov + cov.netCov)}</span></div>
    <div class="card-row" style="border-top:1px solid var(--b2);padding-top:10px;margin-top:4px">
      <label style="font-weight:600;color:var(--text)">Custo líquido</label>
      <span style="color:var(--yellow);font-weight:700">${fmt(liq)}</span>
    </div>`;
      }

      // ══════════════════════════════════════════
      //  NÃO ESSENCIAIS
      // ══════════════════════════════════════════
      function addNE() {
        const hoje = new Date();
        const comp = hoje.getFullYear() + '-' + String(hoje.getMonth()+1).padStart(2,'0');
        state.naoEssenciais.push({ id: uid('n'), nome: 'Nova despesa', valor: 0, dia: 20, membro: state.membros[0]?.id || 'm1', cat: 'outros', fixo: false, pago: false, competencia: comp });
        renderNE(); calcular();
      }
      function removeNE(id) { state.naoEssenciais = state.naoEssenciais.filter(n => n.id !== id); renderNE(); calcular(); }
      function renderNE() {
        const el = document.getElementById('lista-ne'); if (!el) return;
        el.innerHTML = '';
        state.naoEssenciais.forEach((n, i) => {
          el.innerHTML += `<div class="item-card${n.pago ? ' pago' : ''}">
      <div class="item-top">
        <label class="chk-pago${n.pago ? ' pago' : ''}" onclick="togglePagoNE('${n.id}')">
          <div class="chk-pago-box">${n.pago ? '✓' : ''}</div>
          ${n.pago ? 'Pago' : 'Marcar pago'}
        </label>
        <input class="item-name-inp" value="${esc(n.nome)}" onchange="state.naoEssenciais[${i}].nome=this.value;calcular()">
        <span class="badge ${n.fixo ? 'b-blue' : 'b-yellow'}">${n.fixo ? 'Fixo' : 'Variável'}</span>
        <div class="venc-dot ${getDotClass(n.dia)}"></div>
        <button class="rm-btn" onclick="removeNE('${n.id}')">remover</button>
      </div>
      <div class="item-fields if-auto">
        <div class="ifield"><label>Valor (R$)</label><input type="number" value="${n.valor}" oninput="state.naoEssenciais[${i}].valor=+this.value;calcular()"></div>
        <div class="ifield"><label>Vencimento (dia)</label><input type="number" value="${n.dia}" min="1" max="31" oninput="state.naoEssenciais[${i}].dia=+this.value;calcular()"></div>
        <div class="ifield"><label>Competência</label><input type="month" value="${n.competencia||''}" oninput="state.naoEssenciais[${i}].competencia=this.value" style="color-scheme:dark"></div>
        <div class="ifield"><label>Membro</label><select onchange="state.naoEssenciais[${i}].membro=this.value;renderMembros();renderFamiliaTotais()">${membrosOptions(n.membro)}</select></div>
        <div class="ifield"><label>Categoria</label>
          <select onchange="state.naoEssenciais[${i}].cat=this.value;calcular()">
            ${CATS_NE.map(c => `<option value="${c}" ${n.cat === c ? 'selected' : ''}>${CAT_LABEL[c] || c}</option>`).join('')}
          </select>
        </div>
        <div class="ifield"><label>Fixo?</label>
          <select onchange="state.naoEssenciais[${i}].fixo=this.value==='1';renderNE()">
            <option value="1" ${n.fixo ? 'selected' : ''}>Sim</option>
            <option value="0" ${!n.fixo ? 'selected' : ''}>Não</option>
          </select>
        </div>
      </div>
    </div>`;
        });
        renderPagoBar('pago-bar-ne', state.naoEssenciais);
      }
      function renderResumoNE(tot, cov) {
        const el = document.getElementById('resumo-ne'); if (!el) return;
        const liq = Math.max(0, tot - cov.combCov);
        el.innerHTML = `
    <div class="card-row"><label>Total bruto</label><span>${fmt(tot)}</span></div>
    <div class="card-row"><label>Coberto por benefícios</label><span style="color:var(--green)">– ${fmt(cov.combCov)}</span></div>
    <div class="card-row" style="border-top:1px solid var(--b2);padding-top:10px;margin-top:4px">
      <label style="font-weight:600;color:var(--text)">Custo líquido</label>
      <span style="color:var(--orange);font-weight:700">${fmt(liq)}</span>
    </div>`;
      }

      function getDotClass(dia) {
        const hoje = new Date().getDate();
        if (dia === hoje) return 'venc-hoje';
        if (dia > hoje && dia - hoje <= 5) return 'venc-prox';
        return 'venc-ok';
      }

      // ══════════════════════════════════════════
      //  BENEFÍCIOS
      // ══════════════════════════════════════════
      function renderBenefCov(cov) {
        const el = document.getElementById('benefit-coverage'); if (!el) return;
        const rows = [
          { l: 'VA → Supermercado', val: cov.superCov, max: state.essenciais.filter(e => e.cat === 'alimentacao').reduce((s, e) => s + e.valor, 0) },
          { l: 'VT → Combustível/Transporte', val: cov.combCov, max: state.naoEssenciais.filter(n => n.cat === 'transporte').reduce((s, n) => s + n.valor, 0) },
          { l: 'Auxílio → Internet', val: cov.netCov, max: state.essenciais.filter(e => e.nome.toLowerCase().includes('internet')).reduce((s, e) => s + e.valor, 0) },
          { l: 'Vale Refeição', val: cov.vrCov, max: cov.vrCov },
        ].filter(r => r.val > 0 || r.max > 0);
        if (!rows.length) { el.innerHTML = '<div class="hbox hbox-blue">Nenhum benefício configurado ainda.</div>'; return; }
        el.innerHTML = rows.map(r => {
          const pct = r.max > 0 ? clamp(r.val / r.max * 100, 0, 100) : 100;
          const c = pct >= 100 ? 'var(--green)' : pct > 50 ? 'var(--yellow)' : 'var(--red)';
          return `<div class="card-row">
      <label>${r.l}</label>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="color:${c};font-weight:600">${fmt(r.val)}</span>
        ${r.max > 0 && r.max !== r.val ? `<span style="color:var(--muted);font-size:10px">/ ${fmt(r.max)}</span>` : ''}
        <div class="prog" style="width:80px"><div class="prog-fill" style="width:${pct}%;background:${c}"></div></div>
      </div>
    </div>`;
        }).join('') + `<div class="card-row" style="border-top:1px solid var(--b2);padding-top:10px;margin-top:4px">
    <label style="font-weight:600;color:var(--text)">Total coberto</label>
    <span style="color:var(--green);font-weight:700">${fmt(cov.total)}</span>
  </div>`;
      }

      // ══════════════════════════════════════════
      //  CARTÕES DE CRÉDITO
      // ══════════════════════════════════════════
      function addCartao() {
        state.cartoes.push({ id: uid('c'), banco: 'Nubank', tipo: 'básico', bandeira: 'Mastercard', limite: 2000, fatura: 0, venc: 15, anuidade: 0, taxa: 15.99, parcelas: [] });
        renderCartoes(); calcular();
      }
      function removeCartao(id) { state.cartoes = state.cartoes.filter(c => c.id !== id); renderCartoes(); calcular(); }
      function addParcela(ccId) {
        const cc = state.cartoes.find(c => c.id === ccId); if (!cc) return;
        cc.parcelas.push({ desc: '', valor: 0, total: 0, pagas: 0 });
        renderCartoes(); calcular();
      }
      function removeParcela(ccId, pi) {
        const cc = state.cartoes.find(c => c.id === ccId); if (!cc) return;
        cc.parcelas.splice(pi, 1); renderCartoes(); calcular();
      }
      function renderCartoes() {
        const el = document.getElementById('lista-cartoes'); if (!el) return;
        // Se CC_BENEFITS_DB ainda não carregou, aguarda e tenta novamente
        if (!CC_BENEFITS_DB || Object.keys(CC_BENEFITS_DB).length === 0) {
          const configPromise = typeof loadConfig === 'function' ? loadConfig() : Promise.resolve();
          configPromise.then(() => renderCartoes());
          return;
        }
        el.innerHTML = '';
        state.cartoes.forEach((c, i) => {
          const db = CC_BENEFITS_DB[c.banco] || CC_BENEFITS_DB['Outro'] || { cor:'var(--b1)', milhas:false, cashback:false, pontos:false, programa:'', beneficios:[] };
          const cor = db.cor;
          if (!Array.isArray(c.parcelas)) c.parcelas = [];
          const parcTotal = c.parcelas.reduce((s, p) => s + p.valor, 0);
          const bancoOpts = BANCOS.map(b => `<option value="${b}" ${c.banco === b ? 'selected' : ''}>${b}</option>`).join('');
          const tipoOpts = TIPOS_CC.map(t => `<option value="${t.toLowerCase()}" ${c.tipo === t.toLowerCase() ? 'selected' : ''}>${t}</option>`).join('');
          const bandeiraOpts = BANDEIRAS.map(b => `<option value="${b}" ${c.bandeira === b ? 'selected' : ''}>${b}</option>`).join('');
          const benefTags = db.beneficios.map(b => `<span class="cc-benefit-tag">✦ ${b}</span>`).join(' ');
          const parcHtml = c.parcelas.map((p, pi) => `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:6px;align-items:center;margin-bottom:6px;font-size:12px">
        <input style="background:var(--s1);border:1px solid var(--b1);border-radius:6px;padding:5px 8px;color:var(--text);width:100%" placeholder="Descrição" value="${p.desc}" oninput="state.cartoes[${i}].parcelas[${pi}].desc=this.value">
        <input type="number" style="background:var(--s1);border:1px solid var(--b1);border-radius:6px;padding:5px 8px;color:var(--text);width:100%" placeholder="Parcela R$" value="${p.valor || ''}" oninput="state.cartoes[${i}].parcelas[${pi}].valor=+this.value;calcular()">
        <input type="number" style="background:var(--s1);border:1px solid var(--b1);border-radius:6px;padding:5px 8px;color:var(--text);width:100%" placeholder="Total R$" value="${p.total || ''}" oninput="state.cartoes[${i}].parcelas[${pi}].total=+this.value">
        <input type="number" style="background:var(--s1);border:1px solid var(--b1);border-radius:6px;padding:5px 8px;color:var(--text);width:100%" placeholder="Pagas" value="${p.pagas || ''}" oninput="state.cartoes[${i}].parcelas[${pi}].pagas=+this.value">
        <button class="rm-btn" onclick="removeParcela('${c.id}',${pi})">✕</button>
      </div>`).join('');
          el.innerHTML += `<div class="cc-card" style="--cc-color:${cor}">
      <div class="cc-top">
        <div>
          <div class="cc-banco">${esc(c.banco)} <span style="font-size:12px;color:var(--muted);font-weight:400">${esc(c.bandeira)}</span></div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${c.tipo} · Venc. dia ${c.venc}</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          ${db.milhas ? '<span class="badge b-purple">✈ Milhas</span>' : ''}
          ${db.cashback ? '<span class="badge b-green">💰 Cashback</span>' : ''}
          ${db.pontos ? '<span class="badge b-blue">⭐ Pontos</span>' : ''}
          <button class="rm-btn" onclick="removeCartao('${c.id}')">remover</button>
        </div>
      </div>
      <div class="item-fields if-auto" style="margin-bottom:10px">
        <div class="ifield"><label>Banco</label><select onchange="state.cartoes[${i}].banco=this.value;renderCartoes()">${bancoOpts}</select></div>
        <div class="ifield"><label>Tipo</label><select onchange="state.cartoes[${i}].tipo=this.value">${tipoOpts}</select></div>
        <div class="ifield"><label>Bandeira</label><select onchange="state.cartoes[${i}].bandeira=this.value">${bandeiraOpts}</select></div>
        <div class="ifield"><label>Limite (R$)</label><input type="number" value="${c.limite}" oninput="state.cartoes[${i}].limite=+this.value"></div>
        <div class="ifield"><label>Fatura atual (R$)</label><input type="number" value="${c.fatura}" oninput="state.cartoes[${i}].fatura=+this.value;calcular()"></div>
        <div class="ifield"><label>Vencimento (dia)</label><input type="number" value="${c.venc}" min="1" max="31" oninput="state.cartoes[${i}].venc=+this.value"></div>
        <div class="ifield"><label>Anuidade (R$/ano)</label><input type="number" value="${c.anuidade}" oninput="state.cartoes[${i}].anuidade=+this.value"></div>
        <div class="ifield"><label>Taxa juros %/mês</label><input type="number" value="${c.taxa}" step="0.1" oninput="state.cartoes[${i}].taxa=+this.value"></div>
      </div>
      <div style="margin-bottom:10px">
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">${db.programa}</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">${benefTags}</div>
      </div>
      <div>
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Parcelas</div>
        <div style="font-size:10px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:6px;color:var(--dim);margin-bottom:4px"><span>Descrição</span><span>Parcela R$</span><span>Total R$</span><span>Pagas</span><span></span></div>
        ${parcHtml}
        <button style="font-size:12px;padding:5px 10px;border:1px dashed var(--b1);border-radius:6px;background:none;color:var(--muted);cursor:pointer" onclick="addParcela('${c.id}')">+ Parcela</button>
        ${parcTotal > 0 ? `<div style="font-size:12px;color:var(--yellow);margin-top:6px">Total em parcelas este mês: ${fmt(parcTotal)}</div>` : ''}
      </div>
    </div>`;
        });
      }
      function renderCCRecomendacao() {
        const el = document.getElementById('cc-recomendacao'); if (!el) return;
        if (!state.cartoes.length) { el.innerHTML = '<div class="hbox hbox-blue">Nenhum cartão cadastrado.</div>'; return; }
        const scored = state.cartoes.map(c => {
          const db = CC_BENEFITS_DB[c.banco] || CC_BENEFITS_DB['Outro'] || { cor:'var(--b1)', milhas:false, cashback:false, pontos:false, programa:'', beneficios:[], score:0 };
          let score = 0;
          if (db.milhas) score += 3; if (db.cashback) score += 2; if (db.pontos) score += 1;
          if (c.anuidade === 0) score += 3; else if (c.anuidade < 400) score += 1;
          if (c.taxa < 5) score += 3; else if (c.taxa < 10) score += 2; else if (c.taxa < 15) score += 1;
          const uso = c.limite > 0 ? (c.fatura / c.limite) * 100 : 0;
          if (uso < 30) score += 2;
          return { ...c, db, score, uso };
        }).sort((a, b) => b.score - a.score);
        const best = scored[0];
        el.innerHTML = `<div class="hbox hbox-acc" style="margin-bottom:1rem">
    <strong>Melhor uso: ${best.banco} ${best.bandeira}</strong><br>
    ${best.db.programa} — ${best.db.beneficios.join(' · ')}
  </div>` + scored.map((c, i) => `<div class="card-row">
    <div>
      <span style="font-weight:500">${i + 1}. ${esc(c.banco)} ${esc(c.bandeira)}</span>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">
        ${c.db.milhas ? '✈ Milhas ' : ''}${c.db.cashback ? '💰 Cashback ' : ''}${c.db.pontos ? '⭐ Pontos ' : ''}
        · Anuidade: ${c.anuidade > 0 ? fmt(c.anuidade / 12) + '/mês' : 'grátis'}
        · Juros: ${c.taxa}%/mês · Limite usado: ${Math.round(c.uso)}%
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-family:var(--ff);font-size:18px;font-weight:700;color:${i === 0 ? 'var(--acc)' : 'var(--muted)'}">${c.score} pts</div>
      ${i === 0 ? '<div style="font-size:10px;color:var(--acc)">⭐ Recomendado</div>' : ''}
    </div>
  </div>`).join('');
      }

      // ══════════════════════════════════════════
      //  DÍVIDAS
      // ══════════════════════════════════════════
      function addDivida() {
        state.dividas.push({ id: uid('d'), nome: 'Nova dívida', total: 1000, juros: 5, minimo: 100, cat: 'outro', parcelas: 0 });
        renderDividas(); calcular();
      }
      function removeDivida(id) { state.dividas = state.dividas.filter(d => d.id !== id); renderDividas(); calcular(); }
      function renderDividas() {
        const el = document.getElementById('lista-dividas'); if (!el) return;
        el.innerHTML = '';
        state.dividas.forEach((d, i) => {
          const badge = d.juros >= 10 ? 'b-red' : d.juros >= 4 ? 'b-yellow' : 'b-green';
          const opts = CATS_DIV.map(c => `<option value="${c}" ${d.cat === c ? 'selected' : ''}>${CATS_DIV_LABEL[c]}</option>`).join('');
          el.innerHTML += `<div class="item-card">
      <div class="item-top">
        <input class="item-name-inp" value="${esc(d.nome)}" onchange="state.dividas[${i}].nome=this.value">
        <span class="badge ${badge}">${d.juros}%/mês</span>
        <button class="rm-btn" onclick="removeDivida('${d.id}')">remover</button>
      </div>
      <div class="item-fields if-auto">
        <div class="ifield"><label>Categoria</label><select onchange="state.dividas[${i}].cat=this.value">${opts}</select></div>
        <div class="ifield"><label>Saldo devedor (R$)</label><input type="number" value="${d.total}" oninput="state.dividas[${i}].total=+this.value;calcular()"></div>
        <div class="ifield"><label>Juros %/mês</label><input type="number" value="${d.juros}" step="0.5" oninput="state.dividas[${i}].juros=+this.value;renderDividas();calcular()"></div>
        <div class="ifield"><label>Pagamento mínimo</label><input type="number" value="${d.minimo}" oninput="state.dividas[${i}].minimo=+this.value;calcular()"></div>
        <div class="ifield"><label>Parcelas restantes</label><input type="number" value="${d.parcelas}" oninput="state.dividas[${i}].parcelas=+this.value"></div>
      </div>
    </div>`;
        });
      }
      function renderDebtFromCC() {
        const el = document.getElementById('div-tab-cartoes'); if (!el) return;
        if (!state.cartoes.length) { el.innerHTML = '<div class="hbox hbox-blue">Nenhum cartão cadastrado. Vá em Cartões de Crédito.</div>'; return; }
        el.innerHTML = state.cartoes.map(c => {
          const db = CC_BENEFITS_DB[c.banco] || CC_BENEFITS_DB['Outro'];
          const parcTotal = c.parcelas.reduce((s, p) => s + (p.total > 0 && p.pagas >= 0 ? p.total - p.pagas * p.valor : 0), 0);
          return `<div class="item-card" style="border-color:${db.cor}44">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-family:var(--ff);font-weight:700;font-size:15px">${esc(c.banco)} ${esc(c.bandeira)}</span>
        <span class="badge b-red">Taxa: ${c.taxa}%/mês</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px">
        <div><div style="font-size:10px;color:var(--muted)">Fatura atual</div><div style="font-weight:600;color:var(--red)">${fmt(c.fatura)}</div></div>
        <div><div style="font-size:10px;color:var(--muted)">Vencimento</div><div style="font-weight:600">Dia ${c.venc}</div></div>
        <div><div style="font-size:10px;color:var(--muted)">Saldo em parcelas</div><div style="font-weight:600;color:var(--yellow)">${fmt(parcTotal)}</div></div>
        <div><div style="font-size:10px;color:var(--muted)">Anuidade/mês</div><div style="font-weight:600">${fmt(c.anuidade / 12)}</div></div>
        <div><div style="font-size:10px;color:var(--muted)">Limite disponível</div><div style="font-weight:600;color:var(--green)">${fmt(Math.max(0, c.limite - c.fatura))}</div></div>
      </div>
    </div>`;
        }).join('');
      }
      function switchDivTab(t, btn) {
        ['geral', 'cartoes', 'estrategia'].forEach(x => { const el = document.getElementById('div-tab-' + x); if (el) el.style.display = 'none'; });
        const el = document.getElementById('div-tab-' + t); if (el) el.style.display = 'block';
        document.querySelectorAll('#page-dividas .tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
      function renderDebtStrategy(saldo, extra) {
        const el = document.getElementById('debt-strategy'); if (!el) return;
        const all = [
          ...state.dividas.map(d => ({ nome: d.nome, total: d.total, juros: d.juros, minimo: d.minimo })),
          ...state.cartoes.map(c => ({ nome: c.banco + ' (cartão)', total: c.fatura, juros: c.taxa, minimo: c.fatura })),
        ].filter(d => d.total > 0).sort((a, b) => b.juros - a.juros);
        if (!all.length) { el.innerHTML = '<div class="hbox hbox-green">Parabéns! Sem dívidas cadastradas.</div>'; return; }
        let extraLeft = Math.max(0, extra);
        el.innerHTML = all.map((d, i) => {
          const alocado = i === 0 ? extraLeft : 0;
          const meses = d.minimo + alocado > 0 ? Math.ceil(d.total / (d.minimo + alocado)) : 999;
          const c = d.juros >= 10 ? 'var(--red)' : d.juros >= 4 ? 'var(--yellow)' : 'var(--green)';
          return `<div class="card-row">
      <div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:11px;background:rgba(255,255,255,.07);border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-weight:700">${i + 1}</span>
          <span style="font-weight:500">${esc(d.nome)}</span>
          ${i === 0 ? '<span style="font-size:10px;padding:2px 6px;border-radius:5px;background:rgba(200,255,87,.12);color:var(--acc);font-weight:600">prioridade</span>' : ''}
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px;margin-left:26px">
          ${fmt(d.total)} · ${d.juros}%/mês · mín. ${fmt(d.minimo)}${alocado > 0 ? ' + ' + fmt(alocado) + ' extra' : ''}
        </div>
      </div>
      <div style="text-align:right">
        <div style="color:${c};font-weight:600">${meses < 999 ? meses + ' meses' : '—'}</div>
        <div style="font-size:10px;color:var(--muted)">para quitar</div>
      </div>
    </div>`;
        }).join('');
      }
      function renderDebtMetrics() {
        const el = document.getElementById('debt-metrics'); if (!el) return;
        const tot = getTotDiv(), min = getTotDivMin();
        const saldo = getTotRenda() + getTotBenef() - getTotEss() - getTotNE() - min;
        const extra = Math.max(0, saldo * 0.75);
        const meses = extra > 0 ? Math.ceil(tot / (min + extra)) : 999;
        el.innerHTML = `
    <div class="metric" style="--mc:var(--red)"><div class="metric-label">Total das dívidas</div><div class="metric-value" style="color:var(--red)">${fmt(tot)}</div></div>
    <div class="metric" style="--mc:var(--yellow)"><div class="metric-label">Mínimos mensais</div><div class="metric-value" style="color:var(--yellow)">${fmt(min)}</div></div>
    <div class="metric" style="--mc:var(--green)"><div class="metric-label">Extra disponível</div><div class="metric-value" style="color:var(--green)">${fmt(Math.max(0, extra))}</div></div>
    <div class="metric" style="--mc:var(--blue)"><div class="metric-label">Previsão quitação</div><div class="metric-value" style="color:var(--blue)">${meses < 999 ? meses + 'm' : '—'}</div></div>`;
      }

      // ══════════════════════════════════════════
      //  DASHBOARD
      // ══════════════════════════════════════════
      function renderDashMetrics(renda, benef, ess, ne, minDiv, saldo) {
        const el = document.getElementById('dash-metrics'); if (!el) return;
        const c = saldo < 0 ? 'var(--red)' : saldo < 300 ? 'var(--yellow)' : 'var(--green)';
        el.innerHTML = `
    <div class="metric" style="--mc:var(--acc)"><div class="metric-label">Renda total</div><div class="metric-value" style="color:var(--acc)">${fmt(renda + benef)}</div><div class="metric-note">Salários + benefícios</div></div>
    <div class="metric" style="--mc:var(--yellow)"><div class="metric-label">Total saídas</div><div class="metric-value" style="color:var(--yellow)">${fmt(ess + ne + minDiv)}</div><div class="metric-note">Todas as despesas</div></div>
    <div class="metric" style="--mc:var(--red)"><div class="metric-label">Total dívidas</div><div class="metric-value" style="color:var(--red)">${fmt(getTotDiv())}</div><div class="metric-note">Saldo devedor</div></div>
    <div class="metric" style="--mc:${c}"><div class="metric-label">Saldo livre</div><div class="metric-value" style="color:${c}">${fmt(saldo)}</div><div class="metric-note">${saldo < 0 ? 'Déficit! Atenção' : 'Disponível'}</div></div>`;
      }
      function renderDashCharts(ess, ne, minDiv) {
        const dCtx = document.getElementById('chart-donut');
        if (dCtx) {
          if (charts.donut) charts.donut.destroy();
          charts.donut = new Chart(dCtx, {
            type: 'doughnut',
            data: {
              labels: ['Essenciais', 'Não essenciais', 'Dívidas'],
              datasets: [{
                data: [Math.max(0, ess), Math.max(0, ne), Math.max(0, minDiv)],
                backgroundColor: ['rgba(96,165,250,.7)', 'rgba(251,191,36,.7)', 'rgba(248,113,113,.7)'],
                borderColor: 'transparent', hoverOffset: 6
              }]
            },
            options: {
              responsive: true, maintainAspectRatio: false, cutout: '65%',
              plugins: {
                legend: { position: 'bottom', labels: { color: '#7a7f96', font: { size: 11 }, padding: 12 } },
                tooltip: { callbacks: { label: c => ' ' + fmt(c.parsed) } }
              }
            }
          });
        }
        const bCtx = document.getElementById('chart-bar');
        if (bCtx) {
          if (charts.bar) charts.bar.destroy();
          const cats = getCatData();
          charts.bar = new Chart(bCtx, {
            type: 'bar',
            data: { labels: cats.map(c => c.l), datasets: [{ data: cats.map(c => c.v), backgroundColor: 'rgba(96,165,250,.65)', borderRadius: 5, borderSkipped: false }] },
            options: {
              responsive: true, maintainAspectRatio: false, indexAxis: 'y',
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmt(c.parsed.x) } } },
              scales: {
                x: { ticks: { color: '#7a7f96', font: { size: 10 }, callback: v => fmt(v) }, grid: { color: 'rgba(255,255,255,.04)' } },
                y: { ticks: { color: '#7a7f96', font: { size: 10 } }, grid: { display: false } }
              }
            }
          });
        }
        // line
        const lCtx = document.getElementById('chart-line');
        if (lCtx) {
          if (charts.line) charts.line.destroy();
          const r = getTotRenda() + getTotBenef();
          const g2 = getTotEss() + getTotNE() + getTotDivMin();
          const sm = r - g2;
          const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
          const hi = new Date().getMonth();
          const labels = Array.from({ length: 12 }, (_, i) => meses[(hi + i) % 12]);
          const data = labels.map((_, i) => Math.round(Math.max(0, sm) * (i + 1)));
          charts.line = new Chart(lCtx, {
            type: 'line',
            data: { labels, datasets: [{ label: 'Saldo acumulado', data, borderColor: 'rgba(200,255,87,.8)', backgroundColor: 'rgba(200,255,87,.06)', tension: .4, fill: true, pointBackgroundColor: 'rgba(200,255,87,1)', pointRadius: 3 }] },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmt(c.parsed.y) } } },
              scales: {
                x: { ticks: { color: '#7a7f96', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,.04)' } },
                y: { ticks: { color: '#7a7f96', font: { size: 11 }, callback: v => fmt(v) }, grid: { color: 'rgba(255,255,255,.04)' } }
              }
            }
          });
        }
      }
      function getCatData() {
        const map = {};
        [...state.essenciais, ...state.naoEssenciais].forEach(x => { map[x.cat] = (map[x.cat] || 0) + x.valor; });
        state.cartoes.forEach(c => { map['credito'] = (map['credito'] || 0) + c.fatura; });
        return Object.entries(map).map(([k, v]) => ({ l: CAT_LABEL[k] || k, v })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 10);
      }
      function renderDashVencimentos() {
        const el = document.getElementById('dash-vencimentos'); if (!el) return;
        const hoje = new Date().getDate();
        const all = [
          ...state.essenciais.map(e => ({ ...e, tipo: 'essencial' })),
          ...state.naoEssenciais.map(n => ({ ...n, tipo: 'não essencial' })),
          ...state.cartoes.map(c => ({ nome: c.banco + ' (fatura)', valor: c.fatura, dia: c.venc, tipo: 'cartão' })),
          ...state.rendas.map(r => ({ ...r, tipo: 'renda' })),
        ].sort((a, b) => a.dia - b.dia);
        const prox = all.filter(x => x.dia >= hoje).slice(0, 10);
        if (!prox.length) { el.innerHTML = '<div style="color:var(--muted);font-size:13px">Nenhum vencimento próximo.</div>'; return; }
        el.innerHTML = prox.map(x => {
          const diff = x.dia - hoje;
          const dotC = diff === 0 ? 'venc-hoje' : diff <= 5 ? 'venc-prox' : 'venc-ok';
          const isRenda = x.tipo === 'renda';
          return `<div class="card-row">
      <div style="display:flex;align-items:center;gap:8px">
        <div class="venc-dot ${dotC}"></div>
        <div>
          <div style="font-size:13px;font-weight:500">${x.nome}</div>
          <div style="font-size:11px;color:var(--muted)">Dia ${x.dia}${diff === 0 ? ' — HOJE' : diff === 1 ? ' — amanhã' : diff <= 5 ? ' — em ' + diff + ' dias' : ''} · ${x.tipo}</div>
        </div>
      </div>
      <span style="font-weight:600;color:${isRenda ? 'var(--green)' : 'var(--red)'}">${isRenda ? '+' : '–'} ${fmt(x.valor)}</span>
    </div>`;
        }).join('');
      }

      // ══════════════════════════════════════════
      //  SALDO
      // ══════════════════════════════════════════
      function renderSaldo(saldo, reserva, extra, lazer, renda, benef, ess, ne, minDiv) {
        const c = saldo < 0 ? 'var(--red)' : saldo < 300 ? 'var(--yellow)' : 'var(--acc)';
        const sv = document.getElementById('saldo-value');
        if (sv) { sv.style.color = c; sv.textContent = fmt(saldo); }
        const sn = document.getElementById('saldo-note');
        if (sn) sn.textContent = saldo < 0 ? 'Déficit: você gasta mais do que ganha!' : saldo < 300 ? 'Saldo apertado. Reduza gastos variáveis.' : 'Saldo saudável. Distribua com inteligência!';
        const sd = document.getElementById('saldo-dist');
        if (sd) sd.innerHTML = saldo > 0
          ? `<div class="card-row"><label>🛡️ Reserva emergência</label><span style="color:var(--blue);font-weight:600">${fmt(reserva)}</span></div>
       <div class="card-row"><label>💳 Extra p/ dívidas</label><span style="color:var(--red);font-weight:600">${fmt(extra)}</span></div>
       <div class="card-row"><label>🎉 Lazer / qualidade</label><span style="color:var(--green);font-weight:600">${fmt(lazer)}</span></div>`
          : '<div class="hbox hbox-red">Saldo negativo — corte gastos não essenciais urgentemente.</div>';

        // cutoff somas
        [5, 15, 20].forEach(day => {
          const el = document.getElementById(`soma-d${String(day).padStart(2, '0')}`); if (!el) return;
          const desp = somaAteDia(day); const re = rendaAteDia(day); const s = re - desp;
          const sc = s < 0 ? 'var(--red)' : s < 200 ? 'var(--yellow)' : 'var(--green)';
          el.innerHTML = `
      <div class="card-row"><label>Despesas até dia ${day}</label><span style="color:var(--red)">${fmt(desp)}</span></div>
      <div class="card-row"><label>Renda recebida até dia ${day}</label><span style="color:var(--green)">${fmt(re)}</span></div>
      <div class="card-row"><label style="font-weight:600;color:var(--text)">Saldo parcial</label><span style="font-weight:700;color:${sc}">${fmt(s)}</span></div>`;
        });

        const sb = document.getElementById('saldo-breakdown');
        if (sb) sb.innerHTML = `
    <div class="card-row"><label>Renda líquida</label><span style="color:var(--green)">${fmt(renda)}</span></div>
    <div class="card-row"><label>Benefícios</label><span style="color:var(--green)">${fmt(benef)}</span></div>
    <div class="card-row"><label>(–) Essenciais</label><span style="color:var(--yellow)">– ${fmt(ess)}</span></div>
    <div class="card-row"><label>(–) Não essenciais</label><span style="color:var(--orange)">– ${fmt(ne)}</span></div>
    <div class="card-row"><label>(–) Dívidas (mínimos)</label><span style="color:var(--red)">– ${fmt(minDiv)}</span></div>
    <div class="card-row" style="border-top:1px solid var(--b2);padding-top:10px;margin-top:4px">
      <label style="font-weight:600;color:var(--text)">Saldo livre</label>
      <span style="color:${c};font-weight:700;font-size:18px;font-family:var(--ff)">${fmt(saldo)}</span>
    </div>`;
      }

      // ══════════════════════════════════════════
      //  INVESTIMENTOS — corrigido
      // ══════════════════════════════════════════
      function addInvestimento() {
        state.investimentos.push({ id: uid('i'), nome: 'Novo investimento', tipo: 'cdb100', valor: 0, aporte: 0, dataInicio: '', membro: state.membros[0]?.id || 'm1' });
        renderInvestimentos(); renderInvMetrics(); calcular();
      }
      function removeInv(id) {
        state.investimentos = state.investimentos.filter(x => x.id !== id);
        renderInvestimentos(); renderInvMetrics(); calcular();
      }
      function renderInvestimentos() {
        const el = document.getElementById('lista-investimentos'); if (!el) return;
        el.innerHTML = '';
        if (!state.investimentos.length) {
          el.innerHTML = '<div class="hbox hbox-blue" style="margin-bottom:1rem">Nenhum investimento cadastrado. Clique em "+ Adicionar investimento" para começar.</div>';
          return;
        }
        state.investimentos.forEach((inv, i) => {
          const info = TIPOS_INV.find(t => t.v === inv.tipo) || TIPOS_INV[0] || { taxa: 0.005, l: 'Padrão', ir: false };
          const tipoOpts = TIPOS_INV.map(t => `<option value="${t.v}" ${inv.tipo === t.v ? 'selected' : ''}>${t.l}</option>`).join('');
          // projeção 12 meses
          let s12 = inv.valor;
          for (let m = 0; m < 12; m++) s12 = s12 * (1 + info.taxa) + inv.aporte;
          const rend12 = s12 - inv.valor - inv.aporte * 12;
          // projeção 60 meses
          let s60 = inv.valor;
          for (let m = 0; m < 60; m++) s60 = s60 * (1 + info.taxa) + inv.aporte;

          el.innerHTML += `<div class="inv-card">
      <div class="inv-top">
        <div style="flex:1">
          <input value="${esc(inv.nome)}" onchange="state.investimentos[${i}].nome=this.value"
            style="background:var(--s3);border:1px solid var(--b1);border-radius:8px;padding:6px 10px;color:var(--text);font-family:var(--ff);font-size:15px;font-weight:600;width:100%;outline:none;transition:border-color .15s"
            onfocus="this.style.borderColor='var(--acc)'" onblur="this.style.borderColor='var(--b1)'">
          <div style="font-size:11px;color:var(--muted);margin-top:4px">${info.l} · ${info.ir ? 'IR sobre rendimento' : 'Isento de IR'} · taxa ~${(info.taxa * 100).toFixed(2)}%/mês</div>
        </div>
        <button class="rm-btn" onclick="removeInv('${inv.id}')">remover</button>
      </div>
      <div class="item-fields if-auto" style="margin-bottom:12px">
        <div class="ifield"><label>Tipo de investimento</label>
          <select onchange="state.investimentos[${i}].tipo=this.value;renderInvestimentos()">${tipoOpts}</select>
        </div>
        <div class="ifield"><label>Valor atual (R$)</label>
          <input type="number" value="${inv.valor}" onchange="state.investimentos[${i}].valor=+this.value;renderInvestimentos()">
        </div>
        <div class="ifield"><label>Aporte mensal (R$)</label>
          <input type="number" value="${inv.aporte}" onchange="state.investimentos[${i}].aporte=+this.value;renderInvestimentos();calcular()">
        </div>
        <div class="ifield"><label>Membro</label>
          <select onchange="state.investimentos[${i}].membro=this.value">${membrosOptions(inv.membro)}</select>
        </div>
        <div class="ifield"><label>Data início</label>
          <input type="date" value="${inv.dataInicio}" oninput="state.investimentos[${i}].dataInicio=this.value">
        </div>
      </div>
      <div class="inv-result">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;font-size:12px">
          <div><div style="color:var(--muted)">Saldo atual</div><div style="font-weight:600;color:var(--acc);font-size:14px">${fmt(inv.valor)}</div></div>
          <div><div style="color:var(--muted)">Em 12 meses</div><div style="font-weight:600;color:var(--green);font-size:14px">${fmt(s12)}</div></div>
          <div><div style="color:var(--muted)">Rendimento 12m</div><div style="font-weight:600;color:var(--blue);font-size:14px">${fmt(rend12)}</div></div>
          <div><div style="color:var(--muted)">Em 5 anos</div><div style="font-weight:600;color:var(--purple);font-size:14px">${fmt(s60)}</div></div>
        </div>
      </div>
    </div>`;
        });
      }
      function renderInvMetrics() {
        const el = document.getElementById('inv-metrics'); if (!el) return;
        const tot = getTotInv();
        const aportes = getTotAporteInv();
        let proj12 = 0;
        state.investimentos.forEach(inv => {
          const info = TIPOS_INV.find(t => t.v === inv.tipo) || TIPOS_INV[0];
          let s = inv.valor;
          for (let m = 0; m < 12; m++) s = s * (1 + info.taxa) + inv.aporte;
          proj12 += s;
        });
        el.innerHTML = `
    <div class="metric" style="--mc:var(--acc)"><div class="metric-label">Patrimônio atual</div><div class="metric-value" style="color:var(--acc)">${fmt(tot)}</div></div>
    <div class="metric" style="--mc:var(--green)"><div class="metric-label">Aportes/mês</div><div class="metric-value" style="color:var(--green)">${fmt(aportes)}</div></div>
    <div class="metric" style="--mc:var(--blue)"><div class="metric-label">Projeção 12 meses</div><div class="metric-value" style="color:var(--blue)">${fmt(proj12)}</div></div>
    <div class="metric" style="--mc:var(--purple)"><div class="metric-label">Ativos cadastrados</div><div class="metric-value" style="color:var(--purple)">${state.investimentos.length}</div></div>`;
        // chart
        const iCtx = document.getElementById('chart-inv');
        if (iCtx && state.investimentos.length) {
          if (charts.inv) charts.inv.destroy();
          charts.inv = new Chart(iCtx, {
            type: 'doughnut',
            data: {
              labels: state.investimentos.map(x => x.nome),
              datasets: [{
                data: state.investimentos.map(x => Math.max(0, x.valor)),
                backgroundColor: ['rgba(200,255,87,.7)', 'rgba(96,165,250,.7)', 'rgba(167,139,250,.7)', 'rgba(251,191,36,.7)', 'rgba(248,113,113,.7)', 'rgba(34,211,238,.7)'],
                borderColor: 'transparent'
              }]
            },
            options: {
              responsive: true, maintainAspectRatio: false, cutout: '60%',
              plugins: {
                legend: { position: 'bottom', labels: { color: '#7a7f96', font: { size: 11 }, padding: 10 } },
                tooltip: { callbacks: { label: c => ' ' + fmt(c.parsed) } }
              }
            }
          });
        }
      }
      function switchInvTab(t, btn) {
        ['carteira', 'simulador', 'sugestoes'].forEach(x => {
          const el = document.getElementById('inv-tab-' + x);
          if (el) el.style.display = 'none';
        });
        const el = document.getElementById('inv-tab-' + t);
        if (el) el.style.display = 'block';
        document.querySelectorAll('#page-investimentos .tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // render after display so chart dimensions are correct
        setTimeout(() => {
          if (t === 'simulador') simular();
          if (t === 'sugestoes') renderInvSugestoes(getTotRenda() + getTotBenef());
          if (t === 'carteira') { renderInvestimentos(); renderInvMetrics(); }
        }, 60);
      }

      // ── SIMULADOR ──
      function simular() {
        const tipo = gStr('sim-tipo');
        const customRow = document.getElementById('sim-custom-row');
        if (customRow) customRow.style.display = tipo === 'custom' ? 'flex' : 'none';
        const info = TIPOS_INV.find(t => t.v === tipo) || TIPOS_INV[1];
        const taxa = tipo === 'custom' ? g('sim-taxa') / 100 : (info?.taxa ?? 0.005);
        const inicial = g('sim-inicial') || 0;
        const aporte = g('sim-aporte') || 0;
        const prazo = Math.max(1, g('sim-prazo') || 12);
        let saldo = inicial, hist = [inicial];
        for (let m = 0; m < prazo; m++) { saldo = saldo * (1 + taxa) + aporte; hist.push(Math.round(saldo)); }
        const totalAportado = inicial + aporte * prazo;
        const rendimento = saldo - totalAportado;
        const rendPct = totalAportado > 0 ? (rendimento / totalAportado * 100) : 0;
        const el = document.getElementById('sim-result');
        if (el) el.innerHTML = `
    <div class="metric" style="--mc:var(--acc);margin-bottom:.75rem"><div class="metric-label">Valor final</div><div class="metric-value" style="color:var(--acc)">${fmt(saldo)}</div></div>
    <div class="metric" style="--mc:var(--green);margin-bottom:.75rem"><div class="metric-label">Rendimento total</div><div class="metric-value" style="color:var(--green)">${fmt(rendimento)}</div><div class="metric-note">+${rendPct.toFixed(1)}% sobre o aportado</div></div>
    <div class="metric" style="--mc:var(--blue)"><div class="metric-label">Total aportado</div><div class="metric-value" style="color:var(--blue)">${fmt(totalAportado)}</div></div>`;
        const sCtx = document.getElementById('chart-sim'); if (!sCtx) return;
        if (charts.sim) charts.sim.destroy();
        const labels = Array.from({ length: prazo + 1 }, (_, i) => i === 0 ? 'Início' : `M${i}`);
        const aportadoLine = Array.from({ length: prazo + 1 }, (_, i) => inicial + aporte * i);
        charts.sim = new Chart(sCtx, {
          type: 'line',
          data: {
            labels, datasets: [
              { label: 'Saldo com juros', data: hist, borderColor: 'rgba(200,255,87,.9)', backgroundColor: 'rgba(200,255,87,.08)', tension: .4, fill: true, pointRadius: prazo <= 24 ? 3 : 0 },
              { label: 'Total aportado', data: aportadoLine, borderColor: 'rgba(96,165,250,.6)', backgroundColor: 'rgba(96,165,250,.04)', tension: .4, fill: true, pointRadius: 0, borderDash: [4, 4] },
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: { legend: { position: 'bottom', labels: { color: '#7a7f96', font: { size: 11 }, padding: 12 } }, tooltip: { callbacks: { label: c => ' ' + fmt(c.parsed.y) } } },
            scales: {
              x: { ticks: { color: '#7a7f96', font: { size: 10 }, maxTicksLimit: 12 }, grid: { color: 'rgba(255,255,255,.04)' } },
              y: { ticks: { color: '#7a7f96', font: { size: 10 }, callback: v => fmt(v) }, grid: { color: 'rgba(255,255,255,.04)' } }
            }
          }
        });
      }
      function renderInvSugestoes(renda) {
        const el = document.getElementById('inv-sugestoes'); if (!el) return;
        const sugestoes = renda < 2000 ? [
          { nome: 'Poupança', desc: 'Zero risco, liquidez imediata. Perfeita para a reserva de emergência.', retorno: '~6%/ano', risco: 'Baixo', minimo: 'R$ 1', tag: 'b-green' },
          { nome: 'CDB liquidez diária', desc: 'Rende mais que poupança. Saque quando quiser, sem carência.', retorno: '~10%/ano', risco: 'Baixo', minimo: 'R$ 1', tag: 'b-green' },
          { nome: 'Tesouro Selic', desc: 'Garantido pelo governo federal. Melhor que poupança.', retorno: '~10.5%/ano', risco: 'Baixo', minimo: 'R$ 30', tag: 'b-green' },
          { nome: 'LCI/LCA', desc: 'Isento de imposto de renda. Excelente para perfil conservador.', retorno: '~9.5%/ano', risco: 'Baixo', minimo: 'R$ 1.000', tag: 'b-blue' },
        ] : renda < 6000 ? [
          { nome: 'CDB 110% CDI', desc: 'Rende 10% acima da taxa normal do CDI.', retorno: '~11%/ano', risco: 'Baixo', minimo: 'R$ 1', tag: 'b-green' },
          { nome: 'Tesouro IPCA+', desc: 'Protege contra inflação + juro real. Ideal para longo prazo.', retorno: '~6% real/ano', risco: 'Médio', minimo: 'R$ 30', tag: 'b-blue' },
          { nome: 'FIIs (Fundos Imobiliários)', desc: 'Renda mensal via aluguéis de imóveis. Isento de IR.', retorno: '~9%/ano', risco: 'Médio', minimo: 'R$ 10/cota', tag: 'b-yellow' },
          { nome: 'Ações via ETF (BOVA11)', desc: 'Exposição ao Ibovespa inteiro com uma única cota.', retorno: 'variável', risco: 'Alto', minimo: 'R$ 20/cota', tag: 'b-red' },
        ] : [
          { nome: 'Carteira diversificada', desc: '60% renda fixa + 30% ações + 10% internacional.', retorno: '~12-15%/ano', risco: 'Médio', minimo: 'Varia', tag: 'b-purple' },
          { nome: 'FIIs de papel e tijolo', desc: 'Diversificação entre imóveis físicos e recebíveis imobiliários.', retorno: '~10%/ano', risco: 'Médio', minimo: 'R$ 10/cota', tag: 'b-blue' },
          { nome: 'BDRs (Apple, Google...)', desc: 'Investir em grandes empresas internacionais via B3.', retorno: 'variável', risco: 'Alto', minimo: 'R$ 10/BDR', tag: 'b-orange' },
          { nome: 'Previdência PGBL/VGBL', desc: 'Benefício fiscal para quem declara IR completo.', retorno: '~10%/ano', risco: 'Baixo-Médio', minimo: 'Varia', tag: 'b-green' },
        ];
        el.innerHTML = `<div class="hbox hbox-blue" style="margin-bottom:1rem">Sugestões para renda de ${fmt(renda)}/mês. Consulte um especialista antes de investir.</div>` +
          sugestoes.map(s => `<div class="card" style="margin-bottom:.75rem">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
        <div style="font-family:var(--ff);font-size:15px;font-weight:600">${s.nome}</div>
        <span class="badge ${s.tag}">Risco ${s.risco}</span>
      </div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:8px">${s.desc}</div>
      <div style="display:flex;gap:16px;font-size:12px">
        <span style="color:var(--green)">Retorno est.: ${s.retorno}</span>
        <span style="color:var(--muted)">Mínimo: ${s.minimo}</span>
      </div>
    </div>`).join('');
      }

      // ══════════════════════════════════════════
      //  RESERVA DE EMERGÊNCIA — corrigida
      // ══════════════════════════════════════════
      function renderEmergencia(ess) {
        const meta = ess * 6;
        const atual = state.emergAtual;  // usa state, não g()
        const pct = meta > 0 ? clamp(atual / meta * 100, 0, 100) : 0;
        const faltam = Math.max(0, meta - atual);
        const c = pct >= 100 ? 'var(--green)' : pct > 50 ? 'var(--yellow)' : 'var(--blue)';

        const emEl = document.getElementById('emerg-meta');
        if (emEl) emEl.textContent = fmt(meta);

        const pEl = document.getElementById('emerg-progress');
        if (pEl) pEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:4px">
      <span>Progresso</span><span style="font-weight:500">${Math.round(pct)}% — ${fmt(atual)}</span>
    </div>
    <div class="prog prog-h8"><div class="prog-fill" style="width:${pct}%;background:${c}"></div></div>
    <div style="font-size:13px;color:${faltam > 0 ? 'var(--muted)' : 'var(--green)'};margin-top:8px;font-weight:500">
      ${faltam > 0 ? '📍 Faltam ' + fmt(faltam) + ' para a meta' : '✅ Meta atingida! Parabéns!'}
    </div>`;

        const renda = getTotRenda() + getTotBenef();
        const saidas = getTotEss() + getTotNE() + getTotDivMin();
        const saldo = Math.max(0, renda - saidas);
        const poupar = faltam > 0 ? Math.max(50, Math.min(500, saldo * 0.2)) : 0;
        const meses = poupar > 0 ? Math.ceil(faltam / poupar) : 0;

        const eEl = document.getElementById('emerg-plano');
        if (eEl) eEl.innerHTML = `
    <div class="card-row"><label>Gastos essenciais/mês</label><span>${fmt(ess)}</span></div>
    <div class="card-row"><label>Meta (6 meses de gastos)</label><span style="color:var(--blue);font-weight:600">${fmt(meta)}</span></div>
    <div class="card-row"><label>Já guardado</label><span style="color:var(--green);font-weight:600">${fmt(atual)}</span></div>
    <div class="card-row"><label>Falta para a meta</label><span style="color:${faltam > 0 ? 'var(--red)' : 'var(--green)'};font-weight:600">${fmt(faltam)}</span></div>
    ${saldo > 0 ? `
    <div class="card-row"><label>Sugestão de poupança/mês</label><span style="color:var(--acc);font-weight:600">${fmt(poupar)}</span></div>
    <div class="card-row"><label>Prazo estimado</label><span style="color:var(--blue);font-weight:600">${meses > 0 ? meses + ' meses' : 'Meta atingida!'}</span></div>
    ` : '<div class="card-row"><label style="color:var(--red)">⚠️ Saldo negativo — quite gastos antes de guardar</label></div>'}`;
      }

      // ══════════════════════════════════════════
      //  VALORES IDEAIS — corrigido
      // ══════════════════════════════════════════
      function renderIdeal() {
        const el = document.getElementById('ideal-table');
        if (!el) return;

        const pessoasEl = document.getElementById('ideal-pessoas');
        const filhosEl = document.getElementById('ideal-filhos');
        const idososEl = document.getElementById('ideal-idosos');
        const veiculoEl = document.getElementById('ideal-veiculo');
        const cidadeEl = document.getElementById('ideal-cidade');

        const pessoas = Math.max(1, +(pessoasEl?.value) || 1);
        const filhos = +(filhosEl?.value) || 0;
        const idosos = +(idososEl?.value) || 0;
        const veiculo = +(veiculoEl?.value) || 1;
        const cidade = +(cidadeEl?.value) || 1;
        const renda = getTotRenda() + getTotBenef();

        if (!renda) {
          el.innerHTML = '<div class="hbox hbox-blue" style="margin-top:.5rem">Configure sua renda primeiro na aba Rendas.</div>';
          return;
        }

        const fp = 1 + (pessoas - 1) * 0.3;
        const ff = filhos ? 1.15 : 1;
        const fi = idosos ? 1.1 : 1;
        const fc = cidade;

        const ideais = [
          { cat: 'Moradia', pct: Math.round(28 * fc), atual: state.essenciais.filter(e => e.cat === 'moradia').reduce((s, e) => s + e.valor, 0) },
          { cat: 'Alimentação', pct: Math.round(13 * fp * ff), atual: state.essenciais.filter(e => e.cat === 'alimentacao').reduce((s, e) => s + e.valor, 0) },
          { cat: 'Transporte', pct: veiculo ? 10 : 5, atual: state.naoEssenciais.filter(n => n.cat === 'transporte').reduce((s, n) => s + n.valor, 0) },
          { cat: 'Saúde', pct: Math.round(6 * fi * fp), atual: state.essenciais.filter(e => e.cat === 'saude').reduce((s, e) => s + e.valor, 0) },
          { cat: 'Educação', pct: filhos ? 10 : 5, atual: state.essenciais.filter(e => e.cat === 'educacao').reduce((s, e) => s + e.valor, 0) },
          { cat: 'Lazer', pct: 5, atual: state.naoEssenciais.filter(n => n.cat === 'lazer').reduce((s, n) => s + n.valor, 0) },
          { cat: 'Investimentos', pct: 10, atual: getTotAporteInv() },
          { cat: 'Dívidas (máx)', pct: 20, atual: getTotDivMin() },
          { cat: 'Imprevistos', pct: 5, atual: state.naoEssenciais.filter(n => n.cat === 'outros').reduce((s, n) => s + n.valor, 0) },
        ];

        el.innerHTML = ideais.map(row => {
          const idealVal = Math.round(renda * row.pct / 100);
          const diff = row.atual - idealVal;
          const semDado = row.atual === 0;
          const status = semDado
            ? `<span style="color:var(--muted);font-size:11px">— não informado</span>`
            : diff <= 0
              ? `<span style="color:var(--green);font-size:11px;font-weight:600">✓ dentro do ideal</span>`
              : diff / idealVal < 0.3
                ? `<span style="color:var(--yellow);font-size:11px;font-weight:600">⚠ um pouco acima</span>`
                : `<span style="color:var(--red);font-size:11px;font-weight:600">✕ acima do ideal</span>`;
          const bg = !semDado && diff > 0 ? 'background:rgba(248,113,113,.04)' : '';
          return `<div class="ideal-row" style="${bg}">
      <div style="font-size:13px">${row.cat} <span style="color:var(--muted);font-size:11px">(${row.pct}%)</span></div>
      <div style="color:var(--blue);font-weight:600">${fmt(idealVal)}</div>
      <div style="color:${!semDado && diff > 0 ? 'var(--red)' : 'var(--green)'};font-weight:600">${row.atual > 0 ? fmt(row.atual) : '—'}</div>
      <div class="hide-mob">${status}</div>
    </div>`;
        }).join('');

        const tipEl = document.getElementById('ideal-tip');
        if (tipEl) {
          const totalPct = ideais.reduce((s, r) => s + r.pct, 0);
          tipEl.textContent = `Base: ${fmt(renda)}/mês · ${pessoas} pessoa${pessoas > 1 ? 's' : ''}${filhos ? ' + filhos' : ''}${idosos ? ' + idosos' : ''} · ${totalPct}% alocados, ~${100 - totalPct}% livres.`;
        }
      }

      // ══════════════════════════════════════════
      //  PLANO QUITAÇÃO
      // ══════════════════════════════════════════
      function renderPlano(extra, minDiv) {
        const el = document.getElementById('meses-plano'); if (!el) return;
        el.innerHTML = '';
        const totDiv = getTotDiv();
        if (totDiv <= 0) { el.innerHTML = '<div class="hbox hbox-green">Sem dívidas cadastradas!</div>'; return; }
        if (extra <= 0) { el.innerHTML = '<div class="hbox hbox-red">Sem saldo extra. Verifique receitas e despesas.</div>'; return; }

        // ── Detecta despesas essenciais em atraso (não pagas e vencimento já passou) ──
        const hoje = new Date();
        const diaHoje = hoje.getDate();
        const atrasadas = [...state.essenciais, ...state.naoEssenciais].filter(x => !x.pago && (x.dia||0) < diaHoje);
        if (atrasadas.length > 0) {
          const totAtrasado = atrasadas.reduce((s, x) => s + x.valor, 0);
          el.innerHTML += `<div style="background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.3);border-radius:10px;padding:12px 16px;margin-bottom:14px;">
            <div style="font-size:13px;font-weight:700;color:var(--red);margin-bottom:6px;">⚠️ ${atrasadas.length} conta${atrasadas.length>1?'s':''} em atraso — prioridade ao receber renda</div>
            <div style="display:flex;flex-direction:column;gap:4px;">
              ${atrasadas.map(x=>`<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text);"><span>${esc(x.nome)}</span><span style="color:var(--red);font-weight:600">–${fmt(x.valor)}</span></div>`).join('')}
            </div>
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(248,113,113,.2);font-size:12px;color:var(--muted);">Total em atraso: <span style="color:var(--red);font-weight:700">${fmt(totAtrasado)}</span> — quite estas antes de qualquer outra alocação.</div>
          </div>`;
        }

        // Monta lista de dívidas ordenada por juros (bola de neve)
        let debtPool = [
          ...state.dividas.map(d => ({ id: d.id, nome: d.nome, juros: d.juros, minimo: d.minimo, saldo: d.total, tipo: 'divida', cor: 'var(--red)' })),
          ...state.cartoes.map(c => ({ id: c.id, nome: c.banco + ' (cartão)', juros: c.taxa, minimo: c.fatura, saldo: c.fatura, tipo: 'cartao', cor: 'var(--purple)' })),
        ].filter(d => d.saldo > 0).sort((a, b) => b.juros - a.juros);

        const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        let totRestante = debtPool.reduce((s, d) => s + d.saldo, 0);
        let res = 0;

        for (let i = 0; i < 48 && totRestante > 0; i++) {
          const mIdx = (hoje.getMonth() + i) % 12;
          const ano = hoje.getFullYear() + Math.floor((hoje.getMonth() + i) / 12);
          res += Math.max(50, extra * 0.15);

          // Paga mínimo em todas primeiro
          let extraDisp = extra;
          const pagamentos = [];
          for (const d of debtPool) {
            if (d.saldo <= 0) continue;
            const pagMin = Math.min(d.minimo, d.saldo);
            d.saldo = Math.max(0, d.saldo - pagMin);
            extraDisp -= pagMin;
            if (pagMin > 0) pagamentos.push({ nome: d.nome, pago: pagMin, saldo: d.saldo, cor: d.cor, prioridade: false });
          }
          // Extra vai para a de maior juros (primeira com saldo)
          const alvo = debtPool.find(d => d.saldo > 0);
          if (alvo && extraDisp > 0) {
            const pagExtra = Math.min(Math.max(0, extraDisp), alvo.saldo);
            alvo.saldo = Math.max(0, alvo.saldo - pagExtra);
            const p = pagamentos.find(x => x.nome === alvo.nome);
            if (p) { p.pago += pagExtra; p.saldo = alvo.saldo; p.prioridade = true; }
            else pagamentos.push({ nome: alvo.nome, pago: pagExtra, saldo: alvo.saldo, cor: alvo.cor, prioridade: true });
          }

          // Remove zeradas
          debtPool = debtPool.filter(d => d.saldo > 0);
          totRestante = debtPool.reduce((s, d) => s + d.saldo, 0);
          const pct = totDiv > 0 ? Math.round(((totDiv - totRestante) / totDiv) * 100) : 100;
          const bc = pct < 30 ? 'var(--red)' : pct < 70 ? 'var(--yellow)' : 'var(--green)';

          // Linhas de detalhe por dívida
          const debtRows = pagamentos.map(p => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--b0)">
        <div style="display:flex;align-items:center;gap:6px">
          ${p.prioridade ? '<span style="font-size:9px;background:rgba(200,255,87,.15);color:var(--acc);border-radius:4px;padding:1px 5px;font-weight:600">FOCO</span>' : '<span style="width:46px"></span>'}
          <span style="font-size:12px;color:${p.cor};font-weight:500">${p.nome}</span>
        </div>
        <div style="text-align:right;font-size:12px">
          <span style="color:var(--red)">–${fmt(p.pago)}</span>
          <span style="color:var(--muted);margin-left:8px">restam ${fmt(p.saldo)}</span>
          ${p.saldo <= 0 ? '<span style="margin-left:6px;font-size:10px;color:var(--green);font-weight:700">✓ QUITADA</span>' : ''}
        </div>
      </div>`).join('');

          el.innerHTML += `<div class="month-card">
      <div class="month-header">
        <span style="font-weight:600">${nomes[mIdx]} / ${ano}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:11px;color:var(--muted)">${pct}% quitado</span>
          ${debtPool.length === 0 ? '<span style="font-size:11px;background:rgba(74,222,128,.15);color:var(--green);border-radius:5px;padding:2px 7px;font-weight:600">✓ Zerado!</span>' : ''}
        </div>
      </div>
      <div class="month-stats" style="margin-bottom:10px">
        <div class="month-stat"><label>Pago total</label><div class="v" style="color:var(--red)">${fmt(pagamentos.reduce((s, p) => s + p.pago, 0))}</div></div>
        <div class="month-stat"><label>Restante total</label><div class="v">${fmt(totRestante)}</div></div>
        <div class="month-stat"><label>Reserva acum.</label><div class="v" style="color:var(--green)">${fmt(res)}</div></div>
        <div class="month-stat"><label>Dívidas ativas</label><div class="v" style="color:var(--blue)">${debtPool.length}</div></div>
      </div>
      <div style="background:var(--s3);border-radius:8px;padding:8px 12px;margin-bottom:8px">${debtRows}</div>
      <div class="prog"><div class="prog-fill" style="width:${pct}%;background:${bc}"></div></div>
    </div>`;
        }
        if (totRestante <= 0) el.innerHTML += `<div class="done-card">
    <div style="font-family:var(--ff);font-size:28px;font-weight:700;color:var(--green);margin-bottom:8px">🎉 Todas as dívidas zeradas!</div>
    <p style="color:var(--muted);font-size:14px">Reserva acumulada: <strong style="color:var(--acc)">${fmt(res)}</strong></p>
    <p style="color:var(--muted);font-size:13px;margin-top:6px">Agora invista tudo o que ia para juros!</p>
  </div>`;
      }

      // ══════════════════════════════════════════
      //  💾 UTILITÁRIOS DE DADOS
      // ══════════════════════════════════════════
      function saveState() {
        persistSave().then(() => {
          showToast('💾 Dados salvos com sucesso!', 'green');
        });
      }
      function exportData() {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'financaminha_backup.json'; a.click();
        URL.revokeObjectURL(url);
        showToast('📁 Backup exportado!', 'green');
      }
      function importData() {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.json';
        inp.onchange = e => {
          const file = e.target.files[0]; if (!file) return;
          const reader = new FileReader();
          reader.onload = async ev => {
            try {
              const parsed = JSON.parse(ev.target.result);
              state = parsed; persistSave();
              showToast('✅ Importado! Recarregando...', 'green');
              setTimeout(() => location.reload(), 1200);
            } catch (err) { showToast('Arquivo inválido!', 'red'); }
          };
          reader.readAsText(file);
        };
        inp.click();
      }
      function resetData() {
        openConfirmModal('Apagar todos os dados?', 'Esta ação não pode ser desfeita.', () => {
          if (_currentUser) { sbFetch('user_data?user_id=eq.' + _currentUser.id, { method: 'DELETE' }); }
          showToast('🗑️ Apagado. Recarregando...', 'red');
          setTimeout(() => location.reload(), 1200);
        });
      }
      function showSaveIndicator() {
        const el = document.getElementById('save-indicator'); if (!el) return;
        el.style.opacity = '1';
        clearTimeout(el._t);
        el._t = setTimeout(() => { el.style.opacity = '0'; }, 2000);
      }

      // ══════════════════════════════════════════
      //  🔔 TOASTS
      // ══════════════════════════════════════════
      function showToast(msg, color = 'green') {
        const colors = { green: '#4ade80', red: '#f87171', yellow: '#fbbf24', blue: '#60a5fa' };
        const t = document.createElement('div');
        t.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;background:#1e2230;border:1px solid ${colors[color] || colors.green};color:${colors[color] || colors.green};padding:12px 20px;border-radius:10px;font-size:13px;font-family:'Instrument Sans',sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5);transition:opacity .4s;max-width:320px;text-align:center;`;
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 2800);
      }

      // ══════════════════════════════════════════
      //  📄 PDF READER
      // ══════════════════════════════════════════
      function openPDFModal() { document.getElementById('pdf-modal').style.display = 'flex'; }
      function closePDFModal() {
        document.getElementById('pdf-modal').style.display = 'none';
        document.getElementById('pdf-transactions').innerHTML = '';
        document.getElementById('pdf-status').textContent = '';
        const inp = document.getElementById('pdf-file-input'); if (inp) inp.value = '';
      }
      // ── PDF.js CDN loader ──
      function loadPdfJs() {
        return new Promise((resolve, reject) => {
          if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
          s.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            resolve(window.pdfjsLib);
          };
          s.onerror = () => reject(new Error('Falha ao carregar pdf.js'));
          document.head.appendChild(s);
        });
      }

      // ── Categorização automática por palavras-chave ──
      function categorizarDescricao(desc) {
        const d = desc.toLowerCase();
        if (/supermercado|mercado|padaria|hortifruti|atacad|carrefour|extra |pao de acucar|walmart|sacolao/.test(d)) return 'alimentacao';
        if (/restaurante|lanchonete|ifood|rappi|uber eats|mcdonalds|burger|pizza|sushi|bar |cafe |bakery/.test(d)) return 'alimentacao';
        if (/uber|99pop|taxi|onibus|metro|combustivel|posto |shell|ipiranga|estacionamento|pedagio/.test(d)) return 'transporte';
        if (/farmacia|drogaria|hospital|clinica|medico|dentista|laboratorio|exame|unimed/.test(d)) return 'saude';
        if (/escola|faculdade|curso|universidade|colegio|udemy|alura/.test(d)) return 'educacao';
        if (/netflix|spotify|amazon prime|hbo|disney|globoplay|youtube premium|deezer/.test(d)) return 'streaming';
        if (/aluguel|condominio|iptu|imobiliaria/.test(d)) return 'moradia';
        if (/energia|conta de luz|conta agua|saneamento|gas |internet|tim |claro |vivo |oi |net /.test(d)) return 'utilidades';
        if (/salao|barbearia|cabelereiro|estetica|manicure|academia|gym/.test(d)) return 'pessoal';
        return 'outros';
      }

      // ── Extrai transações do texto bruto do PDF ──
      function detectarTipoExtrato(fullText) {
        const t = fullText.toLowerCase();
        // Cartão de crédito
        if (/fatura|cartao de credito|cart.o de cr.dito|limite|parcela|anuidade|bandeira|visa|mastercard|elo |amex/.test(t)) return 'cartao';
        // Conta corrente / poupança
        if (/conta corrente|conta poupan|extrato de conta|saldo anterior|saldo atual|ted|doc |pix |deposito|saque|tarifa|cheque/.test(t)) return 'conta';
        return 'desconhecido';
      }

      function extrairBanco(fullText) {
        const bancoPatterns = [
          { r: /nubank/i, n: 'Nubank' }, { r: /ita[uú]/i, n: 'Itaú' }, { r: /bradesco/i, n: 'Bradesco' },
          { r: /santander/i, n: 'Santander' }, { r: /inter/i, n: 'Inter' }, { r: /c6\s?bank/i, n: 'C6 Bank' },
          { r: /caixa/i, n: 'Caixa' }, { r: /banco do brasil/i, n: 'Banco do Brasil' },
          { r: /picpay/i, n: 'PicPay' }, { r: /mercado pago/i, n: 'Mercado Pago' },
          { r: /btg/i, n: 'BTG' }, { r: /xp /i, n: 'XP' },
        ];
        for (const bp of bancoPatterns) { if (bp.r.test(fullText)) return bp.n; }
        return '';
      }

      function extrairTransacoes(fullText) {
        const trans = [];
        const linhas = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 3);
        const banco = extrairBanco(fullText);
        const tipoExtrato = detectarTipoExtrato(fullText);

        // Regex: data + descrição + valor
        const re = /(\d{2}[\/\-]\d{2}(?:[\/\-]\d{2,4})?)\s+(.{3,60?}?)\s+([\d]{1,3}(?:[.,]\d{3})*[.,]\d{2})/g;
        for (const linha of linhas) {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(linha)) !== null) {
            const data = m[1].slice(0, 5).replace('-', '/');
            const desc = m[2].replace(/\s+/g, ' ').trim();
            if (desc.length < 3) continue;
            const valorStr = m[3].replace(/\./g, '').replace(',', '.');
            const valor = parseFloat(valorStr);
            if (!valor || valor <= 0 || valor > 50000) continue;
            const tipo = /pagamento|credito|estorno|devol|pix rec|deposito|salario|transferencia recebida/i.test(desc) ? 'credito' : 'debito';
            trans.push({ data, descricao: desc, valor, tipo, categoria: categorizarDescricao(desc), banco, tipoExtrato });
          }
        }

        // Fallback R$
        if (!trans.length) {
          const re2 = /R\$\s*([\d.,]+)\s+(.{5,50})/g;
          for (const linha of linhas) {
            re2.lastIndex = 0;
            let m;
            while ((m = re2.exec(linha)) !== null) {
              const valorStr = m[1].replace(/\./g, '').replace(',', '.');
              const valor = parseFloat(valorStr);
              const desc = m[2].replace(/\s+/g, ' ').trim();
              if (!valor || valor <= 0 || valor > 50000 || desc.length < 3) continue;
              const tipo = /pagamento|credito|estorno|deposito|salario/i.test(desc) ? 'credito' : 'debito';
              trans.push({ data: '', descricao: desc, valor, tipo, categoria: categorizarDescricao(desc), banco, tipoExtrato });
            }
          }
        }

        const vistos = new Set();
        return {
          banco, tipoExtrato, transacoes: trans.filter(t => {
            const k = t.descricao.slice(0, 15) + '|' + t.valor;
            if (vistos.has(k)) return false;
            vistos.add(k); return true;
          })
        };
      }

      async function handlePDFUpload(e) {
        const file = e.target.files[0]; if (!file) return;
        const statusEl = document.getElementById('pdf-status');
        const transEl = document.getElementById('pdf-transactions');
        statusEl.innerHTML = '<span style="color:var(--blue)">&#128196; Carregando leitor de PDF...</span>';
        transEl.innerHTML = '';
        try {
          const pdfjs = await loadPdfJs();
          statusEl.innerHTML = '<span style="color:var(--blue)">&#128196; Lendo PDF...</span>';
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
          statusEl.innerHTML = `<span style="color:var(--blue)">&#128196; Extraindo texto de ${pdf.numPages} pag(s)...</span>`;
          let fullText = '';
          for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const tc = await page.getTextContent();
            // Preserva quebras de linha baseadas em posição Y
            const items = tc.items;
            let lastY = null, lineText = '';
            for (const item of items) {
              const y = item.transform ? item.transform[5] : 0;
              if (lastY !== null && Math.abs(y - lastY) > 5) { fullText += lineText + '\n'; lineText = ''; }
              lineText += ' ' + item.str;
              lastY = y;
            }
            if (lineText) fullText += lineText + '\n';
          }
          if (!fullText.trim()) {
            statusEl.innerHTML = '<span style="color:var(--yellow)">&#9888; PDF sem texto extraivel (imagem/escaneado). Use entrada manual.</span>';
            renderPDFManual();
            return;
          }
          statusEl.innerHTML = '<span style="color:var(--blue)">&#128269; Identificando transacoes...</span>';
          const resultado = extrairTransacoes(fullText);
          const trans = resultado.transacoes;
          if (!trans.length) {
            statusEl.innerHTML = '<span style="color:var(--yellow)">&#9888; Nenhuma transacao reconhecida. Use entrada manual.</span>';
            renderPDFManual();
            return;
          }
          window._pdfTipoExtrato = resultado.tipoExtrato;
          window._pdfBanco = resultado.banco;
          const tipoLabel = resultado.tipoExtrato === 'cartao' ? '&#x1F4B3; Extrato de cart&#xE3;o' : resultado.tipoExtrato === 'conta' ? '&#x1F3E6; Extrato de conta' : ' Extrato';
          statusEl.innerHTML = `<span style="color:var(--green)">&#10003; ${trans.length} lan&#231;amentos &mdash; ${tipoLabel}${resultado.banco ? ' &bull; ' + resultado.banco : ''}</span>`;
          window._pdfTrans = trans;
          renderPDFTransactions(trans, resultado.tipoExtrato, resultado.banco);
        } catch (err) {
          statusEl.innerHTML = `<span style="color:var(--red)">&#10005; Erro: ${err.message}</span>`;
          console.error(err);
        }
      }

      function renderPDFManual() {
        const el = document.getElementById('pdf-transactions');
        el.innerHTML = `<div class="hbox hbox-yellow" style="margin-bottom:1rem">PDF nao legivel automaticamente. Insira as transacoes manualmente:</div>
    <div id="manual-trans-list"></div>
    <button onclick="addManualTrans()" class="add-btn" style="margin-bottom:1rem">+ Adicionar transacao</button>
    <button onclick="importManualTransactions()" class="action-btn primary">Importar</button>`;
        window._manualTrans = [];
      }
      function addManualTrans() {
        const list = document.getElementById('manual-trans-list'); if (!list) return;
        const idx = (window._manualTrans = window._manualTrans || []).length;
        window._manualTrans.push({ descricao: '', valor: 0, tipo: 'debito', categoria: 'outros' });
        const div = document.createElement('div');
        div.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:6px;margin-bottom:8px;align-items:center';
        div.innerHTML = `
    <input placeholder="Descricao" oninput="window._manualTrans[${idx}].descricao=this.value" style="padding:7px 9px;background:var(--s1);border:1px solid var(--b1);border-radius:7px;color:var(--text);font-size:13px;font-family:var(--fb)">
    <input type="number" placeholder="Valor R$" oninput="window._manualTrans[${idx}].valor=+this.value" style="padding:7px 9px;background:var(--s1);border:1px solid var(--b1);border-radius:7px;color:var(--text);font-size:13px;font-family:var(--fb)">
    <select onchange="window._manualTrans[${idx}].tipo=this.value" style="padding:7px;background:var(--s1);border:1px solid var(--b1);border-radius:7px;color:var(--text);font-size:12px"><option value="debito">Debito</option><option value="credito">Credito</option></select>
    <select onchange="window._manualTrans[${idx}].categoria=this.value" style="padding:7px;background:var(--s1);border:1px solid var(--b1);border-radius:7px;color:var(--text);font-size:12px">
      ${['alimentacao', 'transporte', 'saude', 'educacao', 'lazer', 'streaming', 'moradia', 'utilidades', 'pessoal', 'outros'].map(c => `<option value="${c}">${CAT_LABEL[c] || c}</option>`).join('')}
    </select>
    <button onclick="this.parentElement.remove()" class="rm-btn">&#10005;</button>`;
        list.appendChild(div);
      }
      function importManualTransactions() {
        const trans = (window._manualTrans || []).filter(t => t && t.descricao && t.valor > 0);
        if (!trans.length) { showToast('Adicione ao menos uma transacao', 'yellow'); return; }
        window._pdfTrans = trans; importPDFTransactions();
      }

      function renderPDFTransactions(trans, tipoExtrato, banco) {
        const el = document.getElementById('pdf-transactions');
        const isCartao = tipoExtrato === 'cartao';
        const isConta = tipoExtrato === 'conta';

        // Banner contextual
        let banner = '';
        if (isCartao) {
          const bancoCC = banco || 'detectado';
          banner = `<div class="hbox hbox-purple" style="margin-bottom:10px">
      &#x1F4B3; <strong>Extrato de cart&#xE3;o detectado</strong> &mdash; ${bancoCC}<br>
      <span style="font-size:11px">Os d&#xe9;bitos ser&#xe3;o lan&#xe7;ados automaticamente no cart&#xe3;o ${bancoCC} na aba Cart&#xF5;es de Cr&#xe9;dito.</span>
    </div>`;
        } else if (isConta) {
          banner = `<div class="hbox hbox-green" style="margin-bottom:10px">
      &#x1F3E6; <strong>Extrato de conta corrente/poupan&#xe7;a detectado</strong> &mdash; ${banco || ''}<br>
      <span style="font-size:11px">Cr&#xe9;ditos ser&#xe3;o lan&#xe7;ados como <strong>Renda</strong>. D&#xe9;bitos como despesas.</span>
    </div>`;
        }

        el.innerHTML = banner + `<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
    <button onclick="document.querySelectorAll('.pdf-cb').forEach(c=>c.checked=true)" style="font-size:11px;padding:4px 10px;border:1px solid var(--b1);border-radius:6px;background:none;color:var(--muted);cursor:pointer">Marcar todos</button>
    <button onclick="document.querySelectorAll('.pdf-cb').forEach(c=>c.checked=false)" style="font-size:11px;padding:4px 10px;border:1px solid var(--b1);border-radius:6px;background:none;color:var(--muted);cursor:pointer">Desmarcar</button>
    <span style="font-size:11px;color:var(--muted);margin-left:auto;align-self:center">${trans.length} lan&#xe7;amentos</span>
  </div>` + trans.map((t, i) => {
          const isD = t.tipo === 'debito';
          // Para conta: créditos vão como renda; para cartão: tudo como fatura
          const destLabel = isCartao
            ? `<span style="color:var(--purple);font-size:10px">&#x2192; Fatura ${banco || 'cartão'}</span>`
            : isConta && !isD
              ? `<span style="color:var(--green);font-size:10px">&#x2192; Renda</span>`
              : `<span style="color:var(--orange);font-size:10px">&#x2192; Despesa</span>`;
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--b0)">
      <input type="checkbox" class="pdf-cb" data-idx="${i}" ${isD || !isConta ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--acc);flex-shrink:0">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.descricao}</div>
        <div style="font-size:11px;color:var(--muted);display:flex;gap:6px;margin-top:2px">${t.data || ''} · ${CAT_LABEL[t.categoria] || t.categoria} ${destLabel}</div>
      </div>
      <span style="font-weight:600;color:${isD ? 'var(--red)' : 'var(--green)'};flex-shrink:0">${isD ? '–' : '+'} R$ ${Number(t.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
    </div>`;
        }).join('') + `<div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
    <button onclick="importPDFTransactions()" class="action-btn primary">Importar selecionadas</button>
    <button onclick="closePDFModal()" class="action-btn">Cancelar</button>
  </div>`;
      }
      function importPDFTransactions() {
        const trans = window._pdfTrans || [];
        const tipo = window._pdfTipoExtrato || 'desconhecido';
        const banco = window._pdfBanco || '';
        const cbs = document.querySelectorAll('.pdf-cb');
        let countDesp = 0, countRenda = 0, countFatura = 0;

        // Para extrato de cartão: soma todos os débitos selecionados e adiciona/atualiza o cartão
        if (tipo === 'cartao') {
          let totalFatura = 0;
          const parcelas = [];
          cbs.forEach((cb, i) => {
            if (!cb.checked) return;
            const t = trans[i]; if (!t || t.tipo !== 'debito') return;
            totalFatura += Number(t.valor) || 0;
            parcelas.push({ desc: t.descricao.slice(0, 35), valor: Number(t.valor) || 0, total: Number(t.valor) || 0, pagas: 0 });
            countFatura++;
          });
          if (totalFatura > 0) {
            // Procura cartão existente com mesmo banco
            let cc = state.cartoes.find(c => c.banco.toLowerCase() === banco.toLowerCase());
            if (!cc) {
              // Cria novo cartão
              cc = { id: uid('cc'), banco: banco || 'Importado', tipo: 'básico', bandeira: 'Visa', limite: 5000, fatura: 0, venc: 15, anuidade: 0, taxa: 15.99, parcelas: [] };
              state.cartoes.push(cc);
            }
            // Acumula na fatura e adiciona parcelas
            cc.fatura = (cc.fatura || 0) + totalFatura;
            cc.parcelas = [...(cc.parcelas || []), ...parcelas];
            renderCartoes();
          }
        } else if (tipo === 'conta') {
          // Créditos → renda; débitos → despesa
          cbs.forEach((cb, i) => {
            if (!cb.checked) return;
            const t = trans[i]; if (!t) return;
            const valor = Number(t.valor) || 0;
            const dia = parseInt((t.data || '').split('/')[0]) || 1;
            if (t.tipo === 'credito') {
              // Lança como renda
              state.rendas.push({ id: uid('pdfr'), nome: t.descricao.slice(0, 40), valor, dia, membro: state.membros[0]?.id || 'm1', tipo: 'extra' });
              countRenda++;
            } else {
              // Lança como despesa
              const isEss = ['moradia', 'alimentacao', 'utilidades', 'saude', 'educacao'].includes(t.categoria);
              const item = { id: uid('pdfd'), nome: t.descricao.slice(0, 40), valor, dia, membro: state.membros[0]?.id || 'm1', cat: t.categoria || 'outros', fixo: false };
              if (isEss) state.essenciais.push(item);
              else state.naoEssenciais.push(item);
              countDesp++;
            }
          });
          renderRendas(); renderEssenciais(); renderNE();
        } else {
          // Desconhecido: trata igual despesas normais
          cbs.forEach((cb, i) => {
            if (!cb.checked) return;
            const t = trans[i]; if (!t) return;
            const isEss = ['moradia', 'alimentacao', 'utilidades', 'saude', 'educacao'].includes(t.categoria);
            const item = { id: uid('pdf'), nome: t.descricao.slice(0, 40), valor: Number(t.valor) || 0, dia: parseInt((t.data || '').split('/')[0]) || 15, membro: state.membros[0]?.id || 'm1', cat: t.categoria || 'outros', fixo: false };
            if (isEss) state.essenciais.push(item); else state.naoEssenciais.push(item);
            countDesp++;
          });
          renderEssenciais(); renderNE();
        }

        closePDFModal();
        calcular();

        const msgs = [];
        if (countFatura > 0) msgs.push(`${countFatura} lançamentos na fatura de ${banco || 'cartão'}`);
        if (countRenda > 0) msgs.push(`${countRenda} entradas como renda`);
        if (countDesp > 0) msgs.push(`${countDesp} despesas`);
        showToast('✅ Importado: ' + msgs.join(' · '), 'green');
      }
      function fileToBase64(file) {
        return new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result.split(',')[1]);
          r.onerror = () => rej(new Error('Falha ao ler arquivo'));
          r.readAsDataURL(file);
        });
      }

      // ══════════════════════════════════════════
      //  ✏️ MODAL DE EDIÇÃO
      // ══════════════════════════════════════════
      let _editTarget = null;
      function openEditModal(type, id) {
        _editTarget = { type, id };
        const title = document.getElementById('edit-modal-title');
        const body = document.getElementById('edit-modal-body');
        let item, fields;
        const m = state.membros;
        if (type === 'renda') {
          item = state.rendas.find(r => r.id === id); title.textContent = 'Editar renda';
          fields = buildFields([{ k: 'nome', l: 'Nome', t: 'text', v: item.nome }, { k: 'valor', l: 'Valor (R$)', t: 'number', v: item.valor }, { k: 'dia', l: 'Dia recebimento', t: 'number', v: item.dia, min: 1, max: 31 }, { k: 'tipo', l: 'Tipo', t: 'select', v: item.tipo, opts: [{ v: 'fixo', l: 'Fixo' }, { v: 'variavel', l: 'Variável' }, { v: 'extra', l: 'Extra' }] }]);
        } else if (type === 'essencial') {
          item = state.essenciais.find(e => e.id === id); title.textContent = 'Editar despesa essencial';
          fields = buildFields([{ k: 'nome', l: 'Nome', t: 'text', v: item.nome }, { k: 'valor', l: 'Valor (R$)', t: 'number', v: item.valor }, { k: 'dia', l: 'Vencimento (dia)', t: 'number', v: item.dia, min: 1, max: 31 }, { k: 'cat', l: 'Categoria', t: 'select', v: item.cat, opts: CATS_ESS.map(c => ({ v: c, l: CAT_LABEL[c] || c })) }, { k: 'fixo', l: 'Fixo?', t: 'select', v: item.fixo ? '1' : '0', opts: [{ v: '1', l: 'Sim' }, { v: '0', l: 'Não' }] }]);
        } else if (type === 'ne') {
          item = state.naoEssenciais.find(n => n.id === id); title.textContent = 'Editar despesa';
          fields = buildFields([{ k: 'nome', l: 'Nome', t: 'text', v: item.nome }, { k: 'valor', l: 'Valor (R$)', t: 'number', v: item.valor }, { k: 'dia', l: 'Vencimento (dia)', t: 'number', v: item.dia, min: 1, max: 31 }, { k: 'cat', l: 'Categoria', t: 'select', v: item.cat, opts: CATS_NE.map(c => ({ v: c, l: CAT_LABEL[c] || c })) }, { k: 'fixo', l: 'Fixo?', t: 'select', v: item.fixo ? '1' : '0', opts: [{ v: '1', l: 'Sim' }, { v: '0', l: 'Não' }] }]);
        } else if (type === 'divida') {
          item = state.dividas.find(d => d.id === id); title.textContent = 'Editar dívida';
          fields = buildFields([{ k: 'nome', l: 'Nome', t: 'text', v: item.nome }, { k: 'total', l: 'Saldo devedor (R$)', t: 'number', v: item.total }, { k: 'juros', l: 'Juros %/mês', t: 'number', v: item.juros, step: .5 }, { k: 'minimo', l: 'Pagamento mínimo', t: 'number', v: item.minimo }, { k: 'cat', l: 'Categoria', t: 'select', v: item.cat, opts: CATS_DIV.map(c => ({ v: c, l: CATS_DIV_LABEL[c] || c })) }]);
        } else if (type === 'investimento') {
          item = state.investimentos.find(x => x.id === id); title.textContent = 'Editar investimento';
          fields = buildFields([{ k: 'nome', l: 'Nome', t: 'text', v: item.nome }, { k: 'valor', l: 'Valor atual (R$)', t: 'number', v: item.valor }, { k: 'aporte', l: 'Aporte/mês (R$)', t: 'number', v: item.aporte }, { k: 'tipo', l: 'Tipo', t: 'select', v: item.tipo, opts: TIPOS_INV.map(t => ({ v: t.v, l: t.l })) }]);
        }
        body.innerHTML = fields;
        document.getElementById('edit-modal').style.display = 'flex';
      }
      function buildFields(fields) {
        return fields.map(f => {
          if (f.t === 'select') {
            const opts = f.opts.map(o => `<option value="${o.v}" ${o.v == f.v ? 'selected' : ''}>${o.l}</option>`).join('');
            return `<div style="margin-bottom:12px"><label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">${f.l}</label><select data-key="${f.k}" style="width:100%;padding:8px 10px;background:var(--s3);border:1px solid var(--b1);border-radius:8px;color:var(--text);font-size:14px;font-family:var(--fb)">${opts}</select></div>`;
          }
          return `<div style="margin-bottom:12px"><label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">${f.l}</label><input type="${f.t}" data-key="${f.k}" value="${f.v || ''}" ${f.min != null ? 'min=' + f.min : ''} ${f.max != null ? 'max=' + f.max : ''} ${f.step ? 'step=' + f.step : ''} style="width:100%;padding:8px 10px;background:var(--s3);border:1px solid var(--b1);border-radius:8px;color:var(--text);font-size:14px;font-family:var(--fb)"></div>`;
        }).join('');
      }
      function saveEditModal() {
        if (!_editTarget) return;
        const { type, id } = _editTarget;
        const inputs = document.querySelectorAll('#edit-modal-body [data-key]');
        const updates = {};
        inputs.forEach(inp => {
          const k = inp.dataset.key;
          updates[k] = inp.tagName === 'SELECT' ? inp.value : inp.type === 'number' ? parseFloat(inp.value) || 0 : inp.value;
        });
        if (updates.fixo !== undefined) updates.fixo = updates.fixo === '1';
        const arrs = { renda: state.rendas, essencial: state.essenciais, ne: state.naoEssenciais, divida: state.dividas, investimento: state.investimentos };
        const arr = arrs[type];
        if (arr) { const idx = arr.findIndex(x => x.id === id); if (idx > -1) Object.assign(arr[idx], updates); }
        closeEditModal();
        if (type === 'renda') renderRendas();
        else if (type === 'essencial') renderEssenciais();
        else if (type === 'ne') renderNE();
        else if (type === 'divida') renderDividas();
        else if (type === 'investimento') renderInvestimentos();
        calcular();
        showToast('✅ Salvo!', 'green');
      }
      function closeEditModal() { document.getElementById('edit-modal').style.display = 'none'; _editTarget = null; }

      // ── CONFIRM ──
      let _confirmCb = null;
      function openConfirmModal(title, msg, cb) {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-msg').textContent = msg;
        _confirmCb = cb;
        document.getElementById('confirm-modal').style.display = 'flex';
      }
      function closeConfirmModal() { document.getElementById('confirm-modal').style.display = 'none'; _confirmCb = null; }
      function confirmAction() { if (_confirmCb) _confirmCb(); closeConfirmModal(); }

      // ══ EDIT BUTTON INJECTION ══
      function injectEditBtn(card, type, id) {
        const top = card.querySelector('.item-top'); if (!top) return;
        if (top.querySelector('[data-edit]')) return;
        const btn = document.createElement('button');
        btn.dataset.edit = id; btn.dataset.editType = type;
        btn.innerHTML = '✏️'; btn.title = 'Editar';
        btn.style.cssText = 'background:none;border:1px solid var(--b1);border-radius:6px;padding:3px 7px;cursor:pointer;font-size:11px;color:var(--muted);flex-shrink:0';
        btn.onclick = () => openEditModal(type, id);
        const rm = top.querySelector('.rm-btn');
        if (rm) top.insertBefore(btn, rm); else top.appendChild(btn);
      }
      function injectEditButtons(listId, type, items) {
        const el = document.getElementById(listId); if (!el) return;
        el.querySelectorAll('.item-card').forEach((card, i) => {
          if (items[i]) injectEditBtn(card, type, items[i].id);
        });
      }

      // Patch renders to add edit buttons
      ['renderRendas', 'renderEssenciais', 'renderNE', 'renderDividas', 'renderInvestimentos'].forEach(name => {
        const orig = window[name];
        window[name] = function (...args) {
          orig(...args);
          const map = { renderRendas: { id: 'lista-rendas', type: 'renda', items: state.rendas }, renderEssenciais: { id: 'lista-essenciais', type: 'essencial', items: state.essenciais }, renderNE: { id: 'lista-ne', type: 'ne', items: state.naoEssenciais }, renderDividas: { id: 'lista-dividas', type: 'divida', items: state.dividas }, renderInvestimentos: { id: 'lista-investimentos', type: 'investimento', items: state.investimentos } };
          const cfg = map[name]; if (cfg) injectEditButtons(cfg.id, cfg.type, cfg.items);
        };
      });

      // ══════════════════════════════════════════
      //  INIT — único DOMContentLoaded
      // ══════════════════════════════════════════


      // ══════════════════════════════════════════
      //  🏆 METAS FINANCEIRAS
      // ══════════════════════════════════════════

      const META_CATS = {
        viagem:      { icon: '✈️', color: 'var(--blue)',   bg: 'rgba(96,165,250,.12)'  },
        veiculo:     { icon: '🚗', color: 'var(--orange)', bg: 'rgba(251,146,60,.12)'  },
        imovel:      { icon: '🏠', color: 'var(--yellow)', bg: 'rgba(251,191,36,.12)'  },
        educacao:    { icon: '🎓', color: 'var(--purple)', bg: 'rgba(167,139,250,.12)' },
        emergencia:  { icon: '🛡️', color: 'var(--cyan)',   bg: 'rgba(34,211,238,.12)'  },
        eletronico:  { icon: '📱', color: 'var(--pink)',   bg: 'rgba(244,114,182,.12)' },
        saude:       { icon: '💊', color: 'var(--red)',    bg: 'rgba(248,113,113,.12)' },
        investimento:{ icon: '📈', color: 'var(--green)',  bg: 'rgba(74,222,128,.12)'  },
        outro:       { icon: '🎯', color: 'var(--acc)',    bg: 'rgba(200,255,87,.12)'  },
      };

      const META_PRIO = {
        alta:  { label: 'Alta',  cls: 'b-red'    },
        media: { label: 'Média', cls: 'b-yellow' },
        baixa: { label: 'Baixa', cls: 'b-green'  },
      };

      function fmtMes(ym) {
        if (!ym) return '—';
        const [y, m] = ym.split('-');
        const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
        return meses[parseInt(m)-1] + '/' + y;
      }

      function mesesRestantes(prazo) {
        if (!prazo) return null;
        const hoje = new Date();
        const [y, m] = prazo.split('-').map(Number);
        const alvo = new Date(y, m-1, 1);
        const diff = (alvo.getFullYear() - hoje.getFullYear()) * 12 + (alvo.getMonth() - hoje.getMonth());
        return diff;
      }

      function adicionarMeta() {
        const nome = document.getElementById('meta-nome').value.trim();
        const valor = parseFloat(document.getElementById('meta-valor').value) || 0;
        const atual = parseFloat(document.getElementById('meta-atual').value) || 0;
        const cat = document.getElementById('meta-cat').value;
        const prioridade = document.getElementById('meta-prioridade').value;
        const prazo = document.getElementById('meta-prazo').dataset.value || '';

        if (!nome) { showToast('⚠️ Dê um nome para a meta.', 'yellow'); return; }
        if (valor <= 0) { showToast('⚠️ Informe o valor da meta.', 'yellow'); return; }

        const meta = { id: uid('mt'), nome, valor, atual: Math.min(atual, valor), cat, prioridade, prazo, criadaEm: new Date().toISOString() };
        state.metas.push(meta);

        // Limpa formulário
        document.getElementById('meta-nome').value = '';
        document.getElementById('meta-valor').value = '';
        document.getElementById('meta-atual').value = '';
        const prazoEl = document.getElementById('meta-prazo');
        prazoEl.value = ''; prazoEl.dataset.value = '';

        renderMetas();
        debounceAutoSave();
        showToast('✅ Meta criada!', 'green');
      }

      // ── CALENDÁRIO CUSTOMIZADO ──
      const MESES_CAL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

      function toggleMetaCal(calId, inputId) {
        // Fecha qualquer outro calendário aberto
        document.querySelectorAll('.meta-cal').forEach(c => { if (c.id !== calId) c.style.display = 'none'; });
        const cal = document.getElementById(calId);
        if (!cal) return;
        if (cal.style.display === 'none' || !cal.style.display) {
          renderMetaCal(calId, inputId);
          cal.style.display = 'block';
          // Posiciona o calendário para não ficar cortado
          const inp = document.getElementById(inputId);
          const rect = inp.getBoundingClientRect();
          const spaceBelow = window.innerHeight - rect.bottom;
          // Se está dentro de um modal usa position fixed
          const inModal = inp.closest('[id$="-modal"]');
          if (inModal) {
            cal.style.position = 'fixed';
            cal.style.left = rect.left + 'px';
            cal.style.width = Math.max(260, rect.width) + 'px';
            if (spaceBelow >= 280) {
              cal.style.top = (rect.bottom + 4) + 'px';
              cal.style.bottom = 'auto';
            } else {
              cal.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
              cal.style.top = 'auto';
            }
          } else {
            cal.style.position = 'absolute';
            cal.style.top = '';
            cal.style.bottom = '';
            cal.style.left = '';
            cal.style.width = '';
          }
        } else {
          cal.style.display = 'none';
        }
      }

      function renderMetaCal(calId, inputId) {
        const cal = document.getElementById(calId);
        if (!cal) return;
        const inp = document.getElementById(inputId);
        const now = new Date();
        const storedYear = inp.dataset.calYear;
        const year = (storedYear && !isNaN(parseInt(storedYear))) ? parseInt(storedYear) : now.getFullYear();
        const selValue = inp.dataset.value || ''; // "YYYY-MM"
        const [selY, selM] = selValue ? selValue.split('-').map(Number) : [0,0];

        cal.innerHTML = `
          <div class="meta-cal-head">
            <button class="meta-cal-nav" onclick="metaCalYear('${calId}','${inputId}',-1)">‹</button>
            <span>${year}</span>
            <button class="meta-cal-nav" onclick="metaCalYear('${calId}','${inputId}',1)">›</button>
          </div>
          <div class="meta-cal-grid">
            ${MESES_CAL.map((m, i) => {
              const isPast = year < now.getFullYear() || (year === now.getFullYear() && i < now.getMonth());
              const isSel = year === selY && (i+1) === selM;
              return `<div class="meta-cal-month${isSel?' selected':''}${isPast?' past':''}"
                onclick="${isPast?'':` pickMetaMonth('${calId}','${inputId}',${year},${i+1})`}">${m}</div>`;
            }).join('')}
          </div>
          <button class="meta-cal-clear" onclick="clearMetaPrazo('${calId}','${inputId}')">Limpar data</button>`;
      }

      function metaCalYear(calId, inputId, delta) {
        const inp = document.getElementById(inputId);
        const now = new Date();
        const storedYear = inp.dataset.calYear;
        const cur = (storedYear && !isNaN(parseInt(storedYear))) ? parseInt(storedYear) : now.getFullYear();
        const next = cur + delta;
        if (next < now.getFullYear()) return;
        inp.dataset.calYear = String(next);
        renderMetaCal(calId, inputId);
      }

      function pickMetaMonth(calId, inputId, year, month) {
        const inp = document.getElementById(inputId);
        const mm = String(month).padStart(2,'0');
        inp.dataset.value = `${year}-${mm}`;
        inp.value = `${MESES_CAL[month-1]}/${year}`;
        document.getElementById(calId).style.display = 'none';
        renderMetaCal(calId, inputId);
      }

      function clearMetaPrazo(calId, inputId) {
        const inp = document.getElementById(inputId);
        inp.dataset.value = '';
        inp.value = '';
        document.getElementById(calId).style.display = 'none';
      }

      // Fecha calendário ao clicar fora
      document.addEventListener('click', e => {
        if (!e.target.closest('.meta-date-wrap')) {
          document.querySelectorAll('.meta-cal').forEach(c => c.style.display = 'none');
        }
      });

      // ── EDITAR META ──
      let _metaEditId = null;

      function editarMeta(id) {
        const m = state.metas.find(x => x.id === id);
        if (!m) return;
        _metaEditId = id;
        document.getElementById('meta-edit-nome').value = m.nome;
        document.getElementById('meta-edit-cat').value = m.cat;
        document.getElementById('meta-edit-prioridade').value = m.prioridade;
        document.getElementById('meta-edit-valor').value = m.valor;
        document.getElementById('meta-edit-atual').value = m.atual;
        const editPrazo = document.getElementById('meta-edit-prazo');
        editPrazo.dataset.value = m.prazo || '';
        delete editPrazo.dataset.calYear;
        if (m.prazo) {
          const [y, mo] = m.prazo.split('-').map(Number);
          editPrazo.value = `${MESES_CAL[mo-1]}/${y}`;
        } else {
          editPrazo.value = '';
        }
        document.getElementById('meta-edit-modal').style.display = 'flex';
      }

      function closeMetaEditModal() {
        document.getElementById('meta-edit-modal').style.display = 'none';
        _metaEditId = null;
        // Fecha calendários dentro do modal
        document.querySelectorAll('.meta-cal').forEach(c => c.style.display = 'none');
      }

      function saveMetaEdit() {
        if (!_metaEditId) return;
        const m = state.metas.find(x => x.id === _metaEditId);
        if (!m) return;
        const nome = document.getElementById('meta-edit-nome').value.trim();
        const valor = parseFloat(document.getElementById('meta-edit-valor').value) || 0;
        const atual = parseFloat(document.getElementById('meta-edit-atual').value) || 0;
        if (!nome) { showToast('⚠️ Dê um nome para a meta.', 'yellow'); return; }
        if (valor <= 0) { showToast('⚠️ Informe o valor da meta.', 'yellow'); return; }
        m.nome = nome;
        m.cat = document.getElementById('meta-edit-cat').value;
        m.prioridade = document.getElementById('meta-edit-prioridade').value;
        m.valor = valor;
        m.atual = Math.min(atual, valor);
        m.prazo = document.getElementById('meta-edit-prazo').dataset.value || '';
        closeMetaEditModal();
        renderMetas();
        debounceAutoSave();
        showToast('✅ Meta atualizada!', 'green');
      }

      function aportarMeta(id) {
        const meta = state.metas.find(m => m.id === id);
        if (!meta) return;
        const inp = document.getElementById('aporte-' + id);
        const val = parseFloat(inp?.value) || 0;
        if (val <= 0) { showToast('⚠️ Informe o valor do aporte.', 'yellow'); return; }
        meta.atual = Math.min(meta.atual + val, meta.valor);
        if (inp) inp.value = '';
        renderMetas();
        debounceAutoSave();
        if (meta.atual >= meta.valor) {
          showToast('🏆 Meta "' + meta.nome + '" concluída! Parabéns!', 'green');
        } else {
          showToast('💰 Aporte de ' + fmt(val) + ' registrado!', 'green');
        }
      }

      function removerMeta(id) {
        openConfirmModal('Remover meta', 'Tem certeza que deseja remover esta meta?', () => {
          state.metas = state.metas.filter(m => m.id !== id);
          renderMetas();
          debounceAutoSave();
          showToast('🗑️ Meta removida.', 'red');
        });
      }

      function renderMetasResumo() {
        const el = document.getElementById('metas-resumo');
        if (!el) return;
        const total = state.metas.length;
        const concluidas = state.metas.filter(m => m.atual >= m.valor).length;
        const totalMeta = state.metas.reduce((s, m) => s + m.valor, 0);
        const totalAtual = state.metas.reduce((s, m) => s + m.atual, 0);
        const pct = totalMeta > 0 ? Math.round(totalAtual / totalMeta * 100) : 0;

        el.innerHTML = [
          { label: 'Metas criadas', val: total, sub: `${concluidas} concluída${concluidas!==1?'s':''}`, cor: 'var(--acc)' },
          { label: 'Total a poupar', val: fmt(totalMeta), sub: 'soma de todas as metas', cor: 'var(--blue)' },
          { label: 'Total acumulado', val: fmt(totalAtual), sub: `${pct}% do objetivo total`, cor: 'var(--green)' },
          { label: 'Falta poupar', val: fmt(Math.max(0, totalMeta - totalAtual)), sub: 'para completar tudo', cor: totalMeta > totalAtual ? 'var(--yellow)' : 'var(--green)' },
        ].map(c => `
          <div class="metric" style="--mc:${c.cor}">
            <div class="metric-label">${c.label}</div>
            <div class="metric-value" style="color:${c.cor}">${c.val}</div>
            <div class="metric-note">${c.sub}</div>
          </div>`).join('');
      }

      function renderMetas() {
        renderMetasResumo();
        const el = document.getElementById('lista-metas');
        if (!el) return;

        if (!state.metas.length) {
          el.innerHTML = `<div class="meta-empty">
            <div class="em-icon">🎯</div>
            <p>Nenhuma meta cadastrada ainda.</p>
            <p style="font-size:12px;color:var(--dim);margin-top:4px">Crie sua primeira meta acima!</p>
          </div>`;
          document.getElementById('card-chart-metas').style.display = 'none';
          return;
        }

        // Sort: incompletas por prioridade, depois concluídas
        const pOrder = { alta: 0, media: 1, baixa: 2 };
        const sorted = [...state.metas].sort((a, b) => {
          const aCon = a.atual >= a.valor;
          const bCon = b.atual >= b.valor;
          if (aCon !== bCon) return aCon ? 1 : -1;
          return (pOrder[a.prioridade] || 1) - (pOrder[b.prioridade] || 1);
        });

        el.innerHTML = sorted.map(m => {
          const cat = META_CATS[m.cat] || META_CATS.outro;
          const prio = META_PRIO[m.prioridade] || META_PRIO.media;
          const pct = m.valor > 0 ? clamp(m.atual / m.valor * 100, 0, 100) : 0;
          const pctR = Math.round(pct);
          const falta = Math.max(0, m.valor - m.atual);
          const concluida = m.atual >= m.valor;
          const meses = mesesRestantes(m.prazo);
          const mensal = (meses && meses > 0 && falta > 0) ? falta / meses : null;

          let prazoInfo = '';
          if (m.prazo) {
            if (concluida) {
              prazoInfo = `<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--green);background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.2);border-radius:7px;padding:5px 10px;margin-top:8px">🏆 Meta concluída!</div>`;
            } else if (meses !== null) {
              const urgente = meses <= 2;
              const cor = meses < 0 ? 'var(--red)' : urgente ? 'var(--yellow)' : 'var(--muted)';
              const bg = meses < 0 ? 'rgba(248,113,113,.08)' : urgente ? 'rgba(251,191,36,.08)' : 'var(--s2)';
              const brd = meses < 0 ? 'rgba(248,113,113,.2)' : urgente ? 'rgba(251,191,36,.2)' : 'var(--b0)';
              prazoInfo = `<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:${cor};background:${bg};border:1px solid ${brd};border-radius:7px;padding:5px 10px;margin-top:8px">
                ${meses < 0 ? '⚠️ Prazo vencido' : meses === 0 ? '⏰ Vence este mês' : `⏳ ${meses} mês${meses!==1?'es':''} restante${meses!==1?'s':''}`}
                ${mensal ? ` · precisa poupar ${fmt(mensal)}/mês` : ''}
              </div>`;
            }
          }

          return `<div class="meta-card ${concluida ? 'concluida' : ''}" style="--meta-color:${cat.color}">
            <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:14px;flex-wrap:wrap">
              <div class="meta-icon" style="background:${cat.bg}">${cat.icon}</div>
              <div style="flex:1;min-width:0">
                <div class="meta-nome">${esc(m.nome)}</div>
                <div class="meta-sub">Prazo: ${m.prazo ? fmtMes(m.prazo) : 'Sem prazo definido'}</div>
              </div>
              <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">
                <span class="badge ${prio.cls}">${prio.label}</span>
                ${concluida ? '<span class="badge b-green">✅ Concluída</span>' : ''}
              </div>
            </div>

            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
              <div class="meta-val-box">
                <div class="meta-val-label">Meta</div>
                <div class="meta-val-num" style="color:${cat.color}">${fmt(m.valor)}</div>
              </div>
              <div class="meta-val-box">
                <div class="meta-val-label">Acumulado</div>
                <div class="meta-val-num" style="color:var(--green)">${fmt(m.atual)}</div>
              </div>
              <div class="meta-val-box">
                <div class="meta-val-label">Faltam</div>
                <div class="meta-val-num" style="color:${concluida?'var(--green)':'var(--text)'}">${concluida ? '🏆 Pronto' : fmt(falta)}</div>
              </div>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:12px;color:var(--muted)">
              <span>Progresso</span>
              <span style="font-family:var(--ff);font-size:18px;font-weight:700;color:${cat.color}">${pctR}%</span>
            </div>
            <div class="meta-prog-bar">
              <div class="meta-prog-fill" style="width:${pctR}%;background:${cat.color}"></div>
            </div>

            ${prazoInfo}

            ${!concluida ? `<div style="display:flex;gap:6px;margin-top:12px;align-items:center;flex-wrap:wrap">
              <span style="font-size:12px;color:var(--muted);flex-shrink:0">Aportar:</span>
              <span style="font-size:12px;color:var(--dim);flex-shrink:0">R$</span>
              <input type="number" id="aporte-${m.id}" class="meta-aporte-inp" placeholder="0" min="1" step="50">
              <button class="meta-btn-aporte" onclick="aportarMeta('${m.id}')">+ Adicionar</button>
              <button class="meta-btn-rm" onclick="editarMeta('${m.id}')" style="border-color:rgba(96,165,250,.3);color:var(--blue)">✏️ editar</button>
              <button class="meta-btn-rm" onclick="removerMeta('${m.id}')">remover</button>
            </div>` : `<div style="display:flex;gap:6px;margin-top:10px">
              <button class="meta-btn-rm" onclick="editarMeta('${m.id}')" style="border-color:rgba(96,165,250,.3);color:var(--blue)">✏️ editar</button>
              <button class="meta-btn-rm" onclick="removerMeta('${m.id}')">remover</button>
            </div>`}
          </div>`;
        }).join('');

        // Chart
        renderMetasChart();
      }

      function renderMetasChart() {
        const chartCard = document.getElementById('card-chart-metas');
        if (!state.metas.length) { if(chartCard) chartCard.style.display='none'; return; }
        if (chartCard) chartCard.style.display = 'block';

        const ctx = document.getElementById('chart-metas');
        if (!ctx) return;
        if (charts.metas) charts.metas.destroy();

        const sorted = [...state.metas].sort((a,b) => b.valor - a.valor).slice(0, 8);
        const cats = sorted.map(m => META_CATS[m.cat] || META_CATS.outro);

        charts.metas = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: sorted.map(m => m.nome.length > 14 ? m.nome.slice(0,14)+'…' : m.nome),
            datasets: [
              {
                label: 'Acumulado',
                data: sorted.map(m => m.atual),
                backgroundColor: cats.map(c => c.color.replace('var(--','').replace(')','') === 'acc' ? 'rgba(200,255,87,.7)' : c.bg.replace('rgba(', 'rgba(').replace('.12)', '.7)')),
                borderRadius: 6, borderSkipped: false
              },
              {
                label: 'Meta total',
                data: sorted.map(m => m.valor),
                backgroundColor: 'rgba(255,255,255,.06)',
                borderRadius: 6, borderSkipped: false
              }
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { labels: { color: '#7a7f96', font: { size: 11 } } },
              tooltip: { callbacks: { label: c => ' ' + fmt(c.parsed.y) } }
            },
            scales: {
              x: { ticks: { color: '#7a7f96', font: { size: 11 } }, grid: { display: false } },
              y: { ticks: { color: '#7a7f96', font: { size: 11 }, callback: v => fmt(v) }, grid: { color: 'rgba(255,255,255,.04)' } }
            }
          }
        });
      }

      // ══════════════════════════════════════════
      //  🎯 ONBOARDING
      // ══════════════════════════════════════════

      const OB_CATS = {
        'ob-c1': { nome: 'Aluguel / Moradia',       cat: 'moradia',      valor: 0, dia: 5  },
        'ob-c2': { nome: 'Água, Luz e Internet',     cat: 'utilidades',   valor: 0, dia: 10 },
        'ob-c3': { nome: 'Mercado / Alimentação',    cat: 'alimentacao',  valor: 0, dia: 15 },
        'ob-c4': { nome: 'Transporte / Combustível', cat: 'transporte',   valor: 0, dia: 20 },
        'ob-c5': { nome: 'Cartão de Crédito',        cat: 'outros',       valor: 0, dia: 10 },
        'ob-c6': { nome: 'Plano de Celular',         cat: 'utilidades',   valor: 0, dia: 15 },
        'ob-c7': { nome: 'Saúde / Plano',            cat: 'saude',        valor: 0, dia: 5  },
        'ob-c8': { nome: 'Educação / Cursos',        cat: 'educacao',     valor: 0, dia: 10 },
      };

      function showOnboarding() {
        const el = document.getElementById('onboarding-modal');
        if (!el) return;
        el.style.display = 'flex';
        obGoStep(1);
      }

      function obToggleCat(el) {
        const ativo = el.style.borderColor === 'var(--acc)' || el.style.background === 'rgba(200,255,87,0.1)';
        if (ativo) {
          el.style.borderColor = 'var(--b1)';
          el.style.background = 'var(--s2)';
          el.style.color = 'var(--text)';
        } else {
          el.style.borderColor = 'var(--acc)';
          el.style.background = 'rgba(200,255,87,.1)';
          el.style.color = 'var(--acc)';
        }
      }

      function obGoStep(n) {
        [1,2,3,4].forEach(i => {
          document.getElementById('ob-step-'+i).style.display = i === n ? 'block' : 'none';
          document.getElementById('ob-bar-'+i).style.background = i <= n ? 'var(--acc)' : 'var(--s3)';
        });
        document.getElementById('ob-step-label').textContent = `Passo ${n} de 4`;
      }

      function obNext(step) {
        if (step === 2) {
          const nome = document.getElementById('ob-nome').value.trim();
          if (!nome) { document.getElementById('ob-nome').focus(); return; }
        }
        if (step === 4) {
          // Prepara resumo final
          const nome = document.getElementById('ob-nome').value.trim();
          const renda = parseFloat(document.getElementById('ob-renda').value) || 0;
          const selecionados = Object.keys(OB_CATS).filter(id => {
            const el = document.getElementById(id);
            return el && el.style.borderColor === 'var(--acc)';
          });
          document.getElementById('ob-nome-final').textContent = `Tudo pronto, ${nome}! 🎉`;
          document.getElementById('ob-resumo-final').textContent =
            `Criamos seu perfil com ${renda > 0 ? fmt(renda) + ' de renda' : 'renda a definir'} e ${selecionados.length} categoria${selecionados.length !== 1 ? 's' : ''} de despesas pré-configuradas.`;
          const itens = [];
          if (renda > 0) itens.push(`<div style="display:flex;align-items:center;gap:6px;padding:4px 0"><span style="color:var(--green)">💰</span> Renda: ${fmt(renda)}</div>`);
          selecionados.forEach(id => {
            itens.push(`<div style="display:flex;align-items:center;gap:6px;padding:4px 0"><span style="color:var(--acc)">→</span> ${OB_CATS[id].nome}</div>`);
          });
          document.getElementById('ob-resumo-items').innerHTML = itens.join('') || '<div style="color:var(--dim);font-size:12px">Nenhum item selecionado — você pode adicionar tudo manualmente.</div>';
        }
        obGoStep(step);
      }

      function obBack(step) { obGoStep(step); }

      function obFinalizar() {
        const nome = document.getElementById('ob-nome').value.trim();
        const renda = parseFloat(document.getElementById('ob-renda').value) || 0;

        // Atualiza nome do membro principal
        if (state.membros.length > 0 && nome) state.membros[0].nome = nome;

        // Adiciona renda
        if (renda > 0) {
          state.rendas.push({ id: uid('r'), nome: 'Salário', valor: renda, dia: 5, membro: state.membros[0]?.id || 'm1', cat: 'salario' });
        }

        // Adiciona despesas selecionadas
        const ess_cats = ['moradia','utilidades','alimentacao','saude','educacao'];
        Object.keys(OB_CATS).forEach(id => {
          const el = document.getElementById(id);
          if (el && el.style.borderColor === 'var(--acc)') {
            const item = { ...OB_CATS[id], id: uid('e'), membro: state.membros[0]?.id || 'm1', fixo: true, pago: false };
            if (ess_cats.includes(item.cat)) state.essenciais.push(item);
            else state.naoEssenciais.push(item);
          }
        });

        state.onboardingDone = true;
        document.getElementById('onboarding-modal').style.display = 'none';
        initApp();
        debounceAutoSave();
        showToast(`🎉 Bem-vindo ao FinançaMinha, ${nome || 'usuário'}!`, 'green');
        // Abre o tour logo após o onboarding
        setTimeout(() => showTour(), 500);
      }

      // ══════════════════════════════════════════
      //  🗺️  TOUR DO SISTEMA
      // ══════════════════════════════════════════
      const TOUR_STEPS = [
        {
          icon: '📊', tag: 'Visão geral', title: 'Dashboard',
          sub: 'Panorama completo da sua vida financeira',
          body: 'O dashboard é sua central de controle. Assim que você cadastrar seus dados, ele exibe automaticamente os indicadores mais importantes: renda total, despesas, saldo livre e projeção dos próximos 12 meses.',
          features: ['Métricas de renda, despesas e saldo em tempo real','Gráficos de distribuição e categorias','Projeção acumulada dos próximos 12 meses','Vencimentos do mês em destaque','🔍 Importar extrato: leitura somente — nenhum dado é armazenado'],
          tip: 'O botão "Importar extrato" serve apenas para leitura — o conteúdo do arquivo é analisado localmente e não é enviado nem armazenado em nenhum lugar. Comece sempre aqui para ter uma visão geral antes de ajustar qualquer categoria.',
          page: 'dashboard'
        },
        {
          icon: '💵', tag: 'Visão geral', title: 'Saldo do mês',
          sub: 'O que sobra depois de pagar tudo',
          body: 'Esta tela calcula automaticamente quanto dinheiro sobra após todas as despesas. Também mostra uma distribuição sugerida para o saldo livre — quanto guardar, investir e usar livremente.',
          features: ['Saldo livre estimado em destaque','Distribuição sugerida do saldo','Resumo de vencimentos por período (dia 5, 15, 20)','Detalhamento de cada item que compõe o saldo'],
          tip: 'O saldo negativo aparece em vermelho. Nesse caso, revise suas despesas não essenciais primeiro.',
          page: 'saldo'
        },
        {
          icon: '💰', tag: 'Entradas', title: 'Rendas',
          sub: 'Cadastre todas as suas fontes de renda',
          body: 'Aqui você registra salário, freelances, aluguéis e qualquer outra entrada financeira. Cada renda pode ter uma data de recebimento e ser vinculada a um membro da família.',
          features: ['Múltiplas fontes de renda por membro','Data de recebimento para controle de fluxo','Métricas totais de renda familiar','Botão "+ Adicionar renda" para cada nova entrada'],
          tip: 'Cadastre também rendas variáveis estimadas — o sistema ajusta as projeções automaticamente.',
          page: 'rendas'
        },
        {
          icon: '🎁', tag: 'Entradas', title: 'Benefícios',
          sub: 'Benefícios que cobrem suas despesas automaticamente',
          body: 'Informe os benefícios que você recebe da empresa (VA, VR, VT, plano de saúde, etc). O sistema desconta esses valores das despesas correspondentes, mostrando quanto você realmente gasta do próprio bolso.',
          features: ['Vale Alimentação, Refeição e Transporte','Auxílio home office e plano de saúde','Cobertura automática nas despesas essenciais','Painel de cobertura mostrando quanto cada benefício cobre'],
          tip: 'Preencha os benefícios antes das despesas para que o cálculo de cobertura seja preciso.',
          page: 'beneficios'
        },
        {
          icon: '🏠', tag: 'Despesas', title: 'Despesas essenciais',
          sub: 'Contas que você não pode deixar de pagar',
          body: 'Registre aluguel, condomínio, luz, água, internet, supermercado, escola e tudo que é indispensável. Cada despesa tem categoria, valor, vencimento, membro responsável e se é fixa ou variável.',
          features: ['Categorias pré-definidas (moradia, alimentação, saúde...)','Marcar como "Pago" para controle mensal','Tipo fixo (repete todo mês) ou variável (só neste mês)','Resumo por categoria com total geral'],
          tip: 'Use o campo "vencimento" — o dashboard mostrará alertas quando a data estiver próxima.',
          page: 'essenciais'
        },
        {
          icon: '🛍️', tag: 'Despesas', title: 'Despesas não essenciais',
          sub: 'Gastos que podem ser cortados em caso de aperto',
          body: 'Streaming, academia, restaurantes, lazer — tudo que é desejável mas não essencial fica aqui. Isso ajuda o sistema a sugerir cortes quando o saldo ficar negativo.',
          features: ['Separação clara entre necessidade e desejo','Identificação dos gastos que podem ser reduzidos','Resumo com total e participação percentual','Mesmo sistema de "Pago" para acompanhar o mês'],
          tip: 'O sistema usa esta lista para sugerir onde cortar quando as dívidas ou metas precisam de mais recursos.',
          page: 'nao-essenciais'
        },
        {
          icon: '💳', tag: 'Despesas', title: 'Cartões de crédito',
          sub: 'Gerencie cartões, benefícios e milhas',
          body: 'Cadastre seus cartões com bandeira, banco, limite, data de vencimento e fechamento. O sistema monitora o uso, calcula juros e recomenda qual cartão usar para cada tipo de compra.',
          features: ['Múltiplos cartões com limites individuais','Programa de pontos e cashback','Alerta quando a fatura está próxima do limite','Recomendação automática de melhor cartão por categoria'],
          tip: 'Taxas de cartão chegam a 400% ao ano. Dívidas no cartão têm prioridade máxima de quitação.',
          page: 'cartoes'
        },
        {
          icon: '⚠️', tag: 'Financeiro', title: 'Dívidas',
          sub: 'Estratégia automática de quitação',
          body: 'Registre todas as dívidas (empréstimos, financiamentos, cartão em atraso). O sistema calcula a estratégia ótima de quitação — bola de neve ou avalanche — sem comprometer suas metas.',
          features: ['Lista de todas as dívidas com taxa e parcela','Aba de dívidas originadas por cartões','Estratégia automática de quitação','Métricas de impacto no saldo mensal'],
          tip: 'A aba "Estratégia" mostra a ordem recomendada de quitação com base nas taxas de juros.',
          page: 'dividas'
        },
        {
          icon: '📈', tag: 'Financeiro', title: 'Investimentos',
          sub: 'Acompanhe e planeje sua carteira',
          body: 'Registre seus investimentos (renda fixa, ações, fundos, etc). O sistema calcula a rentabilidade, diversificação e sugere novas aplicações com base na sua renda e perfil de risco.',
          features: ['Múltiplos tipos de investimento','Métricas de carteira e rentabilidade','Sugestões baseadas no saldo livre disponível','Integração com a reserva de emergência'],
          tip: 'Invista somente após quitar dívidas com juros altos. O sistema lembra você disso automaticamente.',
          page: 'investimentos'
        },
        {
          icon: '👨‍👩‍👧', tag: 'Planejamento', title: 'Família',
          sub: 'Gerencie membros e custos individuais',
          body: 'Adicione todos os membros da família (adultos, crianças, idosos). Cada despesa pode ser vinculada a um membro, permitindo ver quanto o sistema custa por pessoa.',
          features: ['Perfis individuais por membro','Tipo de membro (adulto, criança, bebê, idoso)','Despesas vinculadas por membro','Custo mensal detalhado por pessoa'],
          tip: 'Vincule as despesas das crianças a elas próprias para calcular o custo real de cada filho.',
          page: 'familia'
        },
        {
          icon: '🎯', tag: 'Planejamento', title: 'Valores ideais',
          sub: 'Compare seu orçamento com referências saudáveis',
          body: 'Esta tela mostra como seu orçamento atual se compara com proporções financeiramente saudáveis (regra 50/30/20 e similares), apontando onde você está acima ou abaixo do ideal.',
          features: ['Comparativo visual com valores de referência','Indicador de saúde financeira geral','Sugestões de reequilíbrio por categoria','Baseado na sua renda real cadastrada'],
          tip: 'Use como guia, não como lei. Cada família tem suas prioridades.',
          page: 'ideal'
        },
        {
          icon: '🛡️', tag: 'Planejamento', title: 'Reserva de emergência',
          sub: 'Quanto você precisa guardar',
          body: 'Com base nas suas despesas essenciais, o sistema calcula o valor ideal da sua reserva de emergência (normalmente 3 a 6 meses de despesas). Informe quanto já tem guardado e acompanhe o progresso.',
          features: ['Cálculo automático do valor ideal','Campo para informar o saldo atual','Barra de progresso visual','Sugestão de quanto guardar por mês'],
          tip: 'A reserva de emergência tem prioridade sobre investimentos de longo prazo.',
          page: 'emergencia'
        },
        {
          icon: '📅', tag: 'Planejamento', title: 'Plano de quitação',
          sub: 'Calendário para zerar suas dívidas',
          body: 'Com base no seu saldo livre, o sistema cria um plano mensal detalhado para quitar todas as dívidas. Você visualiza mês a mês quando cada dívida será encerrada.',
          features: ['Cronograma visual de quitação','Data estimada de quitação por dívida','Impacto do saldo extra nas dívidas','Recalcula automaticamente ao alterar dívidas'],
          tip: 'Pequenos aportes extras aceleram muito o plano. Experimente ajustar o saldo livre disponível.',
          page: 'plano'
        },
        {
          icon: '🔮', tag: 'Planejamento', title: 'Projeção mensal',
          sub: 'Simulador financeiro dos próximos meses',
          body: 'Visualize como sua situação financeira evolui nos próximos 12 meses considerando renda, despesas fixas, aportes em metas e pagamento de dívidas.',
          features: ['Gráfico de projeção acumulada','Cenários com diferentes taxas de reajuste','Impacto das metas no fluxo de caixa','Alerta de meses com saldo projetado negativo'],
          tip: 'Use o simulador antes de assumir novas dívidas para ver o impacto real no seu orçamento.',
          page: 'projecao'
        },
        {
          icon: '🏆', tag: 'Planejamento', title: 'Metas financeiras',
          sub: 'Sonhos com prazo e progresso visível',
          body: 'Cadastre suas metas (viagem, veículo, imóvel, reserva...) com valor total, prazo e prioridade. Faça aportes mensais e acompanhe o progresso com barras e datas estimadas de conclusão.',
          features: ['Categorias com ícones (viagem, educação, saúde...)','Prioridade alta, média e baixa','Aporte manual ou por valor fixo mensal','Progresso em % com data estimada de conclusão'],
          tip: 'Metas com prazo definido ganham uma barra de urgência — o sistema avisa quando o ritmo está lento.',
          page: 'metas'
        },
        {
          icon: '🗓️', tag: 'Planejamento', title: 'Calendário financeiro',
          sub: 'Linha do tempo mensal de entradas e saídas',
          body: 'Visualize todos os eventos financeiros do mês em uma grade de calendário e em uma linha do tempo cronológica. Cada dia mostra rendas, despesas, vencimentos de dívidas e faturas de cartão.',
          features: ['Grade mensal com pontos coloridos por tipo','Linha do tempo ordenada por dia','Resumo do mês: entradas, saídas, saldo e pendências','Navegação entre meses passados e futuros'],
          tip: 'Use o calendário para antecipar meses com muitos vencimentos acumulados e redistribuir despesas variáveis.',
          page: 'calendario'
        }
      ];

      let _tourStep = 0;

      function showTour() {
        _tourStep = 0;
        document.getElementById('tour-modal').style.display = 'flex';
        _tourRender();
      }

      function closeTour() {
        document.getElementById('tour-modal').style.display = 'none';
      }

      function tourNext() {
        if (_tourStep < TOUR_STEPS.length - 1) { _tourStep++; _tourRender(); }
        else { closeTour(); }
      }

      function tourPrev() {
        if (_tourStep > 0) { _tourStep--; _tourRender(); }
      }

      function tourGoStep(i) { _tourStep = i; _tourRender(); }

      function _tourRender() {
        const s = TOUR_STEPS[_tourStep];
        const total = TOUR_STEPS.length;
        const isLast = _tourStep === total - 1;

        document.getElementById('tour-prog-fill').style.width = ((_tourStep + 1) / total * 100) + '%';
        document.getElementById('tour-step-label').textContent = (_tourStep + 1) + ' de ' + total;

        const isFinish = _tourStep === total - 1;

        if (isFinish) {
          // Tela de conclusão
          const miniItems = TOUR_STEPS.map(t =>
            `<div style="background:var(--s2);border:1px solid var(--b1);border-radius:8px;padding:8px 10px;display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted);">
              <span style="font-size:15px;">${t.icon}</span>${t.title}
            </div>`
          ).join('');
          document.getElementById('tour-step-content').innerHTML = `
            <div style="text-align:center;padding:.5rem 0 1rem;">
              <div style="font-size:42px;margin-bottom:.75rem;">🎉</div>
              <div style="font-family:var(--ff);font-size:20px;font-weight:700;margin-bottom:.5rem;">Você está pronto!</div>
              <div style="color:var(--muted);font-size:14px;line-height:1.6;margin-bottom:1.25rem;">Agora você conhece todas as 14 seções do FinançaMinha. Comece pelo cadastro de rendas e despesas para o dashboard ganhar vida.</div>
            </div>
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.5rem;">Seções do sistema</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:7px;">${miniItems}</div>
          `;
          document.getElementById('tour-btn-next').textContent = 'Fechar ✓';
          document.getElementById('tour-btn-next').style.background = 'var(--green)';
        } else {
          const featHtml = s.features
            ? s.features.map(f => `<div style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--muted);padding:4px 0;border-bottom:1px solid var(--b0);">
                <span style="color:var(--green);flex-shrink:0;margin-top:1px;">✓</span>${f}
              </div>`).join('')
            : '';

          document.getElementById('tour-step-content').innerHTML = `
            <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:1.1rem;">
              <div style="width:46px;height:46px;border-radius:10px;background:var(--s2);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">${s.icon}</div>
              <div>
                <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px;">${s.tag}</div>
                <div style="font-family:var(--ff);font-size:17px;font-weight:700;color:var(--text);margin-bottom:2px;">${s.title}</div>
                <div style="font-size:13px;color:var(--muted);">${s.sub}</div>
              </div>
            </div>
            <div style="font-size:13px;color:var(--muted);line-height:1.65;margin-bottom:.875rem;">${s.body}</div>
            ${featHtml ? `<div style="margin-bottom:.875rem;">${featHtml}</div>` : ''}
            <div style="background:var(--s2);border-left:3px solid var(--acc);border-radius:0 8px 8px 0;padding:.75rem 1rem;margin-top:.5rem;">
              <span style="font-size:13px;color:var(--text);font-weight:500;">Dica:</span>
              <span style="font-size:13px;color:var(--muted);"> ${s.tip}</span>
            </div>
          `;
          document.getElementById('tour-btn-next').textContent = 'Próximo →';
          document.getElementById('tour-btn-next').style.background = 'var(--acc)';
        }

        // Dots
        const dotsEl = document.getElementById('tour-dots');
        dotsEl.innerHTML = '';
        TOUR_STEPS.forEach((_, i) => {
          const d = document.createElement('div');
          d.style.cssText = `width:${i === _tourStep ? '20px' : '7px'};height:7px;border-radius:99px;background:${i === _tourStep ? 'var(--acc)' : i < _tourStep ? 'var(--green)' : 'var(--s4)'};transition:all .2s;cursor:pointer;flex-shrink:0;`;
          d.onclick = () => tourGoStep(i);
          d.title = 'Passo ' + (i + 1);
          dotsEl.appendChild(d);
        });

        const btnPrev = document.getElementById('tour-btn-prev');
        btnPrev.disabled = _tourStep === 0;
        btnPrev.style.opacity = _tourStep === 0 ? '.35' : '1';
        btnPrev.style.cursor = _tourStep === 0 ? 'default' : 'pointer';
      }

      // ══════════════════════════════════════════
      //  🔄 RESET MENSAL
      // ══════════════════════════════════════════

      const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

      function checkMonthlyReset() {
        const now = new Date();
        const mesAtual = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        if (!state.lastResetMonth) {
          state.lastResetMonth = mesAtual;
          return;
        }
        if (state.lastResetMonth !== mesAtual) {
          // Novo mês detectado — mostra modal
          const [ay, am] = state.lastResetMonth.split('-').map(Number);
          const mesAnterior = MESES_NOME[am-1] + '/' + ay;
          document.getElementById('reset-mes-label').innerHTML =
            `Era <strong style="color:var(--text)">${mesAnterior}</strong> quando você usou o app pela última vez. Quer resetar as contas para o novo mês de <strong style="color:var(--acc)">${MESES_NOME[now.getMonth()]}/${now.getFullYear()}</strong>?`;
          document.getElementById('reset-modal').style.display = 'flex';
        }
      }

      function doMonthlyReset() {
        const now = new Date();
        const mesAtual = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

        // Reseta status "pago" de todos
        state.essenciais.forEach(e => { e.pago = false; });
        state.naoEssenciais.forEach(n => { n.pago = false; });

        // Remove itens variáveis (não fixos)
        state.essenciais = state.essenciais.filter(e => e.fixo);
        state.naoEssenciais = state.naoEssenciais.filter(n => n.fixo);

        state.lastResetMonth = mesAtual;
        document.getElementById('reset-modal').style.display = 'none';
        renderEssenciais(); renderNE(); calcular();
        debounceAutoSave();
        showToast(`✅ Novo mês iniciado! Contas resetadas.`, 'green');
      }

      function closeMonthlyResetModal() {
        const now = new Date();
        const mesAtual = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        state.lastResetMonth = mesAtual; // não pergunta de novo neste mês
        document.getElementById('reset-modal').style.display = 'none';
        debounceAutoSave();
      }

      // ══════════════════════════════════════════
      
//  PROJEÇÃO MENSAL
      // ══════════════════════════════════════════
      function renderProjecao() {
        const n = parseInt(document.getElementById('proj-meses')?.value || 6);
        const now = new Date();
        const meses = [];

        // Calcula totais base do state atual
        const totalRendas = state.rendas.reduce((s, r) => s + (r.valor || 0), 0)
          + (state.beneficios ? Object.values(state.beneficios).reduce((s, v) => s + (Number(v) || 0), 0) : 0);

        const totalEssenciais = state.essenciais.reduce((s, e) => s + (e.valor || 0), 0);
        const totalNE = state.naoEssenciais.reduce((s, e) => s + (e.valor || 0), 0);
        const totalCartoes = state.cartoes.reduce((s, c) => s + (c.fatura || 0), 0);
        const totalDividas = state.dividas.reduce((s, d) => s + (d.minimo || 0), 0);
        const totalSaidas = totalEssenciais + totalNE + totalCartoes + totalDividas;

        let saldoAcumulado = 0;

        for (let i = 0; i < n; i++) {
          const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
          const nomeMes = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
          const saldo = totalRendas - totalSaidas;
          saldoAcumulado += saldo;

          meses.push({
            nome: nomeMes,
            entradas: totalRendas,
            saidas: totalSaidas,
            essenciais: totalEssenciais,
            naoEssenciais: totalNE,
            cartoes: totalCartoes,
            dividas: totalDividas,
            saldo,
            saldoAcumulado,
          });
        }

        // Resumo cards
        const mediaEntradas = meses.reduce((s, m) => s + m.entradas, 0) / n;
        const mediaSaidas = meses.reduce((s, m) => s + m.saidas, 0) / n;
        const mediaSaldo = mediaEntradas - mediaSaidas;
        const resumoEl = document.getElementById('proj-resumo');
        if (resumoEl) {
          resumoEl.innerHTML = [
            { label: 'Entrada média/mês', val: mediaEntradas, cor: 'var(--green)' },
            { label: 'Saída média/mês', val: mediaSaidas, cor: 'var(--red)' },
            { label: 'Saldo médio/mês', val: mediaSaldo, cor: mediaSaldo >= 0 ? 'var(--acc)' : 'var(--red)' },
            { label: `Acumulado em ${n} meses`, val: saldoAcumulado, cor: saldoAcumulado >= 0 ? 'var(--blue)' : 'var(--red)' },
          ].map(c => `
            <div style="background:var(--s2);border:1px solid var(--b1);border-radius:12px;padding:1rem 1.25rem;">
              <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">${c.label}</div>
              <div style="font-size:20px;font-weight:600;color:${c.cor};">${fmt(c.val)}</div>
            </div>`).join('');
        }

        // Tabela meses
        const tabelaEl = document.getElementById('proj-tabela');
        if (!tabelaEl) return;
        tabelaEl.innerHTML = meses.map((m, i) => `
          <div style="background:var(--s2);border:1px solid var(--b1);border-radius:12px;padding:1.25rem 1.5rem;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
              <div style="font-size:15px;font-weight:600;color:var(--text);text-transform:capitalize;">${esc(m.nome)}</div>
              <div style="font-size:14px;font-weight:600;color:${m.saldo >= 0 ? 'var(--acc)' : 'var(--red)'};">
                Saldo: ${fmt(m.saldo)}
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
              <div style="background:var(--s3);border-radius:8px;padding:10px 12px;">
                <div style="font-size:11px;color:var(--muted);margin-bottom:2px;">💰 Entradas</div>
                <div style="font-size:16px;color:var(--green);font-weight:600;">${fmt(m.entradas)}</div>
              </div>
              <div style="background:var(--s3);border-radius:8px;padding:10px 12px;">
                <div style="font-size:11px;color:var(--muted);margin-bottom:2px;">💸 Saídas</div>
                <div style="font-size:16px;color:var(--red);font-weight:600;">${fmt(m.saidas)}</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:6px;">
              <div style="font-size:12px;color:var(--muted);">🏠 Essenciais: <span style="color:var(--text)">${fmt(m.essenciais)}</span></div>
              <div style="font-size:12px;color:var(--muted);">🛍️ Não essenciais: <span style="color:var(--text)">${fmt(m.naoEssenciais)}</span></div>
              <div style="font-size:12px;color:var(--muted);">💳 Cartões: <span style="color:var(--text)">${fmt(m.cartoes)}</span></div>
              <div style="font-size:12px;color:var(--muted);">⚠️ Dívidas: <span style="color:var(--text)">${fmt(m.dividas)}</span></div>
            </div>
            <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--b0);font-size:12px;color:var(--muted);">
              Saldo acumulado até aqui: <span style="color:${m.saldoAcumulado >= 0 ? 'var(--blue)' : 'var(--red)'};">${fmt(m.saldoAcumulado)}</span>
            </div>
          </div>`).join('');
      }

      function initApp() {
        renderMembros();
        renderRendas();
        renderEssenciais();
        renderNE();
        renderCartoes();
        renderDividas();
        renderInvestimentos();
        renderMetas();
        ['va', 'vr', 'vt', 'vhome', 'vsaude', 'voutra'].forEach(k => {
          const el = document.getElementById(k);
          if (el && state.beneficios[k]) el.value = state.beneficios[k];
        });
        const ea = document.getElementById('emerg-atual');
        if (ea) ea.value = state.emergAtual || 0;
        calcular();
        renderProjecao();

        // Onboarding para novos usuários
        if (!state.onboardingDone) {
          setTimeout(() => showOnboarding(), 400);
        } else {
          // Reset mensal para usuários existentes
          setTimeout(() => checkMonthlyReset(), 600);
          showToast('✅ Bem-vindo ao FinançaMinha!', 'green');
        }
      }



      // ══════════════════════════════════════════
      
//  🗓️  CALENDÁRIO FINANCEIRO
      // ══════════════════════════════════════════

      let _calAno  = new Date().getFullYear();
      let _calMes  = new Date().getMonth(); // 0-based

      const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                        'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
      const DIAS_PT  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

      function calNavMes(delta) {
        if (delta === 0) { _calAno = new Date().getFullYear(); _calMes = new Date().getMonth(); }
        else {
          _calMes += delta;
          if (_calMes < 0)  { _calMes = 11; _calAno--; }
          if (_calMes > 11) { _calMes = 0;  _calAno++; }
        }
        renderCalendario();
      }

      // Coleta todos os eventos do mês/ano atual do state
      function calEventos(ano, mes) {
        const hoje = new Date();
        const eventos = [];
        const mesStr = ano + '-' + String(mes+1).padStart(2,'0');

        // Rendas
        (state.rendas || []).forEach(r => {
          // Se tem competência definida, só aparece no mês correto
          if (r.competencia && r.competencia !== mesStr) return;
          const dia = Math.min(parseInt(r.dia) || 1, 28);
          eventos.push({
            dia, tipo: 'renda',
            label: r.nome || 'Renda',
            valor: r.valor || 0,
            membro: (state.membros||[]).find(m=>m.id===r.membro)?.nome || '',
            pago: false
          });
        });

        // Despesas essenciais
        (state.essenciais || []).forEach(d => {
          if (d.competencia && d.competencia !== mesStr) return;
          const dia = Math.min(parseInt(d.vencimento||d.dia) || 1, 28);
          eventos.push({
            dia, tipo: 'essencial',
            label: d.nome || 'Despesa essencial',
            valor: -(d.valor || 0),
            cat: d.cat || '',
            pago: !!d.pago,
            membro: (state.membros||[]).find(m=>m.id===d.membro)?.nome || ''
          });
        });

        // Despesas não essenciais
        (state.naoEssenciais || []).forEach(d => {
          if (d.competencia && d.competencia !== mesStr) return;
          const dia = Math.min(parseInt(d.vencimento||d.dia) || 1, 28);
          eventos.push({
            dia, tipo: 'nao-essencial',
            label: d.nome || 'Despesa',
            valor: -(d.valor || 0),
            cat: d.cat || '',
            pago: !!d.pago,
            membro: (state.membros||[]).find(m=>m.id===d.membro)?.nome || ''
          });
        });

        // Parcelas de dívidas
        (state.dividas || []).forEach(d => {
          const dia = Math.min(parseInt(d.vencimento||d.dia) || 5, 28);
          eventos.push({
            dia, tipo: 'divida',
            label: d.nome || 'Dívida',
            valor: -(d.parcela || 0),
            pago: false
          });
        });

        // Faturas de cartões
        (state.cartoes || []).forEach(c => {
          const dia = Math.min(parseInt(c.vencimento) || 10, 28);
          eventos.push({
            dia, tipo: 'cartao',
            label: (c.nome||'Cartão') + ' — fatura',
            valor: -(c.limite_usado || 0),
            pago: false
          });
        });

        return eventos.sort((a,b) => a.dia - b.dia);
      }

      function renderCalendario() {
        const ano = _calAno, mes = _calMes;
        const hoje = new Date();
        const ehMesAtual = ano === hoje.getFullYear() && mes === hoje.getMonth();
        const diaHoje = ehMesAtual ? hoje.getDate() : -1;

        document.getElementById('cal-mes-label').textContent = MESES_PT[mes] + ' ' + ano;

        const eventos = calEventos(ano, mes);

        // ── Resumo ──
        let totalEntradas = 0, totalSaidas = 0, totalPago = 0, totalPendente = 0;
        eventos.forEach(e => {
          if (e.valor > 0) totalEntradas += e.valor;
          else totalSaidas += Math.abs(e.valor);
          if (e.pago) totalPago += Math.abs(e.valor);
          else if (e.valor < 0) totalPendente += Math.abs(e.valor);
        });
        const saldo = totalEntradas - totalSaidas;

        document.getElementById('cal-resumo').innerHTML = `
          <div style="background:var(--s2);border:1px solid var(--b1);border-radius:10px;padding:.875rem 1rem;">
            <div style="font-size:11px;color:var(--muted);margin-bottom:3px;">Entradas previstas</div>
            <div style="font-size:20px;font-weight:600;color:var(--green);">${fmt(totalEntradas)}</div>
          </div>
          <div style="background:var(--s2);border:1px solid var(--b1);border-radius:10px;padding:.875rem 1rem;">
            <div style="font-size:11px;color:var(--muted);margin-bottom:3px;">Saídas previstas</div>
            <div style="font-size:20px;font-weight:600;color:var(--red);">${fmt(totalSaidas)}</div>
          </div>
          <div style="background:var(--s2);border:1px solid var(--b1);border-radius:10px;padding:.875rem 1rem;">
            <div style="font-size:11px;color:var(--muted);margin-bottom:3px;">Saldo do mês</div>
            <div style="font-size:20px;font-weight:600;color:${saldo>=0?'var(--green)':'var(--red)'};">${fmt(saldo)}</div>
          </div>
          <div style="background:var(--s2);border:1px solid var(--b1);border-radius:10px;padding:.875rem 1rem;">
            <div style="font-size:11px;color:var(--muted);margin-bottom:3px;">A pagar ainda</div>
            <div style="font-size:20px;font-weight:600;color:var(--yellow);">${fmt(totalPendente)}</div>
          </div>
        `;

        // ── Grade do calendário ──
        const primeiroDia = new Date(ano, mes, 1).getDay();
        const diasNoMes   = new Date(ano, mes+1, 0).getDate();

        // Indexar eventos por dia
        const eventosPorDia = {};
        eventos.forEach(e => {
          if (!eventosPorDia[e.dia]) eventosPorDia[e.dia] = [];
          eventosPorDia[e.dia].push(e);
        });

        let grade = `<div style="display:grid;grid-template-columns:repeat(7,1fr);">`;

        // Cabeçalho dias da semana
        DIAS_PT.forEach(d => {
          grade += `<div style="padding:8px 4px;text-align:center;font-size:11px;font-weight:600;color:var(--muted);background:var(--s2);border-bottom:1px solid var(--b1);">${d}</div>`;
        });

        // Células vazias antes do primeiro dia
        for (let i = 0; i < primeiroDia; i++) {
          grade += `<div style="min-height:72px;padding:6px;border-bottom:1px solid var(--b0);border-right:1px solid var(--b0);background:var(--s2);opacity:.4;"></div>`;
        }

        // Dias do mês
        for (let dia = 1; dia <= diasNoMes; dia++) {
          const isHoje = dia === diaHoje;
          const evs = eventosPorDia[dia] || [];
          const temRenda = evs.some(e => e.tipo === 'renda');
          const temDespesa = evs.some(e => e.valor < 0);
          const col = (primeiroDia + dia - 1) % 7;
          const borderRight = col < 6 ? '1px solid var(--b0)' : 'none';

          let dots = '';
          if (temRenda)   dots += `<span style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;"></span>`;
          if (temDespesa) dots += `<span style="width:6px;height:6px;border-radius:50%;background:var(--red);display:inline-block;"></span>`;

          let evHtml = '';
          evs.slice(0, 2).forEach(e => {
            const cor = e.tipo === 'renda' ? 'var(--green)' :
                        e.tipo === 'divida' || e.tipo === 'cartao' ? 'var(--red)' : 'var(--yellow)';
            const bg  = e.tipo === 'renda' ? 'rgba(34,197,94,.12)' :
                        e.tipo === 'divida' || e.tipo === 'cartao' ? 'rgba(248,113,113,.12)' : 'rgba(250,204,21,.12)';
            evHtml += `<div style="font-size:10px;background:${bg};color:${cor};border-radius:3px;padding:1px 4px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${e.label} — ${fmt(Math.abs(e.valor))}">${e.label}</div>`;
          });
          if (evs.length > 2) evHtml += `<div style="font-size:10px;color:var(--muted);margin-top:1px;">+${evs.length-2} mais</div>`;

          grade += `
            <div onclick="calAbrirDia(${dia})" style="min-height:72px;padding:5px 6px;border-bottom:1px solid var(--b0);border-right:${borderRight};cursor:pointer;transition:background .1s;${isHoje?'background:rgba(200,255,87,.07);':''}hover:background:var(--s2);">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">
                <span style="font-size:13px;font-weight:${isHoje?'700':'400'};color:${isHoje?'var(--acc)':'var(--text)'};${isHoje?'background:var(--acc);color:#09090d;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;':''}"> ${dia}</span>
                <div style="display:flex;gap:2px;">${dots}</div>
              </div>
              ${evHtml}
            </div>`;
        }

        // Células vazias no final
        const totalCelulas = primeiroDia + diasNoMes;
        const restante = totalCelulas % 7 === 0 ? 0 : 7 - (totalCelulas % 7);
        for (let i = 0; i < restante; i++) {
          grade += `<div style="min-height:72px;padding:6px;border-right:1px solid var(--b0);background:var(--s2);opacity:.4;"></div>`;
        }

        grade += `</div>`;
        document.getElementById('cal-grade').innerHTML = grade;

        // ── Linha do tempo ──
        renderTimeline(eventos, diaHoje);
      }

      function renderTimeline(eventos, diaHoje) {
        const el = document.getElementById('cal-timeline');
        if (!eventos.length) {
          el.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--muted);font-size:14px;">Nenhum evento cadastrado neste mês.<br>Cadastre rendas e despesas com data de vencimento.</div>`;
          return;
        }

        // Agrupar por dia
        const porDia = {};
        eventos.forEach(e => {
          if (!porDia[e.dia]) porDia[e.dia] = [];
          porDia[e.dia].push(e);
        });

        const dias = Object.keys(porDia).map(Number).sort((a,b)=>a-b);
        let html = '';

        dias.forEach((dia, idx) => {
          const evs = porDia[dia];
          const passado = diaHoje > 0 && dia < diaHoje;
          const ehHoje  = dia === diaHoje;
          const futuro  = diaHoje > 0 && dia > diaHoje;

          const totalDia = evs.reduce((s,e) => s + e.valor, 0);
          const cor = totalDia >= 0 ? 'var(--green)' : 'var(--red)';

          const isLast = idx === dias.length - 1;

          html += `
            <div style="display:flex;gap:0;align-items:stretch;">
              <!-- coluna do marcador -->
              <div style="display:flex;flex-direction:column;align-items:center;width:40px;flex-shrink:0;">
                <div style="width:14px;height:14px;border-radius:50%;margin-top:14px;flex-shrink:0;
                  background:${ehHoje?'var(--acc)':passado?'var(--green)':'var(--s4)'};
                  border:2px solid ${ehHoje?'var(--acc)':passado?'var(--green)':'var(--b2)'};
                  ${ehHoje?'box-shadow:0 0 0 3px rgba(200,255,87,.25);':''}">
                </div>
                ${!isLast ? `<div style="flex:1;width:2px;background:var(--b1);min-height:16px;"></div>` : ''}
              </div>
              <!-- conteúdo -->
              <div style="flex:1;padding:.625rem .625rem .625rem .5rem;margin-bottom:${isLast?'0':'4px'};">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:.5rem;">
                  <span style="font-size:13px;font-weight:600;color:${ehHoje?'var(--acc)':'var(--text)'};">
                    Dia ${dia}${ehHoje?' — hoje':''}
                  </span>
                  ${passado?'<span style="font-size:10px;background:rgba(34,197,94,.1);color:var(--green);border-radius:99px;padding:1px 7px;">passado</span>':''}
                  ${futuro?'<span style="font-size:10px;background:rgba(96,165,250,.1);color:var(--blue);border-radius:99px;padding:1px 7px;">futuro</span>':''}
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;">
                  ${evs.map(e => {
                    const icone = e.tipo==='renda'?'💰':e.tipo==='essencial'?'🏠':e.tipo==='nao-essencial'?'🛍️':e.tipo==='divida'?'⚠️':'💳';
                    const corV = e.valor>=0?'var(--green)':'var(--red)';
                    const bg   = e.pago?'rgba(34,197,94,.05)':'var(--s2)';
                    const border = e.pago?'1px solid rgba(34,197,94,.2)':'1px solid var(--b1)';
                    return `
                      <div style="display:flex;align-items:center;justify-content:space-between;background:${bg};border:${border};border-radius:8px;padding:7px 10px;">
                        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                          <span style="font-size:15px;flex-shrink:0;">${icone}</span>
                          <div style="min-width:0;">
                            <div style="font-size:13px;color:var(--text);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${e.label}</div>
                            ${e.membro?`<div style="font-size:11px;color:var(--muted);">${e.membro}</div>`:''}
                          </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                          ${e.pago?'<span style="font-size:10px;color:var(--green);">✓ pago</span>':''}
                          <span style="font-size:13px;font-weight:600;color:${corV};">${e.valor>=0?'+':''}${fmt(Math.abs(e.valor))}</span>
                        </div>
                      </div>`;
                  }).join('')}
                </div>
                <div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--b1);display:flex;justify-content:flex-end;">
                  <span style="font-size:12px;color:var(--muted);margin-right:6px;">saldo do dia</span>
                  <span style="font-size:13px;font-weight:700;color:${cor};">${totalDia>=0?'+':''}${fmt(totalDia)}</span>
                </div>
              </div>
            </div>`;
        });

        el.innerHTML = html;
      }


      // ── CALENDÁRIO NO DASHBOARD ──
      let _dashCalAno = new Date().getFullYear();
      let _dashCalMes = new Date().getMonth();

      function dashCalNavMes(delta) {
        if (delta === 0) { _dashCalAno = new Date().getFullYear(); _dashCalMes = new Date().getMonth(); }
        else {
          _dashCalMes += delta;
          if (_dashCalMes < 0)  { _dashCalMes = 11; _dashCalAno--; }
          if (_dashCalMes > 11) { _dashCalMes = 0;  _dashCalAno++; }
        }
        renderDashCalendario();
      }

      function renderDashCalendario() {
        if (!document.getElementById('dash-cal-mes-label')) return;
        const ano = _dashCalAno, mes = _dashCalMes;
        const hoje = new Date();
        const ehMesAtual = ano === hoje.getFullYear() && mes === hoje.getMonth();
        const diaHoje = ehMesAtual ? hoje.getDate() : -1;

        document.getElementById('dash-cal-mes-label').textContent = MESES_PT[mes] + ' ' + ano;

        const eventos = calEventos(ano, mes);
        const totalRenda = eventos.filter(e=>e.tipo==='renda').reduce((s,e)=>s+e.valor,0);
        const totalDesp  = eventos.filter(e=>e.valor<0).reduce((s,e)=>s+e.valor,0);
        const saldoMes   = totalRenda + totalDesp;

        document.getElementById('dash-cal-resumo').innerHTML = `
          <div style="background:var(--s3);border-radius:10px;padding:10px 14px;">
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Entradas</div>
            <div style="font-family:var(--ff);font-size:15px;font-weight:700;color:var(--green);">+${fmt(totalRenda)}</div>
          </div>
          <div style="background:var(--s3);border-radius:10px;padding:10px 14px;">
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Saídas</div>
            <div style="font-family:var(--ff);font-size:15px;font-weight:700;color:var(--red);">${fmt(totalDesp)}</div>
          </div>
          <div style="background:var(--s3);border-radius:10px;padding:10px 14px;">
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Saldo do mês</div>
            <div style="font-family:var(--ff);font-size:15px;font-weight:700;color:${saldoMes>=0?'var(--acc)':'var(--red)'};">${saldoMes>=0?'+':''}${fmt(saldoMes)}</div>
          </div>
          <div style="background:var(--s3);border-radius:10px;padding:10px 14px;">
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Eventos</div>
            <div style="font-family:var(--ff);font-size:15px;font-weight:700;color:var(--text);">${eventos.length}</div>
          </div>`;

        const gradeEl = document.getElementById('dash-cal-grade');
        const diasNoMes = new Date(ano, mes+1, 0).getDate();
        const primeiroDia = new Date(ano, mes, 1).getDay();
        const eventosPorDia = {};
        eventos.forEach(e => { if(!eventosPorDia[e.dia]) eventosPorDia[e.dia]=[]; eventosPorDia[e.dia].push(e); });

        let grade = '<div style="display:grid;grid-template-columns:repeat(7,1fr);">';
        DIAS_PT.forEach(d => {
          grade += `<div style="padding:7px 4px;text-align:center;font-size:11px;font-weight:600;color:var(--muted);background:var(--s3);border-bottom:1px solid var(--b1);">${d}</div>`;
        });
        for (let i=0; i<primeiroDia; i++) {
          grade += '<div style="min-height:64px;padding:5px;border-bottom:1px solid var(--b0);border-right:1px solid var(--b0);opacity:.3;"></div>';
        }
        for (let dia=1; dia<=diasNoMes; dia++) {
          const isHoje = dia===diaHoje;
          const evs = eventosPorDia[dia]||[];
          const col = (primeiroDia+dia-1)%7;
          const borderRight = col<6?'1px solid var(--b0)':'none';
          let dots = '';
          if (evs.some(e=>e.tipo==='renda'))  dots += '<span style="width:5px;height:5px;border-radius:50%;background:var(--green);display:inline-block;"></span>';
          if (evs.some(e=>e.valor<0))         dots += '<span style="width:5px;height:5px;border-radius:50%;background:var(--red);display:inline-block;"></span>';
          let evHtml = '';
          evs.slice(0,2).forEach(e => {
            const cor = e.tipo==='renda'?'var(--green)':e.tipo==='divida'||e.tipo==='cartao'?'var(--red)':'var(--yellow)';
            const bg  = e.tipo==='renda'?'rgba(34,197,94,.12)':e.tipo==='divida'||e.tipo==='cartao'?'rgba(248,113,113,.12)':'rgba(250,204,21,.12)';
            evHtml += `<div style="font-size:9px;background:${bg};color:${cor};border-radius:3px;padding:1px 3px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${e.label}</div>`;
          });
          if (evs.length>2) evHtml += `<div style="font-size:9px;color:var(--muted);margin-top:1px;">+${evs.length-2}</div>`;
          grade += `<div style="min-height:64px;padding:4px 5px;border-bottom:1px solid var(--b0);border-right:${borderRight};${isHoje?'background:rgba(200,255,87,.07);':''}">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">
              <span style="font-size:12px;${isHoje?'background:var(--acc);color:#09090d;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;':'color:var(--text);'}">${dia}</span>
              <div style="display:flex;gap:2px;">${dots}</div>
            </div>${evHtml}</div>`;
        }
        const restante = (primeiroDia+diasNoMes)%7===0?0:7-(primeiroDia+diasNoMes)%7;
        for (let i=0;i<restante;i++) grade += '<div style="min-height:64px;border-right:1px solid var(--b0);opacity:.3;"></div>';
        grade += '</div>';
        gradeEl.innerHTML = grade;

        // Timeline
        const tlEl = document.getElementById('dash-cal-timeline');
        if (!eventos.length) { tlEl.innerHTML = '<div style="text-align:center;padding:1.5rem;color:var(--muted);font-size:13px;">Nenhum evento cadastrado neste mês.</div>'; return; }
        const porDia = {};
        eventos.forEach(e => { if(!porDia[e.dia]) porDia[e.dia]=[]; porDia[e.dia].push(e); });
        const dias = Object.keys(porDia).map(Number).sort((a,b)=>a-b);
        let tlHtml = '';
        dias.forEach((dia,idx) => {
          const evs = porDia[dia];
          const passado = diaHoje>0 && dia<diaHoje;
          const ehHoje  = dia===diaHoje;
          const futuro  = diaHoje>0 && dia>diaHoje;
          const totalDia = evs.reduce((s,e)=>s+e.valor,0);
          const cor = totalDia>=0?'var(--green)':'var(--red)';
          const isLast = idx===dias.length-1;
          tlHtml += `<div style="display:flex;gap:0;align-items:stretch;">
            <div style="display:flex;flex-direction:column;align-items:center;width:36px;flex-shrink:0;">
              <div style="width:12px;height:12px;border-radius:50%;margin-top:14px;flex-shrink:0;background:${ehHoje?'var(--acc)':passado?'var(--green)':'var(--s4)'};border:2px solid ${ehHoje?'var(--acc)':passado?'var(--green)':'var(--b2)'};${ehHoje?'box-shadow:0 0 0 3px rgba(200,255,87,.25);':''}"></div>
              ${!isLast?'<div style="flex:1;width:2px;background:var(--b1);min-height:14px;"></div>':''}
            </div>
            <div style="flex:1;padding:.5rem .5rem .5rem .375rem;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:.375rem;">
                <span style="font-size:12px;font-weight:600;color:${ehHoje?'var(--acc)':'var(--text)'};">Dia ${dia}${ehHoje?' — hoje':''}</span>
                ${passado?'<span style="font-size:9px;background:rgba(34,197,94,.1);color:var(--green);border-radius:99px;padding:1px 6px;">passado</span>':''}
                ${futuro?'<span style="font-size:9px;background:rgba(96,165,250,.1);color:var(--blue);border-radius:99px;padding:1px 6px;">futuro</span>':''}
              </div>
              <div style="display:flex;flex-direction:column;gap:3px;">
                ${evs.map(e=>{
                  const icone=e.tipo==='renda'?'💰':e.tipo==='essencial'?'🏠':e.tipo==='nao-essencial'?'🛍️':e.tipo==='divida'?'⚠️':'💳';
                  const corV=e.valor>=0?'var(--green)':'var(--red)';
                  return '<div style="display:flex;align-items:center;justify-content:space-between;background:'+(e.pago?'rgba(34,197,94,.05)':'var(--s3)')+';border:'+(e.pago?'1px solid rgba(34,197,94,.2)':'1px solid var(--b1)')+';border-radius:7px;padding:6px 9px;"><div style="display:flex;align-items:center;gap:6px;min-width:0;"><span style="font-size:13px;flex-shrink:0;">'+icone+'</span><div style="min-width:0;"><div style="font-size:12px;color:var(--text);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+e.label+'</div>'+(e.membro?'<div style="font-size:10px;color:var(--muted);">'+e.membro+'</div>':'')+'</div></div><div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">'+(e.pago?'<span style="font-size:9px;color:var(--green);">✓ pago</span>':'')+'<span style="font-size:12px;font-weight:600;color:'+corV+';">'+(e.valor>=0?'+':'')+fmt(Math.abs(e.valor))+'</span></div></div>';
                }).join('')}
              </div>
              <div style="margin-top:5px;padding-top:5px;border-top:1px solid var(--b1);display:flex;justify-content:flex-end;">
                <span style="font-size:11px;color:var(--muted);margin-right:5px;">saldo do dia</span>
                <span style="font-size:12px;font-weight:700;color:${cor};">${totalDia>=0?'+':''}${fmt(totalDia)}</span>
              </div>
            </div>
          </div>`;
        });
        tlEl.innerHTML = tlHtml;
      }
      function calAbrirDia(dia) {
        const ano = _calAno, mes = _calMes;
        const eventos = calEventos(ano, mes).filter(e => e.dia === dia);
        if (!eventos.length) return;
        const nomeMes = MESES_PT[mes];
        let txt = `📅 ${dia} de ${nomeMes} de ${ano}\n\n`;
        eventos.forEach(e => {
          const sinal = e.valor >= 0 ? '+' : '';
          txt += `• ${e.label}: ${sinal}${fmt(Math.abs(e.valor))}${e.pago?' ✓':''}\n`;
        });
        showToast(txt.split('\n')[2] || `Dia ${dia}`, 'green');
      }
