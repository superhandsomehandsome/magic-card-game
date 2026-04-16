"""秘术对决：禁忌魔典 — Streamlit main app (Hearthstone board layout)."""
import random
import streamlit as st

from game_state import (
    GamePhase, CARD_CONFIG, SCOREPAD_CONFIG, HAND_LIMIT, WIN_SCORE,
    INITIAL_HAND_P0, INITIAL_HAND_P1, SCAVENGE_LIMIT, SEAL_LIMIT,
    INSTANT_PER_TURN,
    init_game, reset_turn, total_score, total_sealed, slots_left,
    has_open_slot, has_empty_unseal, opp,
)
from game_logic import (
    create_deck, sort_hand, bv, draw_cards, compare_duel,
    scavengeable_indices, hand_overflow,
)
from scoring import find_combos, apply_modifiers, detect_playable
from collision import init as col_init, next_round as col_next, final_winner, compare as col_compare
from styles import PAGE_CFG, theme_css, card_html, cards_row_html
from ui_components import (
    render_board_top, render_board_bottom, render_center_info,
    render_phase_header, render_hand, render_mask,
    render_main_menu, render_duel, render_log, _bvs,
    card_selector, clear_card_selection, render_scorepad_grid,
    render_collision_row,
)

SCAVENGE_TURN_WINDOW = 10

# ═══════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════

def _go(phase):
    st.session_state.phase = phase

def _mask_to(player, then):
    ss = st.session_state
    ss.mask_target = player
    ss.after_mask_phase = then
    ss.phase = GamePhase.PLAYER_MASK

def _discard_cards(ss, cards):
    """Add cards to discard pile with turn tracking."""
    for c in cards:
        ss.discard_pile.append(c)
        ss.discard_turns.append(ss.turn_number)

def _flush_duel_discard(ss):
    pending = getattr(ss, 'duel_pending_discard', [])
    if pending:
        _discard_cards(ss, pending)
        ss.duel_pending_discard = []

def _finish_turn(ss):
    p = ss.players[ss.current_player]
    if total_score(p) >= WIN_SCORE:
        ss.winner = ss.current_player
        _go(GamePhase.GAME_OVER)
        return
    if ss.deck_empty_flag:
        _go(GamePhase.COLLISION_SETUP)
        return
    nxt = opp(ss.current_player)
    ss.current_player = nxt
    ss.turn_number += 1
    reset_turn(ss)
    _mask_to(nxt, GamePhase.DRAW)

def _board(ss, arena_fn):
    render_board_top(ss)
    render_center_info(ss)
    render_phase_header(ss)
    arena_fn()
    render_board_bottom(ss)

# ═══════════════════════════════════════════════════════════
#  Phase handlers
# ═══════════════════════════════════════════════════════════

def _h_menu(ss):
    render_main_menu()
    c1, c2, c3 = st.columns([1,2,1])
    with c2:
        if st.button("⚔  开始对决  ⚔", use_container_width=True):
            init_game(ss)
            ss.deck = create_deck()
            ss.players[0]['hand'] = sort_hand(draw_cards(ss.deck, INITIAL_HAND_P0))
            ss.players[1]['hand'] = sort_hand(draw_cards(ss.deck, INITIAL_HAND_P1))
            _mask_to(0, GamePhase.DRAW)
            st.rerun()


def _h_mask(ss):
    render_mask(ss)


# ── Draw ───────────────────────────────────────────────
def _h_draw(ss):
    p = ss.players[ss.current_player]
    if not ss.draw_done:
        ss.draw_was_overdraft = p['overdraft']
        cnt = 1 if p['overdraft'] else 2
        drawn = draw_cards(ss.deck, cnt)
        p['hand'].extend(drawn)
        p['hand'] = sort_hand(p['hand'])
        ss.drawn_cards = drawn
        p['overdraft'] = False
        ss.draw_done = True
        if not ss.deck:
            ss.deck_empty_flag = True

    def arena():
        st.markdown("### 壹 · 汲取阶段")
        if ss.draw_was_overdraft:
            st.warning("⚡ 透支状态 — 本回合仅抽 1 张")
        st.success(f"抽到 {len(ss.drawn_cards)} 张牌")
        st.markdown(cards_row_html(ss.drawn_cards, _bvs(ss.drawn_cards)),
                    unsafe_allow_html=True)
        if ss.deck_empty_flag:
            st.error("⚠ 牌库已空！本回合结束后将进入【魔力对撞】")
        st.button("进入突袭阶段 →", on_click=lambda: _go(GamePhase.AMBUSH_DECISION))

    _board(ss, arena)


