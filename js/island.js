/**
 * Ilha.Island — componente da Dynamic Island.
 * Estados: collapsed <-> expanded. Renderiza o feed de atividade,
 * barra de uso, gauge do plano, pílula de voz e toasts.
 */
window.Ilha = window.Ilha || {};

Ilha.Island = (function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const els = {
    island: $('island'),
    collapsed: $('islCollapsed'),
    islExpanded: $('islExpanded'),
    orb: $('orb'),
    orb2: $('orb2'),
    collapsedAgent: $('collapsedAgent'),
    collapsedStatus: $('collapsedStatus'),
    gauge: $('gauge'),
    gaugeFill: $('gaugeFill'),
    gaugeNum: $('gaugeNum'),
    agentChip: $('agentChip'),
    brandSub: $('brandSub'),
    btnCollapse: $('btnCollapse'),
    islStatus: $('islStatus'),
    islStatusText: $('islStatusText'),
    islTimer: $('islTimer'),
    evtList: $('evtList'),
    usageText: $('usageText'),
    usageFill: $('usageFill'),
    planText: $('planText'),
    planFill: $('planFill'),
    micBtn: $('micBtn'),
    cmdInput: $('cmdInput'),
    voicePill: $('voicePill'),
    voiceText: $('voiceText'),
    toast: $('toast'),
  };

  const GLYPH = {
    session: '🔀',
    read: '📖',
    edit: '✏️',
    command: '▶️',
    success: '✅',
    error: '❌',
    approval: '⏳',
    tool: '🔍',
    reminder: '⏰',
    voice: '🎙️',
    info: '↩️',
  };

  const GAUGE_C = 97.4; // circunferência do círculo do gauge (r=15.5)

  let state = 'collapsed';
  let workMode = 'idle';       // modo "de trabalho" do orb (idle | working | error)
  let toastTimer = null;
  let voiceTimer = null;
  const events = new Map();    // id -> evento

  /** Callback registrado pelo main.js: onAction('approve'|'deny'|'done', id) */
  let onAction = null;

  /* ---------------- helpers ---------------- */

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function timeOf(ts) {
    return new Date(ts).toLocaleTimeString('pt-BR', { hour12: false });
  }

  function rowHTML(e) {
    let extra = '';
    if (e.type === 'approval' && e.status === 'pending') {
      extra =
        '<span class="evt-actions">' +
        '<button class="btn btn-approve" data-act="approve" data-id="' + e.id + '">Aprovar</button>' +
        '<button class="btn btn-deny" data-act="deny" data-id="' + e.id + '">Negar</button>' +
        '</span>';
    } else if (e.type === 'approval' && e.status === 'done') {
      extra = '<span class="evt-resolved ' + (e.resolved ? 'ok' : 'no') + '">' +
        (e.resolved ? '✓ aprovado por você' : '✗ negado por você') + '</span>';
    } else if (e.type === 'reminder' && e.status !== 'done') {
      extra =
        '<span class="evt-actions">' +
        '<button class="btn btn-approve" data-act="done" data-id="' + e.id + '">Concluir</button>' +
        '</span>';
    } else if (e.type === 'reminder' && e.status === 'done') {
      extra = '<span class="evt-resolved ok">✓ concluído</span>';
    }

    const detail = e.detail
      ? '<span class="evt-detail">' + esc(e.detail) + '</span>'
      : '';

    return (
      '<span class="evt-icon" aria-hidden="true">' + (GLYPH[e.type] || '•') + '</span>' +
      '<span class="evt-body">' +
        '<span class="evt-text">' + esc(e.text) + '</span>' +
        detail +
        extra +
      '</span>' +
      '<time class="evt-time">' + timeOf(e.ts) + '</time>'
    );
  }

  function refreshEmpty() {
    const empty = els.evtList.querySelector('.evt-empty');
    const hasRows = !!els.evtList.querySelector('.evt');
    if (empty) empty.hidden = hasRows;
  }

  /* ---------------- estados ---------------- */

  function expand() {
    if (state === 'expanded') return;
    state = 'expanded';
    els.island.dataset.state = 'expanded';
    els.collapsed.setAttribute('aria-expanded', 'true');
    els.islExpanded.setAttribute('aria-hidden', 'false');
    if (onAction) onAction('state', state);
  }

  function collapse() {
    if (state === 'collapsed') return;
    state = 'collapsed';
    els.island.dataset.state = 'collapsed';
    els.collapsed.setAttribute('aria-expanded', 'false');
    els.islExpanded.setAttribute('aria-hidden', 'true');
    els.cmdInput.blur();
    if (onAction) onAction('state', state);
  }

  function getState() { return state; }

  function setOrbMode(mode) {
    els.orb.dataset.mode = mode;
    els.orb2.dataset.mode = mode;
  }

  function setWorkMode(mode) {
    workMode = mode;
    setOrbMode(mode);
  }

  function setStatus(text, status) {
    els.islStatusText.textContent = text;
    els.collapsedStatus.textContent = text;
    els.islStatus.dataset.state = status || 'working';
  }

  function setAgent(name) {
    els.agentChip.textContent = name;
    els.agentChip.dataset.agent = name;
    els.collapsedAgent.textContent = name;
  }

  function setBrandSub(text) {
    els.brandSub.textContent = text;
  }

  /* ---------------- feed ---------------- */

  function pushEvent(e) {
    events.set(e.id, e);
    const empty = els.evtList.querySelector('.evt-empty');
    const row = document.createElement('div');
    row.className = 'evt';
    row.dataset.id = e.id;
    row.dataset.type = e.type;
    row.dataset.status = e.status || 'done';
    row.title = e.text + (e.detail ? ' — ' + e.detail : '');
    row.innerHTML = rowHTML(e);
    els.evtList.insertBefore(row, els.evtList.firstChild);
    if (empty) empty.hidden = true;
    // mantém o histórico com tamanho razoável
    const rows = els.evtList.querySelectorAll('.evt');
    if (rows.length > 60) rows[rows.length - 1].remove();
  }

  function updateEvent(e) {
    events.set(e.id, e);
    const row = els.evtList.querySelector('.evt[data-id="' + e.id + '"]');
    if (!row) { pushEvent(e); return; }
    row.dataset.type = e.type;
    row.dataset.status = e.status || 'done';
    row.title = e.text + (e.detail ? ' — ' + e.detail : '');
    row.innerHTML = rowHTML(e);
  }

  function resolveLocal(id) {
    const e = events.get(id);
    if (!e) return;
    e.status = 'done';
    updateEvent(e);
  }

  function clear() {
    events.clear();
    els.evtList.querySelectorAll('.evt').forEach((r) => r.remove());
    refreshEmpty();
  }

  /* ---------------- uso ---------------- */

  function setUsage(u) {
    els.usageText.textContent = u.contextPct + '% · ' + u.contextUsedK + 'k/' + u.contextMaxK + 'k';
    els.usageFill.style.width = u.contextPct + '%';
    els.planText.textContent = u.planPct + '% · reseta em 4h';
    els.planFill.style.width = u.planPct + '%';
    els.gaugeNum.textContent = u.planPct + '%';
    els.gaugeFill.style.strokeDashoffset = String(GAUGE_C * (1 - u.planPct / 100));
    els.gauge.dataset.level = u.planPct > 90 ? 'critical' : u.planPct > 70 ? 'high' : 'normal';
    els.gauge.title = 'Uso do plano: ' + u.planPct + '%';
  }

  /* ---------------- timer ---------------- */

  function setTimer(label) {
    if (!label) {
      els.islTimer.hidden = true;
      els.islTimer.textContent = '';
      return;
    }
    els.islTimer.hidden = false;
    els.islTimer.textContent = label;
  }

  /* ---------------- voz / toast ---------------- */

  function setVoice(show, text) {
    clearTimeout(voiceTimer);
    if (!show) {
      els.voicePill.hidden = true;
      els.voicePill.classList.remove('in');
      return;
    }
    const first = els.voicePill.hidden;
    els.voicePill.hidden = false;
    els.voiceText.textContent = text || '';
    if (first) {
      void els.voicePill.offsetWidth; // reinicia a animação
      els.voicePill.classList.add('in');
    }
  }

  function hideVoiceSoon(ms) {
    clearTimeout(voiceTimer);
    voiceTimer = setTimeout(() => setVoice(false), ms || 900);
  }

  function toast(msg, kind) {
    clearTimeout(toastTimer);
    const first = els.toast.hidden;
    els.toast.hidden = false;
    els.toast.textContent = msg;
    if (kind) els.toast.dataset.kind = kind;
    else delete els.toast.dataset.kind;
    if (first) {
      void els.toast.offsetWidth;
      els.toast.classList.add('in');
    }
    toastTimer = setTimeout(() => {
      els.toast.hidden = true;
      els.toast.classList.remove('in');
    }, 3600);
  }

  function setListening(on) {
    els.micBtn.dataset.listening = String(!!on);
    els.micBtn.setAttribute('aria-pressed', String(!!on));
    if (on) setOrbMode('listening');
    else setOrbMode(workMode);
  }

  /* ---------------- init ---------------- */

  function init() {
    const empty = document.createElement('div');
    empty.className = 'evt-empty';
    empty.textContent = 'A atividade dos seus agentes aparece aqui…';
    els.evtList.appendChild(empty);

    els.collapsed.addEventListener('click', expand);
    els.btnCollapse.addEventListener('click', collapse);

    els.evtList.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-act]');
      if (!btn || !onAction) return;
      onAction(btn.dataset.act, btn.dataset.id);
    });

    els.micBtn.setAttribute('aria-pressed', 'false');
  }

  return {
    init,
    expand,
    collapse,
    getState,
    setStatus,
    setWorkMode,
    setAgent,
    setBrandSub,
    pushEvent,
    updateEvent,
    resolveLocal,
    clear,
    setUsage,
    setTimer,
    setVoice,
    hideVoiceSoon,
    toast,
    setListening,
    els,
    get onAction() { return onAction; },
    set onAction(fn) { onAction = fn; },
  };
})();
