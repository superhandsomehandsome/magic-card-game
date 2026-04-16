"""Dark Academia theme CSS and card HTML rendering — Hearthstone board layout."""
from game_state import WIN_SCORE

PAGE_CFG = dict(
    page_title="秘术对决：禁忌魔典",
    page_icon="🃏",
    layout="wide",
    initial_sidebar_state="collapsed",
)

_CARD_VIS = {
    'A': {'bg':'linear-gradient(135deg,#8B0000,#A52A2A,#8B0000)',
          'bd':'#DAA520','tx':'#FFD700','glow':'rgba(218,165,32,.4)',
          'sym':'♠','sub':'圣物'},
    'B': {'bg':'linear-gradient(135deg,#0D1B3E,#1a237e,#0D1B3E)',
          'bd':'#5C7AEA','tx':'#90CAF9','glow':'rgba(92,122,234,.3)',
          'sym':'♦','sub':'元素'},
    'C': {'bg':'linear-gradient(135deg,#0D2818,#1b5e20,#0D2818)',
          'bd':'#4CAF50','tx':'#A5D6A7','glow':'rgba(76,175,80,.3)',
          'sym':'♣','sub':'中坚'},
    'D': {'bg':'linear-gradient(135deg,#2C1A10,#4E342E,#2C1A10)',
          'bd':'#8D6E63','tx':'#BCAAA4','glow':'rgba(141,110,99,.3)',
          'sym':'◆','sub':'基础'},
    'E': {'bg':'linear-gradient(135deg,#1B2631,#2C3E50,#1B2631)',
          'bd':'#607D8B','tx':'#90A4AE','glow':'rgba(96,125,139,.3)',
          'sym':'○','sub':'低阶'},
    'F': {'bg':'linear-gradient(135deg,#1A1A1A,#333,#1A1A1A)',
          'bd':'#616161','tx':'#9E9E9E','glow':'rgba(97,97,97,.2)',
          'sym':'△','sub':'杂鱼'},
    '瞬':{'bg':'linear-gradient(135deg,#1A0033,#4a148c,#1A0033)',
          'bd':'#AB47BC','tx':'#CE93D8','glow':'rgba(171,71,188,.4)',
          'sym':'⚡','sub':'瞬'},
}


