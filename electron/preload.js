/**
 * Ponte segura entre a janela do Electron e o renderer da Ilha.
 * Expõe apenas o necessário: redimensionar a janela, alternar a
 * captura de mouse e receber o atalho global de voz.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ilhaShell', {
  setState(state, rect) {
    ipcRenderer.send('ilha:state', state, rect);
  },
  setInteractive(on) {
    ipcRenderer.send('ilha:interactive', !!on);
  },
});

ipcRenderer.on('ilha:hotkey', () => {
  window.dispatchEvent(new Event('ilha-hotkey'));
});
