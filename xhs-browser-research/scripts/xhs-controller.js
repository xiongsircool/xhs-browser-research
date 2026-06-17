const readline = require('node:readline');
const { chromium } = require('/Users/Apple/.codex/browser-mcp/node_modules/playwright');

const userDataDir = '/Users/Apple/.codex/browser-mcp/xhs-profile';
const outputDir = '/Users/Apple/.codex/browser-mcp/output';

let context;
let page;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pageState() {
  return page.evaluate(() => {
    const text = document.body?.innerText || '';
    const loginWords = ['扫码', '手机号登录', '获取验证码', '登录后推荐更懂你的笔记'];
    const stillLogin = loginWords.some(word => text.includes(word));
    const loggedInSignals = ['发布', '通知', '我', '创作中心'].filter(word => text.includes(word));
    return {
      title: document.title,
      url: location.href,
      loggedIn: !stillLogin && loggedInSignals.length >= 2,
      stillLogin,
      loggedInSignals,
      excerpt: text.replace(/\s+/g, ' ').slice(0, 700),
    };
  });
}

async function ensurePage(url = 'https://www.xiaohongshu.com/explore') {
  if (!context) {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chrome',
      headless: false,
      viewport: { width: 1280, height: 900 },
    });
  }
  page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(30000);
  if (!page.url() || page.url() === 'about:blank') {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }
  return page;
}

async function search(query) {
  await ensurePage();
  const visibleSearch = page.locator('#search-input');
  const visibleCount = await visibleSearch.count();
  if (visibleCount === 1) {
    await visibleSearch.click({ force: true });
    await visibleSearch.fill(query);
    await page.keyboard.press('Enter');
  } else {
    await page.evaluate(value => {
      const inputs = [...document.querySelectorAll('input')];
      const input = inputs.find(el => el.id === 'search-input' || el.placeholder?.includes('搜索'));
      if (!input) throw new Error('search input not found');
      input.focus();
      input.value = value;
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', code: 'Enter' }));
      input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', code: 'Enter' }));
    }, query);
  }
  await sleep(3000);
  const state = await pageState();
  if (!state.url.includes('search_result') && !state.url.includes('search')) {
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button, svg, div, span')];
      const button = buttons.find(el => {
        const label = `${el.getAttribute('aria-label') || ''} ${el.className || ''} ${el.textContent || ''}`;
        return /search|搜索/.test(label);
      });
      button?.click();
    });
    await sleep(3000);
  }
  return { ok: true, method: 'search-input', state: await pageState() };
}

async function snapshot(name = 'current') {
  await ensurePage();
  const path = `${outputDir}/${name}.png`;
  await page.screenshot({
    path,
    fullPage: false,
    timeout: 30000,
    animations: 'disabled',
  });
  return { path };
}

async function extractVisibleCards() {
  await ensurePage();
  return page.evaluate(() => {
    const badWords = ['沪ICP备', '营业执照', '许可证', '公网安备', '关于我们', '创作中心', '业务合作'];
    const seen = new Set();
    const cards = [];
    const nodes = [...document.querySelectorAll('section, div, a')]
      .map(el => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width >= 120 && rect.height >= 120 && rect.left > 180 && rect.top >= 80);
    for (const { el, rect } of nodes) {
      const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
      if (text.length < 4 || text.length > 260) continue;
      if (badWords.some(word => text.includes(word))) continue;
      const href = el.href || el.querySelector?.('a[href*="/explore/"]')?.href || el.querySelector?.('a')?.href || '';
      const img = el.querySelector?.('img')?.src || '';
      const key = `${text}|${href}|${img}`.slice(0, 260);
      if (!href && !img) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push({
        text,
        href,
        img,
        box: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        },
      });
      if (cards.length >= 16) break;
    }
    return cards;
  });
}

function assessRiskText(text) {
  const riskWords = ['加微信', 'vx', 'VX', '私信', '进群', '红娘', '月老', '中介', '收费', '付费', '资源', '杀猪盘', '理财', '投资', '下载', '二维码'];
  const hits = riskWords.filter(word => text.includes(word));
  let level = '低';
  if (hits.length >= 2) level = '高';
  else if (hits.length === 1) level = '中';
  return { level, hits };
}

async function inspectCurrentDetail() {
  await sleep(2500);
  return page.evaluate(() => {
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const imgs = [...document.querySelectorAll('img')]
      .map(img => img.src)
      .filter(src => src && !src.includes('data:') && !src.includes('platform'))
      .slice(0, 8);
    const links = [...document.querySelectorAll('a[href]')]
      .map(a => ({ text: (a.innerText || '').trim(), href: a.href }))
      .filter(x => x.href.includes('xiaohongshu.com'))
      .slice(0, 8);
    return {
      title: document.title,
      url: location.href,
      text: text.slice(0, 1800),
      imgs,
      links,
    };
  });
}

