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

/* --- RÚT MENU TỰ ĐỘNG KHI CLICK --- */
document.querySelectorAll('.nav-menu li').forEach(li => {
    li.addEventListener('click', () => {
        let parentMenu = li.closest('.nav-menu');
        if(parentMenu) {
            parentMenu.style.visibility = 'hidden';
            parentMenu.style.opacity = '0';
            setTimeout(() => {
                parentMenu.style.visibility = '';
                parentMenu.style.opacity = '';
            }, 300); 
        }
    });
});

function goHome() {
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById('home-view').classList.add('active');
    stopTimer(); secondsElapsed = 0;
    document.getElementById('time-display').innerHTML = formatTime(0);
}

/* --- TẢI MODULE (CÓ WORKOUT VÀ THỐNG KÊ MỚI) --- */
async function loadModule(moduleType, level) {
    currentModuleType = moduleType;
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    
    // NẾU LÀ MODULE THỐNG KÊ
    if (moduleType === 'stats') {
        document.getElementById('stats-view').classList.add('active');
        renderStatsDashboard();
        return;
    }

    // CÁC MODULE LÀM BÀI
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
        // NẾU LÀ WORKOUT -> Tải file context_workout.json
        if (moduleType === 'workout') {
            const response = await fetch(`data/context_workout.json`);
            if (!response.ok) throw new Error(`HTTP error`);
            currentData = await response.json();
            // Ẩn menu chọn chế độ vì Workout mặc định là Hỏi Việt -> Gõ Trung
            document.getElementById('study-mode').style.display = 'none'; 
        } else {
            // CÁC MODULE KHÁC
            document.getElementById('study-mode').style.display = 'inline-block';
            const response = await fetch(`data/hsk${level}.json`);
            if (!response.ok) throw new Error(`HTTP error`);
            currentData = await response.json();
        }
        
        isReviewMode = false;
        checkErrorLedgerStatus(); 
    } catch (error) {
        alert(`Không tìm thấy dữ liệu. Đảm bảo bạn đã có tệp JSON tương ứng trong thư mục data/.`);
        currentData = [];
    }
}

function renderStatsDashboard() {
    let listContainer = document.getElementById('error-ledger-list');
    listContainer.innerHTML = '';
    
    if (errorLedger.length === 0) {
        listContainer.innerHTML = '<p style="color:#10b981; font-weight:bold;">Tuyệt vời! Bạn không có lỗ hổng kiến thức nào cần ôn tập.</p>';
    } else {
        errorLedger.forEach(item => {
            let div = document.createElement('div');
            div.className = 'error-item';
            let word = item.hanzi || item.word || 'Câu hỏi ẩn';
            let pinyin = item.pinyin || '';
            let meaning = item.vietnamese || item.meaning || item.situation || '';
            div.innerHTML = `${word} <span style="color:#ef4444; float:right;">Cần ôn</span><span class="error-item-pinyin">${pinyin} - ${meaning}</span>`;
            listContainer.appendChild(div);
        });
    }
}

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
    
    // Chuyển view nếu đang ở trang Thống kê
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
    let hintGroup = document.getElementById('hint-buttons-group');
    let instructionText = document.getElementById('instruction-text');
    
    if (currentModuleType === 'workout') {
        // NẾU LÀ WORKOUT: Hỏi Việt (Tình huống)
        displayElem.innerText = currentQuestion.situation || currentQuestion.vietnamese || "Tình huống giả định";
        hintGroup.style.display = 'none'; // Ẩn gợi ý
        instructionText.innerText = "Yêu cầu: Gõ câu giao tiếp Tiếng Trung";
    } else {
        // CÁC MODULE KHÁC
        hintGroup.style.display = 'flex';
        if (mode === 'vi-zh') { // Hỏi Việt
            displayElem.innerText = currentQuestion.meaning || currentQuestion.vietnamese;
            instructionText.innerText = "Yêu cầu: Gõ Pinyin hoặc Hán tự";
        } else if (mode === 'zh-vi') { // Hỏi Trung
            displayElem.innerText = currentQuestion.hanzi || currentQuestion.word;
            instructionText.innerText = "Yêu cầu: Gõ nghĩa Tiếng Việt";
        } else if (mode === 'zh-zh') { // Hỏi Trung -> Trung
            displayElem.innerText = currentQuestion.hanzi || currentQuestion.word;
            instructionText.innerText = "Yêu cầu: Nhìn Hán tự, gõ Pinyin để ra chữ Hán";
        }
    }
    
    document.getElementById('pinyin-hint-display').style.display = 'none';
    let inputElem = document.getElementById('answer-input');
    inputElem.value = '';
    inputElem.focus();
    
    let btn = document.getElementById('check-btn');
    btn.innerText = "Kiểm tra Đáp án (Enter)";
    btn.className = "big-green-btn";
    
    document.getElementById('result-area').style.display = 'none';
}

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

function sanitizeString(str) {
    if (!str) return "";
    return str.replace(/[.,!?;:。，！？；：]/g, '').trim().toLowerCase();
}

function triggerEnter() {
    if (!isWaitingForNext) { checkAnswer(); } else { nextQuestion(); }
}

document.getElementById('answer-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); triggerEnter(); }
});