# ── Ambush Decision ────────────────────────────────────
def _h_ambush_decision(ss):
    p = ss.players[ss.current_player]

    def arena():
        st.markdown("### 贰 · 突袭阶段")
        duel_cards = [c for c in p['hand'] if c != '瞬']
        if not duel_cards:
            st.info("手中没有可拼点的牌，自动跳过突袭")
            st.button("进入咏唱阶段 →", on_click=lambda: _go(GamePhase.SPELL))
            return
        c1, c2 = st.columns(2)
        with c1:
            st.button("⚔ 发起拼点", on_click=lambda: _go(GamePhase.AMBUSH_ATTACKER_SELECT),
                      use_container_width=True)
        with c2:
            st.button("跳过 →", on_click=lambda: _go(GamePhase.SPELL),
                      use_container_width=True)

    _board(ss, arena)


# ── Ambush Attacker Select (card click) ────────────────
def _h_ambush_atk(ss):
    p = ss.players[ss.current_player]

    def arena():
        st.markdown("### 选择你的拼点牌")
        st.caption("点击一张牌选中，选中的牌会上浮")

        sel = card_selector(p['hand'], f"atk_{ss.turn_number}",
                            multi=False, filter_fn=lambda c: c != '瞬')

        if sel is not None:
            card = p['hand'][sel]
            st.markdown(f"已选: **{card}** ({bv(card)}分)")
            c1, c2 = st.columns(2)
            with c1:
                def _confirm():
                    card_out = p['hand'].pop(sel)
                    ss.atk_card = card_out
                    clear_card_selection(f"atk_{ss.turn_number}")
                    _mask_to(opp(ss.current_player), GamePhase.AMBUSH_DEFENDER_SELECT)
                st.button("确认出牌 🔒", on_click=_confirm, use_container_width=True)
            with c2:
                def _cancel():
                    clear_card_selection(f"atk_{ss.turn_number}")
                    _go(GamePhase.AMBUSH_DECISION)
                st.button("放弃突袭", on_click=_cancel, use_container_width=True)

    _board(ss, arena)


# ── Ambush Defender Select (card click) ────────────────
def _h_ambush_def(ss):
    d_idx = opp(ss.current_player)
    d = ss.players[d_idx]
    atk_p = ss.players[ss.current_player]

    def arena():
        st.markdown("### 你必须应战！选择防守牌")
        eligible = [c for c in d['hand'] if c != '瞬']

        if not eligible:
            st.warning("手中没有可拼点的牌 — 进攻方自动获胜（不触发圣物威压）")
            def _auto_lose():
                drawn = draw_cards(ss.deck, 1)
                atk_p['hand'].extend(drawn)
                atk_p['hand'] = sort_hand(atk_p['hand'])
                ss.duel_pending_discard = [ss.atk_card]
                if not ss.deck:
                    ss.deck_empty_flag = True
                ss.turn_log.append("防守方无可用拼点牌，进攻方自动获胜")
                ss.ambush_result = 1
                ss.reveal_done = True
                ss.ambush_godslayer = False
                can_scav = len(_scavengeable_recent(ss)) > 0
                if can_scav and d['scavenge_remaining'] > 0:
                    ss.scavenge_player = d_idx
                    _go(GamePhase.AMBUSH_SCAVENGE)
                else:
                    _flush_duel_discard(ss)
                    _mask_to(ss.current_player, GamePhase.SPELL)
            st.button("确认 →", on_click=_auto_lose)
            return

        st.caption("点击一张牌选中")
        sel = card_selector(d['hand'], f"def_{ss.turn_number}",
                            multi=False, filter_fn=lambda c: c != '瞬')

        if sel is not None:
            card = d['hand'][sel]
            st.markdown(f"已选: **{card}** ({bv(card)}分)")
            def _confirm():
                card_out = d['hand'].pop(sel)
                ss.def_card = card_out
                clear_card_selection(f"def_{ss.turn_number}")
                _go(GamePhase.AMBUSH_REVEAL)
            st.button("确认出牌 🔒", on_click=_confirm)

    arena()


