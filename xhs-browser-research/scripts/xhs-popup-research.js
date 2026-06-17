const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('/Users/Apple/.codex/browser-mcp/node_modules/playwright');

const userDataDir = '/Users/Apple/.codex/browser-mcp/xhs-profile';
const outputDir = '/Users/Apple/.codex/browser-mcp/output';
const reportPath = path.join(process.cwd(), 'xhs-shanghai-male-candidates.html');
const query = '上海男找女';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const badSignals = [
  '加微信', '加vx', 'vx', 'VX', 'Vx', '私信', '进群', '二维码', '红娘', '月老', '中介',
  '收费', '付费', '资源', '杀猪盘', '理财', '投资', '下载', '别封我了'
];

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function riskFromText(text) {
  const hits = badSignals.filter((word) => text.includes(word));
  if (hits.length >= 2) return { level: '高', hits };
  if (hits.length === 1) return { level: '中', hits };
  if (text.length < 80) return { level: '中', hits: ['信息偏少'] };
  return { level: '低', hits };
}

function scoreCandidate(item) {
  const text = `${item.cardText} ${item.detailText}`;
  let score = 0;
  const positives = [];
  for (const [pattern, label, points] of [
    [/真诚|认真|长期|稳定|结婚|恋爱|对象/, '表达目标较明确', 1],
    [/上海|浦东|徐汇|静安|黄浦|闵行|杨浦|长宁|奉贤|宝山|松江|嘉定/, '上海同城线索', 1],
    [/博士|硕士|研究生|985|211|复旦|交大|同济|华师|上财|留学|海归|名校/, '学历/智力线索', 2],
    [/老师|教师|国企|外企|互联网|金融|医生|律师|工程师|CPA|事业|创业|高校/, '职业线索', 2],
    [/97|98|99|00|01|年龄|岁|身高|cm|本科|硕士|博士/, '个人信息较具体', 1],
    [/帅|照片|露脸|颜值|运动|健身|穿搭/, '形象线索', 1],
  ]) {
    if (pattern.test(text)) {
      score += points;
      positives.push(label);
    }
  }
  const risk = riskFromText(text);
  if (risk.level === '高') score -= 4;
  if (risk.level === '中') score -= 1;
  if (text.length < 60) score -= 2;
  return { score, positives, risk };
}

async function pageState(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText || '';
    return {
      url: location.href,
      title: document.title,
      text: text.replace(/\s+/g, ' ').slice(0, 800),
    };
  });
}

async function search(page) {
  await page.goto('https://www.xiaohongshu.com/explore', { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const input = page.locator('#search-input');
  await input.click({ force: true });
  await input.fill(query);
  await page.keyboard.press('Enter');
  await sleep(4500);
}

async function clickFilters(page) {
  await page.evaluate(() => {
    const node = [...document.querySelectorAll('div,button,span')].find((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (el.innerText || el.textContent || '').trim() === '筛选';
    });
    node?.click();
  });
  await sleep(1200);
  await page.evaluate(() => {
    function clickExact(text) {
      const nodes = [...document.querySelectorAll('div,button,span')].map((node) => ({
        node,
        rect: node.getBoundingClientRect(),
        text: (node.innerText || node.textContent || '').trim(),
      }));
      const match = nodes
        .filter((x) => x.rect.width > 0 && x.rect.height > 0 && x.text === text)
        .sort((a, b) => b.rect.left - a.rect.left)[0];
      match?.node.click();
    }
    clickExact('最新');
    clickExact('一周内');
    clickExact('同城');
  });
  await sleep(3500);
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(1200);
}

async function getCards(page) {
  return page.evaluate(() => {
    const cards = [];
    const seen = new Set();
    const nodes = [...document.querySelectorAll('section, a, div')]
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width >= 160 && rect.width <= 320 && rect.height >= 180 && rect.left > 220 && rect.top >= 90 && rect.top < window.innerHeight - 20);
    for (const { el, rect } of nodes) {
      const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
      const href = el.href || el.querySelector?.('a[href*="/explore/"]')?.href || '';
      const img = el.querySelector?.('img')?.src || '';
      if (!text || text.length < 8 || !href.includes('/explore/') || !img) continue;
      const key = href;
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push({
        text,
        href,
        img,
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + Math.min(rect.height / 2, 150)),
      });
    }
    return cards.slice(0, 12);
  });
}