function checkAnswer() {
    let rawInput = document.getElementById('answer-input').value;
    if (rawInput.trim() === '') return; 
    
    let userAnswer = sanitizeString(rawInput);
    let mode = document.getElementById('study-mode').value;
    let isCorrect = false;
    
    if (currentModuleType === 'workout') {
        // Đối chiếu Workout
        let sgk = sanitizeString(currentQuestion.text_sgk || currentQuestion.hanzi);
        let native = sanitizeString(currentQuestion.text_native);
        isCorrect = (userAnswer === sgk || userAnswer === native);
    } else {
        // Đối chiếu module thường
        if (mode === 'zh-vi') {
            let vietnameseMeaning = currentQuestion.vietnamese || currentQuestion.meaning || currentQuestion.translation || "";
            let meaningArray = vietnameseMeaning.split(/[,;]/).map(item => sanitizeString(item));
            isCorrect = meaningArray.some(keyword => keyword !== "" && (userAnswer.includes(keyword) || keyword.includes(userAnswer)));
        } else if (mode === 'vi-zh' || mode === 'zh-zh') {
            let hanzi = sanitizeString(currentQuestion.hanzi || currentQuestion.word);
            let pinyin = sanitizeString(currentQuestion.pinyin);
            isCorrect = (userAnswer === hanzi || userAnswer === pinyin);
        }
    }
    
    isWaitingForNext = true; 
    showResult(isCorrect, rawInput);
}

function showResult(isCorrect, rawInput) {
    let resultArea = document.getElementById('result-area');
    resultArea.style.display = 'block';
    
    let btn = document.getElementById('check-btn');
    btn.innerText = "Tiếp tục (Enter) ➔";
    btn.className = "big-green-btn next";
    
    let statusBanner = document.getElementById('status-banner');
    if (isCorrect) {
        statusBanner.className = 'status-banner correct';
        statusBanner.innerHTML = '<i class="fa-solid fa-check"></i> Chính xác';
        stats.correct++;
    } else {
        statusBanner.className = 'status-banner wrong';
        statusBanner.innerHTML = '<i class="fa-solid fa-xmark"></i> Chưa chính xác';
        stats.wrong++;
    }
    updateStatsUI();
    
    // ĐIỀU PHỐI LAYOUT HIỂN THỊ
    if (currentModuleType === 'workout') {
        document.getElementById('standard-result-layout').style.display = 'none';
        document.getElementById('workout-result-layout').style.display = 'block';
        
        document.getElementById('wo-user').innerText = rawInput;
        document.getElementById('wo-sgk').innerText = currentQuestion.text_sgk || currentQuestion.hanzi || 'Chưa có data';
        document.getElementById('wo-native').innerText = currentQuestion.text_native || 'Chưa có data';
        document.getElementById('wo-explain').innerHTML = currentQuestion.goc_lao_su || 'Giao tiếp bản xứ thường rút gọn từ ngữ để tự nhiên hơn.';
        
    } else {
        document.getElementById('standard-result-layout').style.display = 'block';
        document.getElementById('workout-result-layout').style.display = 'none';
        
        document.getElementById('user-input-echo').innerText = rawInput;
        
        let hanziChar = currentQuestion.hanzi || currentQuestion.word;
        document.getElementById('correct-hanzi').innerText = hanziChar;
        document.getElementById('correct-pinyin').innerText = currentQuestion.pinyin || '';
        document.getElementById('correct-meaning').innerText = currentQuestion.vietnamese || currentQuestion.meaning || currentQuestion.translation || '';
        
        let example = currentQuestion.example || 'Chưa có ví dụ cho từ này.';
        document.getElementById('usage-text').innerHTML = example;
        
        let laosu = currentQuestion.goc_lao_su || 'Đang cập nhật phân tích.';
        document.getElementById('laosu-text').innerHTML = laosu;

        // VẼ BÚT THUẬN HANZI WRITER
        document.getElementById('hanzi-writer-container').innerHTML = ''; 
        if(hanziChar && hanziChar.length > 0) {
            let charToDraw = hanziChar.charAt(0); 
            HanziWriter.create('hanzi-writer-container', charToDraw, {
                width: 140, height: 140, padding: 5, strokeAnimationSpeed: 1, delayBetweenStrokes: 100
            }).loopCharacterAnimation();
        }
    }
    
    // ANIMATION MASCOT (KHÔNG MÂY MƯA)
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
    
    // Tự động kéo cuộn mượt mà
    resultArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function nextQuestion() {
    currentIndex++;
    loadQuestion();
    document.getElementById('testing-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

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
function stopTimer() { clearInterval(timerInterval); isTimerRunning = false; }
document.getElementById('timer-btn').addEventListener('click', () => {
    if (confirm('Bạn muốn Reset thời gian?')) {
        stopTimer(); secondsElapsed = 0; document.getElementById('time-display').innerHTML = formatTime(0);
        if (document.getElementById('testing-area').style.display === 'block') startTimer();
    }
});
document.getElementById('sfx-btn').addEventListener('click', function() {
    sfxEnabled = !sfxEnabled;
    let icon = this.querySelector('i');
    if (sfxEnabled) { this.style.color = '#f59e0b'; icon.className = 'fa-solid fa-party-horn'; } 
    else { this.style.color = '#9ca3af'; icon.className = 'fa-solid fa-bell-slash'; }
});
function spawnHearts() {
    const container = document.getElementById('effects-container');
    const mascotBox = document.getElementById('mascot').getBoundingClientRect();
    for (let i = 0; i < 20; i++) {
        let heart = document.createElement('i');
        heart.className = 'fa-solid fa-heart heart-particle';
        heart.style.left = (mascotBox.left + 20) + 'px'; heart.style.top = (mascotBox.top + 20) + 'px';
        let tx = (Math.random() * 500 - 400) + 'px';  let ty = ((Math.random() * -400) - 200) + 'px'; 
        heart.style.setProperty('--tx', tx); heart.style.setProperty('--ty', ty);
        container.appendChild(heart);
        setTimeout(() => { heart.remove(); }, 1500);
    }
}