# PRTS-Reader Online · 泰拉文本考察室

基于 Astro 的《明日方舟》剧情在线阅读器，静态部署于 GitHub Pages。

**在线阅读：https://Luckyblock233.github.io/PRTS-Reader-online/**

支持剧情目录、正文 / 脚本 / 源 JSON、角色立绘、全文检索及上下文、笔记与收藏、阅读续接、深色模式和专注阅读。无需运行后端服务。

## 本地开发

需要 Node.js 24+、npm 和 Python 3.10+（仅用于构建剧情数据）。

```sh
npm ci
npm run data:bootstrap
npm run dev
```

打开终端显示的 `/PRTS-Reader-online/` 地址。首次准备数据需要访问 GitHub；下载固定 Release 并校验 SHA-256，锁定来源见 `config/data-source.json`。

```sh
npm test
python -m unittest discover -s tests -p "test_*.py"
npm run build
npm run preview
```

## GitHub Pages 发布

仓库 Settings → Pages → Source 选择 **GitHub Actions**。推送到 `main` 或手动运行 `Deploy GitHub Pages`：下载并校验剧情 → 测试 → Astro 静态构建 → 发布 Pages。

`astro.config.mjs` 的 `site` 和 `base` 必须与仓库地址一致。`dist/`、下载数据和生成的 `public/data/` 不提交到 Git；部署工作流从锁定来源重建。源仓库提交历史保留，原仓库保留为 `upstream`，在线版仓库作为 `origin`。

## 数据与个人记录

- 章节按需下载；全文索引仅在首次搜索时加载，在 Web Worker 中检索。首次全库搜索可能需要等待，移动网络会产生流量。
- 笔记、收藏、续读与首页自定义仅保存在当前浏览器，不上传。请定期导出笔记，换设备或清理浏览器前备份。
- 更新剧情：维护者更新 `config/data-source.json` 中的 Release 和校验值，重新初始化、检查后提交发布。访客不能修改网站共享数据。
- 立绘按固定版本从 GitHub 获取；网络或 GitHub API 频率限制可能影响图片，文字阅读不受影响。
- 深链接使用 `#章节ID/段落下标`，可直接分享和刷新，无需服务端路由。

## 目录

- `src/pages/index.astro`：Astro 页面入口。
- `reader/`：阅读交互、样式、后台搜索与浏览器数据访问。
- `public/preferences.js`：在页面绘制前恢复外观。
- `scripts/bootstrap.py` / `prepare.py`：校验及转换上游剧情。
- `scripts/export-static.mjs`：发布数据导出与搜索索引分片。
- `.github/workflows/deploy.yml`：GitHub Pages 自动部署。

Python 服务模块保留用于数据工具回归测试；在线阅读使用 Astro 入口，不再通过 `scripts/serve.py` 启动。

## 许可

应用代码采用 [MIT](LICENSE)，字体采用 SIL OFL 1.1。剧情、立绘及 Wiki 内容权利归原权利人，详见 [第三方说明](THIRD_PARTY_NOTICES.md)。本项目为非官方阅读工具，源码仓库不提交游戏全文、个人笔记或立绘缓存，发布构建包含用于在线阅读的剧情投影。
