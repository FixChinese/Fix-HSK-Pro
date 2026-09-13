/* =========================================================
   HỆ THỐNG BIẾN TOÀN CỤC & TRẠNG THÁI (GLOBAL STATE)
========================================================= */
let currentData = [];          
let currentSessionData = [];   
let errorLedger = JSON.parse(localStorage.getItem('hskErrorLedger')) || []; 
let currentIndex = 0;          
let currentQuestion = null;    
let isReviewMode = false;      
let isWaitingForNext = false;  
let sfxEnabled = true;         

let timerInterval = null;
let secondsElapsed = 0;
let isTimerRunning = false;

/* Thống kê bài làm */
let stats = { correct: 0, wrong: 0 };

/* =========================================================
   ĐIỀU HƯỚNG CƠ BẢN
========================================================= */
function goHome() {
    document.getElementById('workspace-view').classList.remove('active');
    document.getElementById('home-view').classList.add('active');
    stopTimer(); 
    secondsElapsed = 0;
    document.getElementById('time-display').innerHTML = formatTime(0);
}

/* =========================================================
   LAZY FETCHING JSON THEO MENU
========================================================= */
async function loadModule(moduleType, level) {
    document.getElementById('home-view').classList.remove('active');
    document.getElementById('workspace-view').classList.add('active');
    
    document.getElementById('config-panel').style.display = 'block';
    document.getElementById('testing-area').style.display = 'none';
    
    let title = moduleType === 'vocab' ? 'Từ vựng' : 
                moduleType === 'grammar' ? 'Ngữ pháp' : 
                moduleType === 'reading' ? 'Đọc hiểu' : 
                moduleType === 'workout' ? 'Workout' :
                moduleType === 'stats' ? 'Thống kê' : 'Nghe hiểu';
    
    document.getElementById('module-title').innerText = `Cấu hình bài tập: ${title} HSK ${level}`;
    document.getElementById('test-main-title').innerText = `Học ${title.toLowerCase()}`;
    document.getElementById('hsk-badge-display').innerText = `HSK ${level}`;
    
    if (moduleType === 'workout' || moduleType === 'stats') {
        alert("Tính năng đang được phát triển chuyên sâu. Hệ thống sẽ load thư viện mặc định để trải nghiệm giao diện.");
        level = 1; // Fallback demo
    }

    try {
        const response = await fetch(`data/hsk${level}.json`);
        if (!response.ok) throw new Error(`HTTP error`);
        currentData = await response.json();
        isReviewMode = false;
        checkErrorLedgerStatus(); 
    } catch (error) {
        alert(`Không tìm thấy dữ liệu cấp độ ${level}. Vui lòng kiểm tra thư mục data.`);
        currentData = [];
    }
}

/* =========================================================
   ĐỘNG CƠ HỌC THUẬT & KHỞI TẠO BÀI TẬP
========================================================= */
function checkErrorLedgerStatus() {
    let reviewBtn = document.getElementById('review-btn');
    let statReviewBtn = document.getElementById('stat-review');
    
    if (errorLedger.length > 0) {
        reviewBtn.style.display = 'inline-block';
        reviewBtn.innerText = `Ôn tập câu sai (${errorLedger.length})`;
        statReviewBtn.style.display = 'inline-block';
        statReviewBtn.innerText = `Cần ôn ${errorLedger.length} câu`;
    } else {
        reviewBtn.style.display = 'none';
        statReviewBtn.style.display = 'none';
    }
}

function startTest() {
    if (currentData.length === 0) { alert("Chưa có dữ liệu."); return; }
    isReviewMode = false;
    let limitInput = parseInt(document.getElementById('question-limit').value);
    let limit = isNaN(limitInput) || limitInput < 1 ? 20 : limitInput;
    
    if (limit > currentData.length) {
        limit = currentData.length;
    }
    
    // Trộn ngẫu nhiên (Shuffle) trước khi cắt
    let shuffledData = [...currentData].sort(() => 0.5 - Math.random());
    currentSessionData = shuffledData.slice(0, limit);
    
    stats.correct = 0; stats.wrong = 0;
    initializeTestArea();
}

function startReview() {
    if (errorLedger.length === 0) return;
    isReviewMode = true;
    currentSessionData = [...errorLedger].sort(() => 0.5 - Math.random()); 
    stats.correct = 0; stats.wrong = 0;
    initializeTestArea();
}

function initializeTestArea() {
    currentIndex = 0;
    document.getElementById('config-panel').style.display = 'none';
    document.getElementById('testing-area').style.display = 'block';
    startTimer();
    loadQuestion();
}

