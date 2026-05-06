"""
秘术对决 V6.0 — Realtime Multiplayer Server

职责:
1. 通过 python-socketio 提供房间管理与游戏指令转发的 WebSocket 通道
2. 通过 aiohttp 同时服务 React 前端静态文件 (frontend/dist)
3. 单文件部署 - 一个 Python 进程同时承担前端 + 后端

事件协议:
  客户端 → 服务端:
    CREATE_ROOM           {}                    → 创建房间, 服务端返回 ROOM_CREATED { roomCode }
    JOIN_ROOM             { roomCode }          → 加入房间, 失败时 ROOM_ERROR
    LEAVE_ROOM            {}                    → 主动离开
    HERO_SELECTED         { hero }              → 我选了某个英雄
    GAME_ACTION           { type, payload }     → 转发游戏动作 (突袭/防守/咏唱/封锁等)

  服务端 → 客户端:
    ROOM_CREATED          { roomCode, slot }    → 房间创建成功 (slot=0/1 决定谁先手)
    ROOM_JOINED           { roomCode, slot, opponentReady }
    OPPONENT_JOINED       {}                    → 对手已加入
    OPPONENT_LEFT         {}                    → 对手离开
    OPPONENT_HERO         { hero }              → 对手英雄选择
    GAME_ACTION           { type, payload }     → 转发对手动作
    ROOM_ERROR            { message }
"""
import os
import string
import random
import logging
from typing import Dict, Optional

import socketio
from aiohttp import web

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
log = logging.getLogger('realtime')

# ═══════════════════════════════════════════════════════════
#  房间管理
# ═══════════════════════════════════════════════════════════

class Room:
    """两人房间。slot 0 = 房主, slot 1 = 加入者。"""
    def __init__(self, code: str, host_sid: str):
        self.code = code
        self.players = [host_sid, None]  # type: list[Optional[str]]
        self.heroes = [None, None]       # type: list[Optional[str]]

    def add_player(self, sid: str) -> Optional[int]:
        for i, slot in enumerate(self.players):
            if slot is None:
                self.players[i] = sid
                return i
        return None

    def remove_player(self, sid: str) -> Optional[int]:
        for i, slot in enumerate(self.players):
            if slot == sid:
                self.players[i] = None
                self.heroes[i] = None
                return i
        return None

    def slot_of(self, sid: str) -> Optional[int]:
        for i, slot in enumerate(self.players):
            if slot == sid:
                return i
        return None

    def opponent_of(self, sid: str) -> Optional[str]:
        slot = self.slot_of(sid)
        if slot is None:
            return None
        return self.players[1 - slot]

    @property
    def is_full(self) -> bool:
        return all(p is not None for p in self.players)

    @property
    def is_empty(self) -> bool:
        return all(p is None for p in self.players)


class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}
        self.sid_to_room: Dict[str, str] = {}

    def _generate_code(self) -> str:
        chars = string.ascii_uppercase.replace('I', '').replace('O', '') + '23456789'
        while True:
            code = ''.join(random.choice(chars) for _ in range(4))
            if code not in self.rooms:
                return code

    def create(self, sid: str) -> Room:
        # 先把之前的房间关系清理
        self.leave(sid)
        code = self._generate_code()
        room = Room(code, sid)
        self.rooms[code] = room
        self.sid_to_room[sid] = code
        return room

    def join(self, sid: str, code: str) -> Optional[Room]:
        room = self.rooms.get(code.upper())
        if room is None or room.is_full:
            return None
        # 同一 sid 不能重复加自己房
        if sid in room.players:
            return room
        # 先离开旧房
        self.leave(sid)
        room.add_player(sid)
        self.sid_to_room[sid] = room.code
        return room

    def leave(self, sid: str) -> Optional[Room]:
        code = self.sid_to_room.pop(sid, None)
        if not code:
            return None
        room = self.rooms.get(code)
        if not room:
            return None
        room.remove_player(sid)
        if room.is_empty:
            self.rooms.pop(code, None)
            log.info(f'Room {code} disposed (empty)')
        return room

    def find(self, sid: str) -> Optional[Room]:
        code = self.sid_to_room.get(sid)
        return self.rooms.get(code) if code else None


# ═══════════════════════════════════════════════════════════
#  Socket.IO 服务端
# ═══════════════════════════════════════════════════════════

