# 代码块组件来源

- 灰色代码框：已固定的 Tufted-Blog-Template，commit `9688c47b951c390d25a809dc86bd9748c93282d9`，MIT；原始样式保存在 `upstream/profile/tufted-code.css`，沿用 `#f7f7f7` 背景和 `#e0e0e0` 边框。
- 复制按钮：`@quartz-community/syntax-highlighting` **0.1.0**，MIT；从当前安装包的 `dist/index.js.map` 保留原始 `clipboard.inline.ts` 编译内容与 `clipboard.scss`，及包内 LICENSE，位于 `upstream/code-blocks/`。SVG 与按钮框体来自该组件。
- 本站适配：`code-blocks.js` / `code-blocks.css`。限定现有 `.reading-outline`；按钮常显，复用中文提示、键盘焦点与失败重试；兼容现有正文更新及搜索预览事件。
- 删除上游复制函数中的连续空行压缩；点击时读取 `code.textContent`，不从渲染后的按钮文字取值。复制保留代码空行、缩进、尾部换行，不承诺平台间原始 CRLF 字节完全相同。
- 不增加持续 MutationObserver，不改变 RemNote 原文、权限、折叠状态或搜索索引，不启用新语法高亮模块。
- 单元验收：`node --test sample/code-blocks.test.mjs sample/search-preview.test.mjs`；浏览器验收：`node scripts/code-blocks-browser.mjs`。合成样例仅在本地验收服务器与 D 盘产物中存在，不加入正式 Blog 或发布范围。
