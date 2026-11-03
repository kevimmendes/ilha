/**
 * Ilha — bootstrap e cérebro do app.
 * Liga o motor de agentes à ilha, interpreta comandos de voz/texto,
 * gerencia timers, lembretes, ditado e atalhos de teclado.
 */
(function () {
  'use strict';

  const A = Ilha.Agents;
  const V = Ilha.Voice;
  const I = Ilha.Island;
  const D = Ilha.Desktop;

  const params = new URLSearchParams(location.search);
  const OVERLAY = params.has('overlay');
  if (OVERLAY) document.body.classList.add('overlay');

  let lastInteract = Date.now();
  let autoExpanded = false;
  let uid = 0;
  let timerId = null;

  /* -------------------------------------------------------
     Som de notificação (WebAudio, sem arquivos)
     ------------------------------------------------------- */
  let audioCtx = null;
  function beep(freq, dur) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t0 = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.14, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 0.12));
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + (dur || 0.12) + 0.03);
    } catch (e) { /* silencioso */ }
  }

  /* -------------------------------------------------------
     Eventos do motor -> ilha + terminal
     ------------------------------------------------------- */

  A.on('event', (e) => {
    I.pushEvent(e);
    D.print(e, false);
    I.setAgent(e.agent);
    onEngineEvent(e);
  });

  A.on('update', (e) => {
    I.updateEvent(e);
    D.print(e, true);
    onEngineUpdate(e);
  });

  A.on('usage', (u) => I.setUsage(u));

  function onEngineEvent(e) {
    switch (e.type) {
      case 'approval':
        I.setStatus('aguardando sua aprovação…', 'working');
        if (I.getState() === 'collapsed') {
          I.expand();
          autoExpanded = true; // definido DEPOIS de expandir (o expand dispara 'state')
        }
        I.toast('⏳ Aprovação necessária: ' + e.text, 'warn');
        beep(740, 0.14);
        setTimeout(() => beep(940, 0.12), 170);
        break;

      case 'error':
        I.setStatus('✗ ' + e.text, 'idle');
        I.setWorkMode('error');
        I.toast('❌ ' + e.text, 'err');
        beep(420, 0.22);
        setTimeout(() => I.setWorkMode('working'), 4200);
        break;

      case 'session':
        I.setStatus('sessão ativa · ' + e.agent, 'working');
        break;

      case 'command':
        I.setStatus(e.text.replace(/^\$\s*/, 'executando '), 'working');
        break;

      case 'approval-pending':
        break;

      default:
        I.setStatus(e.text, 'working');
    }
  }

  function onEngineUpdate(e) {
    if (e.from === 'command') {
      if (e.type === 'error') {
        I.setStatus('✗ ' + e.text, 'idle');
        I.setWorkMode('error');
        I.toast('❌ ' + e.text, 'err');
        beep(420, 0.22);
        setTimeout(() => I.setWorkMode('working'), 4200);
      } else {
        I.setStatus('✓ ' + e.text, 'working');
        beep(1040, 0.06);
      }
      return;
    }

    if (e.type === 'approval') {
      if (e.resolved) {
        I.setStatus('✓ aprovação concedida', 'working');
        I.toast('Aprovado ✓ ' + e.text, 'ok');
        beep(880, 0.1);
      } else {
        I.setStatus('✗ aprovação recusada', 'working');
        I.toast('Negado — ' + e.text, 'warn');
        beep(520, 0.14);
      }
      // recolhe sozinha se o usuário não estiver interagindo
      setTimeout(() => {
        if (autoExpanded && I.getState() === 'expanded' && Date.now() - lastInteract > 9000) {
          I.collapse();
          autoExpanded = false;
        }
      }, 9500);
    }
  }

  /* -------------------------------------------------------
     Eventos do usuário (voz/teclado) -> feed + terminal
     ------------------------------------------------------- */

  function userEvent(type, text, detail) {
    const e = {
      id: 'u' + (++uid),
      type,
      agent: 'Você',
      text,
      detail: detail || null,
      ts: Date.now(),
      status: 'done',
    };
    I.pushEvent(e);
    D.print(e, false);
    return e;
  }

  function markInteract() {
    lastInteract = Date.now();
  }

  /* -------------------------------------------------------
     Timer
     ------------------------------------------------------- */

  function fmtDur(s) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
  }

  function startTimer(secs, label) {
    if (timerId) clearInterval(timerId);
    let left = secs;
    const tick = () => {
      I.setTimer(fmtDur(left) + (label ? ' · ' + label : ''));
      if (left <= 0) {
        clearInterval(timerId);
        timerId = null;
        I.setTimer(null);
        I.toast('⏰ Timer finalizado' + (label ? ': ' + label : ''), 'ok');
        beep(880, 0.14);
        setTimeout(() => beep(1180, 0.18), 170);
        userEvent('reminder', '⏰ Timer finalizado' + (label ? ': ' + label : ''), 'tempo esgotado');
        return;
      }
      left -= 1;
    };
    tick();
    timerId = setInterval(tick, 1000);
  }

  /* -------------------------------------------------------
     Ditado
     ------------------------------------------------------- */

  function isEditable(el) {
    return !!el && (
      el.isContentEditable ||
      el.getAttribute('contenteditable') !== null ||
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA'
    );
  }

  function typeInto(text) {
    const note = document.getElementById('note');
    const ae = document.activeElement;
    const target = isEditable(ae) ? ae : note;

    const payload = text + ' ';
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      const start = target.selectionStart != null ? target.selectionStart : target.value.length;
      const end = target.selectionEnd != null ? target.selectionEnd : target.value.length;
      target.setRangeText(payload, start, end, 'end');
    } else {
      target.focus();
      let ok = false;
      try { ok = document.execCommand('insertText', false, payload); } catch (e) { ok = false; }
      if (!ok) target.appendChild(document.createTextNode(payload));
    }

    const short = text.length > 64 ? text.slice(0, 64) + '…' : text;
    userEvent('voice', 'Ditado: ' + short, 'inserido no texto em foco');
  }

  /* -------------------------------------------------------
     Intérprete de comandos (voz ou teclado)
     ------------------------------------------------------- */

  function runCommand(raw) {
    const text = String(raw || '').trim();
    if (!text) return;
    const t = text.toLowerCase();

    // --- comandos sobre a própria ilha ---
    if (/\bilha\b/.test(t) && /(recolh|fech|escond)/.test(t)) {
      userEvent('voice', text, 'comando de voz');
      I.collapse();
      I.toast('Ilha recolhida', 'ok');
      return;
    }
    if (/\bilha\b/.test(t) && /(abr|expand|mostre|mostr)/.test(t)) {
      userEvent('voice', text, 'comando de voz');
      I.expand();
      I.toast('Ilha expandida', 'ok');
      return;
    }

    // --- limpar feed ---
    if (/^(limp|esvaz)/.test(t)) {
      userEvent('voice', text, 'comando de voz');
      I.clear();
      I.toast('Atividade limpa ✓', 'ok');
      return;
    }

    // --- timer ---
    const tm = t.match(/(\d+)\s*(min|seg)/);
    if (tm && /(timer|cron[oô]metro|contagem|alarme)/.test(t)) {
      userEvent('voice', text, 'comando de voz');
      const n = parseInt(tm[1], 10);
      const secs = /^min/.test(tm[2]) ? n * 60 : n;
      const label = text
        .replace(new RegExp(tm[0], 'i'), '')
        .replace(/(timer|cron[oô]metro|contagem|alarme|para|de|do|da|um|uma)/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      startTimer(secs, label);
      I.toast('⏱ Timer de ' + fmtDur(secs) + (label ? ' · ' + label : ''), 'ok');
      return;
    }

    // --- lembrete ---
    const rm = t.match(/^(lembre|lembrar|lembra)(-me)?\s+(de\s+|do\s+|da\s+)?(.+)/);
    if (rm) {
      const what = rm[4].trim();
      userEvent('voice', text, 'comando de voz');
      userEvent('reminder', 'Lembrete: ' + what, 'anotado por você');
      I.toast('Lembrete anotado ⏰', 'ok');
      beep(980, 0.1);
      return;
    }

    // --- abrir app/site (demonstração) ---
    const am = t.match(/^(abra|abrir|abre|iniciar|inicia|executar|executa)\s+(o\s+|a\s+|os\s+|as\s+)?(.+)/);
    if (am && !/\bilha\b/.test(t)) {
      const target = am[3].replace(/\s+(aqui|agora|para mim)$/, '').trim();
      userEvent('voice', text, 'comando de voz');
      I.toast('Abrindo ' + target + '… (demonstração)', 'ok');
      userEvent('voice', 'Abrir ' + target, 'ação de voz · demo');
      return;
    }

    // --- pequenas respostas ---
    if (/^(que horas|hora atual)/.test(t)) {
      I.toast('São ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), 'ok');
      return;
    }
    if (/^ping\b/.test(t)) {
      I.toast('pong 🏓', 'ok');
      return;
    }
    if (/^(obrigad|brigad|valeu)/.test(t)) {
      I.toast('De nada! 👋', 'ok');
      return;
    }
    if (V.listening && /^(pare|parar|sil[eê]ncio|chega|cancelar)/.test(t)) {
      V.stop();
      return;
    }

    // --- ditado padrão ---
    typeInto(text);
  }

  /* -------------------------------------------------------
     Voz
     ------------------------------------------------------- */

  function toggleVoice() {
    markInteract();
    if (!V.supported) {
      I.expand();
      I.toast('Voz indisponível neste navegador — use o campo de texto', 'warn');
      return;
    }
    if (V.listening) {
      V.stop();
    } else {
      I.expand();
      V.start();
    }
  }

  V.on('listening', (on) => {
    I.setListening(on);
    if (on) {
      I.setVoice(true, '');
      I.setBrandSub('ouvindo…');
      I.setStatus('ouvindo você…', 'working');
    }
  });

  V.on('interim', (t) => I.setVoice(true, t));

  V.on('final', (t) => {
    I.setVoice(true, t);
    I.hideVoiceSoon(1500);
    runCommand(t);
  });

  V.on('end', () => {
    I.setListening(false);
    I.setBrandSub('uma ilhota para suas IAs');
    I.hideVoiceSoon(700);
  });

  V.on('error', (code) => {
    I.setListening(false);
    I.setBrandSub('uma ilhota para suas IAs');
    I.setVoice(false);
    const msgs = {
      'not-allowed': 'Microfone bloqueado — permita o acesso ao microfone',
      'service-not-allowed': 'Serviço de voz indisponível',
      'no-speech': 'Não ouvi nada… tente de novo',
      'audio-capture': 'Nenhum microfone encontrado',
      network: 'Erro de rede no reconhecimento de voz',
      aborted: 'Ouvindo cancelado',
      unsupported: 'Voz indisponível neste navegador — use o campo de texto',
    };
    I.toast(msgs[code] || ('Erro ao ouvir: ' + code), code === 'no-speech' || code === 'aborted' ? 'warn' : 'err');
  });

  /* -------------------------------------------------------
     Ações dos botões da ilha
     ------------------------------------------------------- */

  I.onAction = function (action, id) {
    markInteract();
    if (action === 'approve') A.resolve(id, true);
    else if (action === 'deny') A.resolve(id, false);
    else if (action === 'done') {
      I.resolveLocal(id);
      I.toast('Lembrete concluído ✓', 'ok');
      beep(980, 0.1);
    } else if (action === 'state') {
      autoExpanded = false;
      notifyShell();
    }
  };

  /* -------------------------------------------------------
     Ponte com o Electron (modo overlay)
     ------------------------------------------------------- */

  function notifyShell() {
    if (!window.ilhaShell || typeof window.ilhaShell.setState !== 'function') return;
    const expanded = I.getState() === 'expanded';
    const w = expanded ? Math.min(424, window.innerWidth - 28) : 272;
    const h = expanded ? Math.min(566, window.innerHeight - 96) : 54;
    window.ilhaShell.setState(I.getState(), {
      w: Math.ceil(w) + 18,
      h: Math.ceil(h) + 18,
    });
  }

  const islandEl = document.getElementById('island');
  islandEl.addEventListener('mouseenter', () => {
    if (window.ilhaShell && window.ilhaShell.setInteractive) window.ilhaShell.setInteractive(true);
  });
  islandEl.addEventListener('mouseleave', () => {
    if (window.ilhaShell && window.ilhaShell.setInteractive) {
      window.ilhaShell.setInteractive(I.getState() === 'expanded');
    }
  });

  window.addEventListener('ilha-hotkey', toggleVoice);

  /* -------------------------------------------------------
     Atalhos e interação
     ------------------------------------------------------- */

  document.addEventListener('pointerdown', markInteract, true);
  document.addEventListener('keydown', (e) => {
    markInteract();
    if (e.altKey && (e.key === 'r' || e.key === 'R')) {
      e.preventDefault();
      toggleVoice();
      return;
    }
    if (e.key === 'Escape') {
      if (V.listening) V.stop();
      else I.collapse();
    }
  }, true);

  const cmdInput = document.getElementById('cmdInput');
  cmdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const v = cmdInput.value;
      cmdInput.value = '';
      runCommand(v);
    }
    e.stopPropagation();
  });

  document.getElementById('micBtn').addEventListener('click', toggleVoice);

  // recolhe sozinha depois de uma expansão automática, se ninguém tocar
  setInterval(() => {
    if (
      autoExpanded &&
      I.getState() === 'expanded' &&
      Date.now() - lastInteract > 14000
    ) {
      I.collapse();
      autoExpanded = false;
    }
  }, 2500);

  /* -------------------------------------------------------
     Boot
     ------------------------------------------------------- */

  I.init();
  D.init();
  I.setAgent('Claude Code');
  I.setStatus('pronto para observar', 'idle');
  notifyShell();

  setTimeout(() => A.start(), 1400);
})();
