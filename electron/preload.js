const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopPet', {
  isDesktop: true,
  setIgnore: (ignore) => ipcRenderer.send('pet:ignore', !!ignore),
  quit: () => ipcRenderer.send('pet:quit'),
  /* 开机启动：读当前状态 / 设置开关，都返回 Promise<boolean> */
  getAutoLaunch: () => ipcRenderer.invoke('pet:auto-launch'),
  setAutoLaunch: (open) => ipcRenderer.invoke('pet:set-auto-launch', !!open),
  /* 全局键鼠事件：{ t:'key', code, down } / { t:'btn', side } / { t:'wheel', dy } */
  onInput: (cb) => {
    if (typeof cb !== 'function') return () => {};
    const handler = (_evt, payload) => cb(payload);
    ipcRenderer.on('pet:input', handler);
    return () => ipcRenderer.removeListener('pet:input', handler);
  }
});
