# 视频展示配置

主页工厂宣传视频与所有产品详情页已接入 `public/data/videos.json`。
未配置（null）时该区域自动隐藏，不展示空播放器。点击播放，无自动播放。

## 工厂视频
factory.html 直接嵌入 videos/kanapet-factory-tour.mp4，使用相对路径，无需读取 JSON，本地直接打开 HTML 也可显示。
视频为 57 秒、1920×1080 H.264/AAC，约 19.1 MB，带 faststart 和车间封面，点击播放、preload=none。
首页仍使用 factory 配置，当前保持 null。

将 factory 的 null 替换为：

```json
{"src":"https://您的视频域名/factory.mp4","poster":"/images/factory/factory-1.jpg","title":"Kanapet Factory Tour"}
```

## 产品视频
products 下已列出全部产品 slug。将对应产品的 null 替换为：

```json
{"src":"https://您的视频域名/product.mp4","poster":"/images/products/bird-travel-cage-23.jpg","title":"Product Demonstration"}
```

src 必填；poster 和 title 可选。支持 MP4、WebM、YouTube 视频/Shorts 链接和 Vimeo 公开链接。
每款产品独立配置；同系列可为多个产品填入同一视频链接。产品页包含 /product/<slug>.html 和 product.html?slug=<slug> 两种路径。
大视频可存放在视频托管或对象存储上，并使用可公开访问的 HTTPS 链接。
使用站内文件时放在 public/videos/ 下，src 填 /videos/文件名.mp4。
填写实际素材后，请在桌面和手机检查播放、声音、全屏及对应产品；本次未提供素材，尚未验证实际视频播放。
Facebook：支持公开原始视频链接 /reel/数字ID/、/主页名/videos/数字ID/、/watch/?v=数字ID。分享短链接 /share/r/ 需先转换为原始地址。视频公开性、嵌入权限与实际播放需要逐条确认。播放器下方提供 Watch on Facebook 备用入口。

产品视频位于图片画廊第二项（主图后），点击 Video 缩略图显示播放器，切回图片时暂停视频。

比例：MP4/WebM 读取素材尺寸自动适配；跨域嵌入视频需设置 aspectRatio（如 9 / 16）。650 Facebook Reel 暂按竖屏 9:16 配置，实际比例待素材核实。
