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

/* =========================================================
   HÀM QUÉT DỮ LIỆU THÔNG MINH (CHỐNG LỖI VIẾT HOA/THƯỜNG)
========================================================= */
function getSafeValue(obj, possibleKeys, fallback = "") {
    if (!obj) return fallback;
    let keysObj = Object.keys(obj);
    for (let pKey of possibleKeys) {
        let lowerPKey = pKey.toLowerCase();
        let foundKey = keysObj.find(k => k.toLowerCase() === lowerPKey);
        if (foundKey && obj[foundKey] !== null && obj[foundKey] !== "") {
            return obj[foundKey];
        }
    }
    return fallback;
}

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
    // Nếu level là chuỗi '7_9', điều chỉnh lại Text hiển thị
    if (level === '7_9') levelText = ' HSK 7-9';
    
    document.getElementById('module-title').innerText = `Cấu hình bài tập: ${title}${levelText}`;
    document.getElementById('test-main-title').innerText = title;
    
    let badgeText = level ? `HSK ${level}` : 'TỔNG HỢP';
    if (level === '7_9') badgeText = 'HSK 7-9';
    document.getElementById('hsk-badge-display').innerText = badgeText;

    try {
        // PHÁ CACHE TRÌNH DUYỆT BẰNG THỜI GIAN THỰC
        let timestamp = new Date().getTime();
        let url = (moduleType === 'workout') 
            ? `data/context_workout.json?t=${timestamp}` 
            : `data/hsk${level}.json?t=${timestamp}`;

        if (moduleType === 'workout') {
            document.getElementById('study-mode').style.display = 'none'; 
        } else {
            document.getElementById('study-mode').style.display = 'inline-block';
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error`);
        currentData = await response.json();
        
        isReviewMode = false;
        checkErrorLedgerStatus(); 
    } catch (error) {
        let errorMsgLevel = level === '7_9' ? '7_9' : level;
        alert(`Không tải được dữ liệu. Bạn hãy F5 tải lại trang hoặc kiểm tra file data/hsk${errorMsgLevel}.json có trên Github chưa nhé.`);
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
            let word = getSafeValue(item, ['hanzi', 'word', 'chinese', 'tu'], 'Câu hỏi');
            let pinyin = getSafeValue(item, ['pinyin', 'phienam'], '');
            let meaning = getSafeValue(item, ['vietnamese', 'meaning', 'translation', 'vn', 'situation'], '');
            div.innerHTML = `${word} <span style="color:#ef4444; float:right;">Cần ôn</span><span class="error-item-pinyin">${pinyin} - ${meaning}</span>`;
            listContainer.appendChild(div);
        });
    }
}

function checkErrorLedgerStatus() {
    let reviewBtnTop = document.getElementById('review-btn');
    let reviewBtnBottom = document.getElementById('review-btn-bottom');
    let reviewCount = document.getElementById('review-count-bottom');
    
    if (errorLedger.length > 0) {
        reviewBtnTop.style.display = 'inline-block';
        reviewBtnTop.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Ôn tập câu sai (${errorLedger.length})`;
        reviewBtnBottom.style.display = 'block';
        reviewCount.innerText = errorLedger.length;
    } else {
        reviewBtnTop.style.display = 'none';
        reviewBtnBottom.style.display = 'none';
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
        alert(`Hoàn thành bài tập!\nĐúng: ${stats.correct}\nSai: ${stats.wrong}\nThời gian: ${document.getElementById('time-display').innerText}`);
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
    
    // GỌI HÀM QUÉT DỮ LIỆU ĐỂ CHẮC CHẮN 100% CÓ DATA
    let vnFallbackText = getSafeValue(currentQuestion, ['vietnamese', 'meaning', 'translation', 'vn', 'nghia'], 'Dữ liệu tiếng Việt đang trống');
    let hzFallbackText = getSafeValue(currentQuestion, ['hanzi', 'word', 'chinese', 'tu'], 'Dữ liệu tiếng Trung đang trống');

    if (currentModuleType === 'workout') {
        displayElem.innerText = getSafeValue(currentQuestion, ['situation'], vnFallbackText);
        hintGroup.style.display = 'none'; 
        instructionText.innerText = "(Gõ tiếng Trung)";
    } else {
        hintGroup.style.display = 'flex';
        if (mode === 'vi-zh') { 
            displayElem.innerText = vnFallbackText;
            instructionText.innerText = "(Gõ Pinyin/Hán)";
        } else if (mode === 'zh-vi') { 
            displayElem.innerText = hzFallbackText;
            instructionText.innerText = "(Gõ Tiếng Việt)";
        } else if (mode === 'zh-zh') { 
            displayElem.innerText = hzFallbackText;
            instructionText.innerText = "(Nhìn Hán, gõ Pinyin ra Hán)";
        }
    }
    
    document.getElementById('pinyin-hint-display').style.display = 'none';
    let inputElem = document.getElementById('answer-input');
    inputElem.value = ''; inputElem.focus();
    
    document.getElementById('check-btn').innerText = "Kiểm tra đáp án";
    
    document.getElementById('result-area').style.display = 'none';
    document.getElementById('hanzi-writer-container').innerHTML = ''; 
}

function showPinyinHint() {
    let hintBox = document.getElementById('pinyin-hint-display');
    let py = getSafeValue(currentQuestion, ['pinyin', 'phienam'], 'Không có dữ liệu');
    hintBox.innerText = `Pinyin: ${py}`;
    hintBox.style.display = 'block';
}
function playAudioHint() {
    let hz = getSafeValue(currentQuestion, ['hanzi', 'word', 'chinese', 'tu'], '');
    if(hz) {
        let msg = new SpeechSynthesisUtterance(hz);
        msg.lang = 'zh-CN'; window.speechSynthesis.speak(msg);
    }
}

function sanitizeString(str) { return (!str) ? "" : str.replace(/[.,!?;:。，！？；：()]/g, '').trim().toLowerCase(); }

function triggerEnter() { 
    if (!isWaitingForNext) { checkAnswer(); } else { nextQuestion(); }
}
document.getElementById('answer-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); triggerEnter(); }
});