function updateStatsUI() {
    document.getElementById('stat-progress').innerText = `${currentIndex + 1} / ${currentSessionData.length}`;
    document.getElementById('stat-correct').innerText = stats.correct;
    document.getElementById('stat-wrong').innerText = stats.wrong;
    
    let totalAnswered = stats.correct + stats.wrong;
    let ratio = totalAnswered === 0 ? 0 : Math.round((stats.correct / totalAnswered) * 100);
    document.getElementById('stat-ratio').innerText = `${ratio}%`;
}

function loadQuestion() {
    if (currentIndex >= currentSessionData.length) {
        stopTimer();
        alert(`Hoàn thành bài tập!\nĐúng: ${stats.correct}\nSai: ${stats.wrong}\nThời gian: ${document.getElementById('time-display').innerText}`);
        document.getElementById('testing-area').style.display = 'none';
        document.getElementById('config-panel').style.display = 'block';
        checkErrorLedgerStatus();
        return;
    }
    
    isWaitingForNext = false; 
    currentQuestion = currentSessionData[currentIndex];
    updateStatsUI();
    
    let mode = document.getElementById('study-mode').value;
    let displayElem = document.getElementById('question-display');
    let passageElem = document.getElementById('passage-display');
    
    if (currentQuestion.passage_cn) {
        passageElem.style.display = 'block';
        passageElem.innerText = currentQuestion.passage_cn;
    } else {
        passageElem.style.display = 'none';
    }

    if (mode === 'zh-vi') {
        displayElem.innerText = currentQuestion.hanzi || currentQuestion.word;
    } else if (mode === 'vi-zh') {
        displayElem.innerText = currentQuestion.meaning || currentQuestion.vietnamese;
    } else if (mode === 'au-vi') {
        displayElem.innerText = "🔊 Đang phát âm thanh..."; 
    }
    
    document.getElementById('pinyin-hint-display').style.display = 'none';
    let inputElem = document.getElementById('answer-input');
    inputElem.value = '';
    inputElem.focus();
    
    document.getElementById('result-area').style.display = 'none';
}

// Bật mí Pinyin & Audio
function showPinyinHint() {
    let hintBox = document.getElementById('pinyin-hint-display');
    hintBox.innerText = `Pinyin: ${currentQuestion.pinyin || 'Không có dữ liệu pinyin'}`;
    hintBox.style.display = 'block';
}

function playAudioHint() {
    let msg = new SpeechSynthesisUtterance();
    msg.text = currentQuestion.hanzi || currentQuestion.word;
    msg.lang = 'zh-CN';
    window.speechSynthesis.speak(msg);
}

/* =========================================================
   THUẬT TOÁN KHỬ NHIỄU, CHẤM ĐIỂM
========================================================= */
function sanitizeString(str) {
    if (!str) return "";
    return str.replace(/[.,!?;:。，！？；：]/g, '').trim().toLowerCase();
}

document.getElementById('answer-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault(); 
        if (!isWaitingForNext) { checkAnswer(); } 
        else { nextQuestion(); }
    }
});

function checkAnswer() {
    let rawInput = document.getElementById('answer-input').value;
    if (rawInput.trim() === '') return; 
    
    let userAnswer = sanitizeString(rawInput);
    let mode = document.getElementById('study-mode').value;
    let isCorrect = false;
    
    if (mode === 'zh-vi' || mode === 'au-vi') {
        let vietnameseMeaning = currentQuestion.vietnamese || currentQuestion.meaning || currentQuestion.translation || "";
        let meaningArray = vietnameseMeaning.split(/[,;]/).map(item => sanitizeString(item));
        isCorrect = meaningArray.some(keyword => keyword !== "" && (userAnswer.includes(keyword) || keyword.includes(userAnswer)));
    } else if (mode === 'vi-zh') {
        let hanzi = sanitizeString(currentQuestion.hanzi || currentQuestion.word);
        let pinyin = sanitizeString(currentQuestion.pinyin);
        isCorrect = (userAnswer === hanzi || userAnswer === pinyin);
    }
    
    isWaitingForNext = true; 
    showResult(isCorrect, rawInput);
}

