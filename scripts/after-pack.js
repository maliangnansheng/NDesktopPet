/* 打包后处理：给 exe 打图标 + 版本信息
 *
 * 为什么不用 electron-builder 自带的 signAndEditExecutable？
 * 它要先下载 winCodeSign-2.6.0.7z，包里带了 macOS 的符号链接（darwin/10.12/lib/*.dylib），
 * 普通权限的 Windows 账号没有「创建符号链接」的权限（需要开发者模式 / 管理员），
 * 解压会直接报 Sub items Errors: 2 然后打包失败。
 * 这里改成：打包时不改 exe（signAndEditExecutable:false），打包后用自带的 rcedit 补上，
 * 效果一样，但不需要任何系统权限，也不用联网下载。
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const root = path.join(__dirname, '..');
  const rcedit = path.join(root, 'tools', 'rcedit-x64.exe');
  const icon = path.join(root, 'assets', 'icon.ico');
  const exe = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.exe');

  if (!fs.existsSync(rcedit) || !fs.existsSync(exe)) {
    console.warn('[after-pack] 跳过 exe 图标写入（缺 rcedit 或 exe）');
    return;
  }

  const info = context.packager.appInfo;
  const productName = info.productName || 'NDesktopPet';
  const version = info.version || '1.0.0';

  const args = [
    exe,
    '--set-version-string', 'ProductName', productName,
    '--set-version-string', 'FileDescription', productName + ' · 南生桌宠',
    '--set-version-string', 'CompanyName', info.companyName || '南生',
    '--set-version-string', 'LegalCopyright', 'MIT',
    '--set-version-string', 'OriginalFilename', path.basename(exe),
    '--set-version-string', 'InternalName', productName,
    '--set-file-version', version,
    '--set-product-version', version
  ];
  if (fs.existsSync(icon)) args.splice(1, 0, '--set-icon', icon);

  /* exe 刚写出来时可能被杀毒软件短暂占用，rcedit 会报 Unable to commit changes，重试几次 */
  let lastErr = null;
  for (let i = 0; i < 6; i++) {
    try {
      execFileSync(rcedit, args, { stdio: 'pipe' });
      console.log('[after-pack] 已写入图标与版本信息：' + path.basename(exe));
      return;
    } catch (err) {
      lastErr = err;
      const wait = 400 + i * 300;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
    }
  }
  console.warn('[after-pack] 图标写入失败（不影响程序本身）：' + (lastErr && lastErr.message));
};
