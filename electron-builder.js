/* electron-builder 配置
 *
 * 关于 electronDist（复用本机 electron）：
 *   npm install 只会在 node_modules/electron/dist 里放**当前系统+当前架构**那一份。
 *   国内直连 github.com 下 electron 基本会 EOF，所以本地打包最好复用它；
 *   但复用得判断「目标平台 + 目标架构」是否和本机一致，否则就会出现
 *   macOS arm64 机器上打 --x64、结果把 arm64 的 electron 拷进去的事故
 *   （产物名字叫 mac-x64、内容却是 arm64，Intel 机器打不开）。
 *
 *   判断依据不能问 prepareOptions：electron-builder 的 electronDist 回调只传
 *   prepareOptions（packager / appOutDir / platformName），**没有 arch**
 *   （arch 在同级的 options 参数上，回调拿不到 —— 早期版本这里踩过坑）。
 *   改成自己从 process.argv 里读 CLI 参数（本配置就跑在 electron-builder 进程里，
 *   scripts/build.js 又把 `--mac --x64` 原样转发过去，所以一定读得到）。
 *
 *   命中缓存时 electron-builder 不会真的重下：它用 %LOCALAPPDATA%\electron\Cache
 *   （macOS/Linux 是 ~/.cache/electron）。国内网络慢就设
 *   ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
 *
 * 配置为什么不写在 package.json 的 "build" 字段里？
 *   LINUX_TARGETS 要按宿主平台动态决定（见下），JSON 写不了条件逻辑。
 */
const fs = require('fs');
const path = require('path');

const LOCAL_ELECTRON = path.join(__dirname, 'node_modules', 'electron', 'dist');

/* 本机那份 electron 属于哪个平台 */
function localElectronPlatform() {
  if (!fs.existsSync(LOCAL_ELECTRON)) return null;
  if (fs.existsSync(path.join(LOCAL_ELECTRON, 'electron.exe'))) return 'win32';
  if (fs.existsSync(path.join(LOCAL_ELECTRON, 'Electron.app'))) return 'darwin';
  if (fs.existsSync(path.join(LOCAL_ELECTRON, 'electron'))) return 'linux';
  return null;
}

/* CLI 参数 → 本次要打的平台 / 架构（可能没写，表示「按本机」） */
const PLATFORM_FLAGS = {
  '--win': 'win32', '-w': 'win32',
  '--mac': 'darwin', '-m': 'darwin',
  '--linux': 'linux', '-l': 'linux'
};
const ARCH_FLAGS = {
  '--x64': 'x64', '--arm64': 'arm64', '--ia32': 'ia32',
  '--armv7l': 'armv7l', '--universal': 'universal'
};

function flagsIn(table, argv) {
  const list = [];
  for (const arg of argv) {
    const hit = table[arg.split('=')[0]];
    if (hit) list.push(hit);
  }
  return list;
}

const targetPlatforms = (argv) => flagsIn(PLATFORM_FLAGS, argv);
const targetArchs = (argv) => flagsIn(ARCH_FLAGS, argv);

/* AppImage 打包时要在镜像里建一条符号链接指向图标，而 Windows 账号默认没有
 * 「创建符号链接」的权限（和 winCodeSign 解压失败是同一个坑），会直接报
 * "A required privilege is not held by the client"。所以 Windows 上只产 tar.gz，
 * AppImage / deb 交给 Linux、macOS 或仓库里的 GitHub Actions 出。 */
const LINUX_TARGETS = process.platform === 'win32'
  ? [{ target: 'tar.gz', arch: ['x64'] }]
  : [{ target: 'AppImage' }, { target: 'tar.gz' }];

module.exports = {
  appId: 'top.nansin.ndesktoppet',
  productName: 'NDesktopPet',
  copyright: 'MIT © 2026 南生',

  directories: {
    output: 'dist'
  },

  /* uiohook-napi 自带各平台预编译二进制，不需要 node-gyp 重编 */
  npmRebuild: false,

  /* 目标平台（prepareOptions.platformName，可靠）+ 目标架构（从 CLI 参数读）
   * 都和本机这份 electron 对得上，才复用它；否则交给 electron-builder
   * 按目标平台/架构自己下载，别把本机那份拷进别的架构的包里。 */
  electronDist(prepareOptions) {
    const platformName = prepareOptions && prepareOptions.platformName;
    const local = localElectronPlatform();
    if (!local || platformName !== local) return undefined;

    const argv = process.argv;
    const platforms = targetPlatforms(argv);           /* 空 = 没指定，按本机 */
    const archs = targetArchs(argv);
    const samePlatform = platforms.length === 0 || platforms.every((p) => p === local);
    const sameArch = archs.length === 0 || archs.every((a) => a === process.arch);
    return samePlatform && sameArch ? LOCAL_ELECTRON : undefined;
  },

  /* 国内拉 electron 大文件经常超时，给个镜像口子（不改默认行为） */
  ...(process.env.ELECTRON_MIRROR
    ? { electronDownload: { mirror: process.env.ELECTRON_MIRROR } }
    : {}),

  files: [
    'index.html',
    'assets/**/*',
    'electron/**/*',
    'package.json',
    'node_modules/uiohook-napi/**/*'
  ],
  /* .node 原生模块必须解包，asar 里加载不了 */
  asarUnpack: [
    'node_modules/uiohook-napi/**/*'
  ],

  afterPack: 'scripts/after-pack.js',

  win: {
    icon: 'assets/icon.ico',
    /* 自带签名/改图标要下载 winCodeSign，包里有 macOS 符号链接，普通账号解不开；
     * 改成打包后用 tools/rcedit-x64.exe 补图标与版本号，见 scripts/after-pack.js */
    signAndEditExecutable: false,
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] }
    ]
  },

  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    shortcutName: 'NDesktopPet',
    installerIcon: 'assets/icon.ico',
    uninstallerIcon: 'assets/icon.ico',
    installerHeaderIcon: 'assets/icon.ico',
    artifactName: '${productName}-${version}-win-${arch}-setup.${ext}'
  },

  portable: {
    artifactName: '${productName}-${version}-win-${arch}-portable.${ext}'
  },

  mac: {
    icon: 'assets/icon.icns',           /* 由 icon.png 生成，16 → 1024 全尺寸 */
    category: 'public.app-category.entertainment',
    darkModeSupport: true,
    artifactName: '${productName}-${version}-mac-${arch}.${ext}',
    /* 没有 Apple 开发者证书时不要尝试公证，否则 CI 里会卡很久 */
    notarize: false,
    /* 不写死 arch：默认打「当前这台机器」的架构。
     * Intel Mac 出 x64、Apple Silicon 出 arm64；要通用包就跑
     * `npm run build:mac -- --universal`（会额外下载另一份 electron）。 */
    target: ['dmg', 'zip']
  },

  dmg: {
    title: 'NDesktopPet ${version}',
    contents: [
      { x: 140, y: 200, type: 'file' },
      { x: 400, y: 200, type: 'link', path: '/Applications' }
    ]
  },

  linux: {
    icon: 'assets/icon.png',            /* 512×512 */
    executableName: 'ndesktoppet',
    category: 'Utility',
    artifactName: '${productName}-${version}-linux-${arch}.${ext}',
    synopsis: '透明置顶的桌面桌宠，键鼠动作实时同步',
    description: 'NDesktopPet（南生桌宠）— 无需登录、无需联网的桌面桌宠，9 只透明立绘全部免费，支持导入自定义桌宠与自定义分类。',
    target: LINUX_TARGETS
  }
};