function checkAnswer() {
    let rawInput = document.getElementById('answer-input').value;
    let userAnswer = sanitizeString(rawInput);
    let mode = document.getElementById('study-mode').value;
    let isCorrect = false;
    
    if (userAnswer !== "") {
        if (currentModuleType === 'workout') {
            let sgk = sanitizeString(getSafeValue(currentQuestion, ['text_sgk', 'hanzi'], ''));
            let native = sanitizeString(getSafeValue(currentQuestion, ['text_native'], ''));
            isCorrect = (userAnswer === sgk || userAnswer === native);
        } else {
            if (mode === 'zh-vi') {
                let vn = getSafeValue(currentQuestion, ['vietnamese', 'meaning', 'translation', 'vn'], "");
                let arr = vn.split(/[,;]/).map(i => sanitizeString(i));
                isCorrect = arr.some(k => k !== "" && (userAnswer.includes(k) || k.includes(userAnswer)));
            } else {
                let hz = sanitizeString(getSafeValue(currentQuestion, ['hanzi', 'word', 'chinese'], ""));
                let py = sanitizeString(getSafeValue(currentQuestion, ['pinyin', 'phienam'], ""));
                isCorrect = (userAnswer === hz || userAnswer === py);
            }
        }
    }
    
    isWaitingForNext = true; 
    showResult(isCorrect, rawInput);
}

