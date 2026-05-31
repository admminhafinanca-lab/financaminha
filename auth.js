//  🔐 SUPABASE AUTH + PERSISTÊNCIA
      //  CONFIGURE AQUI com suas credenciais:
      // ══════════════════════════════════════════
      const SUPABASE_URL = 'https://iapsjwiahrngytrxawrj.supabase.co';
      const SUPABASE_ANON_KEY = 'sb_publishable_6rRbVuPIfuF56utFPfVzLg_waXyH5XS';

      const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

      // ── Variáveis de controle ──
      var _currentUser = null;
      var _authSuccessCalled = false;
      window._recoverySession = window._recoverySession || false;

      // ── Boot guard: verifica sessão antes de renderizar ──
      (async function bootGuard() {
        const { data: { session } } = await _sb.auth.getSession();
        if (!session) {
          const hash = window.location.hash;
          if (!hash.includes('type=recovery') && !hash.includes('access_token')) {
            location.href = 'index.html';
          }
          return;
        }
        // Sessão válida — chama onAuthSuccess diretamente, sem depender do onAuthStateChange
        // que em páginas já autenticadas (reload, navegação entre páginas) pode não disparar SIGNED_IN
        if (!_authSuccessCalled) {
          _authSuccessCalled = true;
          await onAuthSuccess(session.user);
        }
      })();

      // ── Verifica compra na Cakto via Edge Function ──
      async function verificarCompraCakto(email) {
        try {
          const res = await fetch(
            SUPABASE_URL + '/functions/v1/smooth-handler',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
              },
              body: JSON.stringify({ email: email.trim().toLowerCase() }),
            }
          );
          if (!res.ok) throw new Error('Erro na verificação');
          const data = await res.json();
          return data.allowed === true;
        } catch (err) {
          console.error('verificarCompraCakto:', err);
          // Em caso de erro na API, bloqueia por segurança
          return false;
        }
      }

      // ── Auth helpers ──
      function authTab(tab) {
        const isLogin = tab === 'login';
        document.getElementById('form-login').style.display = isLogin ? 'block' : 'none';
        document.getElementById('form-signup').style.display = isLogin ? 'none' : 'block';
        document.getElementById('tab-login').style.background = isLogin ? 'var(--s3)' : 'transparent';
        document.getElementById('tab-login').style.color = isLogin ? 'var(--text)' : 'var(--muted)';
        document.getElementById('tab-signup').style.background = isLogin ? 'transparent' : 'var(--s3)';
        document.getElementById('tab-signup').style.color = isLogin ? 'var(--muted)' : 'var(--text)';
        setAuthMsg('');
      }

      function setAuthMsg(msg, isError = true) {
        const el = document.getElementById('auth-msg');
        if (!el) return;
        el.innerHTML = msg; // suporta links e <br> nas mensagens
        el.style.color = isError ? 'var(--red)' : 'var(--green)';
      }

      function setBtnLoading(id, loading, label) {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.disabled = loading;
        btn.textContent = loading ? 'Aguarde...' : label;
        btn.style.opacity = loading ? '.6' : '1';
      }

      async function doLogin() {
        _authSuccessCalled = false; // reset flag para novo login
        const email = document.getElementById('auth-email').value.trim();
        const pass = document.getElementById('auth-pass').value;
        if (!email || !pass) { setAuthMsg('Preencha e-mail e senha.'); return; }
        setBtnLoading('btn-login', true, 'Entrar'); clearInterval(_countdownTimer);
        try {
          const { data, error } = await _sb.auth.signInWithPassword({ email, password: pass });
          if (error) throw error;
          await onAuthSuccess(data.user);
        } catch (err) {
          const m = traduzErroAuth(err.message, 'btn-login', 'Entrar'); if (m) setAuthMsg(m);
        } finally {
          if (!_countdownTimer || !document.getElementById('btn-login').disabled) setBtnLoading('btn-login', false, 'Entrar');
        }
      }

      async function doSignup() {
        const name  = document.getElementById('auth-name').value.trim();
        const email = document.getElementById('auth-email-s').value.trim();
        const pass  = document.getElementById('auth-pass-s').value;

        // ── Validações locais ──
        if (!name)  { setAuthMsg('Informe seu nome.'); return; }
        if (!email) { setAuthMsg('Informe seu e-mail.'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setAuthMsg('E-mail inválido. Verifique o endereço digitado.');
          return;
        }
        if (pass.length < 6) { setAuthMsg('Senha deve ter pelo menos 6 caracteres.'); return; }

        setBtnLoading('btn-signup', true, 'Criar conta'); clearInterval(_countdownTimer);
        setAuthMsg('');

        try {
          // ── Verifica se o e-mail tem compra aprovada na Cakto ──
          setBtnLoading('btn-signup', true, 'Verificando compra…');
          const temCompra = await verificarCompraCakto(email);
          if (!temCompra) {
            setAuthMsg(
              '🔒 Acesso não encontrado.<br>' +
              '<span style="font-size:12px;color:var(--muted);">Este e-mail não possui uma compra ativa do FinançaMinha. ' +
              'Adquira o produto para criar sua conta.</span>'
            );
            return;
          }
          setBtnLoading('btn-signup', true, 'Criando conta…');

          const { data, error } = await _sb.auth.signUp({
            email, password: pass,
            options: { data: { full_name: name } }
          });

          if (error) throw error;

          // Supabase retorna identities vazio quando o e-mail JÁ existe
          // mas confirmação de e-mail está ativa (não vaza que o usuário existe)
          const jaExiste = data.user &&
            Array.isArray(data.user.identities) &&
            data.user.identities.length === 0;

          if (jaExiste) {
            // Caso 1: e-mail já cadastrado — pode estar confirmado ou não
            // Tentamos login silencioso com senha errada para diferenciar:
            const { error: loginErr } = await _sb.auth.signInWithPassword({
              email, password: '##CHECK_ONLY##'
            });
            const msgLogin = loginErr?.message || '';

            if (msgLogin.includes('Email not confirmed')) {
              // Caso 1a: cadastrado mas e-mail não confirmado ainda
              const el = document.getElementById('auth-msg');
              el.innerHTML =
                '⚠️ Este e-mail já foi cadastrado mas ainda não foi confirmado. ' +
                'Verifique sua caixa de entrada (e a pasta de spam).<br>' +
                '<a href="#" id="link-reenviar" style="color:var(--acc);text-decoration:underline;">Reenviar e-mail de confirmação</a>';
              el.style.color = 'var(--red)';
              document.getElementById('link-reenviar').onclick = (e) => {
                e.preventDefault();
                reenviarConfirmacao(email);
              };
            } else {
              // Caso 1b: cadastrado e confirmado — direciona para login
              const el = document.getElementById('auth-msg');
              el.innerHTML =
                '⚠️ Este e-mail já possui cadastro. ' +
                '<a href="#" id="link-ir-login" style="color:var(--acc);text-decoration:underline;">Clique aqui para entrar</a>';
              el.style.color = 'var(--red)';
              document.getElementById('link-ir-login').onclick = (e) => {
                e.preventDefault();
                authTab('login');
              };
            }
            return;
          }

          // Caso 2: cadastro novo bem-sucedido, aguardando confirmação de e-mail
          if (data.user && !data.session) {
            setAuthMsg(
              '✅ Conta criada com sucesso! Enviamos um link de confirmação para <strong>' +
              email + '</strong>. Clique no link do e-mail para ativar sua conta.<br>' +
              '<span style="color:var(--muted);font-size:11px;">Não recebeu? Verifique a pasta de spam.</span>',
              false
            );
            return;
          }

          // Caso 3: confirmação de e-mail desativada no Supabase — entra direto
          if (data.session) {
            await onAuthSuccess(data.user);
          }

        } catch (err) {
          const m2 = traduzErroAuth(err.message, 'btn-signup', 'Criar conta'); if (m2) setAuthMsg(m2);
        } finally {
          if (!_countdownTimer || !document.getElementById('btn-signup').disabled) setBtnLoading('btn-signup', false, 'Criar conta');
        }
      }

      // Reenvia o e-mail de confirmação
      async function reenviarConfirmacao(email) {
        try {
          const { error } = await _sb.auth.resend({
            type: 'signup',
            email: email
          });
          if (error) throw error;
          setAuthMsg(
            '📧 E-mail de confirmação reenviado para <strong>' + email + '</strong>. ' +
            'Verifique sua caixa de entrada e a pasta de spam.',
            false
          );
        } catch (err) {
          const m3 = traduzErroAuth(err.message, 'btn-signup', 'Criar conta'); setAuthMsg('Erro ao reenviar: ' + (m3 || ''));
        }
      }

      async function doForgotPassword() {
        const email = document.getElementById('auth-email').value.trim();
        if (!email) { setAuthMsg('Informe o e-mail no campo acima.'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setAuthMsg('E-mail inválido. Verifique o endereço digitado.');
          return;
        }

        const btnForgot = document.querySelector('button[onclick="doForgotPassword()"]');
        if (btnForgot) { btnForgot.disabled = true; btnForgot.textContent = 'Enviando…'; }

        const redirectTo = window.location.origin + window.location.pathname;
        const { error } = await _sb.auth.resetPasswordForEmail(email, {
          redirectTo: redirectTo
        });

        if (btnForgot) { btnForgot.disabled = false; btnForgot.textContent = 'Esqueci minha senha'; }

        if (error) {
          const m = traduzErroAuth(error.message, null, null);
          if (m) setAuthMsg(m);
        } else {
          setAuthMsg('');
          showToast('📧 Link enviado para ' + email + ' — verifique o spam!', 'green');
        }
      }

      function doLogout() {
        const btn = document.getElementById('btn-logout');
        if (btn) { btn.disabled = true; btn.textContent = 'Saindo...'; }
        _sb.auth.signOut().finally(() => {
          location.href = 'index.html';
        });
      }

      // ── Controle de sessão única ──
      async function checkAndKillOtherSessions(userId, token) {
        const sessionToken = btoa(userId + ':' + Date.now()).slice(0, 64);
        const { data: existing } = await _sb.from('active_sessions')
          .select('id, session_token, last_seen')
          .eq('user_id', userId)
          .single();

        const now = new Date().toISOString();
        if (existing) {
          const lastSeen = new Date(existing.last_seen);
          const diffMin = (Date.now() - lastSeen.getTime()) / 60000;
          if (diffMin < 3) {
            console.warn('[Session] sessão anterior ativa há', diffMin.toFixed(1), 'min — assumindo controle.');
          }
          await _sb.from('active_sessions').update({
            session_token: sessionToken,
            last_seen: now,
            user_agent: navigator.userAgent.slice(0, 200)
          }).eq('user_id', userId);
        } else {
          await _sb.from('active_sessions').insert({
            user_id: userId,
            session_token: sessionToken,
            last_seen: now,
            user_agent: navigator.userAgent.slice(0, 200)
          });
        }
        try { sessionStorage.setItem('fm_session_token', sessionToken); } catch(e) { /* Safari private mode */ }
      }

      // ── Heartbeat: verifica a cada 20s se esta é a sessão válida ──
      function startSessionHeartbeat() {
        setInterval(async () => {
          if (!_currentUser) return;
          let myToken; try { myToken = sessionStorage.getItem('fm_session_token'); } catch(e) { return; }
          if (!myToken) return;
          const { data } = await _sb.from('active_sessions')
            .select('session_token')
            .eq('user_id', _currentUser.id)
            .single();
          if (data && data.session_token !== myToken) {
            // Outra sessão assumiu o controle — encerra imediatamente sem esperar próximo ciclo
            showToast('⚠️ Sessão encerrada — outro dispositivo fez login.', 'red');
            _currentUser = null; // impede saves adicionais
            clearTimeout(_saveTimer);
            await _sb.auth.signOut();
            setTimeout(() => location.reload(), 2500);
          } else {
            await _sb.from('active_sessions').update({ last_seen: new Date().toISOString() }).eq('user_id', _currentUser.id);
          }
        }, 20000);
      }

      // ── Após login bem-sucedido ──
      function updateSidebarUser() {
        const nome = state.membros?.[0]?.nome || _currentUser?.user_metadata?.full_name || '';
        const email = _currentUser?.email || '';
        const ini = (nome.split(' ').map(w => w[0] || '').join('').toUpperCase() || '?').slice(0, 2);
        const nameEl = document.getElementById('sidebar-user-name');
        const emailEl = document.getElementById('sidebar-user-email');
        const avatarEl = document.getElementById('sidebar-user-avatar');
        if (nameEl) nameEl.textContent = nome || email;
        if (emailEl) emailEl.textContent = nome ? email : '';
        if (avatarEl) avatarEl.textContent = ini;
      }
      async function onAuthSuccess(user) {
        // Bloqueia acesso se e-mail não foi confirmado
        if (!user.email_confirmed_at) {
          await _sb.auth.signOut();
          location.href = 'index.html?msg=confirme-email';
          return;
        }
        _currentUser = user;
        // Registra/assume sessão única antes de qualquer coisa
        // checkAndKillOtherSessions removido — causava travamento do cliente Supabase
        // Exibe email provisório enquanto carrega o state
        const emailEl = document.getElementById('sidebar-user-email');
        if (emailEl) emailEl.textContent = user.email;
        const nameEl = document.getElementById('sidebar-user-name');
        if (nameEl) nameEl.textContent = user.user_metadata?.full_name || user.email;
        const avatarEl = document.getElementById('sidebar-user-avatar');
        if (avatarEl) {
          const n = user.user_metadata?.full_name || user.email || '';
          avatarEl.textContent = (n.split(' ').map(w => w[0]||'').join('').toUpperCase()||'?').slice(0,2);
        }
        // Inicia heartbeat de sessão única
        // startSessionHeartbeat(); // removido — causava travamento do cliente Supabase
        // ── Carrega configurações globais do banco ANTES de tudo ──
        try { await loadConfig(); } catch(e) { }
        // Verifica se usuário é admin
        try { await checkAdminRole(user); } catch(e) { }
        // Carrega dados do usuário
        try { await loadStateFromSupabase(); } catch(e) { console.error('[onAuthSuccess] loadState falhou:', e); }
        // Atualiza nome com o do state (membro titular)
        try { updateSidebarUser(); } catch(e) {}
        // Inicializa o app
        try { initApp(); } catch(e) { console.error('[onAuthSuccess] initApp falhou:', e); }

      // ── Hash-based navigation — apenas se a page existe no DOM (app.html) ──
      const _hashPage = window.location.hash.replace('#','');
      if (_hashPage && document.getElementById('page-' + _hashPage)) {
        const navBtn = [...document.querySelectorAll('.nav-btn')]
          .find(b => b.getAttribute('onclick')?.includes("'" + _hashPage + "'"));
        if (navBtn) nav(_hashPage, navBtn);
      }

      }

      // ── Tradução de erros ──
      // ── Contagem regressiva de rate limit ──
      let _countdownTimer = null;
      function startRateLimitCountdown(seconds, btnId, originalLabel) {
        clearInterval(_countdownTimer);
        const btn = document.getElementById(btnId);
        let remaining = seconds;
        if (btn) { btn.disabled = true; btn.textContent = `Aguarde ${remaining}s...`; }
        setAuthMsg(`⏳ Muitas tentativas. Tente novamente em <strong id="cd-count">${remaining}s</strong>.`, true);
        _countdownTimer = setInterval(() => {
          remaining--;
          const cdEl = document.getElementById('cd-count');
          if (cdEl) cdEl.textContent = remaining + 's';
          if (btn) btn.textContent = `Aguarde ${remaining}s...`;
          if (remaining <= 0) {
            clearInterval(_countdownTimer);
            if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
            setAuthMsg('');
          }
        }, 1000);
      }

      function traduzErroAuth(msg, btnId, originalLabel) {
        if (!msg) return 'Erro desconhecido.';
        if (msg.includes('Invalid login credentials'))
          return 'E-mail ou senha incorretos.';
        if (msg.includes('Email not confirmed'))
          return '⚠️ E-mail ainda não confirmado. Verifique sua caixa de entrada e clique no link que enviamos.';
        if (msg.includes('User already registered'))
          return 'E-mail já cadastrado. Faça login.';
        if (msg.includes('Password should be') || msg.includes('weak_password'))
          return 'Senha muito fraca. Use pelo menos 6 caracteres.';
        if (msg.includes('security purposes') || msg.includes('rate limit') || msg.includes('over_email_send_rate_limit')) {
          // Extrai os segundos da mensagem do Supabase: "after 57 seconds"
          const match = msg.match(/(\d+)\s*second/);
          const secs = match ? parseInt(match[1]) : 60;
          if (btnId) startRateLimitCountdown(secs, btnId, originalLabel);
          return ''; // mensagem gerenciada pelo countdown
        }
        if (msg.includes('unable to validate email') || msg.includes('invalid email'))
          return 'E-mail inválido. Verifique o endereço digitado.';
        if (msg.includes('signup is disabled'))
          return 'Cadastro de novos usuários está desativado no momento.';
        if (msg.includes('network') || msg.includes('fetch'))
          return 'Erro de conexão. Verifique sua internet e tente novamente.';
        return msg;
      }

      // ══════════════════════════════════════════
      //  💾 PERSISTÊNCIA NO SUPABASE
      // ══════════════════════════════════════════
      async function loadStateFromSupabase() {
        if (!_currentUser) { console.warn('[loadState] abortado — _currentUser é null'); return false; }
        try {
          console.log('[loadState] buscando dados para user_id:', _currentUser.id);
          const { data, error } = await _sb.from('user_data')
            .select('state_json')
            .eq('user_id', _currentUser.id)
            .single();
          if (error) {
            // PGRST116 = nenhuma linha encontrada — normal no primeiro acesso
            if (error.code === 'PGRST116') {
              console.log('[loadState] nenhum dado salvo ainda — primeiro acesso');
            } else {
              console.error('[loadState] ERRO Supabase:', error);
              showToast('⚠️ Erro ao carregar dados: ' + (error.message || error.code), 'red');
            }
            return false;
          }
          if (!data?.state_json) { console.log('[loadState] state_json vazio'); return false; }
          const saved = JSON.parse(data.state_json);
          console.log('[loadState] dados carregados com sucesso:', Object.keys(saved));
          if (saved.membros?.length) state.membros = saved.membros;
          if (saved.rendas?.length) state.rendas = saved.rendas;
          if (saved.essenciais?.length) state.essenciais = saved.essenciais;
          if (saved.naoEssenciais?.length) state.naoEssenciais = saved.naoEssenciais;
          if (saved.cartoes?.length) state.cartoes = saved.cartoes;
          if (saved.dividas?.length) state.dividas = saved.dividas;
          if (saved.investimentos?.length) state.investimentos = saved.investimentos;
          if (saved.emergAtual !== undefined) state.emergAtual = saved.emergAtual;
          if (saved.beneficios) state.beneficios = { ...state.beneficios, ...saved.beneficios };
          if (saved.metas?.length) state.metas = saved.metas;
          if (saved.lastResetMonth) state.lastResetMonth = saved.lastResetMonth;
          if (saved.onboardingDone) state.onboardingDone = saved.onboardingDone;
          syncNextId();
          return true;
        } catch (e) { console.error('[loadState] EXCEÇÃO:', e); return false; }
      }

      async function persistSave() {
        console.log('[persistSave] chamado. _currentUser:', _currentUser?.id || 'NULL');
        if (!_currentUser) {
          console.warn('[persistSave] abortado — _currentUser é null. O login foi concluído?');
          return;
        }
        try {
          function sanitizeNum(v, fallback = 0) {
            const n = parseFloat(String(v).replace(',', '.'));
            return (isFinite(n) && !isNaN(n)) ? n : fallback;
          }
          function sanitizeItems(arr) {
            if (!Array.isArray(arr)) return [];
            return arr.map(item => {
              const clean = { ...item };
              ['valor','total','juros','minimo','parcelas','dia','idade'].forEach(campo => {
                if (campo in clean) clean[campo] = sanitizeNum(clean[campo]);
              });
              return clean;
            });
          }

          // ── Merge com o banco: lê o state salvo e só substitui os campos
          //    que existem nesta página (têm itens) — nunca apaga dados de
          //    outras páginas com arrays vazios por falta de DOM.
          let baseState = {};
          try {
            const { data: existing } = await _sb.from('user_data')
              .select('state_json')
              .eq('user_id', _currentUser.id)
              .single();
            if (existing?.state_json) {
              baseState = JSON.parse(existing.state_json);
              console.log('[persistSave] merge base carregado do banco');
            }
          } catch(e) {
            console.warn('[persistSave] sem dados anteriores no banco — salvando do zero');
          }

          // Campos array: só substitui se o state local tiver itens OU se a página
          // é responsável pelo campo (elemento DOM da seção existe na página atual).
          function mergeArray(key, localArr, sanitize = true) {
            const local = sanitize ? sanitizeItems(localArr) : (localArr || []);
            const pageEl = document.getElementById('page-' + key) ||
                           document.getElementById('lista-' + key);
            // Se o elemento da seção existe no DOM desta página, esta página é dona do campo
            if (pageEl) return local;
            // Senão, preserva o que está no banco
            return baseState[key] || local;
          }

          const safeState = {
            // Base: tudo que estava no banco
            ...baseState,
            // Campos simples: sempre salvos (não dependem de DOM de outras páginas)
            lastResetMonth:  state.lastResetMonth  || baseState.lastResetMonth  || '',
            onboardingDone:  state.onboardingDone  ?? baseState.onboardingDone  ?? false,
            emergAtual:      sanitizeNum(state.emergAtual),
            // Campos array: merge inteligente por presença de DOM
            membros:         mergeArray('membros',      state.membros,       false),
            rendas:          mergeArray('rendas',       state.rendas),
            essenciais:      mergeArray('essenciais',   state.essenciais),
            naoEssenciais:   mergeArray('nao-essenciais', state.naoEssenciais),
            cartoes:         mergeArray('cartoes',      state.cartoes),
            dividas:         mergeArray('dividas',      state.dividas),
            investimentos:   mergeArray('investimentos',state.investimentos),
            metas:           mergeArray('metas',        state.metas),
            // Benefícios: só salva se o elemento existe nesta página
            beneficios: document.getElementById('page-beneficios') ? {
              va:     sanitizeNum(state.beneficios?.va),
              vr:     sanitizeNum(state.beneficios?.vr),
              vt:     sanitizeNum(state.beneficios?.vt),
              vhome:  sanitizeNum(state.beneficios?.vhome),
              vsaude: sanitizeNum(state.beneficios?.vsaude),
              voutra: sanitizeNum(state.beneficios?.voutra),
            } : (baseState.beneficios || state.beneficios),
          };

          const payload = {
            user_id:    _currentUser.id,
            state_json: JSON.stringify(safeState),
            updated_at: new Date().toISOString()
          };

          console.log('[persistSave] salvando para user_id:', _currentUser.id, '| bytes:', payload.state_json.length);

          const { data, error } = await _sb.from('user_data').upsert(payload, { onConflict: 'user_id' });
          if (error) {
            console.error('[persistSave] ERRO Supabase:', error);
            showToast('⚠️ Erro ao salvar: ' + (error.message || error.code || JSON.stringify(error)), 'red');
          } else {
            console.log('[persistSave] OK — rendas salvas:', state.rendas.length);
            showToast('💾 Salvo! Rendas: ' + state.rendas.length, 'green');
          }
        } catch (e) {
          console.error('[persistSave] EXCEÇÃO:', e);
          showToast('⚠️ Erro inesperado ao salvar: ' + e.message, 'red');
        }
      }
      // ══════════════════════════════════════════
      //  🚀 INICIALIZAÇÃO COM AUTH
      // ══════════════════════════════════════════

      // ══════════════════════════════════════════
      
//  RESET DE SENHA
      // ══════════════════════════════════════════
      function openResetModal() {
        document.getElementById('reset-pass-modal').classList.add('open');
        document.getElementById('reset-new-pass').focus();
      }

      function closeResetModal() {
        document.getElementById('reset-pass-modal').classList.remove('open');
      }

      function validateResetPass() {
        const p1  = document.getElementById('reset-new-pass').value;
        const p2  = document.getElementById('reset-confirm-pass').value;
        const msg = document.getElementById('reset-msg');
        const btn = document.getElementById('btn-reset-confirm');
        if (p1.length > 0 && p1.length < 6) {
          msg.textContent = 'Senha deve ter pelo menos 6 caracteres.';
          msg.style.color = 'var(--red)';
          btn.disabled = true;
        } else if (p2.length > 0 && p1 !== p2) {
          msg.textContent = 'As senhas não coincidem.';
          msg.style.color = 'var(--red)';
          btn.disabled = true;
        } else {
          msg.textContent = '';
          btn.disabled = false;
        }
      }

      async function doResetPassword() {
        const p1 = document.getElementById('reset-new-pass').value;
        const p2 = document.getElementById('reset-confirm-pass').value;
        const msg = document.getElementById('reset-msg');
        const btn = document.getElementById('btn-reset-confirm');

        if (p1.length < 6) {
          msg.textContent = 'Senha deve ter pelo menos 6 caracteres.';
          msg.style.color = 'var(--red)'; return;
        }
        if (p1 !== p2) {
          msg.textContent = 'As senhas não coincidem.';
          msg.style.color = 'var(--red)'; return;
        }

        btn.disabled = true; btn.textContent = 'Salvando…';
        const { error } = await _sb.auth.updateUser({ password: p1 });

        if (error) {
          msg.innerHTML = traduzErroAuth(error.message) || error.message;
          msg.style.color = 'var(--red)';
          btn.disabled = false; btn.textContent = 'Salvar nova senha';
        } else {
          msg.innerHTML = '✅ Senha alterada com sucesso!';
          msg.style.color = 'var(--green)';
          btn.textContent = 'Salvar nova senha';
          setTimeout(() => {
            closeResetModal();
            // Limpa os campos
            document.getElementById('reset-new-pass').value = '';
            document.getElementById('reset-confirm-pass').value = '';
            msg.textContent = '';
            btn.disabled = false;
          }, 1800);
        }
      }

      // Intercepta o retorno do link de reset
      // Guard: se não autenticado, volta para login
      _sb.auth.onAuthStateChange(async (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          location.href = 'forgot.html' + window.location.hash;
          return;
        }
        if (event === 'SIGNED_OUT') {
          location.href = 'index.html';
          return;
        }
        if (event === 'SIGNED_IN' && session && !window._recoverySession) {
          if (_authSuccessCalled) return;
          _authSuccessCalled = true;
          await onAuthSuccess(session.user);
        }
      });

      // Checa no boot se a URL tem token de recovery (para quando o evento já disparou)
      (async () => {
        const hash = window.location.hash;
        if (hash.includes('type=recovery') || hash.includes('type=magiclink')) {
          window._recoverySession = true;
          // O onAuthStateChange vai capturar e abrir o modal
        }
      })();
      // ══════════════════════════════════════════

      // ══════════════════════════════════════════
      //  ADMIN MODAL — integrado ao app
      // ══════════════════════════════════════════
      let _isAdmin = false;
      let _adminCfgCache = []; // cache dos configs carregados

      async function checkAdminRole(user) {
        try {
          const { data: { user: u } } = await _sb.auth.getUser();
          const meta = u?.app_metadata || {};
          _isAdmin = meta.role === 'admin';
          if (_isAdmin) {
            const btn = document.getElementById('btn-open-admin');
            if (btn) btn.style.display = 'block';
          }
        } catch(e) { console.warn('[checkAdminRole] ignorado:', e.message); }
      }

      function openAdminModal() {
        document.getElementById('admin-modal').classList.add('open');
        if (_adminCfgCache.length === 0) loadAdminConfigs();
      }

      function closeAdminModal() {
        document.getElementById('admin-modal').classList.remove('open');
      }

      function adminModalBgClick(e) {
        if (e.target === document.getElementById('admin-modal')) closeAdminModal();
      }

      // Esc fecha o modal
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeAdminModal();
      });

      async function loadAdminConfigs() {
        const list = document.getElementById('acfg-list');
        list.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:.5rem 0;">Carregando…</div>';
        const { data, error } = await _sb.from('app_config').select('*').order('chave');
        if (error) {
          list.innerHTML = '<div style="color:var(--red);font-size:13px;">Erro ao carregar configurações.</div>';
          return;
        }
        _adminCfgCache = data;
        renderAdminCfgList(data);
      }

      function renderAdminCfgList(configs) {
        const list = document.getElementById('acfg-list');
        list.innerHTML = '';
        configs.forEach(cfg => {
          const card = document.createElement('div');
          card.className = 'acfg-card';
          card.id = 'acfg-' + cfg.chave;
          const json = JSON.stringify(cfg.valor, null, 2);
          const updated = cfg.updated_at
            ? new Date(cfg.updated_at).toLocaleDateString('pt-BR') + ' ' +
              new Date(cfg.updated_at).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})
            : '';
          card.innerHTML = `
            <div class="acfg-header" onclick="toggleAcfg('${cfg.chave}')">
              <div class="acfg-left">
                <div class="acfg-chave">${cfg.chave}</div>
                <div class="acfg-desc">${cfg.descricao || ''} ${updated ? '<span style="color:var(--dim);font-size:10px;">• ' + updated + '</span>' : ''}</div>
              </div>
              <span class="acfg-chevron">▼</span>
            </div>
            <div class="acfg-body">
              <textarea class="acfg-ta" id="acfg-ta-${cfg.chave}"
                oninput="validateAcfg('${cfg.chave}')">${json}</textarea>
              <div id="acfg-err-${cfg.chave}" class="acfg-err"></div>
              <div class="acfg-actions">
                <button class="acfg-reset" onclick="resetAcfg('${cfg.chave}')">Desfazer</button>
                <button class="acfg-save" id="acfg-save-${cfg.chave}" onclick="saveAcfg('${cfg.chave}')">💾 Salvar</button>
              </div>
            </div>
          `;
          card.querySelector('#acfg-ta-' + cfg.chave).dataset.original = json;
          list.appendChild(card);
        });
      }

      function toggleAcfg(chave) {
        document.getElementById('acfg-' + chave).classList.toggle('open');
      }

      function validateAcfg(chave) {
        const ta  = document.getElementById('acfg-ta-' + chave);
        const err = document.getElementById('acfg-err-' + chave);
        const btn = document.getElementById('acfg-save-' + chave);
        try {
          JSON.parse(ta.value);
          ta.classList.remove('error');
          err.className = 'acfg-ok'; err.textContent = '✓ JSON válido';
          btn.disabled = false;
        } catch (e) {
          ta.classList.add('error');
          err.className = 'acfg-err'; err.textContent = '✗ ' + e.message;
          btn.disabled = true;
        }
      }

      function resetAcfg(chave) {
        const ta  = document.getElementById('acfg-ta-' + chave);
        const err = document.getElementById('acfg-err-' + chave);
        ta.value = ta.dataset.original;
        ta.classList.remove('error');
        err.textContent = '';
        document.getElementById('acfg-save-' + chave).disabled = false;
      }

      async function saveAcfg(chave) {
        const ta  = document.getElementById('acfg-ta-' + chave);
        const btn = document.getElementById('acfg-save-' + chave);
        let parsed;
        try { parsed = JSON.parse(ta.value); }
        catch { showToast('JSON inválido', 'red'); return; }
        btn.disabled = true; btn.textContent = 'Salvando…';
        try {
          const { error } = await _sb.from('app_config')
            .update({ valor: parsed, updated_at: new Date().toISOString() })
            .eq('chave', chave);
          if (error) throw error;
          // Atualiza CFG em memória imediatamente
          CFG[chave] = parsed;
          ta.dataset.original = JSON.stringify(parsed, null, 2);
          showToast('✅ "' + chave + '" salvo!', 'green');
        } catch (e) {
          showToast('Erro: ' + e.message, 'red', 4000);
        } finally {
          btn.disabled = false; btn.textContent = '💾 Salvar';
        }
      }
      // ══════════════════════════════════════════

      document.addEventListener('DOMContentLoaded', async () => {
        // Se URL tem token de recovery, não faz login automático — espera o onAuthStateChange abrir o modal
        if (window.location.hash.includes('type=recovery')) {
          // (auth-screen removido — página separada)
          return;
        }

        // Aguarda um tick para o onAuthStateChange disparar primeiro (Safari)
        await new Promise(r => setTimeout(r, 300));

        // Se o onAuthStateChange já tratou o login, não faz nada
        if (_authSuccessCalled) return;

        // Verifica se há sessão ativa no Supabase (fallback para Safari/cookies bloqueados)
        try {
          const { data: { session } } = await _sb.auth.getSession();
          if (session && session.user && !_authSuccessCalled) {
            _authSuccessCalled = true;
            await onAuthSuccess(session.user);
          } else if (!session) {
            // (auth-screen removido — página separada)
          }
        } catch(e) {
          console.error('[DOMContentLoaded] erro ao verificar sessão:', e);
          // (auth-screen removido — página separada)
        }
      });

      // ══════════════════════════════════════════
