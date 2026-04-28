"""Build a fully self-contained offline HTML file (offline_standalone.html).
All CSS and JS are inlined. The file can be saved and opened via file:// — no
server needed. Requires Python only at build time.

Usage:
    python build_offline_bundle.py
    → produces static/offline_standalone.html
"""
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))


def read(path):
    with open(os.path.join(ROOT, path), 'r', encoding='utf-8') as f:
        return f.read()


def main():
    css = read('static/style.css')
    engine_js = read('static/offline-engine.js')
    game_js = read('static/game.js')
    shim_js = read('static/offline-shim.js')

    # Compose a self-contained HTML. We strip any external <link>/<script src> tags.
    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>秘术对决 · 离线版（独立文件）</title>
<style>
{css}
/* Hide BGM controls when running offline (file://) since audio likely blocked */
.bgm-control {{ display: none !important; }}
</style>
</head>
<body>

<div id="lobby" class="lobby">
  <h1>秘术对决 · 离线版</h1>
  <p class="subtitle">禁忌魔典 V5.0 · 独立单文件 · 直面『零』</p>
  <div class="lobby-box">
    <label>你的名字</label>
    <input id="playerName" placeholder="输入昵称..." maxlength="12" value="炼金术士">
    <button class="btn btn-ai" onclick="startOfflineGame()">开始对决 · 挑战「零」</button>
    <div class="or">── ──</div>
    <div style="font-size:.78rem;color:#6B5B3A;text-align:center;line-height:1.5;margin-top:6px">
      ⚡ 真·离线模式：本 HTML 文件包含全部代码与 AI。<br>
      可保存到本地，断网双击打开即可游玩。
    </div>
  </div>
</div>

<div id="gameBoard" class="board hidden">
  <div class="player-zone opp" id="oppZone"></div>
  <div class="arena" id="arenaZone"></div>
  <div class="player-zone me" id="myZone"></div>
</div>

<div id="gameOver" class="game-over hidden"></div>
<div id="toast" class="toast hidden"></div>

<!-- Hidden stubs required by game.js -->
<div id="waitingScreen" class="hidden"></div>
<audio id="bgm" loop></audio>
<div id="bgmControl" style="display:none">🔇</div>

<script>
{engine_js}
</script>
<script>
{game_js}
</script>
<script>
{shim_js}
</script>

</body>
</html>
"""

    out_path = os.path.join(ROOT, 'static', 'offline_standalone.html')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(html)

    size_kb = len(html) / 1024
    print(f'Built {out_path} ({size_kb:.1f} KB)')
    print(f'  CSS:    {len(css)/1024:.1f} KB')
    print(f'  Engine: {len(engine_js)/1024:.1f} KB')
    print(f'  Game:   {len(game_js)/1024:.1f} KB')
    print(f'  Shim:   {len(shim_js)/1024:.1f} KB')


if __name__ == '__main__':
    main()
