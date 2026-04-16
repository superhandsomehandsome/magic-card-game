"""Core game logic — pure functions, zero Streamlit dependency."""
import random
from game_state import CARD_CONFIG, HAND_LIMIT


def create_deck():
    deck = []
    for card, cfg in CARD_CONFIG.items():
        deck.extend([card] * cfg['count'])
    random.shuffle(deck)
    return deck


def sort_hand(hand):
    return sorted(hand, key=lambda c: CARD_CONFIG[c]['rank'])


def bv(card):
    """Base value of a card."""
    return CARD_CONFIG[card]['base_value']


def draw_cards(deck, count):
    """Draw up to *count* cards from deck. Mutates deck. Returns drawn list."""
    drawn = []
    for _ in range(count):
        if not deck:
            break
        drawn.append(deck.pop())
    return drawn


def compare_duel(atk, dfn):
    """Duel comparison.  1 = attacker wins, -1 = defender wins, 0 = tie.
    F always beats A (弑神). Defender playing 瞬 forces tie."""
    if dfn == '瞬':
        return 0
    if atk == dfn:
        return 0
    if atk == 'F' and dfn == 'A':
        return 1
    if atk == 'A' and dfn == 'F':
        return -1
    return 1 if CARD_CONFIG[atk]['rank'] < CARD_CONFIG[dfn]['rank'] else -1


def scavengeable_indices(discard_pile):
    """Return indices of D / E / F cards in the discard pile."""
    return [i for i, c in enumerate(discard_pile) if c in ('D', 'E', 'F')]


def hand_overflow(hand):
    return max(0, len(hand) - HAND_LIMIT)
