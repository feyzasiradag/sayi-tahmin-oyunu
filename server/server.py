import asyncio
import json
import random
import websockets

class Player:
    def __init__(self, name, ws):
        self.name = name
        self.ws = ws
        self.total = 0

class GameRoom:
    def __init__(self, room_id):
        self.room_id = room_id
        self.players = {}
        self.secret = None
        self.active = False
        self.player_order = []
        self.turn_index = 0
        self.length = 4

    def start_round(self, length=4):
        self.length = max(3, min(10, int(length)))
        self.secret = "".join(str(random.randint(0, 9)) for _ in range(self.length))
        self.active = True
        
        # Puanları sıfırla
        for p in self.players.values():
            p.total = 0
            
        self.player_order = list(self.players.keys())
        self.turn_index = 0
        print(f"ODA [{self.room_id}] - YENİ TUR: {self.secret} (Hane: {self.length})")

    def remove_player(self, player_name):
        if player_name in self.players:
            del self.players[player_name]
        
        if player_name in self.player_order:
            # Eğer ayrılan kişinin sırasıysa veya ondan önceyse indexi düzelt
            idx = self.player_order.index(player_name)
            self.player_order.remove(player_name)
            
            if self.turn_index >= len(self.player_order):
                self.turn_index = 0

    def get_current_player_name(self):
        if not self.player_order:
            return None
        return self.player_order[self.turn_index]

    def next_turn(self):
        if not self.player_order: return
        self.turn_index = (self.turn_index + 1) % len(self.player_order)

    def score_guess(self, guess):
        breakdown = []
        total = 0
        secret_left = list(self.secret)
        
        # 1. Doğru Yer
        for i in range(self.length):
            if guess[i] == self.secret[i]:
                breakdown.append(2)
                total += 2
                secret_left[i] = None
            else:
                breakdown.append(None)
        # 2. Yanlış Yer
        for i in range(self.length):
            if breakdown[i] is not None: continue
            if guess[i] in secret_left:
                breakdown[i] = 1
                total += 1
                secret_left[secret_left.index(guess[i])] = None
            else:
                breakdown[i] = -1
                total -= 1
        return breakdown, total

ROOMS = {}

async def broadcast_room(room, msg):
    data = json.dumps(msg, ensure_ascii=False)
    for p in list(room.players.values()):
        try:
            await p.ws.send(data)
        except:
            pass 

async def handler(ws):
    player = None
    current_room = None
    
    try:
        async for raw in ws:
            msg = json.loads(raw)
            action = msg.get("action")

            if action == "join":
                name = msg.get("name")
                room_id = msg.get("room_id", "genel")

                # Odayı bul veya oluştur
                if room_id not in ROOMS:
                    ROOMS[room_id] = GameRoom(room_id)
                current_room = ROOMS[room_id]

                # İsim çakışması
                if name in current_room.players:
                    name = name + "_" + str(random.randint(1,99))
                
                player = Player(name, ws)
                current_room.players[name] = player

                # Bağlantı başarılı 
                await ws.send(json.dumps({
                    "action": "joined",
                    "players": list(current_room.players.keys()),
                    "my_name": name,
                    "room_id": room_id
                }, ensure_ascii=False))
                
                # Odaya mesaj
                await broadcast_room(current_room, {
                     "action": "update_users",
                     "players": list(current_room.players.keys())
                })

            elif action == "start_round":
                if not current_room: continue
                req_len = msg.get("length", 4)
                current_room.start_round(req_len)
                
                await broadcast_room(current_room, {
                    "action": "round_started",
                    "current_turn": current_room.get_current_player_name(),
                    "length": current_room.length
                })

            elif action == "guess":
                if not current_room or not current_room.active: continue

                current_player = current_room.get_current_player_name()
                if player.name != current_player:
                    await ws.send(json.dumps({"action": "error", "message": f"Sıra {current_player} oyuncusunda!"}))
                    continue

                guess = msg.get("guess")
                if not (guess and len(guess) == current_room.length and guess.isdigit()):
                    await ws.send(json.dumps({"action": "error", "message": f"{current_room.length} haneli giriniz!"}))
                    continue

                breakdown, points = current_room.score_guess(guess)
                player.total += points
                current_room.next_turn()

                response = {
                    "action": "guess_result",
                    "player": player.name,
                    "guess": guess,
                    "breakdown": breakdown,
                    "points": points,
                    "total": player.total,
                    "next_turn": current_room.get_current_player_name()
                }

                if guess == current_room.secret:
                    current_room.active = False
                    response["action"] = "round_won"
                    response["winner"] = player.name
                    response["secret"] = current_room.secret
                    response["winner_points"] = player.total
                
                await broadcast_room(current_room, response)

    except websockets.ConnectionClosed:
        pass
    finally:
        if current_room and player:
            print(f"{player.name} odadan düştü.")
            current_room.remove_player(player.name)
            
            await broadcast_room(current_room, {
                "action": "update_users",
                "players": list(current_room.players.keys())
            })
            
            if current_room.active:
                await broadcast_room(current_room, {
                    "action": "turn_update",
                    "next_turn": current_room.get_current_player_name()
                })

            if not current_room.players:
                print(f"Oda {current_room.room_id} silindi.")
                del ROOMS[current_room.room_id]

async def main():
    async with websockets.serve(handler, "0.0.0.0", 8765):
        print("Server running ws://0.0.0.0:8765")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())