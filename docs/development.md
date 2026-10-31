# 开发

Node.js 24+、npm、Python 3.10+。运行 `npm ci`、`npm run data:bootstrap`、`npm run dev`。生产校验运行 `npm test`、`python -m unittest discover -s tests -p "test_*.py"` 和 `npm run build`。使用 `npm run preview` 检查完整仓库子路径。

提交 main 自动发布 GitHub Pages。剧情数据由 CI 按 config/data-source.json 重新下载并校验，不提交生成数据。更新快照后笔记仍保留在原快照命名空间，用户应先导出备份。
