# xhs-browser Notes

## Stable UI Targets

### Search input

- Prefer `#search-input`.
- Fallback: `input[placeholder*="搜索"]`.
- Some pages contain a hidden `input.search-input` that intercepts locator resolution. Avoid `locator('input').first()`.

### Filter entry

Observed markup:

```html
<div class="filter">
  <span>筛选</span>
  <svg class="reds-icon filter-icon"></svg>
</div>
```

Use target strategy:

1. Prefer `.filter:has-text("筛选")` when supported.
2. Fallback to a DOM click on the visible element whose class includes `filter` and text includes `筛选`.
3. Do not use generic `getByText("筛选")` without scoping; filter panels may also contain other filter-related text.

Filter panel visible options observed:

- 排序依据: 综合, 最新, 最多点赞, 最多评论, 最多收藏
- 笔记类型: 不限, 视频, 图文
- 发布时间: 不限, 一天内, 一周内, 半年内
- 搜索范围: 不限, 已看过, 未看过, 已关注
- 位置距离: 不限, 同城, 附近

## Flow Rule

When a user is watching the page, reuse the current browser/page. Do not restart the browser, reload the page, or close the window unless explicitly requested.
