/**
 * Teste de fumaça da Ilha — roda a página real no jsdom e valida:
 * renderização, feed de eventos do agente, terminal, comandos de texto,
 * ditado, aprovação e gauge de uso. (A voz exige navegador real.)
 *
 * Pré-requisito: servidor de prévia rodando (npm run preview).
 * Uso: npm test
 */
const { JSDOM, VirtualConsole } = require('jsdom');

const URL_ = process.env.ILHA_URL || 'http://127.0.0.1:3000/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(ms, cond) {
  const t0 = Date.now();
  for (;;) {
    const found = cond();
    if (found) return found;
    if (Date.now() - t0 > ms) return null;
    await sleep(200);
  }
}

async function main() {
  const errors = [];
  const cssWarnings = [];

  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    const msg = (e && (e.stack || e.message)) || String(e);
    if (/Could not parse CSS stylesheet/.test(msg)) cssWarnings.push(msg);
    else errors.push('jsdomError: ' + msg);
  });
  vc.on('error', (...args) => errors.push('console.error: ' + args.join(' ')));

  const dom = await JSDOM.fromURL(URL_, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.addEventListener('error', (e) => {
        errors.push('window.onerror: ' + ((e.error && e.error.stack) || e.message));
      });
    },
  });

  const { window } = dom;
  const doc = window.document;
  const $ = (sel) => doc.querySelector(sel);
  const results = [];

  function check(name, ok, extra) {
    results.push({ name, ok });
    console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra != null ? '  [' + extra + ']' : ''));
  }

  function enter(sel) {
    const el = $(sel);
    el.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }

  try {
    /* ---- boot + motor do agente ---- */
    await sleep(7000);

    check('página carrega sem erros de script', errors.length === 0, errors.slice(0, 3).join(' | '));
    check('ilha é renderizada', !!$('#island'));
    check('desktop de demo renderizado', !!$('#term') && !!$('#note'));

    const rows = doc.querySelectorAll('.evt').length;
    check('feed recebe eventos do agente (≥ 3)', rows >= 3, rows + ' eventos');

    const termLines = doc.querySelectorAll('#term .t-line').length;
    check('terminal espelha a atividade (≥ 5)', termLines >= 5, termLines + ' linhas');

    check('barra de contexto atualiza', /%/.test($('#usageText').textContent), $('#usageText').textContent);
    check('gauge do plano atualiza', /%$/.test($('#gaugeNum').textContent), $('#gaugeNum').textContent);
    check(
      'motor assume o status da ilha',
      $('#collapsedStatus').textContent !== 'pronto para observar',
      $('#collapsedStatus').textContent
    );

    /* ---- expandir ---- */
    $('#islCollapsed').click();
    check('clique expande a ilha', $('#island').dataset.state === 'expanded');
    check('chip mostra o agente ativo', /Claude Code|Codex/.test($('#agentChip').textContent), $('#agentChip').textContent);

    /* ---- comando de texto ---- */
    const input = $('#cmdInput');
    input.value = 'abrir spotify';
    enter('#cmdInput');
    await sleep(400);
    check(
      'comando "abrir spotify" gera toast',
      !$('#toast').hidden && /Abrindo spotify/.test($('#toast').textContent),
      $('#toast').textContent
    );

    /* ---- ditado ---- */
    input.value = 'isso é um ditado de teste';
    enter('#cmdInput');
    await sleep(400);
    check(
      'ditado é inserido na nota',
      /ditado de teste/.test($('#note').textContent),
      ($('#note').textContent.match(/.{0,40}ditado de teste/) || [''])[0]
    );

    /* ---- timer ---- */
    input.value = 'timer 1 min';
    enter('#cmdInput');
    await sleep(400);
    check('timer é criado', !$('#islTimer').hidden && /01:00/.test($('#islTimer').textContent), $('#islTimer').textContent);

    /* ---- recolher ---- */
    input.value = 'recolher a ilha';
    enter('#cmdInput');
    await sleep(400);
    check('comando recolhe a ilha', $('#island').dataset.state === 'collapsed');

    /* ---- aprovação pendente ---- */
    $('#islCollapsed').click();
    const approvalBtn = await waitFor(45000, () => $('.evt[data-type="approval"] .btn-approve'));
    check('aprovação pendente aparece no feed', !!approvalBtn);
    if (approvalBtn) {
      approvalBtn.click();
      await sleep(500);
      const row = $('.evt[data-type="approval"]');
      check('botão Aprovar resolve o evento', !!row && /aprovado por você/.test(row.textContent), row && row.textContent.trim().replace(/\s+/g, ' ').slice(0, 70));
    }

    /* ---- limpar feed ---- */
    input.value = 'limpar tudo';
    enter('#cmdInput');
    await sleep(400);
    check('comando limpa o feed', doc.querySelectorAll('.evt').length === 0);

    /* ---- erros acumulados ---- */
    check('nenhum erro de execução ao longo do teste', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    if (cssWarnings.length) {
      console.log('  · avisos de CSS (jsdom não suporta sintaxe moderna): ' + cssWarnings.length);
    }
    dom.window.close();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' verificações passaram' + (failed ? ' — FALHOU' : ''));
  process.exit(failed ? 1 : 0);
}

const watchdog = setTimeout(() => {
  console.error('timeout do teste');
  process.exit(2);
}, 120000);

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => clearTimeout(watchdog));