def theme_css():
    return """<style>
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Noto+Serif+SC:wght@400;700&display=swap');

/* ── Global ────────────────────────────── */
.stApp{background:linear-gradient(180deg,#1a1410,#0d0a07)}
.stApp header{background:transparent!important}
section[data-testid="stSidebar"]{display:none!important}
.block-container{padding-top:1rem!important;padding-bottom:1rem!important;max-width:1200px!important}
.stMarkdown,p,span,label,.stSelectbox label,.stMultiSelect label,.stRadio label{
  color:#d4c5a9!important;font-family:'Noto Serif SC',Georgia,serif!important}
h1,h2,h3{font-family:'Cinzel','Noto Serif SC',serif!important;
  color:#DAA520!important;text-shadow:0 0 10px rgba(218,165,32,.3)}
.stButton>button{background:linear-gradient(135deg,#2C1810,#4a2c17);
  color:#DAA520!important;border:1px solid #5a3a1a;
  font-family:'Noto Serif SC',serif;transition:all .3s}
.stButton>button:hover{border-color:#DAA520;box-shadow:0 0 15px rgba(218,165,32,.3)}
hr{border-color:#3a2a1a!important}

/* ── Board Layout ─────────────────────── */
.board{display:flex;flex-direction:column;min-height:85vh;gap:0}
.player-zone{padding:10px 16px;border-radius:10px;position:relative}
.player-zone.opp{background:linear-gradient(180deg,rgba(13,10,7,.95),rgba(26,20,16,.6));
  border-bottom:1px solid #3a2a1a}
.player-zone.me{background:linear-gradient(0deg,rgba(13,10,7,.95),rgba(26,20,16,.6));
  border-top:1px solid #3a2a1a}
.arena{flex:1;padding:16px;display:flex;flex-direction:column;justify-content:center;
  min-height:200px}

/* ── Player Bar ───────────────────────── */
.pbar{display:flex;align-items:center;gap:16px;padding:6px 0}
.pbar .avatar{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;
  justify-content:center;font-size:24px;border:2px solid #5a3a1a;flex-shrink:0}
.pbar .avatar.active{border-color:#DAA520;box-shadow:0 0 12px rgba(218,165,32,.4)}
.pbar .pname{font-family:'Cinzel','Noto Serif SC',serif;font-size:16px;font-weight:700;color:#DAA520}
.pbar .pstat{font-size:13px;color:#8a7a5a}
.pbar .pscore{font-family:'Cinzel',serif;font-size:22px;font-weight:900;color:#DAA520;
  text-shadow:0 0 8px rgba(218,165,32,.3);margin-left:auto;white-space:nowrap}

/* ── Scorepad Inline ──────────────────── */
.sp-inline{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0}
.sp-chip{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:4px;
  font-size:11px;color:#d4c5a9;border:1px solid rgba(90,58,26,.4)}
.sp-chip.t1{background:rgba(139,0,0,.15);border-color:rgba(139,0,0,.3)}
.sp-chip.t2{background:rgba(26,35,126,.15);border-color:rgba(26,35,126,.3)}
.sp-chip.t3{background:rgba(66,66,66,.15);border-color:rgba(66,66,66,.3)}
.sp-chip .sp-val{color:#DAA520;font-weight:bold}
.sp-chip .sp-lk{color:#ef5350;font-size:10px}

/* ── Cards ────────────────────────────── */
.cards-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;padding:8px 0}
.cd{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;
  width:68px;height:105px;border-radius:8px;border:2px solid;position:relative;flex-shrink:0;
  font-family:'Cinzel','Noto Serif SC',serif;transition:transform .2s}
.cd:hover{transform:translateY(-4px)}
.cd .lt{font-size:24px;font-weight:900;line-height:1}
.cd .st{font-size:9px;margin-top:2px;opacity:.8}
.cd .vl{position:absolute;bottom:4px;font-size:9px;opacity:.7}
.cd .sy{position:absolute;top:4px;right:6px;font-size:10px;opacity:.6}
.cd-sm{width:52px;height:80px}.cd-sm .lt{font-size:18px}.cd-sm .st{font-size:7px}
.cd-sm .vl{font-size:7px}.cd-sm .sy{font-size:8px}
.cd-back{background:linear-gradient(135deg,#2C1810,#1a0f08)!important;
  border-color:#5D4037!important;color:#5D4037!important}
.cd-back:hover{transform:none}
.cd-raised{transform:translateY(-12px)!important;
  filter:drop-shadow(0 4px 12px rgba(218,165,32,.5))}
.cd-dim{opacity:.35;pointer-events:none}

/* ── Scorepad Grid ────────────────────── */
.sp-grid{width:100%;border-collapse:collapse;margin:8px 0}
.sp-grid th{text-align:left;padding:4px 8px;color:#8a7a5a;font-size:12px;
  border-bottom:1px solid #3a2a1a;font-weight:normal}
.sp-grid td{padding:5px 8px;border-bottom:1px solid rgba(58,42,26,.3);font-size:13px;color:#d4c5a9}
.sp-grid tr.sp-avail{background:rgba(218,165,32,.06)}
.sp-grid tr.sp-avail td:first-child{color:#DAA520;font-weight:bold}
.sp-grid .sp-score-preview{color:#DAA520;font-weight:bold}
.sp-grid .sp-sealed-cell{color:#ef5350;text-decoration:line-through;opacity:.5}
.sp-grid .sp-filled{color:#4CAF50}

/* ── Mask ─────────────────────────────── */
.mask-box{text-align:center;padding:60px 20px;
  background:radial-gradient(ellipse,rgba(26,20,16,.95),rgba(13,10,7,.98));
  border:1px solid #3a2a1a;border-radius:12px;margin:40px auto;max-width:500px}
.mask-box h2{margin-bottom:8px}
.mask-box p{color:#8a7a5a;margin-bottom:30px}

/* ── Phase Bar ────────────────────────── */
.phase-bar{text-align:center;padding:8px 16px;border-radius:8px;
  background:rgba(218,165,32,.08);border:1px solid rgba(218,165,32,.2);margin:8px auto;
  max-width:700px}

/* ── Duel ─────────────────────────────── */
.duel-area{display:flex;justify-content:center;align-items:center;gap:36px;padding:20px}
.duel-vs{font-size:32px;color:#8B0000;font-family:'Cinzel',serif;
  text-shadow:0 0 20px rgba(139,0,0,.5)}

/* ── Center Deck ──────────────────────── */
.deck-info{text-align:center;padding:8px;font-size:12px;color:#8a7a5a}
.deck-info .deck-count{font-size:18px;font-weight:bold;color:#DAA520}

/* ── Menu ─────────────────────────────── */
.menu-wrap{text-align:center;padding:80px 20px}
.menu-wrap h1{font-size:38px;margin-bottom:4px}
.menu-wrap .sub{font-size:16px;color:#8a7a5a;margin-bottom:50px}
.score-big{font-size:28px;color:#DAA520;font-family:'Cinzel',serif;text-align:center;
  text-shadow:0 0 12px rgba(218,165,32,.4)}
</style>"""


