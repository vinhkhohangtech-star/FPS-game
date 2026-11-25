# SPEC OPS // SURVIVAL — Web FPS lấy cảm hứng từ MW3 (2011) Survival

Game bắn súng góc nhìn thứ nhất 3D chạy thẳng trên trình duyệt bằng **HTML5 + CSS3 + JavaScript (ES6 modules) + Three.js r160** (tải từ CDN unpkg). Không cần build tool.

## Chạy game (không cần terminal)

- **Cách 1 (khuyên dùng):** bấm đúp `START-GAME.bat`. Một cửa sổ đen hiện ra và trình duyệt tự mở game ở `http://localhost:8000`. Cách này dùng được file âm thanh / model của bạn. Giữ cửa sổ đen mở khi chơi, đóng nó khi chơi xong.
- **Cách 2:** mở thẳng `play-offline.html` bằng trình duyệt. File này (~20MB) đã **nhúng sẵn** lính CS2, khẩu AK-74m và âm thanh, nên chạy ngay không cần gì thêm. Nếu bạn thay file trong `assets/`, bản offline không tự cập nhật — dùng Cách 1, hoặc nhờ đóng gói lại.

Nếu Windows hiện cảnh báo SmartScreen khi mở `.bat`, chọn **More info → Run anyway**.

### Cách thủ công (cho người dùng terminal)

Phải chạy qua web server tĩnh (mở trực tiếp file `index.html` bằng `file://` sẽ không chạy vì ES modules và việc tải `.glb/.mp3`):

```bash
cd cod-mw3-web
npx serve            # rồi mở http://localhost:3000
# hoặc
python -m http.server 8000   # rồi mở http://localhost:8000
```

Cần có Internet lần đầu để tải Three.js và font từ CDN.

## Điều khiển

| Phím | Chức năng |
|---|---|
| Click màn hình | Khóa chuột (ESC để thoát / tạm dừng) |
| W A S D | Di chuyển (7.0 m/s) |
| Shift (giữ) | Chạy nước rút (11.5 m/s) |
| C (bật/tắt) / Ctrl (giữ) | Ngồi (3.5 m/s) — nên dùng **C**, vì Ctrl+W sẽ đóng tab |
| Space | Nhảy |
| Chuột trái | Bắn |
| Chuột phải | Ngắm (ADS) |
| R | Nạp đạn |
| B | Đổi chế độ bắn AUTO / SEMI |
| 1 / 2 / Q / con lăn | Đổi súng |
| E | Mở / đóng Armory (khi đứng gần thùng ở giữa bản đồ) |
| 1 / 2 / 3 trong Armory | Mua đạn / áo giáp / súng phụ |
| Enter / F5 | Bỏ qua thời gian chờ giữa các wave |

## Tài nguyên (assets) đã kèm sẵn

Thư mục `assets/` đã có sẵn các file lấy từ dự án của bạn:

| File | Lấy từ | Ghi chú |
|---|---|---|
| `models/ak47.glb` | `CODMW3/Content/Survival/Weapons/AK47/FPS_AK-74m_animations.glb` | Tay + súng AK-74m, 8 animation (Idle, Walk, Run, Shot, Reload, Draw...) |
| `models/terrorist.glb` | `models/Terrorist 3d/` (CS2 Terrorist + 14 animation Mixamo) | **Lính chính**: có texture, 14 animation (đứng, đi, chạy, đi ngang, đi lùi, bắn, ngồi bắn, thay đạn, ném lựu đạn, trúng đạn, 3 kiểu chết) |
| `models/bot.glb` | `CODMW3/Content/Survival/Characters/Enemy/KhungBo/bot.glb` | Lính dự phòng, chỉ dùng khi thiếu `terrorist.glb` |
| `models/house.glb` | `models/house/tower_house_design.glb` (110MB) | **Nhà giữa map**: bản nén còn ~9MB (texture 4096→1024px, bỏ tấm cỏ đế, kính thành kính trong suốt thường) |
| `audio/1 bullet.wav` | `fps/sound/` | Tiếng bắn phát đơn + tiếng súng địch |
| `audio/auto bullet_1.MP3` | `fps/sound/` | Tiếng liên thanh — tự dò điểm lặp để giữ cò không bị ngắt quãng |
| `audio/gun reload.mp3` | `fps/sound/` | Tiếng nạp đạn, kéo giãn cho khớp 3 giai đoạn hoạt ảnh |

Hai model không có texture nên game tự tô màu từng phần (tay, súng, băng đạn, quần áo, khăn).
Chưa có `hitmarker.mp3` → dùng tiếng "tick" tổng hợp. Chép file vào `assets/audio/hitmarker.mp3` nếu có.

Lưu ý: `play-offline.html` mang theo một bản sao của các file trên ngay trong nó (trang `file://` không được phép đọc file rời).

Game vẫn chơi được **khi thiếu file** — súng AK, lính địch, âm thanh và texture đều có bản dự phòng tự tạo bằng code. Khi bạn bỏ file vào đúng chỗ, game tự dùng file của bạn:

