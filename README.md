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

## 剧情数据自动更新

`Update story data` 每 6 小时检查 `3aKHP/arknights-data-pipeline` 的正式剧情 Release，北京时间约 **02:17、08:17、14:17、20:17**（GitHub 调度可能延迟）。在 Actions 中可手动运行此工作流。

只选择带 `manifest.json` 和 `zh_CN.zip` 的正式数据包，跳过草稿、预发布及图片包。按数据版本与发布时间选择新版本，不降级；相同 SHA-256 不重复更新，同一 Release 重新发布且内容变化时也会重新校验。新版数据格式不兼容则停止，等待维护者处理。

有新数据时：检查清单与附件长度 / SHA-256 → 下载 ZIP 并校验实际内容 → 重建章节和全文索引 → 验证段落定位 → 执行测试、Astro 构建及在线适配检查 → 仅提交 `config/data-source.json` → 自动触发 Pages 部署。源代码与 UI 不自动同步，原代码同步工作流及脚本已删除。下载与生成数据不提交到 Git。

定时检查没有新数据就结束；手动执行即使没有新数据也会完整验证并重新发布，可用于恢复部署失败。验证失败不提交候选版本；部署失败时旧网站继续服务。使用 GitHub 自带令牌，无需添加个人令牌或保持本机开机。公开仓库长期无活动时 GitHub 可能暂停定时任务，可在 Actions 中重新启用。

数据更新后刷新网站即可读取新快照。笔记和续读仍按快照保存，不自动套用到新版段落，建议提前导出备份。

## 数据与个人记录

- 章节按需下载；全文索引仅在首次搜索时加载，在 Web Worker 中检索。首次全库搜索可能需要等待，移动网络会产生流量。
- 笔记、收藏、续读与首页自定义仅保存在当前浏览器，不上传。请定期导出笔记，换设备或清理浏览器前备份。
- 更新剧情：定时工作流自动检测并验证新剧情包，通过检查后更新网站；也可手动运行 `Update story data`。访客不能修改网站共享数据。
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
