# KANAPET Website 工作规则

- 开始修改前读 README.md、CONVENTIONS.md、docs/publishing.md，以及相关目录内更具体的规则。保留已有结构和约定。
- 本仓库公开。真实客户信息、内部报价、私有经营资料、数据库、凭证、原始设计不得入库；原始资料按本机全局 KANAPET 文件规则保存到仓库外。
- 正式产品图片使用 public/images/products/，单张不超过 500 KB，主图遵循 CONVENTIONS.md 的 82% 内容占比要求；按现有 SKU/命名方式保存。记录原始素材对应关系，不恢复 products_raw 源文件目录。
- 网站发布数据以 public/data/products.json 与 public/data/categories.json 为准。它们承接经过确认的产品资料，不替代仓库外业务产品主数据；两者有差异时先核对，不自动以一方覆盖另一方。
- public/js/data.js、页面产品事实和指纹由 tools/build_release.py 生成，不单独修改生成结果。content/confirmed-products.json 的已确认规格和图片记录，仅在用户明确确认变更后更新。
- 产品或发布相关修改按 docs/publishing.md 运行生成与验证流程；实际命令以项目当前文件为准。无需求不安装依赖或升级工具。
- main 推送会触发 Cloudflare 部署。未经用户明确授权，不 push、合并 PR、执行部署或回滚发布；不绕过发布保护。
- CONVENTIONS.md 中旧沙箱 TLS/hosts 说明是特定环境记录，不在此 Mac 自动修改系统 hosts 或 Git 全局 TLS 设置。
- 项目资料索引与文件管理遵循本机全局 KANAPET 规则；跨目录检查权限，删除、批量搬迁和敏感操作先列方案确认。结束时报告新增、修改、移动文件路径。
- 一次只执行一个明确范围的更新。未确认需求记录在 docs/UPDATE-QUEUE.md，不混入发布代码。开始前核对最新线上版本及 origin/main；预览使用 tools/preview_site.py。按 docs/publishing.md 捕获并核对线上 release、云端首图及全部改动路径；范围外变化先停止。预览确认与上线授权分别记录，未经当次明确上线授权不 push/部署。