function showResult(isCorrect, rawInput) {
    let resultArea = document.getElementById('result-area');
    resultArea.style.display = 'block';
    
    let echo = document.getElementById('user-input-echo');
    echo.innerText = rawInput || "(Không nhập đáp án)";
    echo.className = isCorrect ? 'correct-text' : 'wrong-text';

    let statusBanner = document.getElementById('status-banner');
    if (isCorrect) {
        statusBanner.className = 'status-banner correct';
        statusBanner.innerHTML = '<i class="fa-solid fa-check"></i> ĐÚNG';
        stats.correct++;
    } else {
        statusBanner.className = 'status-banner wrong';
        statusBanner.innerHTML = '<i class="fa-solid fa-xmark"></i> SAI';
        stats.wrong++;
    }
    updateStatsUI();
    
    if (currentModuleType === 'workout') {
        document.getElementById('standard-result-layout').style.display = 'none';
        document.getElementById('workout-result-layout').style.display = 'block';
        
        let woStatus = document.getElementById('wo-status-banner');
        woStatus.className = isCorrect ? 'status-banner correct' : 'status-banner wrong';
        woStatus.innerHTML = isCorrect ? '<i class="fa-solid fa-check"></i> ĐÚNG' : '<i class="fa-solid fa-xmark"></i> SAI';

        document.getElementById('wo-user').innerText = rawInput || "(Để trống)";
        document.getElementById('wo-sgk').innerText = getSafeValue(currentQuestion, ['text_sgk', 'hanzi'], 'Đang cập nhật');
        document.getElementById('wo-native').innerText = getSafeValue(currentQuestion, ['text_native'], 'Đang cập nhật');
        document.getElementById('wo-explain').innerHTML = getSafeValue(currentQuestion, ['goc_lao_su', 'note'], 'Giao tiếp bản xứ.');
    } else {
        document.getElementById('standard-result-layout').style.display = 'block';
        document.getElementById('workout-result-layout').style.display = 'none';
        
        let hanziChar = getSafeValue(currentQuestion, ['hanzi', 'word', 'chinese'], "Đang tải");
        document.getElementById('correct-hanzi').innerText = hanziChar;
        document.getElementById('correct-pinyin').innerText = getSafeValue(currentQuestion, ['pinyin', 'phienam'], "Đang tải");
        
        let mode = document.getElementById('study-mode').value;
        let vietHighlight = document.getElementById('correct-vietnamese-highlight');
        if (mode === 'zh-vi') {
            vietHighlight.style.display = 'inline-block';
            vietHighlight.innerText = getSafeValue(currentQuestion, ['vietnamese', 'meaning', 'translation', 'vn'], "Đang tải...");
        } else {
            vietHighlight.style.display = 'none';
        }
        
        document.getElementById('hanviet-text').innerText = getSafeValue(currentQuestion, ['hanviet', 'hv'], "Đang cập nhật");
        document.getElementById('radical-text').innerText = getSafeValue(currentQuestion, ['radical', 'bothu', 'bo'], "Đang cập nhật");
        document.getElementById('pos-text').innerText = getSafeValue(currentQuestion, ['type', 'tuloai', 'pos'], "Đang cập nhật");
        
        document.getElementById('usage-text').innerHTML = getSafeValue(currentQuestion, ['vietnamese', 'meaning', 'translation', 'vn'], "Đang cập nhật");
        document.getElementById('example-text').innerHTML = getSafeValue(currentQuestion, ['example', 'vidu'], "Đang cập nhật");
        document.getElementById('laosu-text').innerHTML = getSafeValue(currentQuestion, ['goc_lao_su', 'note', 'explain'], "Đang cập nhật");

        document.getElementById('hanzi-writer-container').innerHTML = '';
        document.getElementById('writer-btn').onclick = function() {
            let container = document.getElementById('hanzi-writer-container');
            container.innerHTML = '';
            if(hanziChar && hanziChar.length > 0) {
                for(let i=0; i<hanziChar.length; i++) {
                    let char = hanziChar.charAt(i);
                    if(/[\u4e00-\u9fa5]/.test(char)) {
                        let div = document.createElement('div');
                        div.id = 'writer-char-' + i;
                        div.className = 'hanzi-char-box';
                        container.appendChild(div);
                        HanziWriter.create(div.id, char, {
                            width: 80, height: 80, padding: 5, strokeAnimationSpeed: 1, delayBetweenStrokes: 100
                        }).loopCharacterAnimation();
                    }
                }
            }
        };
    }
    
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
    checkErrorLedgerStatus(); 

    setTimeout(() => { mascot.className = 'mascot-duck'; }, 1500);
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