# ── Ambush Reveal ──────────────────────────────────────
def _h_ambush_reveal(ss):
    atk_p = ss.players[ss.current_player]
    def_p = ss.players[opp(ss.current_player)]

    if not ss.reveal_done:
        result = compare_duel(ss.atk_card, ss.def_card)
        ss.ambush_result = result
        ss.ambush_godslayer = (ss.def_card == 'F' and ss.atk_card == 'A')

        if result == 1:
            drawn = draw_cards(ss.deck, 1)
            atk_p['hand'].extend(drawn)
            atk_p['hand'] = sort_hand(atk_p['hand'])
            ss.turn_log.append(f"进攻方胜出，抽 {len(drawn)} 张")
            if ss.atk_card == 'A':
                atk_p['score'] += 10
                ss.turn_log.append("【圣物威压】+10 分！")
        elif result == -1:
            drawn = draw_cards(ss.deck, 1)
            def_p['hand'].extend(drawn)
            def_p['hand'] = sort_hand(def_p['hand'])
            ss.turn_log.append(f"防守方胜出，抽 {len(drawn)} 张")
            if ss.def_card == 'A':
                def_p['score'] += 10
                ss.turn_log.append("【圣物威压】+10 分！")
            if ss.ambush_godslayer:
                def_p['breaker_marks'] += 1
                ss.turn_log.append("⚡【弑神】防守方获得破法者标记！")
        else:
            ss.turn_log.append("平局 — 无事发生")

        ss.duel_pending_discard = [ss.atk_card, ss.def_card]
        if not ss.deck:
            ss.deck_empty_flag = True
        ss.reveal_done = True

    def arena():
        st.markdown("### 拼点揭晓！")
        render_duel(ss.atk_card, ss.def_card, atk_p['name'], def_p['name'])

        r = ss.ambush_result
        if r == 1:
            st.success(f"🏆 {atk_p['name']} (进攻方) 获胜！")
        elif r == -1:
            st.success(f"🏆 {def_p['name']} (防守方) 获胜！")
            if ss.ambush_godslayer:
                st.warning("⚡ 弑神触发！防守方获得【破法者标记】")
        else:
            st.info("⚖ 平局 — 双方拼点牌均弃置")

        for entry in ss.turn_log:
            st.caption(entry)

        def _continue():
            atk_i = ss.current_player
            def_i = opp(atk_i)
            can_scav = len(_scavengeable_recent(ss)) > 0
            loser_i = def_i if r == 1 else (atk_i if r == -1 else None)
            if loser_i is not None and can_scav and ss.players[loser_i]['scavenge_remaining'] > 0:
                ss.scavenge_player = loser_i
                if loser_i == def_i:
                    _go(GamePhase.AMBUSH_SCAVENGE)
                else:
                    _mask_to(atk_i, GamePhase.AMBUSH_SCAVENGE)
            else:
                _flush_duel_discard(ss)
                _mask_to(atk_i, GamePhase.SPELL)

        st.button("继续 →", on_click=_continue)

    _board(ss, arena)


# ── Scavenge (recent 10 turns only) ───────────────────
def _scavengeable_recent(ss):
    """Return indices of D/E/F cards discarded in last 10 turns."""
    cutoff = max(1, ss.turn_number - SCAVENGE_TURN_WINDOW)
    indices = []
    for i, c in enumerate(ss.discard_pile):
        if c in ('D', 'E', 'F') and i < len(ss.discard_turns) and ss.discard_turns[i] >= cutoff:
            indices.append(i)
    return indices


