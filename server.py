"""Flask + Flask-SocketIO server for online 2-player game."""
import os, random, string, time, threading
from flask import Flask, render_template
from flask_socketio import SocketIO, emit, join_room, leave_room
from game_room import GameRoom

app = Flask(__name__)
app.config['SECRET_KEY'] = 'mysecret'
socketio = SocketIO(app, cors_allowed_origins='*')

TURN_TIME_LIMIT = 60
DISCONNECT_GRACE = 30

rooms = {}
turn_timers = {}
dc_timers = {}


def _gen_room_id():
    while True:
        rid = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        if rid not in rooms:
            return rid


def _broadcast(room_id):
    room = rooms.get(room_id)
    if not room:
        return
    _reset_turn_timer(room_id)
    for sid, pidx in room.sids.items():
        view = room.get_view(pidx)
        view['turn_deadline'] = room.turn_deadline
        socketio.emit('state', view, to=sid)


def _reset_turn_timer(room_id):
    room = rooms.get(room_id)
    if not room or room.phase in ('LOBBY', 'GAME_OVER'):
        room and setattr(room, 'turn_deadline', 0)
        return
    room.turn_deadline = time.time() + TURN_TIME_LIMIT
    if room_id in turn_timers:
        turn_timers[room_id].cancel()
    t = threading.Timer(TURN_TIME_LIMIT, _on_turn_timeout, args=[room_id])
    t.daemon = True
    t.start()
    turn_timers[room_id] = t


def _on_turn_timeout(room_id):
    room = rooms.get(room_id)
    if not room or room.phase in ('LOBBY', 'GAME_OVER'):
        return
    phase = room.phase
    cp = room.current_player
    if phase == 'DRAW':
        room.handle_action(_sid_for(room, cp), 'DRAW', {})
    elif phase == 'AMBUSH_DECIDE':
        room.handle_action(_sid_for(room, cp), 'AMBUSH_DECIDE', {'choice': 'skip'})
    elif phase == 'AMBUSH_ATK_SELECT':
        room.handle_action(_sid_for(room, cp), 'AMBUSH_CANCEL', {})
    elif phase == 'AMBUSH_DEF_SELECT':
        defender = 1 - cp
        sid_d = _sid_for(room, defender)
        hand = room.players[defender]['hand']
        eligible = [c for c in hand if c != '瞬']
        if eligible:
            card = max(eligible, key=lambda c: {'A':0,'B':1,'C':2,'D':3,'E':4,'F':5}.get(c, 5))
            room.handle_action(sid_d, 'AMBUSH_DEF_SELECT', {'card': card})
        elif '瞬' in hand:
            room.handle_action(sid_d, 'AMBUSH_DEF_SELECT', {'card': '瞬'})
    elif phase == 'AMBUSH_SCAVENGE':
        loser = 1 - room.duel_winner_idx if room.duel_winner_idx >= 0 else (1 - cp)
        room.handle_action(_sid_for(room, loser), 'SCAVENGE', {'choice': 'skip'})
    elif phase == 'SPELL':
        room.handle_action(_sid_for(room, cp), 'SPELL_SKIP', {})
    elif phase == 'END_DISCARD':
        p = room.players[cp]
        from game_logic import hand_overflow, CARD_CONFIG
        overflow = hand_overflow(p['hand'])
        if overflow > 0:
            worst = sorted(p['hand'], key=lambda c: CARD_CONFIG[c]['rank'], reverse=True)
            room.handle_action(_sid_for(room, cp), 'END_DISCARD', {'cards': worst[:overflow]})
    elif phase == 'COLLISION_PRE_DISCARD':
        for i in range(2):
            if not room.col_pre_discard_done[i]:
                room.handle_action(_sid_for(room, i), 'COLLISION_PRE_DISCARD', {'cards': []})
    elif phase == 'COLLISION_FLIP':
        wf = room._col_waiting_for()
        if wf >= 0:
            room.handle_action(_sid_for(room, wf), 'COLLISION_FLIP', {})
    _broadcast(room_id)


def _sid_for(room, pidx):
    for sid, idx in room.sids.items():
        if idx == pidx:
            return sid
    return None


@app.route('/')
def index():
    return render_template('index.html')


@socketio.on('connect')
def on_connect():
    emit('connected', {'msg': 'Connected to server'})