async function modalText(page) {
  await sleep(2800);
  return page.evaluate(() => {
    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const dialog = [...document.querySelectorAll('[role="dialog"], .note-detail-mask, .note-container, div')]
      .map((node) => ({ node, rect: node.getBoundingClientRect(), text: (node.innerText || '').replace(/\s+/g, ' ').trim() }))
      .filter((x) => x.rect.width > 450 && x.rect.height > 350 && x.text.length > 60)
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))[0];
    const root = dialog?.node || document.body;
    const imgs = [...root.querySelectorAll('img')]
      .map((img) => img.src)
      .filter((src) => src && !src.includes('data:') && !src.includes('avatar') && !src.includes('platform'))
      .slice(0, 5);
    const text = ((dialog?.text || bodyText).replace(/\s+/g, ' ').trim()).slice(0, 2200);
    return { text, imgs };
  });
}

async function closeModal(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(900);
  await page.evaluate(() => {
    const close = [...document.querySelectorAll('svg, button, div')]
      .map((node) => ({ node, rect: node.getBoundingClientRect(), label: `${node.getAttribute('aria-label') || ''} ${node.className || ''} ${node.textContent || ''}` }))
      .filter((x) => x.rect.width > 0 && x.rect.height > 0 && /close|关闭|reds-icon/.test(x.label))
      .sort((a, b) => a.rect.top - b.rect.top)[0];
    close?.node.click();
  }).catch(() => {});
  await sleep(1800);
}

async function inspectVisible(page, collected, excluded) {
  const cards = await getCards(page);
  for (const card of cards) {
    if (collected.some((x) => x.url === card.href) || excluded.some((x) => x.url === card.href)) continue;
    await page.mouse.click(card.x, card.y);
    const detail = await modalText(page);
    const item = {
      title: card.text.split(' ').slice(0, 12).join(' '),
      url: card.href,
      image: detail.imgs[0] || card.img,
      cardText: card.text,
      detailText: detail.text,
      ...scoreCandidate({ cardText: card.text, detailText: detail.text }),
    };
    const lowInfo = `${item.cardText} ${item.detailText}`.length < 90;
    const commercial = item.risk.hits.some((hit) => hit !== '信息偏少');
    if (item.score >= 2 && !commercial && !lowInfo) collected.push(item);
    else excluded.push({ url: item.url, title: item.title, reason: commercial ? `风险词：${item.risk.hits.join('、')}` : lowInfo ? '信息太少' : '与偏好匹配度不足', image: item.image });
    await closeModal(page);
    await sleep(2500);
    if (collected.length >= 10) break;
  }
}

function summarize(text) {
  const cleaned = text
    .replace(/网页版|创作中心|业务合作|发现 RED|直播|发布|通知|我/g, '')
    .replace(/沪ICP备.*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 320);
}