def _h_scavenge(ss):
    sp = ss.players[ss.scavenge_player]
    remaining = sp['scavenge_remaining']

    def arena():
        st.markdown(f"### 【有限拾荒】— {sp['name']}")
        st.info(f"从近 {SCAVENGE_TURN_WINDOW} 回合的弃牌中挑选 1 张 D/E/F (剩余{remaining}次)")
        st.caption("刚拼点的牌要到下回合才会进入弃牌堆")

        def _skip_scav():
            _flush_duel_discard(ss)
            ss.turn_log.append(f"{sp['name']} 放弃拾荒")
            _mask_to(ss.current_player, GamePhase.SPELL)

        if remaining <= 0:
            st.warning("拾荒次数已用尽")
            st.button("继续 →", on_click=_skip_scav)
            return

        indices = _scavengeable_recent(ss)
        if not indices:
            st.warning("近期弃牌堆中没有 D/E/F")
            st.button("继续 →", on_click=_skip_scav)
            return

        labels = [f"#{i+1}: {ss.discard_pile[i]} ({bv(ss.discard_pile[i])}分)"
                  for i in indices]
        key = f"scav_{ss.turn_number}"
        choice = st.radio("选择一张", labels, key=key)
        chosen_disc_idx = indices[labels.index(choice)]

        def _pick():
            card = ss.discard_pile.pop(chosen_disc_idx)
            ss.discard_turns.pop(chosen_disc_idx)
            sp['hand'].append(card)
            sp['hand'] = sort_hand(sp['hand'])
            sp['scavenge_remaining'] -= 1
            ss.turn_log.append(f"{sp['name']} 拾荒: {card} (剩余{sp['scavenge_remaining']}次)")
            _flush_duel_discard(ss)
            _mask_to(ss.current_player, GamePhase.SPELL)

        c1, c2 = st.columns(2)
        with c1:
            st.button("拾取", on_click=_pick, use_container_width=True)
        with c2:
            st.button("跳过拾荒", on_click=_skip_scav, use_container_width=True,
                      key="btn_skip_scav")

    _board(ss, arena)