@socketio.on('disconnect')
def on_disconnect():
    from flask import request
    sid = request.sid
    for rid, room in list(rooms.items()):
        if sid in room.sids:
            pidx = room.sids[sid]
            pname = room.players[pidx]['name']
            room.leave(sid)
            if not room.sids:
                _cleanup_room(rid)
            elif room.phase not in ('LOBBY', 'GAME_OVER'):
                socketio.emit('opponent_away', {
                    'player': pidx, 'name': pname,
                    'grace': DISCONNECT_GRACE
                }, to=rid)
                t = threading.Timer(DISCONNECT_GRACE, _on_dc_timeout, args=[rid, pidx])
                t.daemon = True
                t.start()
                dc_timers[rid] = t
            break


def _on_dc_timeout(room_id, dc_pidx):
    room = rooms.get(room_id)
    if not room:
        return
    if dc_pidx not in [idx for idx in room.sids.values()]:
        room.winner = 1 - dc_pidx
        room.phase = 'GAME_OVER'
        room._log('game_over', f'{room.players[dc_pidx]["name"]} 断线超时，对手获胜')
        _broadcast(room_id)


def _cleanup_room(rid):
    if rid in turn_timers:
        turn_timers[rid].cancel()
        del turn_timers[rid]
    if rid in dc_timers:
        dc_timers[rid].cancel()
        del dc_timers[rid]
    if rid in rooms:
        del rooms[rid]


@socketio.on('create_room')
def on_create_room(data):
    from flask import request
    sid = request.sid
    rid = _gen_room_id()
    room = GameRoom(rid)
    rooms[rid] = room
    name = data.get('name', '炼金术士')
    ok, idx = room.join(sid, name)
    join_room(rid)
    emit('room_created', {'room_id': rid, 'player_idx': idx})


@socketio.on('join_room')
def on_join_room(data):
    from flask import request
    sid = request.sid
    rid = data.get('room_id', '').upper().strip()
    if rid not in rooms:
        emit('error', {'msg': f'房间 {rid} 不存在'})
        return
    room = rooms[rid]
    name = data.get('name', '占星师')
    ok, result = room.join(sid, name)
    if not ok:
        emit('error', {'msg': result})
        return
    join_room(rid)
    emit('room_joined', {'room_id': rid, 'player_idx': result})

    if room.phase != 'LOBBY':
        _broadcast(rid)


@socketio.on('surrender')
def on_surrender(data):
    from flask import request
    sid = request.sid
    rid = data.get('room_id')
    if rid not in rooms:
        return
    room = rooms[rid]
    pidx = room.player_idx(sid)
    if pidx < 0 or room.phase in ('LOBBY', 'GAME_OVER'):
        return
    room.winner = 1 - pidx
    room.phase = 'GAME_OVER'
    room._log('game_over', f'{room.players[pidx]["name"]} 投降认输')
    _broadcast(rid)


@socketio.on('leave_game')
def on_leave_game(data):
    from flask import request
    sid = request.sid
    rid = data.get('room_id')
    if rid not in rooms:
        return
    room = rooms[rid]
    pidx = room.player_idx(sid)
    if pidx < 0:
        return
    pname = room.players[pidx]['name']
    room.leave(sid)
    leave_room(rid)
    if room.phase not in ('LOBBY', 'GAME_OVER') and room.sids:
        room.winner = 1 - pidx
        room.phase = 'GAME_OVER'
        room._log('game_over', f'{pname} 退出房间，对手获胜')
        _broadcast(rid)
    elif not room.sids:
        _cleanup_room(rid)
    emit('left_room', {})


@socketio.on('reconnect_room')
def on_reconnect_room(data):
    from flask import request
    sid = request.sid
    rid = data.get('room_id')
    pidx = data.get('player_idx')
    if rid not in rooms:
        emit('error', {'msg': '房间已不存在'})
        return
    room = rooms[rid]
    if pidx not in (0, 1):
        emit('error', {'msg': '无效玩家'})
        return
    room.sids[sid] = pidx
    join_room(rid)
    if rid in dc_timers:
        dc_timers[rid].cancel()
        del dc_timers[rid]
    socketio.emit('opponent_back', {'player': pidx, 'name': room.players[pidx]['name']}, to=rid)
    _broadcast(rid)


@socketio.on('action')
def on_action(data):
    from flask import request
    sid = request.sid
    rid = data.get('room_id')
    action = data.get('action')
    payload = data.get('data', {})

    if rid not in rooms:
        emit('error', {'msg': '房间不存在'})
        return

    room = rooms[rid]
    ok, err = room.handle_action(sid, action, payload)
    if not ok:
        emit('action_error', {'msg': err, 'action': action})
        return

    _broadcast(rid)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('RENDER') is None
    socketio.run(app, host='0.0.0.0', port=port, debug=debug, allow_unsafe_werkzeug=True)
