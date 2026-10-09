# 云端产品素材部署

状态：代码和自动化测试已完成，尚未启用 R2、配置 Access 或部署正式官网。

## Cloudflare 账户准备

1. 在现有管理 kanapet.com 的 Cloudflare 账户启用 R2 标准存储。若要求添加付款方式、接受计费协议，由账户所有者在官方页面自行完成。
2. 创建私有桶 kanapet-product-media，不启用 r2.dev 公共桶入口；全部访问通过 Worker 权限与发布状态校验。
3. Cloudflare Access 建立自托管应用，保护 www.kanapet.com/admin 及其子路径。允许策略使用明确的内部邮箱白名单；登录可使用邮箱验证码。
4. 将 Access 的 team issuer（形如 https://team.cloudflareaccess.com）与 application AUD 写入 wrangler.media.jsonc 的 vars。
5. 通过 Wrangler Secret 配置 MEDIA_ADMIN_EMAILS 为已授权邮箱列表。邮箱不写入公开仓库。Worker 验证 JWT 签名、issuer、audience、有效期及邮箱名单；API 即使绕过 Access 页面也无法匿名操作。
6. 执行 node tools/build_admin_assets.mjs，再运行测试和 wrangler deploy --config wrangler.media.jsonc。Cloudflare Git 自动部署继续使用原 wrangler.jsonc，因此最终上线时须将已核实的 R2/Access 配置合并到原配置，再发布代码，避免下次 Git 部署丢失绑定。

## 云端行为

手机与电脑统一访问 https://www.kanapet.com/admin/。上传先进入内部草稿；预览仅授权人员可查看，发布后公开媒体 API 返回最新版本。
保留产品参数、询盘与配件推荐，视频按比例展示。Cloudflare Access 的 HttpOnly 登录 cookie 也用于私有素材预览校验。
云端单张图片最多10MB，单段视频最多40MB，每款产品最多80项素材。大视频须压缩后上传或使用 Facebook/YouTube 等外部链接。云端当前不做视频转码。
从草稿删除后需发布才从官网隐藏。已移除原始 R2 文件暂保留，不再允许匿名访问；物理清理需另行审核和操作，保留文件仍计入容量。不要把删除展示误解为立即降低存储账单。

## 验证

node tools/test_cloud_media.mjs：真实 RSA 签名测试、拒绝错误邮箱/过期JWT/错误audience、Origin和CSRF校验、R2版本冲突、私有草稿、原子发布、视频Range、删除展示后的权限。
node tools/test_worker.mjs：原有路由和询盘。
node tools/test_media_server.mjs：本地后台兼容。
node tools/smoke_site.mjs：81个地址、70款产品。
首次正式上线还需真实 R2、真实 Access 邮箱验证码和手机上传端到端验证。

本地与云端目前采用同一素材数据结构，但本地数据不会自动上传。若已有本地素材，迁移应只上传已选定的素材和发布顺序；本地账号和密码哈希不迁移到云端（云端改用 Access）。