# ── Spell Phase (Yahtzee-style scoring) ────────────────
def _h_spell(ss):
    p = ss.players[ss.current_player]
    opp_p = ss.players[opp(ss.current_player)]

    def arena():
        st.markdown("### 叁 · 咏唱阶段")

        playable = detect_playable(
            p['hand'],
            lambda k: slots_left(p['scorepad'], k)
        )

        # ── Scorepad grid ──────────────────────
        render_scorepad_grid(p['scorepad'], playable)

        # ── Free actions ───────────────────────
        st.markdown("---")
        st.markdown("**🔓 自由行动**")

        # Breaker marks
        if p['breaker_marks'] > 0:
            opp_sealed = total_sealed(opp_p['scorepad'])
            with st.expander(f"🔮 使用破法者标记 (×{p['breaker_marks']})"):
                effects = ["① 减分诅咒: 对手下次计分 −10"]
                if opp_sealed < SEAL_LIMIT:
                    effects.append("② 封印空位: 永久封印对手计分板 1 格")
                else:
                    effects.append(f"② 封印空位 (已达上限{SEAL_LIMIT}格，不可选)")

                eff = st.radio("选择效果", effects,
                               key=f"brk_eff_{ss.turn_number}_{ss.instant_count}")

                if "减分" in eff:
                    def _curse():
                        opp_p['curse_active'] = True
                        p['breaker_marks'] -= 1
                        ss.turn_log.append("发动减分诅咒 — 对手下次计分 −10")
                    st.button("发动诅咒", on_click=_curse, key="btn_curse")
                elif opp_sealed < SEAL_LIMIT:
                    avail = [(cfg['key'], cfg['name'])
                             for cfg in SCOREPAD_CONFIG
                             if slots_left(opp_p['scorepad'], cfg['key']) > 0]
                    if avail:
                        seal_labels = [n for _,n in avail]
                        sel = st.selectbox("封印目标", seal_labels,
                                           key=f"seal_sel_{ss.turn_number}")
                        def _seal():
                            k = avail[seal_labels.index(sel)][0]
                            opp_p['scorepad'][k]['sealed'] += 1
                            p['breaker_marks'] -= 1
                            ss.turn_log.append(f"封印对手: {sel}")
                        st.button("执行封印", on_click=_seal, key="btn_seal")
                    else:
                        st.caption("对手没有可封印的空位")

        # Instant — click-to-select flow
        instant_indices = [i for i,c in enumerate(p['hand']) if c == '瞬']
        instant_used_this_turn = ss.instant_count >= INSTANT_PER_TURN
        if instant_indices and not instant_used_this_turn:
            with st.expander(f"⚡ 使用「瞬」(手中 {len(instant_indices)} 张)"):
                non_inst = [c for c in p['hand'] if c != '瞬']
                if non_inst:
                    st.caption("点击要弃掉重抽的牌（≥1张），然后确认")
                    sel = card_selector(p['hand'],
                                        f"inst_{ss.turn_number}_{ss.instant_count}",
                                        multi=True,
                                        filter_fn=lambda c: c != '瞬')
                    if sel and len(sel) > 0:
                        n_sel = len(sel)
                        st.markdown(f"将弃掉 **{n_sel}** 张牌并重抽")
                        c1, c2 = st.columns(2)
                        with c1:
                            def _use_instant():
                                inst_idx = instant_indices[0]
                                all_rm = sorted(sel | {inst_idx}, reverse=True)
                                for ri in all_rm:
                                    _discard_cards(ss, [p['hand'].pop(ri)])
                                n_draw = len(all_rm) - 1
                                drawn = draw_cards(ss.deck, n_draw)
                                p['hand'].extend(drawn)
                                p['hand'] = sort_hand(p['hand'])
                                p['overdraft'] = True
                                ss.echo_ready = True
                                ss.instant_count += 1
                                clear_card_selection(f"inst_{ss.turn_number}_{ss.instant_count - 1}")
                                if not ss.deck:
                                    ss.deck_empty_flag = True
                                ss.turn_log.append(f"使用「瞬」: 弃 {n_draw} 张, 抽 {len(drawn)} 张")
                            st.button("确认刷新 ⚡", on_click=_use_instant, key="btn_inst",
                                      use_container_width=True)
                        with c2:
                            def _cancel_instant():
                                clear_card_selection(f"inst_{ss.turn_number}_{ss.instant_count}")
                            st.button("取消", on_click=_cancel_instant, key="btn_inst_cancel",
                                      use_container_width=True)
                else:
                    st.caption("手中没有非「瞬」牌可弃")
        elif instant_indices and instant_used_this_turn:
            st.caption(f"⚡「瞬」本回合已使用 {INSTANT_PER_TURN} 次")

        # ── Terminal actions ───────────────────
        st.markdown("---")
        st.markdown("**🔒 终结行动**")

        if playable:
            st.markdown("##### 📜 可计分组合")
            for ci, (key, name, cards, base_score) in enumerate(playable):
                final = apply_modifiers(base_score, echo=ss.echo_ready, curse=p['curse_active'])
                card_str = ' + '.join(cards)
                detail = f"**{name}** ({card_str}) → **{final}分**"
                if ss.echo_ready:
                    detail += " *(含回响+10)*"
                if p['curse_active']:
                    detail += " *(含诅咒−10)*"

                col_desc, col_btn = st.columns([3, 1])
                with col_desc:
                    st.markdown(detail)
                with col_btn:
                    def _submit(k=key, n=name, c=cards, f=final):
                        for card in c:
                            idx = p['hand'].index(card)
                            p['hand'].pop(idx)
                            ss.played_this_turn.append(card)
                        p['scorepad'][k]['scores'].append(f)
                        if p['curse_active']:
                            p['curse_active'] = False
                        ss.turn_log.append(f"计分: {n} → {f}分")
                        _go(GamePhase.END)
                    st.button("计分", on_click=_submit,
                              key=f"sub_{ci}_{ss.turn_number}",
                              use_container_width=True)
        else:
            st.caption("当前手牌无法组成任何组合")

        st.markdown("---")
        col_sacr, col_skip = st.columns(2)
        with col_sacr:
            if has_empty_unseal(p['scorepad']):
                with st.expander("🩸 黑暗献祭"):
                    avail_slots = [(cfg['key'], cfg['name'])
                                   for cfg in SCOREPAD_CONFIG
                                   if slots_left(p['scorepad'], cfg['key']) > 0]
                    slot_labels = [n for _,n in avail_slots]
                    sl = st.selectbox("选择献祭的空位", slot_labels,
                                      key=f"sac_slot_{ss.turn_number}")
                    st.caption("选择要丢弃的手牌（可不选）")
                    disc_sel = card_selector(p['hand'],
                                             f"sac_disc_{ss.turn_number}",
                                             multi=True)
                    def _sacrifice():
                        k = avail_slots[slot_labels.index(sl)][0]
                        p['scorepad'][k]['scores'].append(0)
                        if disc_sel:
                            for ri in sorted(disc_sel, reverse=True):
                                _discard_cards(ss, [p['hand'].pop(ri)])
                        clear_card_selection(f"sac_disc_{ss.turn_number}")
                        ss.turn_log.append(f"黑暗献祭: {sl} → 0分, 弃 {len(disc_sel) if disc_sel else 0} 张")
                        _go(GamePhase.END)
                    st.button("执行献祭 🩸", on_click=_sacrifice, key="btn_sac")
        with col_skip:
            st.button("跳过咏唱 →", on_click=lambda: _go(GamePhase.END),
                      key="btn_skip_spell", use_container_width=True)

        render_log(ss.turn_log)

    _board(ss, arena)


