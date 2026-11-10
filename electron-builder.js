/* electron-builder 配置
 *
 * 为什么不写在 package.json 的 "build" 字段里？
 *   三平台共用一份 electron 下载缓存。`npm install` 只会在 node_modules/electron/dist
 *   里放**当前系统**那一份（Windows 上是 electron.exe）。以前把 electronDist 写死成
 *   这个目录，打 Windows 包没问题，但打 Linux / macOS 包时它会把 Windows 版的
 *   electron 拷进 linux-unpacked，再去找名叫 `electron` 的可执行文件 —— 找不到，
 *   于是报 `ENOENT: no such file or directory, rename ...\electron -> ...\ndesktop-pet`。
 *
 *   这里改成函数：目标平台和本地这份一致才复用本地目录，否则返回 undefined，
 *   让 electron-builder 按目标平台自己下载对应的 electron。
 *   （国内下载慢 / 失败时设环境变量 ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/）
 */
const fs = require('fs');
const path = require('path');

const LOCAL_ELECTRON = path.join(__dirname, 'node_modules', 'electron', 'dist');
const ON_WINDOWS = process.platform === 'win32';

/* AppImage 打包时要在镜像里建一条符号链接指向图标，而 Windows 账号默认没有
 * 「创建符号链接」的权限（和 winCodeSign 解压失败是同一个坑），会直接报
 * "A required privilege is not held by the client"。所以 Windows 上只产 tar.gz，
 * AppImage / deb 交给 Linux、macOS 或仓库里的 GitHub Actions 出。 */
const LINUX_TARGETS = ON_WINDOWS
  ? [{ target: 'tar.gz', arch: ['x64'] }]
  : [{ target: 'AppImage' }, { target: 'tar.gz' }];

/** 本地这份 electron 属于哪个平台 */
function localElectronPlatform() {
  if (!fs.existsSync(LOCAL_ELECTRON)) return null;
  if (fs.existsSync(path.join(LOCAL_ELECTRON, 'electron.exe'))) return 'win32';
  if (fs.existsSync(path.join(LOCAL_ELECTRON, 'Electron.app'))) return 'darwin';
  if (fs.existsSync(path.join(LOCAL_ELECTRON, 'electron'))) return 'linux';
  return null;
}

/* electron-builder 的 Arch 枚举：ia32=0 x64=1 armv7l=2 arm64=3 universal=4 */
const ARCH = { ia32: 0, x64: 1, armv7l: 2, arm64: 3, universal: 4 };
const LOCAL_ARCH = ARCH[process.arch];

module.exports = {
  appId: 'top.nansin.ndesktoppet',
  productName: 'NDesktopPet',
  copyright: 'MIT © 2026 南生',

  directories: {
    output: 'dist'
  },

  /* uiohook-napi 自带各平台预编译二进制，不需要 node-gyp 重编 */
  npmRebuild: false,

  electronDist(prepareOptions) {
    const local = localElectronPlatform();
    const platformName = prepareOptions && prepareOptions.platformName;
    const arch = prepareOptions && prepareOptions.arch;
    /* 平台、架构都对得上才复用本地那份，否则让它去下目标平台/架构的 electron */
    const reusable = local && platformName === local &&
      (typeof arch !== 'number' || LOCAL_ARCH === undefined || arch === LOCAL_ARCH);
    return reusable ? LOCAL_ELECTRON : undefined;
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
