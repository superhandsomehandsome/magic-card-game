"""Reusable Streamlit UI components — Hearthstone board layout."""
import streamlit as st
from game_state import (
    CARD_CONFIG, SCOREPAD_CONFIG, PHASE_NAMES, WIN_SCORE,
    total_score, slots_left, opp,
)
from game_logic import sort_hand, bv
from styles import (
    card_html, cards_row_html, scorepad_chips_html,
    player_bar_html, theme_css,
)


def _bvs(cards):
    return [CARD_CONFIG[c]['base_value'] for c in cards]


# ── Card Selector ──────────────────────────────────────

def card_selector(hand, key, multi=False, filter_fn=None):
    """Clickable card selector. Returns selected index (single) or set of indices (multi).
    filter_fn(card) → bool controls which cards are eligible.
    """
    ss = st.session_state
    sk = f"_cs_{key}"
    if sk not in ss:
        ss[sk] = set() if multi else None

    if not hand:
        return ss[sk]

    sel = ss[sk]
    n = len(hand)
    cols = st.columns(min(n, 8))

    for i in range(n):
        card = hand[i]
        bval = CARD_CONFIG[card]['base_value']
        ok = filter_fn is None or filter_fn(card)

        if multi:
            is_sel = i in sel
        else:
            is_sel = (sel == i)

        with cols[i % 8]:
            cls = "cd-raised" if is_sel else ("cd-dim" if not ok else "")
            h = card_html(card, bval)
            if cls:
                st.markdown(f'<div class="{cls}" style="text-align:center">{h}</div>',
                            unsafe_allow_html=True)
            else:
                st.markdown(f'<div style="text-align:center">{h}</div>',
                            unsafe_allow_html=True)

            if ok:
                def _click(idx=i):
                    if multi:
                        s = ss[sk]
                        if idx in s:
                            s.discard(idx)
                        else:
                            s.add(idx)
                    else:
                        ss[sk] = None if ss[sk] == idx else idx

                label = "✓" if is_sel else "选"
                st.button(label, key=f"{key}_b{i}", on_click=_click,
                          use_container_width=True)

    return sel


def clear_card_selection(key):
    sk = f"_cs_{key}"
    if sk in st.session_state:
        del st.session_state[sk]


# ── Scorepad Grid ──────────────────────────────────────

def render_scorepad_grid(scorepad, playable_combos=None):
    """Render a Yahtzee-style scoring grid as HTML table.
    playable_combos: list of (key, name, cards, score) from detect_playable.
    """
    playable_map = {}
    if playable_combos:
        for key, name, cards, score in playable_combos:
            playable_map[key] = (cards, score)

    tier_cls = {1: 'sp-t1', 2: 'sp-t2', 3: 'sp-t3'}
    rows = []
    for cfg in SCOREPAD_CONFIG:
        info = scorepad[cfg['key']]
        filled = info['scores']
        sealed = info['sealed']
        avail = info['max_slots'] - len(filled) - sealed

        slot_parts = []
        for s in filled:
            slot_parts.append(f'<span class="sp-filled">{s}分</span>')
        for _ in range(sealed):
            slot_parts.append('<span style="color:#ef5350">🔒</span>')
        for _ in range(avail):
            slot_parts.append('☐')
        slot_html = ' '.join(slot_parts)

        is_avail = cfg['key'] in playable_map
        tr_cls = ' class="sp-avail"' if is_avail else ''

        preview = ''
        if is_avail:
            cards, score = playable_map[cfg['key']]
            card_str = '+'.join(cards)
            preview = f'<span class="sp-score-preview">{card_str} → {score}分</span>'

        short_name = cfg['name']
        rows.append(
            f'<tr{tr_cls}>'
            f'<td>{short_name}</td>'
            f'<td>{slot_html}</td>'
            f'<td>{preview}</td>'
            f'</tr>'
        )

    html = (
        '<table class="sp-grid">'
        '<tr><th>组合</th><th>格子</th><th>当前可达成</th></tr>'
        + ''.join(rows) +
        '</table>'
    )
    st.markdown(html, unsafe_allow_html=True)


# ── Board Zones ────────────────────────────────────────

