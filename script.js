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
let stats = { correct: 0, wrong: 0 };
let currentModuleType = '';

/* RÚT MENU KHI CLICK */
document.querySelectorAll('.nav-menu li').forEach(li => {
    li.addEventListener('click', () => {
        let parentMenu = li.closest('.nav-menu');
        if(parentMenu) {
            parentMenu.style.visibility = 'hidden'; parentMenu.style.opacity = '0';
            setTimeout(() => { parentMenu.style.visibility = ''; parentMenu.style.opacity = ''; }, 300); 
        }
    });
});

function goHome() {
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById('home-view').classList.add('active');
    stopTimer(); secondsElapsed = 0;
    document.getElementById('time-display').innerHTML = formatTime(0);
}

// Hàm hiện lại bảng Cấu hình (Sửa lỗi out trang)
function showConfig() {
    document.getElementById('testing-area').style.display = 'none';
    document.getElementById('config-panel').style.display = 'block';
    stopTimer();
}

async function loadModule(moduleType, level) {
    currentModuleType = moduleType;
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    
    if (moduleType === 'stats') {
        document.getElementById('stats-view').classList.add('active');
        renderStatsDashboard(); return;
    }

    document.getElementById('workspace-view').classList.add('active');
    document.getElementById('config-panel').style.display = 'block';
    document.getElementById('testing-area').style.display = 'none';
    
    let title = "";
    if(moduleType === 'vocab') title = 'Từ vựng';
    if(moduleType === 'grammar') title = 'Ngữ pháp & Câu văn';
    if(moduleType === 'reading') title = 'Đọc hiểu';
    if(moduleType === 'listening') title = 'Nghe hiểu';
    if(moduleType === 'workout') title = 'Workout Ngữ cảnh';

    let levelText = level ? ` HSK ${level}` : '';
    document.getElementById('module-title').innerText = `Cấu hình bài tập: ${title}${levelText}`;
    document.getElementById('test-main-title').innerText = title;
    document.getElementById('hsk-badge-display').innerText = level ? `HSK ${level}` : 'TỔNG HỢP';

    try {
        if (moduleType === 'workout') {
            const response = await fetch(`data/context_workout.json`);
            if (!response.ok) throw new Error(`HTTP error`);
            currentData = await response.json();
            document.getElementById('study-mode').style.display = 'none'; 
        } else {
            document.getElementById('study-mode').style.display = 'inline-block';
            const response = await fetch(`data/hsk${level}.json`);
            if (!response.ok) throw new Error(`HTTP error`);
            currentData = await response.json();
        }
        isReviewMode = false;
        checkErrorLedgerStatus(); 
    } catch (error) {
        alert(`Không tìm thấy dữ liệu. Đảm bảo đã có tệp JSON.`);
        currentData = [];
    }
}

function renderStatsDashboard() {
    let listContainer = document.getElementById('error-ledger-list');
    listContainer.innerHTML = '';
    if (errorLedger.length === 0) {
        listContainer.innerHTML = '<p style="color:#10b981; font-weight:bold;">Tuyệt vời! Không có lỗ hổng nào cần ôn tập.</p>';
    } else {
        errorLedger.forEach(item => {
            let div = document.createElement('div');
            div.className = 'error-item';
            let word = item.hanzi || item.word || 'Câu hỏi';
            let pinyin = item.pinyin || '';
            let meaning = item.vietnamese || item.meaning || item.situation || '';
            div.innerHTML = `${word} <span style="color:#ef4444; float:right;">Cần ôn</span><span class="error-item-pinyin">${pinyin} - ${meaning}</span>`;
            listContainer.appendChild(div);
        });
    }
}

