# PRTS-Reader · 泰拉文本考察室

面向《明日方舟》剧情的个人本地阅读器。阅读原始脚本、检索对白、核对上下文，并把观察留在原文位置。

- **阅读**：目录浏览、发言标签配色、对应 AVG 立绘、脚本指令与源 JSON。
- **外观**：白天 / 夜间、离线霞鹜文楷、字号调整、紧凑模式与专注阅读。
- **导航**：上下键切换可见对白、章节与段落续读。
- **检索**：顶部全库检索、篇章筛选、分页、关键词高亮与可展开上下文。
- **记录**：段落笔记、收藏、JSON 导入 / 导出。
- **首页**：编辑用途说明，手动检查并安装已转换的 ASTR 剧情数据更新。

运行只需 **Python 3.10+**。前端使用原生 ES Modules，无需 Node.js、数据库、模型密钥或前端构建。

## 快速开始

在克隆后的项目根目录执行：

```sh
python scripts/bootstrap.py
python scripts/serve.py --port 8766
```

访问 <http://127.0.0.1:8766>，保持终端运行，Ctrl+C 停止。

首次初始化会从 `3aKHP/arknights-data-pipeline` 的固定 Release 下载 `manifest.json` 与 `zh_CN.zip`，校验 SHA-256 后生成阅读数据。锁定信息在 `config/data-source.json`，初始 ZIP 约 35 MB；保留原始记录的投影会占用更多磁盘。无需 clone 上游仓库。已有校验通过的本地包会复用。

Windows 可用 `./start-reader.ps1`；macOS / Linux 可用 `sh start-reader.sh`。启动脚本会在缺少本地数据时执行初始化。Windows 可通过 `-Python /path/to/python` 指定解释器，或在被 Git 忽略的 `config/runtime.local.json` 中设置 `{"python":"解释器路径"}`；shell 脚本支持 `TERRA_PYTHON` 环境变量。

下载数据和缺失立绘需要访问对应 GitHub 来源；已有本地文本和缓存可离线阅读。首次下载失败时，可检查网络后重试初始化。静态文件不能直接以 `file://` 打开。

## 使用与数据

首页「继续阅读」恢复最后选中的章节与段落。顶部全文检索可查正文、选项及发言标签。点击结果回到原文，展开上下文可继续定位相邻记录。原文按源顺序保留全部分支，不模拟实际游玩路线。

「编辑首页」将修改保存为 `config/home.json`；未设置时使用仓库中的 `config/home.example.json`。个人配置不随源码提交。

首页「数据更新」支持 **检查 → 选择版本 → 下载校验与索引重建 → 载入新版本**。失败保留原快照；旧数据、首页和资源缓存保留。笔记及阅读位置按快照保存在当前浏览器，换浏览器、端口或清理站点数据前可导出备份。旧笔记不会自动套用到新快照。

详见 [阅读指南](docs/reader-guide.md)。

## 开发

```sh
python -m unittest discover -s tests -p "test_*.py" -v
# JavaScript 测试需要 Node.js 20+
node --test tests/reading-session.test.mjs
```

测试使用合成剧情，无需下载真实语料。开发格式工具、完整 schema 验证和 CI 说明见 [开发文档](docs/development.md)。模块划分与数据边界见 [代码结构](docs/architecture.md)。

## 开源范围与许可

应用代码采用 [MIT](LICENSE)。离线字体以 SIL OFL 1.1 分发并保留原许可。剧情、立绘及 Wiki 内容的权利归属见 [第三方说明](THIRD_PARTY_NOTICES.md)；仓库不附带游戏全文、立绘缓存、个人笔记或研究报告。

本项目为非官方个人本地工具，仅监听本机回环地址，不提供公网账户或多用户隔离。它不包含知识图谱抽取或 LLM 生成功能，发布包中上游自带的摘要仅作为既有数据展示。

欢迎提交 Issue / PR，参见 [贡献指南](CONTRIBUTING.md) 与 [安全说明](SECURITY.md)。