# ── End Phase ──────────────────────────────────────────
def _h_end(ss):
    p = ss.players[ss.current_player]

    if ss.played_this_turn:
        _discard_cards(ss, ss.played_this_turn)
        ss.turn_log.append(f"牌入弃牌堆: {', '.join(ss.played_this_turn)}")
        ss.played_this_turn = []

    overflow = hand_overflow(p['hand'])
    if overflow > 0:
        _go(GamePhase.END_DISCARD)
        st.rerun()
        return

    def arena():
        st.markdown("### 肆 · 整理阶段")
        render_log(ss.turn_log)
        st.button("结束回合 ✓", on_click=lambda: _finish_turn(ss))

    _board(ss, arena)


# ── End Discard ────────────────────────────────────────
def _h_end_discard(ss):
    p = ss.players[ss.current_player]
    overflow = hand_overflow(p['hand'])

    def arena():
        st.markdown("### 肆 · 整理阶段 — 强制弃牌")
        st.warning(f"手牌超出上限 ({len(p['hand'])}/{HAND_LIMIT})！必须弃掉 **{overflow}** 张")
        st.caption("点击要弃掉的牌")
        sel = card_selector(p['hand'], f"end_disc_{ss.turn_number}", multi=True)
        n_sel = len(sel) if sel else 0
        if n_sel == overflow:
            def _discard():
                for ri in sorted(sel, reverse=True):
                    _discard_cards(ss, [p['hand'].pop(ri)])
                clear_card_selection(f"end_disc_{ss.turn_number}")
                ss.turn_log.append(f"弃牌: {overflow} 张")
                _finish_turn(ss)
            st.button("确认弃牌", on_click=_discard)
        elif n_sel > 0:
            st.info(f"已选 {n_sel} / {overflow} 张")

    _board(ss, arena)


# ── Collision Setup (random shuffle, no ordering) ──────
def _h_collision_setup(ss):
    def arena():
        st.markdown("### ⚡ 魔力对撞 — 终局决战")
        st.markdown("牌库已空！双方手牌将被系统随机打乱，反扣在桌上逐张翻开比拼！")
        for i, p in enumerate(ss.players):
            st.markdown(f"**{p['name']}** — 手牌 {len(p['hand'])} 张  |  当前总分 {total_score(p)}")

        def _start():
            p0_cards = list(ss.players[0]['hand'])
            p1_cards = list(ss.players[1]['hand'])
            random.shuffle(p0_cards)
            random.shuffle(p1_cards)
            ss.col_p0_cards = p0_cards
            ss.col_p1_cards = p1_cards
            ss.col_p0_flipped = set()
            ss.col_p1_flipped = set()
            ss.col_flipper = 0
            ss.col_round_pair = [None, None]
            ss.col_pot = 10
            ss.col_scores = [0, 0]
            ss.col_log = []
            ss.col_done = False
            _go(GamePhase.COLLISION_REVEAL)

        st.button("开始对撞 ⚡", on_click=_start, use_container_width=True)

    _board(ss, arena)


