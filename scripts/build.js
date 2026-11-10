#!/usr/bin/env node
/* 打包入口：用「当前这个 node」直接跑 electron-builder 的 CLI
 *
 * 为什么不直接在 npm script 里写 `electron-builder`？
 *   它会被解析成 node_modules/.bin/electron-builder.cmd，那个 .cmd 内部再用
 *   PATH 上的 `node` 去跑 cli.js。有些终端（IDE 内置终端、安全沙箱）会把
 *   PATH 里的 node 换成别的东西，于是 cli.js 被塞给一个无关程序 ——
 *   表现就是「没有任何输出、退出码 0、dist 被清空但什么也没生成」，非常难查。
 *   这里改用 process.execPath（正在跑本脚本的那个 node），绕开 .cmd 包装。
 *
 * 用法：
 *   node scripts/build.js --win --x64
 *   node scripts/build.js --linux
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const root = path.join(__dirname, '..');

let cli;
try {
  const pkgDir = path.dirname(require.resolve('electron-builder/package.json'));
  cli = path.join(pkgDir, 'cli.js');
} catch (err) {
  console.error('\n✖ 没找到 electron-builder，先执行一次 npm install\n');
  process.exit(1);
}
if (!fs.existsSync(cli)) {
  console.error('\n✖ electron-builder 的 cli.js 不见了，试试重新 npm install\n');
  process.exit(1);
}

console.log('\n▶ electron-builder ' + args.join(' ') + '\n');
const started = Date.now();
const res = spawnSync(process.execPath, [cli].concat(args), { stdio: 'inherit', cwd: root });
const code = res.status == null ? 1 : res.status;

if (code !== 0) {
  console.error('\n✖ 打包失败（退出码 ' + code + '）');
  if (code === 1) console.error('  上面最后几行的 ⨯ 就是原因；跨平台打包的常见坑见 README「打包」一节。');
  process.exit(code);
}

/* 列一下这次产出的东西，避免「跑完了但不知道成功没有」 */
const dist = path.join(root, 'dist');
const files = fs.existsSync(dist)
  ? fs.readdirSync(dist)
    .filter(f => !fs.statSync(path.join(dist, f)).isDirectory())
    .filter(f => !/\.(ya?ml|blockmap)$/.test(f))
    .map(f => ({ f, size: fs.statSync(path.join(dist, f)).size }))
    .sort((a, b) => b.size - a.size)
  : [];

const secs = ((Date.now() - started) / 1000).toFixed(1);
if (!files.length) {
  console.error('\n✖ 打包进程退出码 0，但 dist/ 里没有任何产物，检查一下上面的日志\n');
  process.exit(1);
}
console.log('\n✔ 打包完成，用时 ' + secs + 's，产物在 dist/：');
for (const { f, size } of files) {
  const mb = size > 1024 * 1024 ? (size / 1024 / 1024).toFixed(0) + ' MB' : Math.round(size / 1024) + ' KB';
  console.log('   ' + mb.padStart(8, ' ') + '  ' + f);
}
console.log('');
