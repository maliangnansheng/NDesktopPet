/* NDesktopPet · Electron 主进程
 * 透明 / 无边框 / 始终置顶的全屏窗口，只有桌宠和面板会响应鼠标，其余区域点击穿透到桌面。
 */
const { app, BrowserWindow, ipcMain, screen, Menu } = require('electron');
const fs = require('fs');
const path = require('path');

let win = null;

/* 改名后用户数据目录会从 DesktopPet 变成 NDesktopPet，
 * 首次启动时把旧目录整体搬过来，别让人辛苦攒的自定义桌宠白丢。 */
function migrateUserData() {
  try {
    const base = app.getPath('appData');
    const oldDir = path.join(base, 'DesktopPet');
    const newDir = path.join(base, app.getName());
    if (oldDir !== newDir && fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
      fs.renameSync(oldDir, newDir);
      console.log('[ndesktoppet] 已把旧数据目录 DesktopPet 迁移为 ' + path.basename(newDir));
    }
  } catch (err) {
    console.warn('[ndesktoppet] 旧数据目录迁移跳过：', err.message);
  }
}
migrateUserData();

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();

  win = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, '..', 'index.html')).then(() => {
    /* 启动时别把这个透明窗留在前台抢键盘焦点，否则全局监听要等你点一下别处 */
    if (win && !win.isDestroyed()) win.blur();
  });

  win.on('closed', () => { win = null; });
}

// 渲染进程根据鼠标位置动态开关穿透
ipcMain.on('pet:ignore', (_event, ignore) => {
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(!!ignore, { forward: true });
  }
});

ipcMain.on('pet:quit', () => app.quit());

/* ---------------- 开机启动 ----------------
 * Windows / macOS 用系统自带接口：
 *   Windows → 注册表 HKCU\...\Run
 *   macOS   → 系统设置里的「登录项」
 * Linux 上 Electron 没实现 setLoginItemSettings，按 XDG 规范自己往
 *   ~/.config/autostart/*.desktop 写一个桌面项（GNOME / KDE / XFCE 都认）。
 */
const AUTOSTART_FILE = 'ndesktoppet.desktop';

function autostartDesktopPath() {
  const base = process.env.XDG_CONFIG_HOME || path.join(app.getPath('home'), '.config');
  return path.join(base, 'autostart', AUTOSTART_FILE);
}

/* 开机时实际要执行的命令。开发模式（electron .）下 process.execPath 是 electron.exe，
 * 必须把项目目录当参数带上，否则开机会弹出一个空白的 Electron。 */
function launchCommand() {
  if (process.env.APPIMAGE) {
    /* AppImage 的 process.execPath 是临时挂载点，每次启动都变，要用原始文件路径 */
    return { file: process.env.APPIMAGE, args: [] };
  }
  if (app.isPackaged) return { file: process.execPath, args: [] };
  return { file: process.execPath, args: [app.getAppPath()] };
}

function loginItemOptions(openAtLogin) {
  const cmd = launchCommand();
  const opts = { openAtLogin: !!openAtLogin };
  if (process.platform === 'win32') {
    opts.path = cmd.file;
    opts.args = cmd.args;
  }
  return opts;
}

function isAutoLaunchOn() {
  if (process.platform === 'linux') return fs.existsSync(autostartDesktopPath());

  try {
    return !!app.getLoginItemSettings(loginItemOptions(false)).openAtLogin;
  } catch (err) {
    console.warn('[ndesktoppet] 读取开机启动状态失败：', err.message);
    return false;
  }
}

function setAutoLaunch(open) {
  if (process.platform === 'linux') {
    const file = autostartDesktopPath();
    if (!open) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
      return false;
    }
    const cmd = launchCommand();
    const exec = cmd.args.length ? cmd.file + ' ' + cmd.args.map(a => '"' + a + '"').join(' ') : cmd.file;
    const content = [
      '[Desktop Entry]',
      'Type=Application',
      'Version=1.0',
      'Name=NDesktopPet',
      'Name[zh_CN]=南生桌宠',
      'Comment=南生桌宠 · 桌面桌宠',
      'Exec="' + exec + '"',
      'Terminal=false',
      'X-GNOME-Autostart-enabled=true',
      ''
    ].join('\n');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
    return true;
  }

  app.setLoginItemSettings(loginItemOptions(open));
  return isAutoLaunchOn();
}