function makeReport({ state, collected, excluded, scanned }) {
  const cards = collected.map((item, index) => `
    <article class="card">
      <img src="${escapeHtml(item.image)}" alt="候选 ${index + 1}">
      <div class="body">
        <div class="rank">#${index + 1} · 匹配分 ${item.score} · 风险 ${escapeHtml(item.risk.level)}</div>
        <h2>${escapeHtml(item.title)}</h2>
        <p class="meta"><a href="${escapeHtml(item.url)}" target="_blank">${escapeHtml(item.url)}</a></p>
        <h3>可见摘要</h3>
        <p>${escapeHtml(summarize(`${item.cardText} ${item.detailText}`))}</p>
        <h3>推荐理由</h3>
        <p>${escapeHtml(item.positives.length ? item.positives.join('；') : '可见信息与上海男找女意图相关，但需进一步核验。')}</p>
        <h3>风险判断</h3>
        <p>${escapeHtml(item.risk.hits.length ? `命中：${item.risk.hits.join('、')}` : '未见明显加微信、收费、中介、红娘或投资引流词；仍不能验证身份真实性。')}</p>
        <h3>下一步核验</h3>
        <p>看主页是否有长期生活记录、评论是否自然；先站内沟通，不转账，不扫陌生二维码，不进外部群。</p>
      </div>
    </article>`).join('\n');

  const excludedRows = excluded.slice(0, 30).map((item) => `
    <li><a href="${escapeHtml(item.url)}" target="_blank">${escapeHtml(item.title || item.url)}</a>：${escapeHtml(item.reason)}</li>`).join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>小红书上海男生候选报告</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #202124; background: #f6f7f9; }
    header { padding: 36px 44px 24px; background: #fff; border-bottom: 1px solid #e6e8eb; }
    h1 { margin: 0 0 12px; font-size: 30px; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 20px; }
    .stat { background: #f1f4f8; border-radius: 8px; padding: 12px; }
    .stat strong { display: block; font-size: 22px; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px 24px 56px; }
    .summary, .excluded, .limits { background: #fff; border: 1px solid #e6e8eb; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    .card { display: grid; grid-template-columns: 260px 1fr; gap: 22px; background: #fff; border: 1px solid #e6e8eb; border-radius: 8px; padding: 18px; margin-bottom: 18px; }
    .card img { width: 260px; height: 340px; object-fit: cover; border-radius: 6px; background: #e9ecef; }
    .rank { color: #b42318; font-weight: 700; font-size: 14px; }
    h2 { margin: 8px 0 8px; font-size: 21px; }
    h3 { margin: 16px 0 6px; font-size: 14px; color: #555; }
    p { line-height: 1.65; margin: 0; }
    a { color: #1a5fb4; overflow-wrap: anywhere; }
    ul { line-height: 1.8; }
    @media (max-width: 760px) {
      header { padding: 28px 20px 20px; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .card { grid-template-columns: 1fr; }
      .card img { width: 100%; height: auto; max-height: 480px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>小红书上海男生候选报告</h1>
    <p>检索意图：帮朋友找上海同城男生候选。筛选偏好：帅、智商高、学历/职业好、表达真诚。排除中介、红娘、引流私信、加微信、收费、模板号和信息太少的号。</p>
    <div class="grid">
      <div class="stat"><strong>${escapeHtml(query)}</strong>搜索词</div>
      <div class="stat"><strong>最新 / 一周内 / 同城</strong>筛选</div>
      <div class="stat"><strong>${scanned}</strong>扫描卡片</div>
      <div class="stat"><strong>${collected.length}</strong>保留候选</div>
    </div>
  </header>
  <main>
    <section class="summary">
      <h2>总体判断</h2>
      <p>本轮结果流里模板帖和低信息帖较多，较可靠的候选集中在有年龄、城市、职业、学历、长期关系意向等具体信息的本人自述。报告只基于网页可见内容做风险筛查，不能证明身份真实或单身状态。</p>
      <p>页面状态：${escapeHtml(state.title)} · ${escapeHtml(state.url)}</p>
    </section>
    ${cards}
    <section class="excluded">
      <h2>排除/降权记录</h2>
      <ul>${excludedRows || '<li>无</li>'}</ul>
    </section>
    <section class="limits">
      <h2>安全限制</h2>
      <p>不要转账，不下载陌生 App，不扫二维码进群，不被“收费撮合/内部资源/高收益投资”带走。建议先站内多轮沟通，再核验主页长期记录、共同关系、视频/线下公共场合见面安排。</p>
    </section>
  </main>
</body>
</html>`;
}

(async () => {
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(12000);
  page.setDefaultNavigationTimeout(30000);

  const collected = [];
  const excluded = [];
  let scanned = 0;

  await search(page);
  await clickFilters(page);

  for (let pageNo = 0; pageNo < 5 && collected.length < 8; pageNo += 1) {
    const before = (await getCards(page)).length;
    scanned += before;
    await inspectVisible(page, collected, excluded);
    await page.mouse.wheel(0, 760);
    await sleep(3500);
  }

  const state = await pageState(page);
  const html = makeReport({ state, collected, excluded, scanned });
  fs.writeFileSync(reportPath, html, 'utf8');
  await page.screenshot({ path: path.join(outputDir, 'xhs_popup_research_final.png'), fullPage: false });
  console.log(JSON.stringify({ reportPath, kept: collected.length, excluded: excluded.length, scanned, state }, null, 2));
  await context.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
