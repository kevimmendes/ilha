# Ilha 🏝️

**Baixar:** [Linux (AppImage + .deb)](https://github.com/kevimmendes/ilha/releases/tag/v0.1.0-linux) · [Windows (portátil .exe + .zip)](https://github.com/kevimmendes/ilha/releases/tag/v0.1.0-win) — binários não assinados, ver notas de cada release.

**Uma ilhota para suas IAs** — um utilitário de desktop no estilo *Dynamic Island*,
inspirado no [TwoCode](https://twocode.nl/) (monitor do Claude Code/Codex) e no
[Nixi](https://heynixi.app/) (assistente de voz no topo da tela).

A Ilha fica flutuando no topo da tela e faz as duas coisas:

1. **Monitora seus agentes de IA** — quais arquivos o Claude Code/Codex lê e edita,
   quais comandos roda, aprovações com um clique (`git push`, etc.), erros de build,
   barra de contexto e limite do plano.
2. **Escuta você** — ditado por voz (pt-BR) que digita no campo em foco e comandos:
   abrir apps, timers, lembretes, expandir/recolher a ilha.

## Rodando

### Prévia web (recomendada)

```bash
npm run preview     # http://localhost:3000
```

Sem dependências de build — é HTML/CSS/JS puro.

- **Clique na ilha** para expandir a atividade dos agentes.
- **Alt+R** liga o ditado (funciona em Chrome/Edge; pede permissão de microfone).
- No campo de texto você também pode digitar comandos:
  `abrir spotify`, `timer 5 min`, `lembrar de revisar o PR`, `recolher a ilha`, `limpar`.

### Teste

```bash
npm test            # requer npm run preview em outra aba
```

Roda a página real em jsdom e valida feed, terminal, comandos, ditado, aprovação e uso.

### App desktop (Electron)

```bash
npm install         # baixa o Electron (devDependency)
npm start           # janela transparente, sem moldura, sempre no topo
```

O modo overlay (`index.html?overlay=1`) esconde o desktop de demonstração e deixa
só a ilha flutuando sobre as suas janelas, com clique-through na parte vazia e
atalho global **Alt+R**.

## Versões compiladas (Linux e Windows)

```bash
npm run dist:linux   # AppImage + .deb   → dist/
npm run dist:win     # .exe portátil + .zip → dist/
npm run dist         # as duas plataformas
```

| Plataforma | Arquivo | Como usar |
|---|---|---|
| **Linux** | `Ilha-<versão>-linux-x86_64.AppImage` | `chmod +x` e dar duplo clique — roda em qualquer distro |
| **Linux** | `Ilha-<versão>-linux-amd64.deb` | `sudo apt install ./Ilha-...deb` (Debian/Ubuntu) |
| **Windows** | `Ilha-<versão>-win-x64.exe` | portátil: duplo clique, sem instalar |
| **Windows** | `Ilha-<versão>-win-x64.zip` | extrair e rodar `Ilha.exe` |

Instalador NSIS do Windows (atalho no menu Iniciar, desinstalador):
`npm run dist:win-installer`. Ele **precisa rodar numa máquina Windows** (ou com
Wine instalado), porque o electron-builder executa o instalador gerado para
produzir o desinstalador.

Diferença de comportamento entre as plataformas, no modo overlay:

- **Windows/macOS**: a parte vazia da janela deixa os cliques passarem
  (`setIgnoreMouseEvents(..., {forward:true})`) e a ilha “acorda” ao hover.
- **Linux**: o Electron ainda não suporta esse *forward* de mouse
  ([electron#16777](https://github.com/electron/electron/issues/16777)), então a
  janela fica sempre interativa — a área bloqueada é só a ilha + margem (~290×72 px).

Os executáveis **não são assinados**: no Windows o SmartScreen mostra “aplicativo
não reconhecido” (Mais informações → Executar assim mesmo); no Linux não há aviso.

## Estrutura

```
index.html        esqueleto: desktop de demo, terminal, nota e a ilha
styles.css        visual glass + morphing da Dynamic Island
js/agents.js      motor de atividade (sessão, leituras, edições, comandos, aprovações)
js/voice.js       reconhecimento de voz (Web Speech API, pt-BR)
js/island.js      componente da ilha (estados, feed, gauge, toasts)
js/desktop.js     relógio + terminal que espelha os eventos
js/main.js        comandos de voz/texto, timers, lembretes, ditado, atalhos
electron/         casca desktop (janela transparente + ponte IPC)
test/smoke.js     teste headless em jsdom
```

## Limitações conhecidas (v0.1)

- **A atividade dos agentes é uma simulação realista** — o roteiro em `js/agents.js`
  reproduz o fluxo de uma sessão real. Integrar de verdade é o próximo passo
  (hooks do Claude Code escrevendo um JSONL que o motor lê).
- **Voz**: usa a Web Speech API do navegador (Chrome/Edge, pt-BR). No Electron o
  reconhecimento de voz do Chromium exige chaves de API do Google — por isso, no
  modo desktop, o campo de texto é o caminho garantido.
- O shell Electron segue o padrão de overlay click-through, mas **não pôde ser
  executado neste ambiente de CI** (sem bibliotecas gráficas) — valide com
  `npm start` na sua máquina.
- Sem persistência: lembretes e timers vivem enquanto a página está aberta.