ipcMain.handle('pet:auto-launch', () => isAutoLaunchOn());
ipcMain.handle('pet:set-auto-launch', (_event, open) => setAutoLaunch(!!open));

/* 便携版被别人拖到别的目录后，注册表里那条还是老路径 —— 启动时顺手纠正。
 * Windows 的 getLoginItemSettings 不给 executablePath，真正的路径在 launchItems[].path 里。 */
function healAutoLaunchPath() {
  if (process.platform !== 'win32' || !isAutoLaunchOn()) return;
  try {
    const cur = launchCommand();
    const reg = app.getLoginItemSettings(loginItemOptions(true));
    const items = reg.launchItems || [];
    const registered = items.length && items[0].path;
    if (registered && path.resolve(registered) !== path.resolve(cur.file)) {
      setAutoLaunch(true);
      console.log('[ndesktoppet] 开机启动路径已更新为 ' + cur.file);
    }
  } catch (err) {
    console.warn('[ndesktoppet] 校正开机启动路径失败：', err.message);
  }
}

/* ---------------- 全局键鼠钩子 ----------------
 * 桌宠是置顶的透明窗，平时没有焦点，用 DOM 监听只能收到「本窗口」的按键。
 * 这里用 libuiohook（uiohook-napi）做系统级监听：不拦截、只旁听，
 * 不管你在 VS Code 还是浏览器里敲，桌宠都能跟着动。
 */
let hooking = false;

function startInputHook() {
  let lib;
  try {
    lib = require('uiohook-napi');
  } catch (err) {
    console.warn('[ndesktoppet] 全局键鼠监听不可用（缺少 uiohook-napi）：', err.message);
    return;
  }

  const { uIOhook, UiohookKey, WheelDirection } = lib;

  /* uiohook 的 keycode → 浏览器 event.code，只映射它面前那套小键盘有的键 */
  const keyMap = {};
  for (let d = 0; d <= 9; d++) keyMap[UiohookKey[d]] = 'Digit' + d;
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') keyMap[UiohookKey[ch]] = 'Key' + ch;
  keyMap[UiohookKey.Space] = 'Space';
  keyMap[UiohookKey.Comma] = 'Comma';
  keyMap[UiohookKey.Period] = 'Period';
  keyMap[UiohookKey.Slash] = 'Slash';

  const down = new Set();
  const send = payload => {
    if (win && !win.isDestroyed()) win.webContents.send('pet:input', payload);
  };

  uIOhook.on('keydown', e => {
    const code = keyMap[e.keycode];
    if (!code || down.has(code)) return;   /* 忽略长按自动重复 */
    down.add(code);
    send({ t: 'key', code, down: true });
  });

  uIOhook.on('keyup', e => {
    const code = keyMap[e.keycode];
    if (!code) return;
    down.delete(code);
    send({ t: 'key', code, down: false });
  });

  uIOhook.on('mousedown', e => {
    const btn = Number(e.button);
    if (btn === 1) send({ t: 'btn', side: 'l' });        /* 左键 */
    else if (btn === 2) send({ t: 'btn', side: 'r' });   /* 右键 */
  });

  uIOhook.on('wheel', e => {
    if (e.direction !== WheelDirection.VERTICAL) return;
    if (!e.rotation) return;
    /* 滚一格交一个 ±100 的 deltaY：正数=向下 */
    send({ t: 'wheel', dy: e.rotation > 0 ? 100 : -100 });
  });

  try {
    uIOhook.start();
    hooking = true;
    console.log('[ndesktoppet] 全局键鼠监听已启动');
  } catch (err) {
    console.warn('[ndesktoppet] 全局键鼠监听启动失败（macOS 需要在「辅助功能」里授权）：', err.message);
  }
}

function stopInputHook() {
  if (!hooking) return;
  try {
    require('uiohook-napi').uIOhook.stop();
  } catch (e) { /* noop */ }
  hooking = false;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { win.show(); win.focus(); }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    healAutoLaunchPath();
    createWindow();
    startInputHook();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', stopInputHook);
}