/* =========================================================
   GIAO DIỆN GRID 6:4 VÀ THÔNG TIN HỌC THUẬT (HÌNH 4)
========================================================= */
function showResult(isCorrect, rawInput) {
    let resultArea = document.getElementById('result-area');
    resultArea.style.display = 'block';
    
    resultArea.scrollIntoView({ behavior: 'smooth', block: 'end' });
    
    // Status Banner
    let statusBanner = document.getElementById('status-banner');
    let statusIcon = document.getElementById('status-icon');
    let statusText = document.getElementById('status-text');
    
    if (isCorrect) {
        statusBanner.className = 'status-banner correct';
        statusIcon.className = 'fa-solid fa-check';
        statusText.innerText = 'Chính xác';
        stats.correct++;
    } else {
        statusBanner.className = 'status-banner wrong';
        statusIcon.className = 'fa-solid fa-xmark';
        statusText.innerText = 'Chưa chính xác';
        stats.wrong++;
    }
    updateStatsUI();
    
    document.getElementById('user-input-echo').innerText = rawInput;
    
    // Grid 6:4
    document.getElementById('correct-hanzi').innerText = currentQuestion.hanzi || currentQuestion.word;
    document.getElementById('correct-pinyin').innerText = currentQuestion.pinyin || '';
    
    // Thông tin học thuật mở rộng
    document.getElementById('hanviet-text').innerText = currentQuestion.hanviet || 'Đang cập nhật';
    document.getElementById('pos-text').innerText = currentQuestion.type || 'Từ vựng';
    
    let meaning = currentQuestion.vietnamese || currentQuestion.meaning || currentQuestion.translation || '';
    let example = currentQuestion.example || 'Chưa có ví dụ đa tầng nghĩa cho từ này.';
    document.getElementById('usage-text').innerHTML = `<strong>Nghĩa chính:</strong> ${meaning}<br><br><strong>Ví dụ:</strong> ${example}`;
    
    // Mascot
    let mascot = document.getElementById('mascot');
    if (isCorrect) {
        mascot.className = 'mascot-duck correct';
        if (sfxEnabled) spawnHearts();
        
        if (isReviewMode) {
            errorLedger = errorLedger.filter(item => item.id !== currentQuestion.id);
            localStorage.setItem('hskErrorLedger', JSON.stringify(errorLedger));
        }
    } else {
        mascot.className = 'mascot-duck wrong';
        let isAlreadyInLedger = errorLedger.some(item => item.id === currentQuestion.id);
        if (!isAlreadyInLedger) {
            errorLedger.push(currentQuestion);
            localStorage.setItem('hskErrorLedger', JSON.stringify(errorLedger));
        }
    }
    
    setTimeout(() => { mascot.className = 'mascot-duck'; }, 1500);
}

function nextQuestion() {
    currentIndex++;
    loadQuestion();
    document.getElementById('testing-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* =========================================================
   VẬT THỂ TƯƠNG TÁC (ĐỒNG HỒ, NÓN PHÁO)
========================================================= */
function formatTime(totalSeconds) {
    let h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    let m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    let s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${h}<span class="blink">:</span>${m}<span class="blink">:</span>${s}`;
}

function startTimer() {
    if (isTimerRunning) return;
    isTimerRunning = true;
    timerInterval = setInterval(() => {
        secondsElapsed++;
        document.getElementById('time-display').innerHTML = formatTime(secondsElapsed);
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    isTimerRunning = false;
}

document.getElementById('timer-btn').addEventListener('click', () => {
    if (confirm('Bạn muốn Reset thời gian?')) {
        stopTimer();
        secondsElapsed = 0;
        document.getElementById('time-display').innerHTML = formatTime(0);
        if (document.getElementById('testing-area').style.display === 'block') {
            startTimer();
        }
    }
});

document.getElementById('sfx-btn').addEventListener('click', function() {
    sfxEnabled = !sfxEnabled;
    let icon = this.querySelector('i');
    if (sfxEnabled) {
        this.style.color = '#f59e0b';
        icon.className = 'fa-solid fa-party-horn';
    } else {
        this.style.color = '#9ca3af';
        icon.className = 'fa-solid fa-bell-slash'; 
    }
});

function spawnHearts() {
    const container = document.getElementById('effects-container');
    const mascotBox = document.getElementById('mascot').getBoundingClientRect();
    
    for (let i = 0; i < 20; i++) {
        let heart = document.createElement('i');
        heart.className = 'fa-solid fa-heart heart-particle';
        
        heart.style.left = (mascotBox.left + 20) + 'px'; 
        heart.style.top = (mascotBox.top + 20) + 'px';
        
        let tx = (Math.random() * 500 - 400) + 'px';  
        let ty = ((Math.random() * -400) - 200) + 'px'; 
        
        heart.style.setProperty('--tx', tx);
        heart.style.setProperty('--ty', ty);
        
        container.appendChild(heart);
        setTimeout(() => { heart.remove(); }, 1500);
    }
}

document.getElementById('writer-btn').addEventListener('click', () => {
    let container = document.getElementById('hanzi-writer-container');
    container.innerHTML = `<p style="color: #6366f1; margin-top: 15px; font-weight:bold; font-size:1.5rem">Đang mô phỏng nét: ${currentQuestion.hanzi || currentQuestion.word}</p>`;
});