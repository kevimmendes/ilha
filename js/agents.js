/**
 * Ilha.Agents — motor de atividade dos agentes de IA.
 * Simula uma sessão real do Claude Code (e depois do Codex): leituras,
 * edições, comandos, buscas, aprovações pendentes e falhas de build.
 * Em uma integração real, os eventos viriam de hooks/statusline do agente.
 */
window.Ilha = window.Ilha || {};

Ilha.Agents = (function () {
  'use strict';

  const CTX_MAX = 80; // k tokens de contexto
  const listeners = { event: [], update: [], usage: [] };

  let seq = 0;
  let running = false;
  let contextK = 4;
  let planPct = 7;
  let cycleCount = 0;
  const pending = new Map();  // id -> evento de aprovação
  const waiters = new Map();  // id -> resolver da promise

  function on(name, cb) {
    (listeners[name] || (listeners[name] = [])).push(cb);
  }

  function fire(name, payload) {
    (listeners[name] || []).forEach((cb) => {
      try { cb(payload); } catch (e) { console.error('[ilha]', e); }
    });
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jitter = (base, spread = 550) => Math.max(400, base + (Math.random() * 2 - 1) * spread);

  function usage() {
    fire('usage', {
      contextPct: Math.max(1, Math.min(100, Math.round((contextK / CTX_MAX) * 100))),
      contextUsedK: Math.round(contextK),
      contextMaxK: CTX_MAX,
      planPct: Math.max(1, Math.min(100, Math.round(planPct))),
    });
  }

  function emit(type, agent, text, detail, extra) {
    seq += 1;
    const evt = Object.assign({
      id: 'e' + seq,
      type,
      agent,
      text,
      detail: detail || null,
      ts: Date.now(),
      status: 'done',
    }, extra || {});

    contextK = Math.min(CTX_MAX - 2, contextK + 2.5 + Math.random() * 3);
    planPct = Math.min(99, planPct + 1.5);
    usage();
    fire('event', evt);
    return evt;
  }

  function update(evt) {
    fire('update', evt);
  }

  /** Resolve uma aprovação pendente (vinda dos botões da ilha). */
  function resolve(id, approved) {
    const evt = pending.get(id);
    if (!evt) return;
    pending.delete(id);
    evt.status = 'done';
    evt.resolved = !!approved;
    update(evt);
    const waiter = waiters.get(id);
    waiters.delete(id);
    if (waiter) waiter(!!approved);
  }

  /** Emite um comando em execução e, depois, o resultado no mesmo evento. */
  async function command(agent, cmd, ms, ok, resultText) {
    const evt = emit('command', agent, '$ ' + cmd, 'executando…', { status: 'running', from: 'command' });
    await sleep(ms);
    evt.status = 'done';
    evt.text = resultText;
    evt.detail = '$ ' + cmd + (ok ? ' · exit 0' : ' · exit 1');
    if (!ok) evt.type = 'error';
    else evt.type = 'success';
    usage();
    update(evt);
    return evt;
  }

  async function approval(agent, text, detail) {
    const evt = emit('approval', agent, text, detail, { status: 'pending' });
    pending.set(evt.id, evt);
    const approved = await new Promise((res) => { waiters.set(evt.id, res); });
    return approved;
  }

  /* -------------------------------------------------------
     Roteiro de um ciclo de trabalho (~45s)
     ------------------------------------------------------- */

  async function cycle() {
    const CLAUDE = 'Claude Code';
    const CODEX = 'Codex';

    cycleCount += 1;
    if ((cycleCount - 1) % 5 === 0) planPct = 7 + Math.random() * 4; // nova sessão zera o plano
    contextK = 4 + Math.random() * 3;

    emit('session', CLAUDE, 'Sessão iniciada · projeto api-gateway', '~/projetos/api-gateway · branch main');
    await sleep(jitter(2800));

    emit('read', CLAUDE, 'Lendo src/routes/users.ts');
    await sleep(jitter(1500, 450));
    emit('read', CLAUDE, 'Lendo src/db/schema.ts');
    await sleep(jitter(1700, 500));
    emit('edit', CLAUDE, 'Editando src/routes/users.ts', '+18 −4 · validação de e-mail');
    await sleep(jitter(1900, 550));

    await command(CLAUDE, 'npm test', 2400, true, '24 testes passaram em 3,2s');
    await sleep(jitter(1600));

    emit('tool', CLAUDE, 'Buscando: rate limit middleware express', '3 resultados · 0,8s');
    await sleep(jitter(1800, 500));
    emit('edit', CLAUDE, 'Editando src/middleware/rateLimit.ts', '+42 −0 · novo middleware');
    await sleep(jitter(1600));

    const ok = await approval(CLAUDE, 'git push origin feat/auth', '1 commit · 3 arquivos · +58 −12');
    if (ok) {
      emit('success', CLAUDE, 'Push enviado para feat/auth', 'origin/feat/auth · 8f3ac21');
    } else {
      emit('info', CLAUDE, 'Push cancelado por você', 'nada foi enviado');
    }
    await sleep(jitter(1400));

    await command(CLAUDE, 'npm run build', 2800, false, 'Build falhou · TS2345 em src/utils/date.ts');
    await sleep(jitter(1200, 350));
    emit('edit', CLAUDE, 'Editando src/utils/date.ts', '+3 −1 · comparação tipada');
    await sleep(jitter(1500));
    await command(CLAUDE, 'npm run build', 2600, true, 'Build concluído em 4,1s');
    await sleep(jitter(2000));

    /* --- Codex assume --- */
    emit('session', CODEX, 'Codex assumiu a tarefa', 'modo auto · plano em 6 passos');
    await sleep(jitter(2200));
    emit('read', CODEX, 'Lendo tests/auth.spec.ts');
    await sleep(jitter(1500, 450));
    emit('edit', CODEX, 'Editando tests/auth.spec.ts', '+26 −0 · 3 cenários novos');
    await sleep(jitter(1700));
    await command(CODEX, 'npm test -- auth', 2200, true, '9 testes passaram em 1,1s');
    await sleep(jitter(1400));
    emit('read', CODEX, 'Lendo docs/API.md');
    await sleep(jitter(1300, 400));
    emit('edit', CODEX, 'Editando docs/API.md', '+12 −3 · seção de autenticação');
    await sleep(jitter(1700));
    emit('success', CODEX, 'Codex entregou · PR #184 pronto para revisão', 'feat/auth · +139 −44');
    await sleep(jitter(3000, 900));
  }

  async function loop() {
    while (running) {
      try {
        await cycle();
      } catch (e) {
        console.error('[ilha] ciclo falhou', e);
        await sleep(2500);
      }
    }
  }

  return {
    on,
    start() {
      if (running) return;
      running = true;
      usage();
      loop();
    },
    stop() {
      running = false;
    },
    resolve,
    get isRunning() { return running; },
  };
})();