def render_board_top(ss):
    opp_idx = opp(ss.current_player)
    opp_p = ss.players[opp_idx]

    st.markdown(
        f'<div class="player-zone opp">'
        f'{player_bar_html(opp_p, is_active=False, is_current=False)}'
        f'</div>', unsafe_allow_html=True)

    if opp_p['hand']:
        st.markdown(
            cards_row_html(opp_p['hand'], _bvs(opp_p['hand']),
                           face_down=True, small=True),
            unsafe_allow_html=True)


def render_board_bottom(ss):
    me = ss.players[ss.current_player]

    if me['hand']:
        sorted_h = sort_hand(me['hand'])
        st.markdown(cards_row_html(sorted_h, _bvs(sorted_h)), unsafe_allow_html=True)

    st.markdown(
        f'<div class="player-zone me">'
        f'{player_bar_html(me, is_active=True, is_current=True)}'
        f'</div>', unsafe_allow_html=True)


def render_center_info(ss):
    disc_count = len(ss.discard_pile)
    deck_count = len(ss.deck)
    st.markdown(
        f'<div class="deck-info">'
        f'牌库 <span class="deck-count">{deck_count}</span> 张'
        f' &nbsp;|&nbsp; 弃牌堆 {disc_count} 张'
        f' &nbsp;|&nbsp; 第 {ss.turn_number} 回合'
        f'</div>', unsafe_allow_html=True)


def render_phase_header(ss):
    p = ss.players[ss.current_player]
    name = PHASE_NAMES.get(ss.phase, str(ss.phase))
    st.markdown(
        f'<div class="phase-bar"><b>{p["name"]}</b> 的回合 &nbsp;—&nbsp; {name}</div>',
        unsafe_allow_html=True)


def render_hand(hand, title="你的手牌"):
    sorted_h = sort_hand(hand)
    st.markdown(f"**{title}** ({len(sorted_h)} 张)")
    st.markdown(cards_row_html(sorted_h, _bvs(sorted_h)), unsafe_allow_html=True)


def render_mask(ss):
    target = ss.players[ss.mask_target]
    st.markdown(
        f'<div class="mask-box">'
        f'<h2>🔮 请将设备交给</h2>'
        f'<h1>{target["name"]}</h1>'
        f'<p>请确保对方已离开视线后点击下方按钮</p>'
        f'</div>', unsafe_allow_html=True)

    def _confirm():
        ss.phase = ss.after_mask_phase

    st.button(f"我是「{target['name']}」，确认身份", on_click=_confirm,
              use_container_width=True)


def render_main_menu():
    st.markdown(
        '<div class="menu-wrap">'
        '<h1>秘术对决</h1>'
        '<p class="sub">— 禁忌魔典 —</p>'
        '</div>', unsafe_allow_html=True)


def render_duel(atk, dfn, atk_name, dfn_name):
    h1 = card_html(atk, CARD_CONFIG[atk]['base_value'])
    h2 = card_html(dfn, CARD_CONFIG[dfn]['base_value'])
    st.markdown(
        f'<div class="duel-area">'
        f'<div style="text-align:center"><div style="color:#d4c5a9;margin-bottom:6px">{atk_name}</div>{h1}</div>'
        f'<span class="duel-vs">⚔</span>'
        f'<div style="text-align:center"><div style="color:#d4c5a9;margin-bottom:6px">{dfn_name}</div>{h2}</div>'
        f'</div>', unsafe_allow_html=True)


def render_log(log):
    if not log:
        return
    with st.expander("📜 本回合记录"):
        for entry in log:
            st.caption(entry)


# ── Collision Face-Down Cards ──────────────────────────

def render_collision_row(cards, flipped_set, label):
    """Render a row of collision cards. Flipped ones face up, rest face down."""
    parts = []
    for i, card in enumerate(cards):
        if i in flipped_set:
            parts.append(card_html(card, CARD_CONFIG[card]['base_value']))
        else:
            parts.append(card_html('F', 0, face_down=True))
    st.markdown(f"**{label}**", unsafe_allow_html=False)
    st.markdown(f'<div class="cards-row">{"".join(parts)}</div>', unsafe_allow_html=True)
