/**
 * Ilha.Desktop — cena de demonstração: relógio da bandeja, terminal que
 * espelha a atividade dos agentes e a dica inicial.
 */
window.Ilha = window.Ilha || {};

Ilha.Desktop = (function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const els = {
    term: $('term'),
    trayTime: $('trayTime'),
    trayDate: $('trayDate'),
    hint: $('hint'),
    hintClose: $('hintClose'),
  };

  const LINE = {
    session: { g: '◆', cls: 't-head' },
    read: { g: '→', cls: 't-dim' },
    edit: { g: '✎', cls: '' },
    command: { g: '$', cls: 't-cmd' },
    success: { g: '✓', cls: 't-ok' },
    error: { g: '✗', cls: 't-err' },
    approval: { g: '⚠', cls: 't-warn' },
    tool: { g: '⊕', cls: 't-tool' },
    reminder: { g: '◌', cls: 't-warn' },
    voice: { g: '◌', cls: '' },
    info: { g: '↩', cls: 't-dim' },
  };

  function line(text, cls) {
    const div = document.createElement('div');
    div.className = 't-line' + (cls ? ' ' + cls : '');
    div.textContent = text;
    els.term.appendChild(div);
    while (els.term.children.length > 80) els.term.firstChild.remove();
    els.term.scrollTop = els.term.scrollHeight;
  }

  /** Imprime um evento no terminal. `updated` indica que é uma atualização. */
  function print(e, updated) {
    const meta = LINE[e.type] || LINE.info;

    if (e.from === 'command') {
      if (!updated) {
        line('$ ' + e.text.replace(/^\$\s*/, ''), 't-cmd');
      } else {
        const ok = e.type === 'success';
        line(ok ? '  ✓ ' + e.text : '  ✗ ' + e.text, ok ? 't-ok' : 't-err');
      }
      return;
    }

    if (e.type === 'approval') {
      if (!updated) line('  ⚠ aguardando aprovação: ' + e.text, 't-warn');
      else line(e.resolved ? '  ✓ aprovado: ' + e.text : '  ✗ negado: ' + e.text, e.resolved ? 't-ok' : 't-err');
      return;
    }

    if (updated) return; // outros tipos não mudam depois de emitidos

    const suffix = e.detail ? '  (' + e.detail + ')' : '';
    if (e.type === 'session') {
      line(meta.g + ' ' + e.agent + ' · ' + e.text, meta.cls);
      if (e.detail) line('  ' + e.detail, 't-dim');
    } else if (e.type === 'edit') {
      line('  ' + meta.g + ' ' + e.text + suffix, meta.cls);
    } else {
      line('  ' + meta.g + ' ' + e.text + suffix, meta.cls);
    }
  }

  function boot() {
    line('● ilha 0.1 · conectado a claude code (demo)', 't-head');
    line('  monitorando ~/projetos/api-gateway…', 't-dim');
    line('');
  }

  function tickClock() {
    const d = new Date();
    els.trayTime.textContent = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    els.trayDate.textContent = d
      .toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
      .replace('.', '');
  }

  function init() {
    boot();
    tickClock();
    setInterval(tickClock, 1000);
    els.hintClose.addEventListener('click', () => { els.hint.hidden = true; });
  }

  return { init, print };
})();
