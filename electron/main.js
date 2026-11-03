/**
 * Ilha · casca Electron.
 * Cria uma janela transparente, sem moldura e sempre no topo, centralizada
 * no topo da tela — a "ilha". Os cliques atravessam a parte vazia da janela
 * até que o ponteiro entre na ilha (ou ela seja expandida).
 *
 * Rodar: npm start   (requer `npm i` para instalar o Electron)
 */
const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');

let win = null;
let hovering = false;
let expanded = false;

const ISLAND = { w: 272, h: 54 };
const PAD = 18; // margem ao redor da ilha dentro da janela
const FALLBACK = { w: 442, h: 584 };

function center(window, width) {
  const { workArea } = screen.getPrimaryDisplay();
  window.setPosition(
    Math.round(workArea.x + (workArea.width - width) / 2),
    workArea.y + 4
  );
}

function updateMouse() {
  if (!win) return;
  if (process.platform === 'linux') {
    // No Linux o Electron NÃO suporta o forward de mouse (electron#16777):
    // enquanto a janela ignora eventos, ela nunca recebe o hover que a tornaria
    // interativa de novo — a ilha recolhida ficaria intocável. Mantemos a janela
    // sempre ativa por lá; a área bloqueada é só a ilha + margem (290×72).
    win.setIgnoreMouseEvents(false);
    return;
  }
  const ignore = !(hovering || expanded);
  win.setIgnoreMouseEvents(ignore, { forward: true });
}

function createWindow() {
  const size = { w: ISLAND.w + PAD, h: ISLAND.h + PAD };

  win = new BrowserWindow({
    width: size.w,
    height: size.h,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  if (typeof win.setVisibleOnAllWorkspaces === 'function') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  center(win, size.w);

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  win.loadFile(path.join(__dirname, '..', 'index.html'), {
    query: { overlay: '1' },
  });

  win.once('ready-to-show', () => win.showInactive());
  updateMouse();
}

/* O renderer informa o estado desejado e o tamanho alvo da ilha. */
ipcMain.on('ilha:state', (_e, state, rect) => {
  if (!win) return;
  expanded = state === 'expanded';
  const size = rect && rect.w && rect.h ? rect : { w: ISLAND.w + PAD, h: ISLAND.h + PAD };
  win.setContentSize(Math.round(size.w), Math.round(size.h), true);
  center(win, Math.round(size.w));
  updateMouse();
});

/* O ponteiro entrou/saiu da ilha. */
ipcMain.on('ilha:interactive', (_e, on) => {
  hovering = !!on;
  updateMouse();
});

function createApp() {
  createWindow();

  // Atalho global estilo Nixi/TwoCode: Alt+R fala em qualquer lugar
  try {
    globalShortcut.register('Alt+R', () => {
      if (win && !win.isDestroyed()) win.webContents.send('ilha:hotkey');
    });
  } catch (err) {
    console.warn('atalho Alt+R indisponível:', err.message);
  }

  screen.on('display-metrics-changed', () => {
    if (win && !win.isDestroyed()) {
      center(win, win.getBounds().width);
    }
  });
}

app.whenReady().then(createApp);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