# ── Collision Reveal (face-down flip one at a time) ────
def _h_collision_reveal(ss):
    p0n = ss.players[0]['name']
    p1n = ss.players[1]['name']

    st.markdown("### ⚡ 魔力对撞")

    # Show past results
    for entry in ss.col_log:
        st.caption(entry)

    if ss.col_done:
        st.markdown("---")
        st.markdown("### 对撞结束！")
        for i, p in enumerate(ss.players):
            bonus = ss.col_scores[i]
            p['score'] += bonus
            st.markdown(f"**{p['name']}** 对撞得分: +{bonus}  |  总分: {total_score(p)}")

        t0 = total_score(ss.players[0])
        t1 = total_score(ss.players[1])
        w = final_winner(t0, t1, ss.col_p0_cards, ss.col_p1_cards)
        ss.winner = w if w >= 0 else -1

        st.button("查看最终结果", on_click=lambda: _go(GamePhase.GAME_OVER))
        return

    # Show card rows
    render_collision_row(ss.col_p0_cards, ss.col_p0_flipped, p0n)
    st.markdown(f'<div class="deck-info">底池: <span class="deck-count">{ss.col_pot}</span> 分</div>',
                unsafe_allow_html=True)
    render_collision_row(ss.col_p1_cards, ss.col_p1_flipped, p1n)

    # Current round pair status
    pair = ss.col_round_pair
    n0, n1 = len(ss.col_p0_cards), len(ss.col_p1_cards)
    all_p0_flipped = len(ss.col_p0_flipped) >= n0
    all_p1_flipped = len(ss.col_p1_flipped) >= n1

    if pair[0] is not None and pair[1] is not None:
        # Both flipped — resolve
        c0, c1 = pair
        h0 = card_html(c0, bv(c0))
        h1 = card_html(c1, bv(c1))
        st.markdown(f'<div class="duel-area">{h0}<span class="duel-vs">⚔</span>{h1}</div>',
                    unsafe_allow_html=True)

        def _resolve():
            cmp = col_compare(c0, c1)
            remaining_p0 = n0 - len(ss.col_p0_flipped)
            remaining_p1 = n1 - len(ss.col_p1_flipped)
            is_last = (remaining_p0 == 0 and remaining_p1 == 0)

            if cmp == 0:
                if is_last:
                    ss.col_log.append(f"💥 {c0} vs {c1}: 魔力过载！{ss.col_pot}分灰飞烟灭")
                    ss.col_pot = 0
                else:
                    ss.col_pot += 10
                    ss.col_log.append(f"⚖ {c0} vs {c1}: 平局，底池→{ss.col_pot}")
            elif cmp == 1:
                w = ss.col_pot
                ss.col_scores[0] += w
                ss.col_log.append(f"🏆 {c0} vs {c1}: {p0n}赢得{w}分")
                ss.col_pot = 10
            else:
                w = ss.col_pot
                ss.col_scores[1] += w
                ss.col_log.append(f"🏆 {c0} vs {c1}: {p1n}赢得{w}分")
                ss.col_pot = 10

            ss.col_round_pair = [None, None]
            ss.col_flipper = 0

            if remaining_p0 == 0 and remaining_p1 == 0:
                # Handle remaining cards for uneven hands
                ss.col_done = True
            elif remaining_p0 == 0 or remaining_p1 == 0:
                _resolve_crush(ss, p0n, p1n)

        st.button("结算本轮 →", on_click=_resolve)

    elif pair[0] is not None and pair[1] is None:
        # P0 flipped, waiting for P1
        st.info(f"等待 {p1n} 翻牌...")
        unflipped_p1 = [i for i in range(n1) if i not in ss.col_p1_flipped]
        if unflipped_p1:
            cols = st.columns(len(unflipped_p1))
            for ci, idx in enumerate(unflipped_p1):
                with cols[ci]:
                    st.markdown(card_html('F', 0, face_down=True), unsafe_allow_html=True)
                    def _flip1(i=idx):
                        ss.col_p1_flipped.add(i)
                        ss.col_round_pair[1] = ss.col_p1_cards[i]
                    st.button(f"翻", key=f"fp1_{idx}", on_click=_flip1,
                              use_container_width=True)

    elif pair[0] is None and pair[1] is not None:
        # P1 flipped, waiting for P0
        st.info(f"等待 {p0n} 翻牌...")
        unflipped_p0 = [i for i in range(n0) if i not in ss.col_p0_flipped]
        if unflipped_p0:
            cols = st.columns(len(unflipped_p0))
            for ci, idx in enumerate(unflipped_p0):
                with cols[ci]:
                    st.markdown(card_html('F', 0, face_down=True), unsafe_allow_html=True)
                    def _flip0(i=idx):
                        ss.col_p0_flipped.add(i)
                        ss.col_round_pair[0] = ss.col_p0_cards[i]
                    st.button(f"翻", key=f"fp0_{idx}", on_click=_flip0,
                              use_container_width=True)

    else:
        # Neither flipped — P0 goes first
        flipper = ss.col_flipper
        unflipped_p0 = [i for i in range(n0) if i not in ss.col_p0_flipped]
        unflipped_p1 = [i for i in range(n1) if i not in ss.col_p1_flipped]

        if not unflipped_p0 and unflipped_p1:
            _resolve_crush_auto(ss, p0n, p1n, 1, unflipped_p1)
            st.rerun()
            return
        elif unflipped_p0 and not unflipped_p1:
            _resolve_crush_auto(ss, p0n, p1n, 0, unflipped_p0)
            st.rerun()
            return
        elif not unflipped_p0 and not unflipped_p1:
            ss.col_done = True
            st.rerun()
            return

        st.info(f"{p0n} 请选择翻开一张你的暗牌")
        cols = st.columns(len(unflipped_p0))
        for ci, idx in enumerate(unflipped_p0):
            with cols[ci]:
                st.markdown(card_html('F', 0, face_down=True), unsafe_allow_html=True)
                def _flip0(i=idx):
                    ss.col_p0_flipped.add(i)
                    ss.col_round_pair[0] = ss.col_p0_cards[i]
                st.button(f"翻", key=f"fp0_{idx}", on_click=_flip0,
                          use_container_width=True)


