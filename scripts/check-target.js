#!/usr/bin/env node
/* 打包前的平台自检
 *
 * 用途：把 electron-builder 那些英文报错提前翻译成人话。
 *
 *   macOS 只能**在 macOS 上打包**（dmg / zip 都要用系统的 codesign、hdiutil），
 *   electron-builder 会直接抛 "Build for macOS is supported only on macOS"。
 *   Windows / Linux 上想得到 mac 安装包，只能靠 GitHub Actions 的 macOS runner。
 *
 * 用法：node scripts/check-target.js <win|mac|linux>
 */
const target = (process.argv[2] || '').toLowerCase();
const host = process.platform;   // win32 | darwin | linux
const MIRROR = 'https://npmmirror.com/mirrors/electron/';

const HOST_NAME = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[host] || host;

function info(lines) {
  console.log(lines.filter(l => l !== undefined).map(l => (l ? '  ' + l : '')).join('\n'));
}

if (target === 'mac' && host !== 'darwin') {
  console.error(
    '\n✖ 不能在 ' + HOST_NAME + ' 上打包 macOS 版本。\n\n' +
    '  dmg / zip 要用 macOS 自带的 codesign、hdiutil 才能生成，\n' +
    '  electron-builder 会直接拒绝：Build for macOS is supported only on macOS.\n\n' +
    '  想在 ' + HOST_NAME + ' 上拿到 mac 安装包，有两个办法：\n' +
    '    1. 用仓库自带的 GitHub Actions：把代码推到 GitHub → Actions →\n' +
    '       「Build desktop app」 → Run workflow，跑完在 Artifacts 里下载 .dmg\n' +
    '    2. 找一台 Mac（或租一台云 Mac），npm install 后 npm run build:mac\n'
  );
  process.exit(1);
}

if (target === 'linux' && host === 'win32') {
  info([
    '提示：在 Windows 上交叉打 Linux 包，需要先下载 Linux 版 electron（约 106MB），首次会慢一点。',
    '      下载卡住的话先执行：set ELECTRON_MIRROR=' + MIRROR,
    '      （PowerShell 里用 $env:ELECTRON_MIRROR="' + MIRROR + '"）',
    '',
    '另外 AppImage 要往镜像里建符号链接，Windows 账号默认没这个权限，',
    '所以这里只产 tar.gz（解压后 chmod +x ndesktoppet 就能跑）。',
    '要 AppImage / .deb，请在 Linux、macOS 上用同一份代码打包，',
    '或者推到 GitHub 跑 Actions。',
    ''
  ]);
}

if (target === 'win' && host === 'linux') {
  info([
    '提示：在 Linux 上打 Windows 包，NSIS 需要 wine（sudo apt install wine64），',
    '      否则会卡在生成安装包这一步。',
    ''
  ]);
}

/* 其它组合都放行 */
process.exit(0);
