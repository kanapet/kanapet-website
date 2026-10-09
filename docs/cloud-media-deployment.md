# 云端产品素材部署

状态：R2 与 Cloudflare Access 已配置，云端后台已部署。实际用户登录与真机上传仍需验证。

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
## 自动照片处理（2026-10-09）
手机和电脑在设备上处理照片，上传处理结果；原图留在用户设备，不另存云端。默认场景/细节模式保留比例；白底主图模式整理白色/透明外围留白，正方形画布82%内容占比，不自动抠图。最长边1600像素（本次默认设置），小图不放大；优先WebP，不支持则JPEG，逐级压缩/缩小，单张不超过500×1024字节。浏览器按EXIF方向解码，画布重编码清除GPS/EXIF。HEIC取决于浏览器解码能力；无法读取会提示转JPG，不上传损坏文件。
后台生成型号-image-序号-唯一短码.ext，保留稳定素材ID地址，响应Content-Disposition使用规范文件名；名称/尺寸从服务端素材元数据恢复，不能由保存草稿伪造。云端R2对象仍使用内部ID键。服务端验证JPEG/PNG/WebP尺寸与500KB限制；既有图片不改写，新图必须经过处理。已存在的旧上传照片不会批量改写，需选原图重新上传。
