# 开发

Node.js 24+、npm、Python 3.10+。运行 `npm ci`、`npm run data:bootstrap`、`npm run dev`。生产校验运行 `npm test`、`python -m unittest discover -s tests -p "test_*.py"` 和 `npm run build`。使用 `npm run preview` 检查完整仓库子路径。

提交 main 自动发布 GitHub Pages。剧情数据由 CI 按 config/data-source.json 重新下载并校验，不提交生成数据。更新快照后笔记仍保留在原快照命名空间，用户应先导出备份。

修改全站导航使用 src/components/SiteHeader.astro；页面外壳使用 src/layouts/SiteLayout.astro；文档排版使用 DocumentLayout.astro。阅读界面按职责拆在 src/components/reader/，阅读交互仍在 reader/。页面局部样式放在组件的 style 块，共享变量和基础样式放在 src/styles/，避免向其他页面引入阅读工作区样式。

`npm run format` 支持 Astro 组件。生产构建后运行 `node scripts/check-online.mjs`，检查三个独立页面的导航、阅读控件、静态数据和子路径兼容。
