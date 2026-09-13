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

/* =========================================================
   CHƯƠNG 1: LOGIC LOGO HOME & ĐIỀU HƯỚNG CƠ BẢN
========================================================= */
function goHome() {
    document.getElementById('workspace-view').classList.remove('active');
    document.getElementById('home-view').classList.add('active');
    stopTimer(); 
    secondsElapsed = 0;
    document.getElementById('time-display').innerHTML = formatTime(0);
}

/* =========================================================
   CHƯƠNG 2 & 7: LAZY FETCHING JSON THEO MENU
========================================================= */
async function loadModule(moduleType, level) {
    document.getElementById('home-view').classList.remove('active');
    document.getElementById('workspace-view').classList.add('active');
    
    document.getElementById('config-panel').style.display = 'block';
    document.getElementById('testing-area').style.display = 'none';
    document.getElementById('result-area').style.display = 'none';
    
    let title = moduleType === 'vocab' ? 'Từ vựng' : 
                moduleType === 'grammar' ? 'Ngữ pháp' : 
                moduleType === 'reading' ? 'Đọc hiểu' : 
                moduleType === 'workout' ? 'Workout' :
                moduleType === 'stats' ? 'Thống kê' : 'Nghe hiểu';
    
    document.getElementById('module-title').innerText = `Cấu hình bài tập: ${title} HSK ${level}`;
    
    // Nếu vào Thống kê hoặc Workout chưa có file JSon, dừng load file
    if (moduleType === 'workout' || moduleType === 'stats') {
        alert("Tính năng đang phát triển chuyên sâu. Vui lòng chọn Từ vựng/Đọc hiểu/Nghe hiểu.");
        return;
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
   CHƯƠNG 5: ĐỘNG CƠ HỌC THUẬT & KHỞI TẠO BÀI TẬP
========================================================= */
function checkErrorLedgerStatus() {
    let reviewBtn = document.getElementById('review-btn');
    if (errorLedger.length > 0) {
        reviewBtn.style.display = 'inline-block';
        reviewBtn.innerText = `Ôn tập câu sai (${errorLedger.length})`;
    } else {
        reviewBtn.style.display = 'none';
    }
}

function startTest() {
    if (currentData.length === 0) {
        alert("Chưa có dữ liệu, vui lòng chọn menu khác.");
        return;
    }
    isReviewMode = false;
    let limitInput = parseInt(document.getElementById('question-limit').value);
    let limit = isNaN(limitInput) || limitInput < 1 ? 20 : limitInput;
    
    // Vá lỗi Batch Size: Cảnh báo nếu thiếu câu, không nhân bản
    if (limit > currentData.length) {
        alert(`Hệ thống chỉ tìm thấy ${currentData.length} câu trong CSDL cấp độ này.`);
        limit = currentData.length;
    }
    
    currentSessionData = currentData.slice(0, limit);
    initializeTestArea();
}

function startReview() {
    if (errorLedger.length === 0) return;
    isReviewMode = true;
    currentSessionData = [...errorLedger]; 
    initializeTestArea();
}

function initializeTestArea() {
    currentIndex = 0;
    document.getElementById('config-panel').style.display = 'none';
    document.getElementById('testing-area').style.display = 'block';
    startTimer();
    loadQuestion();
}

function loadQuestion() {
    if (currentIndex >= currentSessionData.length) {
        stopTimer();
        alert(`Hoàn thành xuất sắc!\nThời gian: ${document.getElementById('time-display').innerText}`);
        document.getElementById('testing-area').style.display = 'none';
        document.getElementById('config-panel').style.display = 'block';
        checkErrorLedgerStatus();
        return;
    }
    
    isWaitingForNext = false; 
    currentQuestion = currentSessionData[currentIndex];
    
    let mode = document.getElementById('study-mode').value;
    let displayElem = document.getElementById('question-display');
    let passageElem = document.getElementById('passage-display');
    
    // Đọc hiểu đoạn văn (nếu có passage_cn trong data tương lai)
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
    
    let inputElem = document.getElementById('answer-input');
    inputElem.value = '';
    inputElem.focus();
    
    document.getElementById('result-area').style.display = 'none';
}

/* =========================================================
   THUẬT TOÁN KHỬ NHIỄU, CHẤM ĐIỂM ĐA NGHĨA & PHÍM ENTER
========================================================= */
function sanitizeString(str) {
    if (!str) return "";
    return str.replace(/[.,!?;:。，！？；：]/g, '').trim().toLowerCase();
}

// Logic Phím Enter 1 Chạm
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
    showResult(isCorrect);
}

/* =========================================================
   CHƯƠNG 6: GIAO DIỆN GRID 6:4 VÀ ĐIỀU KHIỂN MASCOT
========================================================= */
function showResult(isCorrect) {
    document.getElementById('testing-area').style.display = 'none';
    let resultArea = document.getElementById('result-area');
    resultArea.style.display = 'grid';
    
    // Tự động kéo khung nhìn (Giao diện Compact)
    resultArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    let statusBadge = document.getElementById('result-status');
    statusBadge.innerText = isCorrect ? "CHÍNH XÁC" : "CHƯA CHÍNH XÁC";
    statusBadge.style.backgroundColor = isCorrect ? "#10b981" : "#ef4444";
    statusBadge.style.color = "white";
    
    document.getElementById('correct-hanzi').innerText = currentQuestion.hanzi || currentQuestion.word;
    document.getElementById('correct-pinyin').innerText = currentQuestion.pinyin;
    document.getElementById('correct-meaning').innerText = currentQuestion.vietnamese || currentQuestion.meaning || currentQuestion.translation;
    
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
    document.getElementById('testing-area').style.display = 'block';
    loadQuestion();
}

/* =========================================================
   CHƯƠNG 4: VẬT THỂ TƯƠNG TÁC (ĐỒNG HỒ, NÓN PHÁO)
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
    if (confirm('Bạn muốn Reset/Dừng thời gian?')) {
        stopTimer();
        secondsElapsed = 0;
        document.getElementById('time-display').innerHTML = formatTime(0);
        if (document.getElementById('testing-area').style.display === 'block') {
            startTimer();
        }
    }
});

// Nút Cấu Hình Nón Pháo
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

// Thuật toán bắn Trái Tim tản cực rộng (DOM Injection)
function spawnHearts() {
    const container = document.getElementById('effects-container');
    const mascotBox = document.getElementById('mascot').getBoundingClientRect();
    
    for (let i = 0; i < 20; i++) {
        let heart = document.createElement('i');
        heart.className = 'fa-solid fa-heart heart-particle';
        
        heart.style.left = (mascotBox.left + 20) + 'px'; 
        heart.style.top = (mascotBox.top + 20) + 'px';
        
        // Bắn lan rộng: x từ -400px đến 100px, y lên cao từ -200px đến -600px
        let tx = (Math.random() * 500 - 400) + 'px';  
        let ty = ((Math.random() * -400) - 200) + 'px'; 
        
        heart.style.setProperty('--tx', tx);
        heart.style.setProperty('--ty', ty);
        
        container.appendChild(heart);
        setTimeout(() => { heart.remove(); }, 1500);
    }
}

// Bút Thuận Khối 40% (Chuẩn bị nhúng Hanzi Writer)
document.getElementById('writer-btn').addEventListener('click', () => {
    let container = document.getElementById('hanzi-writer-container');
    container.innerHTML = `<p style="color: #6366f1; margin-top: 15px; font-weight:bold; font-size:1.5rem">Đang vẽ nét: ${currentQuestion.hanzi || currentQuestion.word}</p>`;
});