async function inspectTopCards(limit = 5) {
  await ensurePage();
  const cards = await extractVisibleCards();
  const chosen = cards.filter(card => card.href && card.href.includes('/explore/')).slice(0, limit);
  const sourceUrl = page.url();
  const results = [];
  for (const card of chosen) {
    try {
      await page.goto(card.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const detail = await inspectCurrentDetail();
      const risk = assessRiskText(`${card.text} ${detail.text}`);
      results.push({ card, detail, risk });
    } catch (error) {
      results.push({ card, error: error.message });
    }
  }
  await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  return { inspected: results.length, sourceUrl, results };
}

async function clickVisibleByText(text, options = {}) {
  return page.evaluate(({ text, minX, minY }) => {
    const candidates = [...document.querySelectorAll('button, div, span')];
    const el = candidates
      .map(node => ({ node, rect: node.getBoundingClientRect() }))
      .filter(({ node, rect }) => {
        const visible = rect.width > 0 && rect.height > 0;
        const matches = (node.innerText || node.textContent || '').trim() === text;
        const inArea = (minX == null || rect.left >= minX) && (minY == null || rect.top >= minY);
        return visible && matches && inArea;
      })
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))[0]?.node;
    if (!el) return false;
    el.click();
    return true;
  }, { text, minX: options.minX, minY: options.minY });
}

async function currentFilterSelections() {
  return page.evaluate(() => {
    const panel = [...document.querySelectorAll('div')]
      .map(node => ({ node, rect: node.getBoundingClientRect(), text: node.innerText || '' }))
      .filter(({ rect, text }) => rect.width > 300 && rect.height > 300 && text.includes('排序依据') && text.includes('位置距离'))
      .sort((a, b) => b.rect.left - a.rect.left)[0]?.node;
    if (!panel) return null;
    const rows = {};
    const labels = ['排序依据', '笔记类型', '发布时间', '搜索范围', '位置距离'];
    for (const label of labels) {
      const text = panel.innerText || '';
      const start = text.indexOf(label);
      const endCandidates = labels.map(x => text.indexOf(x, start + label.length)).filter(i => i > start);
      const end = endCandidates.length ? Math.min(...endCandidates) : text.length;
      rows[label] = text.slice(start, end).replace(/\s+/g, ' ').trim();
    }
    return rows;
  });
}

async function getFilterPanelBox() {
  return page.evaluate(() => {
    const panel = [...document.querySelectorAll('div')]
      .map(node => ({ rect: node.getBoundingClientRect(), text: node.innerText || '' }))
      .filter(({ rect, text }) => rect.width > 300 && rect.height > 300 && text.includes('排序依据') && text.includes('位置距离'))
      .sort((a, b) => b.rect.left - a.rect.left)[0];
    if (!panel) return null;
    return { left: panel.rect.left, top: panel.rect.top, right: panel.rect.right, bottom: panel.rect.bottom };
  });
}

async function clickPanelOption(option) {
  const box = await getFilterPanelBox();
  if (!box) throw new Error('filter panel not found');
  return clickVisibleByText(option, { minX: box.left, minY: box.top });
}

async function openFilterPanel() {
  await ensurePage();
  const clicked = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll('div, button, span')];
    const el = candidates.find(node => {
      const rect = node.getBoundingClientRect();
      const label = (node.innerText || node.textContent || '').trim();
      const cls = String(node.className || '');
      return rect.width > 0 && rect.height > 0 && label === '筛选' && cls.includes('filter');
    }) || candidates.find(node => {
      const rect = node.getBoundingClientRect();
      const label = (node.innerText || node.textContent || '').trim();
      return rect.width > 0 && rect.height > 0 && label === '筛选';
    });
    if (!el) return false;
    el.click();
    return true;
  });
  await sleep(800);
  return clicked;
}

async function applyDatingFilters() {
  await ensurePage();
  const opened = await openFilterPanel();
  if (!opened) throw new Error('filter entry not found');
  const box = await getFilterPanelBox();
  if (!box) throw new Error('filter panel not found');
  const targets = [
    { option: '最新', x: box.left + 190, y: box.top + 72 },
    { option: '一周内', x: box.left + 300, y: box.top + 296 },
    { option: '同城', x: box.left + 190, y: box.top + 470 },
  ];
  const selected = [];
  for (const target of targets) {
    await page.mouse.click(target.x, target.y);
    selected.push({ option: target.option, ok: true, x: Math.round(target.x), y: Math.round(target.y) });
    await sleep(900);
  }
  await sleep(2500);
  return { selected, filters: await currentFilterSelections(), state: await pageState() };
}

async function handle(command) {
  if (command.cmd === 'open') {
    await ensurePage(command.url);
    if (command.url) {
      await page.goto(command.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    return pageState();
  }
  if (command.cmd === 'status') {
    await ensurePage();
    return pageState();
  }
  if (command.cmd === 'search') {
    if (!command.query) throw new Error('query is required');
    return search(command.query);
  }
  if (command.cmd === 'snapshot') {
    return snapshot(command.name || 'current');
  }
  if (command.cmd === 'cards') {
    return extractVisibleCards();
  }
  if (command.cmd === 'filterDating') {
    return applyDatingFilters();
  }
  if (command.cmd === 'inspectTopCards') {
    return inspectTopCards(command.limit || 5);
  }
  if (command.cmd === 'scroll') {
    await ensurePage();
    await page.mouse.wheel(0, command.dy || 900);
    await sleep(command.waitMs || 1200);
    return pageState();
  }
  if (command.cmd === 'close') {
    await context?.close();
    process.exit(0);
  }
  throw new Error(`unknown command: ${command.cmd}`);
}

(async () => {
  await ensurePage();
  console.log(JSON.stringify({ ready: true, state: await pageState() }));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  rl.on('line', async line => {
    if (!line.trim()) return;
    try {
      const command = JSON.parse(line);
      const result = await handle(command);
      console.log(JSON.stringify({ id: command.id, ok: true, result }));
    } catch (error) {
      console.log(JSON.stringify({ ok: false, error: error.message }));
    }
  });
})();
