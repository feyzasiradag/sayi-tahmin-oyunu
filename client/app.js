let ws = null;
let myName = ""; 
let currentLevel = 4; // Seçilen seviyeyi hafızada tutacağız
const el = (id) => document.getElementById(id);

// LOG SİSTEMİ
function log(txt, type = 'normal') {
  const d = document.createElement("div");
  d.textContent = txt;
  d.className = "log-entry"; 
  if (type === 'joined') d.classList.add('log-join');
  if (type === 'success') d.classList.add('log-success');
  if (type === 'error') d.classList.add('log-error');
  if (type === 'info') d.classList.add('log-info');
  el("log").prepend(d);
}

// SIRA GÜNCELLEME
function updateTurnUI(nextPlayerName) {
    const statusDiv = el("turn-status");
    const guessBtn = el("guessBtn");
    const guessInput = el("guess");

    if (!nextPlayerName) {
        statusDiv.textContent = "👥 Oyuncu Bekleniyor...";
        statusDiv.style.background = "rgba(255,255,255,0.5)";
        statusDiv.style.color = "#333";
        return;
    }

    if (nextPlayerName === myName) {
        statusDiv.textContent = "🟢 SIRA SENDE!";
        statusDiv.style.color = "#059669"; 
        statusDiv.style.background = "#d1fae5";
        
        guessBtn.disabled = false;
        guessBtn.classList.remove("btn-disabled");
        guessInput.disabled = false;
        guessInput.focus();
    } else {
        statusDiv.textContent = `⏳ Sıra ${nextPlayerName} oyuncusunda...`;
        statusDiv.style.color = "#b91c1c";
        statusDiv.style.background = "#fee2e2";
        
        guessBtn.disabled = true;
        guessBtn.classList.add("btn-disabled");
        guessInput.disabled = true;
    }
}

// ODAYA GİRİŞ (Mantık burada değişti)
el("joinBtn").onclick = () => {
  const inputName = el("name").value;
  
  // 1. ZORLUK SEVİYESİNİ AL
  const level = el("digitCount").value;
  currentLevel = level; // Hafızaya at, başlatırken lazım olacak

  // 2. ODA İSMİNİ OTOMATİK OLUŞTUR (Örn: "Level_4_Room")
  const autoRoomName = `Seviye_${level}`; 

  if (!inputName) {
      log("⚠️ İsim giriniz!", "error");
      return;
  }
  if (ws && ws.readyState === WebSocket.OPEN) return;

  ws = new WebSocket("ws://localhost:8765");

  ws.onopen = () => {
    // Otomatik oluşturulan oda ismini gönderiyoruz
    ws.send(JSON.stringify({ 
        action: "join", 
        name: inputName,
        room_id: autoRoomName 
    }));
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);

    if (msg.action === "joined") {
      myName = msg.my_name;
      el("name").value = myName;
      // Kullanıcıya dostça bir mesaj ver
      log(`✅ ${msg.room_id} Odasına Hoşgeldin! (${currentLevel} Haneli Oyun)`, "joined");
      log("👥 Odadakiler: " + msg.players.join(", "), "normal");
      
      // Zorluk seçimini kilitleyebiliriz kafa karışmasın diye
      el("digitCount").disabled = true; 
    }

    if (msg.action === "update_users") {
        if(msg.players.length > 0) log("👥 Liste: " + msg.players.join(", "), "info");
    }

    if (msg.action === "turn_update") updateTurnUI(msg.next_turn);

    if (msg.action === "round_started") {
      el("log").innerHTML = ""; 
      log(`🏁 TUR BAŞLADI! Hedef: ${msg.length} Haneli Sayı`, "info");
      
      el("guess").placeholder = `${msg.length} Haneli Sayı Gir`;
      el("guess").value = "";
      updateTurnUI(msg.current_turn);
    }

    if (msg.action === "guess_result") {
      const visual = msg.breakdown.map(v => 
          v === 2 ? "🟩" : (v === 1 ? "🟨" : "⬛")
      ).join("");
      const textBreakdown = msg.breakdown.map(v => v > 0 ? `+${v}` : v).join(" ");

      log(`${msg.player} [${msg.guess}] ${visual} (${textBreakdown}) | Puan: ${msg.total}`, msg.points > 0 ? "success" : "error");
      updateTurnUI(msg.next_turn);
    }

    if (msg.action === "round_won") {
      log(`🏆 KAZANAN: ${msg.winner} | Gizli Sayı: ${msg.secret}`, "info");
      el("turn-status").textContent = "🏁 Oyun Bitti";
      el("turn-status").style.background = "#fff";
      el("turn-status").style.color = "#333";
      el("guess").disabled = true;
      el("guessBtn").disabled = true;
    }

    if (msg.action === "error") log("❌ " + msg.message, "error");
  };
  
  ws.onclose = () => {
      log("🔴 Sunucudan koptunuz.", "error");
      el("digitCount").disabled = false; // Kopunca seçimi tekrar aç
  };
};

// BAŞLAT BUTONU
el("startBtn").onclick = () => {
  if (!ws) {
      log("⚠️ Önce bir odaya girmelisiniz!", "error");
      return;
  }
  // Giriş yaparken seçtiğimiz seviyeyi (currentLevel) kullanıyoruz
  ws.send(JSON.stringify({ 
      action: "start_round", 
      length: currentLevel 
  }));
};

// TAHMİN BUTONU
el("guessBtn").onclick = () => {
  if (!ws) return;
  const val = el("guess").value;
  if(!val) return;
  ws.send(JSON.stringify({ action: "guess", guess: val }));
  el("guess").value = "";
  el("guess").focus();
};