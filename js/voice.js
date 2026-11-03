/**
 * Ilha.Voice — reconhecimento de voz via Web Speech API (pt-BR).
 * Emite: 'listening' | 'interim' | 'final' | 'end' | 'error'.
 * Quando indisponível, o app cai para o campo de texto (ver main.js).
 */
window.Ilha = window.Ilha || {};

Ilha.Voice = (function () {
  'use strict';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const listeners = { listening: [], interim: [], final: [], end: [], error: [] };
  let rec = null;
  let listening = false;

  function on(name, cb) {
    (listeners[name] || (listeners[name] = [])).push(cb);
  }

  function fire(name, payload) {
    (listeners[name] || []).forEach((cb) => {
      try { cb(payload); } catch (e) { console.error('[ilha:voz]', e); }
    });
  }

  function ensure() {
    if (rec) return rec;
    rec = new SR();
    rec.lang = 'pt-BR';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim) fire('interim', interim.trim());
      if (final) fire('final', final.trim());
    };

    rec.onstart = () => {
      listening = true;
      fire('listening', true);
    };

    rec.onend = () => {
      listening = false;
      fire('end');
    };

    rec.onerror = (e) => {
      listening = false;
      fire('error', e.error || 'unknown');
    };

    return rec;
  }

  return {
    supported: !!SR,
    get listening() { return listening; },
    on,
    start() {
      if (!SR) {
        fire('error', 'unsupported');
        return false;
      }
      try {
        if (listening) { rec.stop(); return true; }
        ensure();
        rec.start();
        return true;
      } catch (err) {
        // start() lança se já houver uma sessão ativa
        console.warn('[ilha:voz]', err);
        return listening;
      }
    },
    stop() {
      if (rec && listening) {
        try { rec.stop(); } catch (e) { /* já parado */ }
      }
    },
  };
})();