def _resolve_crush(ss, p0n, p1n):
    """Handle remaining cards when one side runs out."""
    n0 = len(ss.col_p0_cards)
    n1 = len(ss.col_p1_cards)
    unflipped_p0 = [i for i in range(n0) if i not in ss.col_p0_flipped]
    unflipped_p1 = [i for i in range(n1) if i not in ss.col_p1_flipped]

    if unflipped_p0 and not unflipped_p1:
        for idx in unflipped_p0:
            w = ss.col_pot
            ss.col_scores[0] += w
            ss.col_log.append(f"🏆 空位碾压: {p0n}获得{w}分")
            ss.col_pot = 10
            ss.col_p0_flipped.add(idx)
        ss.col_done = True
    elif unflipped_p1 and not unflipped_p0:
        for idx in unflipped_p1:
            w = ss.col_pot
            ss.col_scores[1] += w
            ss.col_log.append(f"🏆 空位碾压: {p1n}获得{w}分")
            ss.col_pot = 10
            ss.col_p1_flipped.add(idx)
        ss.col_done = True


def _resolve_crush_auto(ss, p0n, p1n, winner, unflipped):
    """Auto-resolve remaining crush cards."""
    for idx in unflipped:
        w = ss.col_pot
        ss.col_scores[winner] += w
        name = p0n if winner == 0 else p1n
        ss.col_log.append(f"🏆 空位碾压: {name}获得{w}分")
        ss.col_pot = 10
        if winner == 0:
            ss.col_p0_flipped.add(idx)
        else:
            ss.col_p1_flipped.add(idx)
    ss.col_done = True


# ── Game Over ──────────────────────────────────────────
def _h_game_over(ss):
    st.markdown("---")
    if ss.winner >= 0:
        w = ss.players[ss.winner]
        st.markdown(f'<div class="score-big">🏆 {w["name"]} 获得最终胜利！</div>',
                    unsafe_allow_html=True)
    else:
        st.markdown('<div class="score-big">⚖ 绝对平局！</div>', unsafe_allow_html=True)

    st.markdown("### 最终战报")
    for p in ss.players:
        ts = total_score(p)
        st.markdown(f"**{p['name']}** — 总分 **{ts}**")

    def _restart():
        for k in list(st.session_state.keys()):
            del st.session_state[k]
    st.button("再来一局", on_click=_restart)


# ═══════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════
_HANDLERS = {
    GamePhase.MAIN_MENU:              _h_menu,
    GamePhase.PLAYER_MASK:            _h_mask,
    GamePhase.DRAW:                   _h_draw,
    GamePhase.AMBUSH_DECISION:        _h_ambush_decision,
    GamePhase.AMBUSH_ATTACKER_SELECT: _h_ambush_atk,
    GamePhase.AMBUSH_DEFENDER_SELECT: _h_ambush_def,
    GamePhase.AMBUSH_REVEAL:          _h_ambush_reveal,
    GamePhase.AMBUSH_SCAVENGE:        _h_scavenge,
    GamePhase.SPELL:                  _h_spell,
    GamePhase.END:                    _h_end,
    GamePhase.END_DISCARD:            _h_end_discard,
    GamePhase.COLLISION_SETUP:        _h_collision_setup,
    GamePhase.COLLISION_ORDER:        _h_collision_reveal,
    GamePhase.COLLISION_REVEAL:       _h_collision_reveal,
    GamePhase.GAME_OVER:              _h_game_over,
}

def main():
    st.set_page_config(**PAGE_CFG)
    st.markdown(theme_css(), unsafe_allow_html=True)
    ss = st.session_state

    if not ss.get('game_started', False):
        _h_menu(ss)
        return

    handler = _HANDLERS.get(ss.phase)
    if handler:
        handler(ss)
    else:
        st.error(f"未知阶段: {ss.phase}")


if __name__ == '__main__':
    main()
