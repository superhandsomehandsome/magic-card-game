"""Flask + Flask-SocketIO server for online 2-player game."""
import os, random, string
from flask import Flask, render_template
from flask_socketio import SocketIO, emit, join_room, leave_room
from game_room import GameRoom

app = Flask(__name__)
app.config['SECRET_KEY'] = 'mysecret'
socketio = SocketIO(app, cors_allowed_origins='*')

rooms = {}


def _gen_room_id():
    while True:
        rid = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        if rid not in rooms:
            return rid


def _broadcast(room_id):
    room = rooms.get(room_id)
    if not room:
        return
    for sid, pidx in room.sids.items():
        view = room.get_view(pidx)
        socketio.emit('state', view, to=sid)


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
            room.leave(sid)
            socketio.emit('player_left', {'player': pidx}, to=rid)
            if not room.sids:
                del rooms[rid]
            break


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