function checkErrorLedgerStatus() {
    let reviewBtnTop = document.getElementById('review-btn');
    if (errorLedger.length > 0) {
        reviewBtnTop.style.display = 'inline-block';
        reviewBtnTop.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Ôn tập câu sai (${errorLedger.length})`;
    } else {
        reviewBtnTop.style.display = 'none';
    }
}

function startTest() {
    if (currentData.length === 0) { alert("Chưa có dữ liệu."); return; }
    isReviewMode = false;
    let limitInput = parseInt(document.getElementById('question-limit').value);
    let limit = isNaN(limitInput) || limitInput < 1 ? 20 : limitInput;
    if (limit > currentData.length) limit = currentData.length;
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
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById('workspace-view').classList.add('active');
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
    let total = stats.correct + stats.wrong;
    document.getElementById('stat-ratio').innerText = total === 0 ? `0%` : `${Math.round((stats.correct/total)*100)}%`;
}

function loadQuestion() {
    if (currentIndex >= currentSessionData.length) {
        stopTimer();
        alert(`Hoàn thành!\nĐúng: ${stats.correct}\nSai: ${stats.wrong}\nThời gian: ${document.getElementById('time-display').innerText}`);
        document.getElementById('testing-area').style.display = 'none';
        document.getElementById('config-panel').style.display = 'block';
        checkErrorLedgerStatus(); return;
    }
    
    isWaitingForNext = false; 
    currentQuestion = currentSessionData[currentIndex];
    updateStatsUI();
    
    let mode = document.getElementById('study-mode').value;
    let displayElem = document.getElementById('question-display');
    let hintGroup = document.getElementById('hint-buttons-group');
    let instructionText = document.getElementById('instruction-text');
    
    if (currentModuleType === 'workout') {
        displayElem.innerText = currentQuestion.situation || currentQuestion.vietnamese || "Tình huống";
        hintGroup.style.display = 'none'; 
        instructionText.innerText = "(Gõ tiếng Trung)";
    } else {
        hintGroup.style.display = 'flex';
        // Tích hợp Fallback lấy dữ liệu tiếng Việt an toàn 100%
        let vietnameseData = currentQuestion.vietnamese || currentQuestion.meaning || currentQuestion.translation || currentQuestion.situation || "Đang cập nhật dữ liệu...";
        let hanziData = currentQuestion.hanzi || currentQuestion.word || "Đang cập nhật...";

        if (mode === 'vi-zh') { 
            displayElem.innerText = vietnameseData;
            instructionText.innerText = "(Gõ Pinyin/Hán)";
        } else if (mode === 'zh-vi') { 
            displayElem.innerText = hanziData;
            instructionText.innerText = "(Gõ Tiếng Việt)";
        } else if (mode === 'zh-zh') { 
            displayElem.innerText = hanziData;
            instructionText.innerText = "(Nhìn Hán, gõ Pinyin ra Hán)";
        }
    }
    
    document.getElementById('pinyin-hint-display').style.display = 'none';
    let inputElem = document.getElementById('answer-input');
    inputElem.value = ''; inputElem.focus();
    
    // Nút Check luôn giữ nguyên chữ (Không bao giờ đổi thành Tiếp tục)
    let btn = document.getElementById('check-btn');
    btn.innerText = "Kiểm tra đáp án";
    
    document.getElementById('result-area').style.display = 'none';
    document.getElementById('hanzi-writer-container').innerHTML = ''; 
}

function showPinyinHint() {
    let hintBox = document.getElementById('pinyin-hint-display');
    hintBox.innerText = `Pinyin: ${currentQuestion.pinyin || 'Không có dữ liệu pinyin'}`;
    hintBox.style.display = 'block';
}
function playAudioHint() {
    let msg = new SpeechSynthesisUtterance(currentQuestion.hanzi || currentQuestion.word);
    msg.lang = 'zh-CN'; window.speechSynthesis.speak(msg);
}

function sanitizeString(str) { return (!str) ? "" : str.replace(/[.,!?;:。，！？；：]/g, '').trim().toLowerCase(); }

// Logic Trigger Nút Xanh To
function triggerEnter() { 
    if (!isWaitingForNext) { checkAnswer(); } else { nextQuestion(); }
}
document.getElementById('answer-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); triggerEnter(); }
});

function checkAnswer() {
    let rawInput = document.getElementById('answer-input').value;
    // Cho phép người dùng ấn Enter để nộp bài trống (Bỏ lệnh return nếu input rỗng)
    let userAnswer = sanitizeString(rawInput);
    let mode = document.getElementById('study-mode').value;
    let isCorrect = false;
    
    if (currentModuleType === 'workout') {
        let sgk = sanitizeString(currentQuestion.text_sgk || currentQuestion.hanzi);
        let native = sanitizeString(currentQuestion.text_native);
        isCorrect = (userAnswer === sgk || userAnswer === native) && userAnswer !== "";
    } else {
        if (mode === 'zh-vi') {
            let vn = currentQuestion.vietnamese || currentQuestion.meaning || currentQuestion.translation || "";
            let arr = vn.split(/[,;]/).map(i => sanitizeString(i));
            isCorrect = arr.some(k => k !== "" && (userAnswer.includes(k) || k.includes(userAnswer))) && userAnswer !== "";
        } else {
            let hz = sanitizeString(currentQuestion.hanzi || currentQuestion.word);
            let py = sanitizeString(currentQuestion.pinyin);
            isCorrect = (userAnswer === hz || userAnswer === py) && userAnswer !== "";
        }
    }
    
    isWaitingForNext = true; 
    showResult(isCorrect, rawInput);
}

function showResult(isCorrect, rawInput) {
    let resultArea = document.getElementById('result-area');
    resultArea.style.display = 'block';
    
    // Nút Check vẫn giữ nguyên chữ "Kiểm tra đáp án", ấn lần nữa sẽ gọi triggerEnter -> nextQuestion
    
    // Giao diện người dùng nhập (chuẩn Ảnh 1)
    let echo = document.getElementById('user-input-echo');
    echo.innerText = rawInput || "(Để trống)";
    echo.className = isCorrect ? 'correct-text' : 'wrong-text';

    if (isCorrect) { stats.correct++; } else { stats.wrong++; }
    updateStatsUI();
    
    if (currentModuleType === 'workout') {
        document.getElementById('standard-result-layout').style.display = 'none';
        document.getElementById('workout-result-layout').style.display = 'block';
        document.getElementById('wo-user').innerText = rawInput || "(Không nhập)";
        document.getElementById('wo-sgk').innerText = currentQuestion.text_sgk || currentQuestion.hanzi || 'N/A';
        document.getElementById('wo-native').innerText = currentQuestion.text_native || 'N/A';
        document.getElementById('wo-explain').innerHTML = currentQuestion.goc_lao_su || 'Giao tiếp bản xứ.';
    } else {
        document.getElementById('standard-result-layout').style.display = 'block';
        document.getElementById('workout-result-layout').style.display = 'none';
        
        let hanziChar = currentQuestion.hanzi || currentQuestion.word || "";
        document.getElementById('correct-hanzi').innerText = hanziChar;
        document.getElementById('correct-pinyin').innerText = currentQuestion.pinyin || '';
        
        // Logic Mode Hỏi Trung -> Gõ Việt (Hiện Nghĩa tiếng Việt thật to)
        let mode = document.getElementById('study-mode').value;
        let vTextDisplay = document.getElementById('correct-vietnamese-highlight');
        if (mode === 'zh-vi') {
            vTextDisplay.style.display = 'block';
            vTextDisplay.innerText = currentQuestion.vietnamese || currentQuestion.meaning || currentQuestion.translation || 'Đang cập nhật...';
        } else {
            vTextDisplay.style.display = 'none';
        }
        
        // 3 Badges Ảnh 1 (Fallback dữ liệu chống N/A)
        document.getElementById('hanviet-text').innerText = currentQuestion.hanviet || 'Đang cập nhật...';
        document.getElementById('radical-text').innerText = currentQuestion.radical || 'Đang cập nhật...';
        document.getElementById('pos-text').innerText = currentQuestion.type || 'Đang cập nhật...';
        
        // Nghĩa và Ví dụ
        let meaning = currentQuestion.vietnamese || currentQuestion.meaning || 'Đang cập nhật...';
        document.getElementById('usage-text').innerHTML = meaning;
        document.getElementById('example-text').innerHTML = currentQuestion.example || 'Đang cập nhật...';
        document.getElementById('laosu-text').innerHTML = currentQuestion.goc_lao_su || 'Đang cập nhật...';

        // Lệnh vẽ Bút Thuận HanziWriter MỚI (Hỗ trợ Đa Chữ Hán)
        document.getElementById('hanzi-writer-container').innerHTML = '';
        document.getElementById('writer-btn').onclick = function() {
            let container = document.getElementById('hanzi-writer-container');
            container.innerHTML = '';
            if(hanziChar && hanziChar.length > 0) {
                for(let i=0; i<hanziChar.length; i++) {
                    let char = hanziChar.charAt(i);
                    // Chỉ vẽ các ký tự là chữ Hán
                    if(/[\u4e00-\u9fa5]/.test(char)) {
                        let div = document.createElement('div');
                        div.id = 'writer-char-' + i;
                        div.className = 'hanzi-char-box';
                        container.appendChild(div);
                        HanziWriter.create(div.id, char, {
                            width: 100, height: 100, padding: 5, strokeAnimationSpeed: 1, delayBetweenStrokes: 100
                        }).loopCharacterAnimation();
                    }
                }
            }
        };
    }
    
    // MASCOT
    let mascot = document.getElementById('mascot');
    if (isCorrect) {
        mascot.className = 'mascot-duck correct';
        if (sfxEnabled) spawnHearts();
        if (isReviewMode) errorLedger = errorLedger.filter(i => i.id !== currentQuestion.id);
    } else {
        mascot.className = 'mascot-duck wrong';
        if (!errorLedger.some(i => i.id === currentQuestion.id)) errorLedger.push(currentQuestion);
    }
    localStorage.setItem('hskErrorLedger', JSON.stringify(errorLedger));
    
    // Cập nhật thẻ ôn tập nếu có câu sai
    checkErrorLedgerStatus(); 

    setTimeout(() => { mascot.className = 'mascot-duck'; }, 1500);
    
    // Auto Cuộn xuống khối kết quả để xem rõ
    resultArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function nextQuestion() {
    currentIndex++; loadQuestion();
    document.getElementById('testing-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function formatTime(totalSeconds) {
    let h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    let m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    let s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${h}<span class="blink">:</span>${m}<span class="blink">:</span>${s}`;
}
function startTimer() {
    if (isTimerRunning) return; isTimerRunning = true;
    timerInterval = setInterval(() => { secondsElapsed++; document.getElementById('time-display').innerHTML = formatTime(secondsElapsed); }, 1000);
}
function stopTimer() { clearInterval(timerInterval); isTimerRunning = false; }
document.getElementById('timer-btn').addEventListener('click', () => {
    if (confirm('Reset thời gian?')) { stopTimer(); secondsElapsed = 0; document.getElementById('time-display').innerHTML = formatTime(0); if (document.getElementById('testing-area').style.display === 'block') startTimer(); }
});
document.getElementById('sfx-btn').addEventListener('click', function() {
    sfxEnabled = !sfxEnabled; let icon = this.querySelector('i');
    if (sfxEnabled) { this.style.color = '#f59e0b'; icon.className = 'fa-solid fa-party-horn'; } else { this.style.color = '#9ca3af'; icon.className = 'fa-solid fa-bell-slash'; }
});
function spawnHearts() {
    const container = document.getElementById('effects-container');
    const box = document.getElementById('mascot').getBoundingClientRect();
    for (let i = 0; i < 20; i++) {
        let heart = document.createElement('i'); heart.className = 'fa-solid fa-heart heart-particle';
        heart.style.left = (box.left + 20) + 'px'; heart.style.top = (box.top + 20) + 'px';
        heart.style.setProperty('--tx', (Math.random() * 500 - 400) + 'px'); heart.style.setProperty('--ty', ((Math.random() * -400) - 200) + 'px');
        container.appendChild(heart); setTimeout(() => { heart.remove(); }, 1500);
    }
}