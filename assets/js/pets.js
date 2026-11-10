/* NDesktopPet — 桌宠引擎 v3
 * 默认桌宠全部是透明底立绘（位图 / WebP），共 9 只，统一归在「默认」分类
 * 分类只有「默认 / 我的 + 自定义分类」，不再有内置的桌宠/二次元/星际/实物
 */
(function () {
  'use strict';

  /* ---------------- 分类 ---------------- */
  /* 「全部」由界面自己拼在最前面；自定义分类从「我的」桌宠里动态汇总 */
  const CATS = [
    { id: 'default', name: '默认' },
    { id: 'mine', name: '我的' }
  ];

  /* ---------------- 默认桌宠 ---------------- */
  const PETS = [
    { id: 'gothic', name: '哥特贵女', cat: 'default', image: 'assets/pets/gothic.webp', alpha: true },
    { id: 'genki', name: '元气少女', cat: 'default', image: 'assets/pets/genki.webp', alpha: true },
    { id: 'hanfu', name: '国风仕女', cat: 'default', image: 'assets/pets/hanfu.webp', alpha: true },
    { id: 'cyber', name: '赛博义体', cat: 'default', image: 'assets/pets/cyber.webp', alpha: true },
    { id: 'healing', name: '治愈邻家', cat: 'default', image: 'assets/pets/healing.webp', alpha: true },
    { id: 'sailor', name: '水手少女', cat: 'default', image: 'assets/pets/sailor.webp', alpha: true },
    { id: 'twintail', name: '紫双马尾', cat: 'default', image: 'assets/pets/twintail.webp', alpha: true },
    { id: 'dreadnought', name: '无畏战舰', cat: 'default', image: 'assets/pets/dreadnought.webp', alpha: true },
    { id: 'frigate', name: '深空护卫', cat: 'default', image: 'assets/pets/frigate.webp', alpha: true }
  ];

  /* ---------------- 桌面道具：键盘 / 鼠标 / 爪子 ---------------- */
  const KEY_ROWS = [
    ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'],
    ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'],
    ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL'],
    ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash']
  ];

  function rigSVG(pet, c, noPaws) {
    const kx = 22, ky = 188, kw = 132, kh = 32, pad = 3;
    const colW = (kw - pad * 2) / 10;
    const rowH = 5;
    let keys = '';
    KEY_ROWS.forEach((row, r) => {
      const indent = r >= 2 ? colW * 0.45 : 0;
      row.forEach((code, i) => {
        const x = kx + pad + indent + i * colW;
        const y = ky + pad + r * rowH;
        keys += `<rect class="key" data-key="${code}" x="${x.toFixed(1)}" y="${y.toFixed(1)}"
          width="${(colW - 1.2).toFixed(1)}" height="${(rowH - 1.2).toFixed(1)}" rx="1.2"/>`;
      });
    });
    const hand = c.hand || c.main2 || '#8b7cff';
    const handLine = c.line || '#2b2440';
    return `
      <g class="pt-rig">
        <rect class="rig-desk" x="8" y="186" width="204" height="37" rx="12"/>
        <path class="rig-desk-line" d="M26 187.5 H194"/>
        <g class="rig-kb">
          <rect class="rig-base" x="${kx}" y="${ky}" width="${kw}" height="${kh}" rx="6"/>
          ${keys}
          <rect class="key key-space" data-key="Space" x="${kx + kw / 2 - 26}" y="211" width="52" height="4.6" rx="1.6"/>
        </g>
        <g class="pt-mouse">
          <rect class="rig-mouse" x="160" y="187" width="30" height="31" rx="14"/>
          <path class="m-btn m-btn-l" d="M175 188 H173 A13 13 0 0 0 160.5 200.6 H175 Z"/>
          <path class="m-btn m-btn-r" d="M175 188 H177 A13 13 0 0 1 189.5 200.6 H175 Z"/>
          <path class="m-sep" d="M175 188 v12.6"/>
          <rect class="m-wheel" x="172.9" y="191" width="4.2" height="7.4" rx="2.1" fill="${c.accent}" opacity=".9"/>
        </g>
        ${noPaws ? '' : `<g class="paw paw-l">
          <ellipse cx="70" cy="192" rx="10" ry="6.4" fill="${hand}"/>
          <path d="M64 191.4v3M70 190.6v3.2M76 191.4v3" stroke="${handLine}" stroke-width="1.1" stroke-linecap="round" opacity=".6"/>
        </g>`}
        ${noPaws ? '' : `<g class="paw paw-r">
          <ellipse cx="126" cy="196" rx="10" ry="6.4" fill="${hand}"/>
          <path d="M120 195.4v3M126 194.6v3.2M132 195.4v3" stroke="${handLine}" stroke-width="1.1" stroke-linecap="round" opacity=".6"/>
        </g>`}
      </g>`;
  }

  /* ---------------- 立绘桌宠：立绘 + 桌面道具 ----------------
   * 位图没有可动的五官和手，所以道具只做「底衬」；
   * 敲键盘 / 按鼠标时整张立绘轻微下沉一下，读起来是在打字。
   */
  const PHOTO_C = { accent: '#8b7cff', main: '#8b7cff', main2: '#5b4bd6', hand: '#8b7cff', line: '#2b2440' };

  function photoBox(pet, inner) {
    const c = Object.assign({}, PHOTO_C, pet.colors || {});
    return `<div class="pet-photo">
      ${inner}
      <svg class="pet-desk" viewBox="0 178 220 46" aria-hidden="true">${rigSVG(pet, c, true)}</svg>
    </div>`;
  }

  function renderPet(pet) {
    if (!pet || !pet.image) return '';
    const img = `<img class="pet-cut" src="${pet.image}" alt="${pet.name || ''}" draggable="false">`;
    return photoBox(pet, img);
  }

  window.PET_DATA = { CATS, PETS, renderPet };
})();
