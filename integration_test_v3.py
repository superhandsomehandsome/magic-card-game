"""V3.0 integration smoke test: simulate a full AI-vs-AI game using real GameRoom + ai_player.
Both sides driven by ai_player (with AI_IDX swap for P0).
"""
import sys
import traceback
import ai_player
from game_room import GameRoom


class AIDriver:
    """Drive both players through ai_player. Need to temporarily swap AI_IDX for each side."""
    def __init__(self, room):
        self.room = room
        self.turns_processed = 0

    def step(self):
        """Take one action. Return True if game still running, False if done."""
        r = self.room
        if r.phase in ('LOBBY', 'GAME_OVER'):
            return False

        # Determine who should act
        actor = -1
        if r.phase in ('DRAW', 'AMBUSH_DECIDE', 'AMBUSH_PAY_COST',
                       'AMBUSH_ATK_SELECT', 'SPELL', 'END_DISCARD'):
            actor = r.current_player
        elif r.phase == 'AMBUSH_DEF_CHOICE':
            actor = 1 - r.current_player
        elif r.phase == 'COLLISION_PRE_DISCARD':
            for i in (0, 1):
                if not r.col_pre_discard_done[i]:
                    actor = i; break
        elif r.phase == 'COLLISION_BET':
            if r.col_bet_phase == 'CALLER':
                actor = r.col_bet_caller
            else:
                actor = 1 - r.col_bet_caller
        elif r.phase == 'COLLISION_FLIP':
            actor = r._col_waiting_for()

        if actor < 0:
            print(f'[ERR] No actor for phase {r.phase}')
            return False

        # Temporarily set AI_IDX so ai_player.decide gives correct output
        orig_ai_idx = ai_player.AI_IDX
        ai_player.AI_IDX = actor
        try:
            decision = ai_player.decide(r)
        finally:
            ai_player.AI_IDX = orig_ai_idx

        if decision is None:
            print(f'[ERR] AI returned None for phase {r.phase} actor={actor}')
            return False

        action, data = decision
        sid = None
        for s, idx in r.sids.items():
            if idx == actor:
                sid = s; break
        ok, err = r.handle_action(sid, action, data)
        if not ok:
            print(f'[ERR] action {action} failed: {err}')
            return False
        return True


def run_one_game(seed=None, verbose=False):
    import random
    if seed is not None:
        random.seed(seed)
    r = GameRoom('TEST')
    r.join('P0_SID', 'Alice')
    r.join('P1_SID', 'Bob')

    driver = AIDriver(r)
    step_count = 0
    max_steps = 3000
    while step_count < max_steps:
        if r.phase == 'GAME_OVER':
            break
        ok = driver.step()
        if not ok:
            return {'error': True, 'phase': r.phase, 'turn': r.turn_number}
        step_count += 1

    if r.phase != 'GAME_OVER':
        return {'error': True, 'stuck': True, 'phase': r.phase, 'turn': r.turn_number, 'steps': step_count}

    def total(p):
        return p['score'] + sum(sum(c['scores']) for c in p['scorepad'].values())
    return {
        'winner': r.winner,
        'turns': r.turn_number,
        'steps': step_count,
        'p0_score': total(r.players[0]),
        'p1_score': total(r.players[1]),
        'deck_left': len(r.deck),
    }


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    p0_wins = 0
    p1_wins = 0
    errors = 0
    tie = 0
    total_turns = 0
    total_steps = 0

    for i in range(n):
        try:
            res = run_one_game(seed=i)
            if res.get('error'):
                errors += 1
                print(f'[{i}] ERROR: {res}')
                continue
            if res['winner'] == 0:
                p0_wins += 1
            elif res['winner'] == 1:
                p1_wins += 1
            else:
                tie += 1
            total_turns += res['turns']
            total_steps += res['steps']
        except Exception as e:
            errors += 1
            print(f'[{i}] EXCEPTION: {e}')
            traceback.print_exc()

    print(f'\n=== V3.0 Integration Test · {n} games ===')
    print(f'P0 wins: {p0_wins} ({p0_wins*100/n:.1f}%)')
    print(f'P1 wins: {p1_wins} ({p1_wins*100/n:.1f}%)')
    print(f'Ties: {tie}')
    print(f'Errors: {errors}')
    if n - errors > 0:
        print(f'Avg turns: {total_turns/(n-errors):.1f}')
        print(f'Avg steps: {total_steps/(n-errors):.1f}')
    print(f'Completion rate: {(n-errors)*100/n:.1f}%')
    return errors


if __name__ == '__main__':
    sys.exit(main())