```
assets/
├── audio/
│   ├── 1 bullet.wav      # tiếng bắn phát đơn (cũng dùng cho súng địch, Deagle)
│   ├── auto bullet.MP3   # tiếng bắn liên thanh (file dài > 0.4s sẽ được lặp khi giữ cò)
│   ├── gun reload.mp3    # tiếng nạp đạn
│   └── hitmarker.mp3     # tiếng "tick" khi bắn trúng
├── models/
│   ├── ak47.glb          # viewmodel AK (hoặc FPS_AK-74m_animations.glb)
│   └── bot.glb           # lính địch (có animation Walk/Run/Shoot/Die thì tự phát)
└── textures/             # tùy chọn: ground.jpg, wall.jpg, cover.jpg (hoặc .png)
```

Màn hình menu hiển thị file nào đang được dùng và file nào đang dùng bản dự phòng.

### Chỉnh model .glb nếu bị lệch

- **Súng:** sửa `AK_GLB_CONFIG` ở đầu `js/Weapon.js` — `flip` (súng quay ngược), `rotation`, `targetLength`, `hipPos`, `adsPos`, `addProceduralArms` (tắt nếu model đã có tay).
- **Súng AK-74m:** ống ngắm khi ngắm (ADS) được tính từ vị trí khe ngắm sau `sightRear` và đầu ngắm trước `sightFront` trong `AK_GLB_CONFIG`; `adsForward` đẩy súng ra xa mắt hơn.
- **Lính địch:** sửa `BOT_GLB_CONFIG` ở đầu `js/Enemy.js` — `yaw` (hướng mặt), `segments` (các đoạn giây trong animation 95s dùng làm đi bộ / ngắm / chết), `aimYawOffset`, `colors`.
- Thêm `?fallback` vào URL (vd. `http://localhost:3000/?fallback`) để bỏ qua mọi file .glb và dùng model tự tạo.

## Ngôi nhà giữa map

- `js/House.js` — đặt nhà ở tâm map (`HOUSE_CONFIG`: `scale` 30 = 1 tầng cao 3m, `yaw`, `center`).
- **Va chạm theo tam giác của model:** tường/lan can chặn người và đạn, sàn và cầu thang đứng/đi lên được (bước cao tối đa 0.5m), đụng đầu khi nhảy dưới trần. Kính cho đạn và tầm nhìn đi xuyên qua.
- **Lính leo cầu thang:** lưới đường đi (nav grid 0.3m) tự dựng từ hình khối nhà lúc tải, lính tìm đường bằng A* khi bạn ở tầng khác hoặc trong khu nhà. Các tầng: đất · 3m · 6m · sàn mở 8.85m. Mái trên cùng (11.8m) không có lối lên.
- Thùng Armory dời ra trước nhà `(0, -9.5)` (`CRATE_POS` trong `js/Arena.js`), người chơi xuất phát ở `(0, -13)`.
- Thêm `?nohouse` vào URL để chơi bãi trống như cũ.
- Thư mục `models/house/` (file gốc 110MB) game không đọc tới — giữ làm bản gốc.

## Ghi công (bắt buộc theo giấy phép)

- Model lính: **“Cs2 Terrorist” by Toast** — Sketchfab, giấy phép **CC BY 4.0** (phải ghi tên tác giả). Đây là nhân vật của Counter-Strike 2 (Valve): dùng cho dự án cá nhân thì ổn, nếu phát hành/bán game nên thay bằng model khác.
- Animation lính: Adobe Mixamo (miễn phí, được dùng trong game).
- Nhà giữa map: **“Tower House Design” by 3DHaupt** — Sketchfab, giấy phép **CC BY-NC 4.0**: phải ghi tên tác giả và **không dùng vào mục đích thương mại** (không bán game / kiếm tiền từ nó).
- Dòng ghi công này cũng hiện ở màn hình menu.

`terrorist.glb` được gộp từ 14 file `.fbx` trong `models/Terrorist 3d/` (nhân vật + texture lấy từ `cs2_terrorist.glb`, bỏ 3 bản nhân vật trùng, khóa chuyển động tại chỗ cho các animation di chuyển). Thư mục `Terrorist 3d` (~150MB) game không đọc tới — giữ làm bản gốc hoặc xóa đều được.

## Cấu trúc code

```
index.html          HUD, menu, Armory, import map Three.js
style.css           giao diện HUD kiểu MW3
js/main.js          khởi tạo renderer/scene, tải asset, input, vòng lặp game, trạng thái
js/Player.js        điều khiển FPS: PointerLockControls, di chuyển, nhảy, ngồi, sprint, head bob, máu/giáp
js/Weapon.js        viewmodel (scene riêng, không xuyên tường), ADS, bắn, giật, nạp đạn, tracer, muzzle flash
js/Enemy.js         AI lính: săn đuổi + né vật cản, tấn công theo loạt 3–5 viên, headshot x2, chết
js/WaveManager.js   tiến trình wave, đếm ngược 15s, spawn, rơi hộp đạn
js/AudioManager.js  Web Audio: file âm thanh + âm thanh 3D + âm thanh tổng hợp dự phòng
js/UIManager.js     HUD, crosshair, hitmarker, popup tiêu diệt, chỉ báo hướng trúng đạn, Armory
js/Arena.js         bản đồ 100x100m, 12 khối che chắn, bao cát, va chạm
js/House.js         nhà giữa map: va chạm theo tam giác, sàn nhiều tầng, lưới đường đi + A* cho lính
js/Effects.js       hạt máu/bụi/tia lửa, tracer, lỗ đạn, đèn chớp nòng
```