sio = socketio.AsyncServer(
    async_mode='aiohttp',
    cors_allowed_origins='*',
    ping_timeout=30,
    ping_interval=15,
)
manager = RoomManager()


@sio.event
async def connect(sid, environ):
    log.info(f'Client connected: {sid}')


@sio.event
async def disconnect(sid):
    log.info(f'Client disconnected: {sid}')
    room = manager.leave(sid)
    if room:
        opp_sid = next((p for p in room.players if p), None)
        if opp_sid:
            await sio.emit('OPPONENT_LEFT', {}, to=opp_sid)


@sio.on('CREATE_ROOM')
async def handle_create_room(sid, _data=None):
    room = manager.create(sid)
    log.info(f'Room {room.code} created by {sid}')
    await sio.emit('ROOM_CREATED', {
        'roomCode': room.code,
        'slot': 0,
    }, to=sid)


@sio.on('JOIN_ROOM')
async def handle_join_room(sid, data):
    code = (data or {}).get('roomCode', '').upper().strip()
    if not code:
        await sio.emit('ROOM_ERROR', {'message': '房间号不能为空'}, to=sid)
        return
    room = manager.join(sid, code)
    if not room:
        await sio.emit('ROOM_ERROR', {'message': '房间不存在或已满'}, to=sid)
        return

    slot = room.slot_of(sid)
    log.info(f'Player {sid} joined room {code} as slot {slot}')

    # 通知加入方
    await sio.emit('ROOM_JOINED', {
        'roomCode': room.code,
        'slot': slot,
        'opponentReady': room.is_full,
    }, to=sid)

    # 通知房间内对手
    opp = room.opponent_of(sid)
    if opp:
        await sio.emit('OPPONENT_JOINED', {}, to=opp)


@sio.on('LEAVE_ROOM')
async def handle_leave_room(sid, _data=None):
    room = manager.leave(sid)
    if room:
        opp_sid = next((p for p in room.players if p), None)
        if opp_sid:
            await sio.emit('OPPONENT_LEFT', {}, to=opp_sid)


@sio.on('HERO_SELECTED')
async def handle_hero_selected(sid, data):
    room = manager.find(sid)
    if not room:
        return
    slot = room.slot_of(sid)
    hero = (data or {}).get('hero')
    if slot is None or not hero:
        return
    room.heroes[slot] = hero
    opp = room.opponent_of(sid)
    if opp:
        await sio.emit('OPPONENT_HERO', {'hero': hero}, to=opp)


@sio.on('GAME_ACTION')
async def handle_game_action(sid, data):
    room = manager.find(sid)
    if not room:
        return
    opp = room.opponent_of(sid)
    if opp:
        await sio.emit('GAME_ACTION', data, to=opp)


# ═══════════════════════════════════════════════════════════
#  HTTP 静态文件服务 (服务 frontend/dist)
# ═══════════════════════════════════════════════════════════

DIST_DIR = os.path.join(os.path.dirname(__file__), 'frontend', 'dist')


async def health(_request):
    return web.json_response({'status': 'ok', 'rooms': len(manager.rooms)})


async def index(_request):
    return web.FileResponse(os.path.join(DIST_DIR, 'index.html'))


async def spa_fallback(request):
    """对所有未匹配静态文件的路径回退到 index.html (SPA 路由)"""
    path = request.match_info.get('tail', '')
    full_path = os.path.join(DIST_DIR, path)
    if os.path.isfile(full_path):
        return web.FileResponse(full_path)
    return web.FileResponse(os.path.join(DIST_DIR, 'index.html'))


def build_app() -> web.Application:
    app = web.Application()
    sio.attach(app)

    app.router.add_get('/health', health)
    app.router.add_get('/', index)

    # 优先服务 dist 下的静态资源
    if os.path.isdir(DIST_DIR):
        app.router.add_static('/assets/', os.path.join(DIST_DIR, 'assets'), name='assets')
        # SPA fallback for all other paths
        app.router.add_get('/{tail:.*}', spa_fallback)
    else:
        log.warning(f'frontend/dist not found at {DIST_DIR}')

    return app


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    log.info(f'Starting realtime server on port {port}')
    log.info(f'Serving frontend from: {DIST_DIR}')
    web.run_app(build_app(), host='0.0.0.0', port=port)