def card_html(card, base_value, face_down=False, small=False):
    if face_down:
        cls = "cd cd-back" + (" cd-sm" if small else "")
        return f'<div class="{cls}"><span class="lt">🔮</span></div>'
    v = _CARD_VIS.get(card, _CARD_VIS['F'])
    cls = "cd" + (" cd-sm" if small else "")
    return (f'<div class="{cls}" style="background:{v["bg"]};border-color:{v["bd"]};color:{v["tx"]}">'
            f'<span class="sy">{v["sym"]}</span>'
            f'<span class="lt">{card}</span>'
            f'<span class="st">{v["sub"]}</span>'
            f'<span class="vl">{base_value}分</span></div>')


def cards_row_html(cards, base_values, face_down=False, small=False):
    inner = ''.join(card_html(c, bv, face_down, small) for c, bv in zip(cards, base_values))
    return f'<div class="cards-row">{inner}</div>'


def scorepad_chips_html(scorepad):
    """Compact inline scorepad chips."""
    from game_state import SCOREPAD_CONFIG
    tier_cls = {1: 't1', 2: 't2', 3: 't3'}
    parts = []
    for cfg in SCOREPAD_CONFIG:
        info = scorepad[cfg['key']]
        tc = tier_cls.get(info['tier'], 't3')
        slots = []
        for s in info['scores']:
            slots.append(f'<span class="sp-val">{s}</span>')
        for _ in range(info['sealed']):
            slots.append('<span class="sp-lk">🔒</span>')
        remaining = info['max_slots'] - len(info['scores']) - info['sealed']
        for _ in range(remaining):
            slots.append('☐')
        slot_str = ' '.join(slots)
        short_name = cfg['name'].split('(')[0].strip()
        parts.append(f'<span class="sp-chip {tc}">{short_name} {slot_str}</span>')
    return '<div class="sp-inline">' + ''.join(parts) + '</div>'


def player_bar_html(player, is_active, is_current):
    """Render a player info bar with avatar, name, score, scorepad."""
    from game_state import total_score
    ts = total_score(player)
    icon = "🧙" if "炼金" in player['name'] else "🔮"
    act_cls = " active" if is_active else ""
    marks = f" | 破法×{player['breaker_marks']}" if player['breaker_marks'] else ""
    scav = f" | 拾荒{player['scavenge_remaining']}"
    hand_info = f"手牌 {len(player['hand'])} 张{marks}{scav}"
    arrow = " 👈" if is_current else ""

    pad_html = scorepad_chips_html(player['scorepad'])
    return (
        f'<div class="pbar">'
        f'<div class="avatar{act_cls}">{icon}</div>'
        f'<div>'
        f'<div class="pname">{player["name"]}{arrow}</div>'
        f'<div class="pstat">{hand_info}</div>'
        f'{pad_html}'
        f'</div>'
        f'<div class="pscore">{ts} / {WIN_SCORE}</div>'
        f'</div>'
    )