Trong console trình duyệt có biến `window.game` để debug (vd. `game.cash = 99999`).

## Highway Bridge // Endless Defense
Map được dựng bằng code trong `js/Bridge.js` (mặt cầu, xe hỏng, đèn, tháp, cáp) và `Arena.buildBridge()` (Sector A/B, điểm xuất hiện). Chế độ endless nằm trong `WaveManager` (`_updateEndless`, `endlessConfig`). Các loại địch mới (`bomber`, `sniper`, `jugg`) và AI núp sau xe nằm trong `Enemy.js`.

## Map mới: HIGHWAY BRIDGE (ENDLESS) — thủ cầu ban đêm
Chọn **HIGHWAY BRIDGE (ENDLESS)** ở mục SELECT MAP rồi bấm DEPLOY.
- Cầu treo dài **220 m** (Z −100 → +120), rộng 15 m, 4 làn xe. Ban đêm nhưng **nhìn rõ địch tới 100–150 m**: cột đèn pha mỗi 18 m hai bên cầu chiếu nón sáng xuống mặt đường, ánh sáng nền xanh xám nên bóng tối không bao giờ đen kịt, sương mù mỏng hơn trước. Mặt đường ướt phản chiếu đèn. Hai bên có dải phân cách bê tông Jersey 1.2 m + lan can thép, không rơi xuống vực được.
- **Đèn pin gắn súng**: tự bật trên cầu, bấm **[L]** để tắt/bật.
- **Sector A** (phía Nam, Z −90…−95, chỗ bạn đứng): công sự bao cát, khối bê tông, và thùng ARMORY ngay cạnh bạn — bấm [E] mua đạn, giáp, lựu đạn, súng mà không cần rời chỗ núp.
- **Sector B** (phía Bắc, cuối cầu trong sương mù): địch xuất hiện liên tục ở đây rồi lao về phía bạn. Về sau có tên còn chui ra từ sau các xe tải ở xa (chỗ bạn không nhìn thấy).
- **34 xe hỏng chi tiết cao** chia thành các vụ tai nạn và đoạn kẹt xe: sedan, SUV, xe cảnh sát (đèn nháy đỏ/xanh), xe tải giao hàng thùng kín, bán tải, đầu kéo + rơ-moóc 13.6 m, container rơi, xác xe cháy bốc khói. Xe có thân bo tròn, hốc bánh, lốp cao su + mâm kim loại, cản trước/sau, gương, kính màu nhìn thấy ghế bên trong. Cả bạn và địch đều núp sau xe được.
- **Không có thời gian nghỉ, địch tăng dần theo thời gian HOẶC số mạng** (cái nào tới trước):
  - **Đầu trận** (0–30 giây / 0–20 mạng): 8–10 tên trên cầu, cứ ~1.5 giây có 1 tên thay thế. Súng lục hoặc AK.
  - **Giữa trận** (1–2 phút / 20–60 mạng): 12–15 tên, ~0.8 giây 1 tên. Chạy nhanh hơn, mặc giáp, UMP45/M4A1, bắn áp chế.
  - **RAMPAGE** (từ 2 phút / 60 mạng): 18–20 tên cùng lúc, ~0.4 giây 1 tên — tràn lên như bầy. Chạy nước rút, đánh vòng qua các làn xe, ép sát Sector A. Thêm **lính đánh bom liều chết**, **bắn tỉa** (tia laser đỏ) và **Juggernaut**.
- HUD: ENDLESS HIGHWAY DEFENSE · KILLS · ACTIVE HOSTILES · SURVIVED (phút:giây), kèm KILLSTREAK và mức đe dọa. Màn thua hiện thời gian sống, kỷ lục và chuỗi giết dài nhất.
- **Nổ mới, dựng hoàn toàn bằng code** (không còn dùng explosion.glb): quả cầu lửa vàng → cam → khói đen trong 0.35 s, vòng sóng xung kích lan trên mặt cầu, 30–45 tia lửa kim loại nảy trên mặt đường, khói bốc lên tan trong ~1.2 s, chớp sáng cam chiếu lên xe xung quanh. Nổ gần thì màn hình giật mạnh, càng xa càng nhẹ.
- Kho đồ trên cầu là **kho "sống"**: mở [E] thì trận đánh vẫn tiếp tục. Đứng gần thùng bấm **[T]** để nạp đạn nhanh ($250) mà không cần mở menu.

## Đồ họa: LOW / MEDIUM / ULTRA
Nút **Graphics** nằm trong menu chính và menu tạm dừng. Nút này chỉnh độ phân giải, độ nét bóng đổ, số đèn thật (đèn đường, đèn cảnh sát, lửa) và số hạt hiệu ứng. Máy yếu thì chọn LOW, máy mạnh chọn ULTRA.
