let allData = [];
let currentList = [];
let currentIndex = 0;
let currentCategory = 'word';
let currentLevel = 'HSK 3';
let currentBatchSize = 50;

let mistakeList = [];
let isReviewingMistakes = false;

let currentUser = localStorage.getItem('hsk_current_user') || 'Fix Chinese';

// WORKOUT CONFIG
let currentWorkoutSet = [];
let workoutConfig = {
    level: 'HSK 3',
    format: 'dialogue',
    topic: 'daily',
    mode: 'V2C',
    count: 5
};

let effectTimeout = null;
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    
    if (type === 'correct') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(783.99, now);
        gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
    } else {
        osc.type = 'triangle'; osc.frequency.setValueAtTime(150, now);
        gain.gain.setValueAtTime(0.4, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    }
}

function shuffleArray(array) {
    let arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function getUserStats() {
    return JSON.parse(localStorage.getItem(`hsk_stats_${currentUser}`)) || { total: 0, correct: 0, wrong: 0 };
}

function saveUserStats(stats) {
    localStorage.setItem(`hsk_stats_${currentUser}`, JSON.stringify(stats));
}

let sessionStats = getUserStats();

fetch('data.json')
    .then(res => res.json())
    .then(data => {
        allData = data;
        initSmartHamburgerMenu();
        initUserManagement();
        initWorkoutModule();
        initModalEvents();
    });

// ==========================================
// 1. CƠ CHẾ MENU THẺ NỔI (LUÔN TỰ ĐÓNG KHI CHỌN HOẶC RỜI CHUỘT)
// ==========================================
function initSmartHamburgerMenu() {
    const menuContainer = document.getElementById('menu-container');
    const btnToggle = document.getElementById('btn-toggle-menu');
    const floatingMenu = document.getElementById('floating-nav-card');
    let closeTimer = null;

    function openMenu() {
        if (closeTimer) clearTimeout(closeTimer);
        floatingMenu.classList.remove('hidden');
    }

    function closeMenu() {
        floatingMenu.classList.add('hidden');
        document.querySelectorAll('.nav-card-item').forEach(el => el.classList.remove('active-mobile-sub'));
    }

    // Khi di chuột vào nút ☰ hoặc menu -> Tự động mở
    menuContainer.addEventListener('mouseenter', openMenu);

    // Khi di chuột ra ngoài -> Tự động đóng sau 250ms cực mượt
    menuContainer.addEventListener('mouseleave', () => {
        closeTimer = setTimeout(closeMenu, 250);
    });

    // Bấm nút ☰ trên màn hình cảm ứng hoặc click
    btnToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (floatingMenu.classList.contains('hidden')) {
            openMenu();
        } else {
            closeMenu();
        }
    });

    // Chạm ra ngoài màn hình -> Tự động thu vào ngay
    document.addEventListener('click', (e) => {
        if (!menuContainer.contains(e.target)) {
            closeMenu();
        }
    });

    // Xử lý các thẻ con trên màn hình cảm ứng điện thoại
    document.querySelectorAll('.nav-card-item.has-sub').forEach(item => {
        item.addEventListener('click', function(e) {
            if (e.target.tagName !== 'A' && window.innerWidth <= 768) {
                this.classList.toggle('active-mobile-sub');
            }
        });
    });

    // Chọn thẻ Trang Chủ
    document.getElementById('card-home').onclick = () => {
        showView('view-home');
        closeMenu();
    };

    // Chọn một cấp độ con trong Từ vựng hoặc Ngữ pháp
    document.querySelectorAll('.sub-flyout-panel a').forEach(link => {
        link.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const cat = link.getAttribute('data-cat');
            const lvl = link.getAttribute('data-level');

            currentCategory = cat;
            currentLevel = lvl;
            isReviewingMistakes = false;
            mistakeList = [];

            showView('view-study');
            document.getElementById('view-title').innerText = `${cat === 'word' ? 'Học từ vựng' : 'Học ngữ pháp & câu văn'} ${lvl}`;
            filterAndLoadData();

            // Tự động thu gọn menu ngay khi chọn xong
            closeMenu();
        };
    });

    // Chọn Workout
    document.getElementById('card-workout').onclick = () => {
        showView('view-daily');
        document.getElementById('daily-setup-panel').classList.remove('hidden');
        document.getElementById('daily-quiz-panel').classList.add('hidden');
        closeMenu();
    };

    // Chọn Thống Kê
    document.getElementById('card-stats').onclick = () => {
        renderUserStatsView();
        showView('view-stats');
        closeMenu();
    };

    // Nhấn Logo về Trang chủ
    document.getElementById('brand-logo-btn').onclick = () => showView('view-home');
}

function initUserManagement() {
    const userinput = document.getElementById('current-username');
    userinput.value = currentUser;
    document.getElementById('top-user-display').innerText = currentUser;
    document.getElementById('stats-username-display').innerText = currentUser;

    userinput.onchange = (e) => {
        const val = e.target.value.trim();
        if(val) {
            currentUser = val;
            localStorage.setItem('hsk_current_user', currentUser);
            document.getElementById('top-user-display').innerText = currentUser;
            document.getElementById('stats-username-display').innerText = currentUser;
            sessionStats = getUserStats();
            updateStatsUI();
        }
    };
}

function showView(viewId) {
    document.querySelectorAll('.app-view').forEach(v => v.classList.add('hidden'));
    const target = document.getElementById(viewId);
    if(target) target.classList.remove('hidden');
}

function goToSection(type) {
    if (type === 'vocab') {
        currentCategory = 'word';
        currentLevel = 'HSK 3';
        showView('view-study');
        document.getElementById('view-title').innerText = 'Học từ vựng HSK 3';
        filterAndLoadData();
    } else if (type === 'grammar') {
        currentCategory = 'sentence';
        currentLevel = 'HSK 3';
        showView('view-study');
        document.getElementById('view-title').innerText = 'Học ngữ pháp & câu văn HSK 3';
        filterAndLoadData();
    } else if (type === 'workout') {
        showView('view-daily');
        document.getElementById('daily-setup-panel').classList.remove('hidden');
        document.getElementById('daily-quiz-panel').classList.add('hidden');
    }
}

// ==========================================
// 2. WORKOUT NGỮ CẢNH: CHUỖI NHIỀU CÂU & BÁO CÁO UYỂN CHUYỂN
// ==========================================
function getLevelRank(lvlStr) {
    if (!lvlStr) return 0;
    if (lvlStr.includes('Cao cấp')) return 10;
    const match = lvlStr.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
}

function initWorkoutModule() {
    const btnStart = document.getElementById('btn-start-daily');
    const btnSubmitAll = document.getElementById('btn-workout-submit-all');
    const btnReconfig = document.getElementById('btn-workout-reconfigure');
    const modalDecision = document.getElementById('workout-decision-modal');

    btnStart.onclick = () => {
        workoutConfig.level = document.getElementById('daily-level').value;
        workoutConfig.format = document.getElementById('daily-format').value;
        workoutConfig.topic = document.getElementById('daily-topic').value;
        workoutConfig.mode = document.getElementById('daily-mode').value;
        workoutConfig.count = parseInt(document.getElementById('daily-count').value);

        generateWorkoutSet();
    };

    btnReconfig.onclick = () => {
        document.getElementById('daily-quiz-panel').classList.add('hidden');
        document.getElementById('daily-setup-panel').classList.remove('hidden');
    };

    btnSubmitAll.onclick = () => {
        modalDecision.classList.remove('hidden');
    };

    document.getElementById('btn-decide-grade').onclick = () => {
        modalDecision.classList.add('hidden');
        gradeEntireWorkout(true);
    };

    document.getElementById('btn-decide-continue').onclick = () => {
        modalDecision.classList.add('hidden');
        gradeEntireWorkout(false);
        generateWorkoutSet();
    };

    document.getElementById('btn-decide-review').onclick = () => {
        modalDecision.classList.add('hidden');
    };
}

function generateWorkoutSet() {
    let pool = allData.filter(i => i.category === 'context_story' || i.category === 'sentence');

    let topicPool = pool.filter(i => i.topic === workoutConfig.topic);
    if (topicPool.length >= workoutConfig.count) {
        pool = topicPool;
    }

    if (workoutConfig.level !== 'ALL') {
        const targetRank = getLevelRank(workoutConfig.level);
        let rankPool = pool.filter(i => getLevelRank(i.level) <= targetRank);
        if (rankPool.length >= workoutConfig.count) {
            pool = rankPool;
        }
    }

    let shuffled = shuffleArray(pool);
    if (shuffled.length < workoutConfig.count) {
        while (shuffled.length < workoutConfig.count) {
            shuffled = shuffled.concat(shuffleArray(pool));
        }
    }

    currentWorkoutSet = shuffled.slice(0, workoutConfig.count);

    const formatNames = {
        'dialogue': '💬 Đoạn hội thoại thực tế',
        'paragraph': '📝 Đoạn văn ngắn miêu tả',
        'news': '📰 Bản tin thời sự',
        'report': '🎙️ Phóng sự thực tế'
    };
    const topicNames = {
        'daily': 'Đời sống thường nhật',
        'work': 'Công sở & Kinh doanh',
        'outing': 'Du lịch & Dã ngoại',
        'study': 'Giảng đường & Học thuật'
    };

    document.getElementById('workout-theme-badge').innerText = 
        `${formatNames[workoutConfig.format] || 'Ngữ cảnh'} • ${topicNames[workoutConfig.topic] || 'Đời sống'} (Ôn lùi ≤ ${workoutConfig.level})`;

    renderWorkoutItemsList();

    document.getElementById('daily-setup-panel').classList.add('hidden');
    document.getElementById('daily-quiz-panel').classList.remove('hidden');
}

function renderWorkoutItemsList() {
    const listContainer = document.getElementById('workout-items-list');
    listContainer.innerHTML = '';

    currentWorkoutSet.forEach((item, idx) => {
        const promptText = workoutConfig.mode === 'V2C' ? item.meaning_vn : item.hanzi;
        const speakerPrefix = workoutConfig.format === 'dialogue' ? `Nhân vật ${idx % 2 === 0 ? 'A' : 'B'}:` : `Câu ${idx + 1}:`;

        const row = document.createElement('div');
        row.className = 'workout-sentence-row';
        row.id = `workout-row-${idx}`;

        row.innerHTML = `
            <div class="w-row-header">
                <span class="w-sentence-num">Câu ${idx + 1} / ${currentWorkoutSet.length}</span>
                <span class="w-speaker-label">${speakerPrefix}</span>
            </div>
            <div class="w-prompt-text">${promptText}</div>
            <div class="w-input-group">
                <input type="text" class="w-text-input" id="workout-input-${idx}" placeholder="${workoutConfig.mode === 'V2C' ? 'Nhập chữ Hán hoặc Pinyin...' : 'Nhập nghĩa tiếng Việt...'}" autocomplete="off">
                <button class="btn-check-single" onclick="checkSingleWorkoutItem(${idx})">✓ Kiểm tra câu này</button>
            </div>
            <div id="workout-feedback-${idx}" class="w-single-feedback hidden"></div>
        `;
        listContainer.appendChild(row);
    });
}

window.checkSingleWorkoutItem = function(index) {
    const item = currentWorkoutSet[index];
    const input = document.getElementById(`workout-input-${index}`);
    const fb = document.getElementById(`workout-feedback-${index}`);
    const row = document.getElementById(`workout-row-${index}`);
    const val = input.value.trim().toLowerCase();

    if (!val) {
        alert("Vui lòng nhập câu trả lời trước khi kiểm tra!");
        return;
    }

    const expected = workoutConfig.mode === 'V2C' ? item.hanzi.toLowerCase() : item.meaning_vn.toLowerCase();
    const pinyinExpected = (item.pinyin || '').toLowerCase();
    const isCorrect = (val === expected || (workoutConfig.mode === 'V2C' && val === pinyinExpected));

    triggerDuckReaction(isCorrect);

    fb.classList.remove('hidden');
    if (isCorrect) {
        row.className = 'workout-sentence-row correct-row';
        fb.className = 'w-single-feedback correct';
        fb.innerHTML = `<strong>✅ Chính xác!</strong> Chuẩn Hán tự: <strong>${item.hanzi}</strong> (${item.pinyin || ''})`;
        playSound('correct');
    } else {
        row.className = 'workout-sentence-row wrong-row';
        fb.className = 'w-single-feedback wrong';
        fb.innerHTML = `<strong>❌ Cần đối chiếu:</strong><br>• Đáp án chuẩn: <strong>${item.hanzi}</strong><br>• Phiên âm: <em>${item.pinyin || ''}</em><br>• Dịch nghĩa: ${item.meaning_vn}<br>• <strong>Góc Lão Sư:</strong> ${item.goc_lao_su || 'Lưu ý trật tự từ và các hư từ.'}`;
        playSound('wrong');
    }
};

function gradeEntireWorkout(showExplanations) {
    let correctCount = 0;
    currentWorkoutSet.forEach((item, idx) => {
        const input = document.getElementById(`workout-input-${idx}`);
        const fb = document.getElementById(`workout-feedback-${idx}`);
        const row = document.getElementById(`workout-row-${idx}`);
        const val = (input ? input.value.trim().toLowerCase() : '');

        const expected = workoutConfig.mode === 'V2C' ? item.hanzi.toLowerCase() : item.meaning_vn.toLowerCase();
        const pinyinExpected = (item.pinyin || '').toLowerCase();
        const isCorrect = (val === expected || (workoutConfig.mode === 'V2C' && val === pinyinExpected));

        sessionStats.total++;
        if (isCorrect) {
            correctCount++;
            sessionStats.correct++;
            if (row) row.className = 'workout-sentence-row correct-row';
            if (fb && showExplanations) {
                fb.classList.remove('hidden');
                fb.className = 'w-single-feedback correct';
                fb.innerHTML = `<strong>✅ Chính xác!</strong> (${item.hanzi})`;
            }
        } else {
            sessionStats.wrong++;
            if (row) row.className = 'workout-sentence-row wrong-row';
            if (fb && showExplanations) {
                fb.classList.remove('hidden');
                fb.className = 'w-single-feedback wrong';
                fb.innerHTML = `<strong>❌ Đáp án:</strong> ${item.hanzi} (${item.pinyin || ''})<br>• <strong>Góc Lão Sư:</strong> ${item.goc_lao_su || 'Chú ý cấu trúc câu.'}`;
            }
        }
    });

    saveUserStats(sessionStats);
    updateStatsUI();

    if (showExplanations) {
        alert(`🎉 Kết quả phiên luyện tập: Bạn làm đúng ${correctCount} / ${currentWorkoutSet.length} câu! Hãy kéo xem lại giải thích chi tiết phía dưới.`);
    }
}

function triggerDuckReaction(isCorrect) {
    const duckContainer = document.getElementById('duck-container');
    const hearts = document.getElementById('hearts-burst');
    const splash = document.getElementById('water-splash');

    if (effectTimeout) clearTimeout(effectTimeout);
    duckContainer.className = '';
    void duckContainer.offsetWidth;

    if (isCorrect) {
        duckContainer.className = "duck-happy";
        if (hearts) hearts.classList.remove('hidden');
        if (splash) splash.classList.add('hidden');
    } else {
        duckContainer.className = "duck-sad";
        if (splash) splash.classList.remove('hidden');
        if (hearts) hearts.classList.add('hidden');
    }

    effectTimeout = setTimeout(() => {
        if (hearts) hearts.classList.add('hidden');
        if (splash) splash.classList.add('hidden');
        duckContainer.className = "duck-idle";
    }, 1500);
}

// ==========================================
// 3. TỪ VỰNG & NGỮ PHÁP
// ==========================================
function updateStatsUI() {
    const totalElem = document.getElementById('stat-total');
    if (totalElem) totalElem.innerText = sessionStats.total;
    const corElem = document.getElementById('stat-correct');
    if (corElem) corElem.innerText = sessionStats.correct;
    const wrgElem = document.getElementById('stat-wrong');
    if (wrgElem) wrgElem.innerText = sessionStats.wrong;
    const mCount = document.getElementById('inline-mistake-count');
    if (mCount) mCount.innerText = mistakeList.length;
    const accElem = document.getElementById('stat-accuracy');
    const acc = sessionStats.total === 0 ? 0 : Math.round((sessionStats.correct / sessionStats.total) * 100);
    if (accElem) accElem.innerText = `${acc}%`;
}

function renderUserStatsView() {
    const stats = getUserStats();
    document.getElementById('user-total-learned').innerText = stats.total;
    document.getElementById('user-total-correct').innerText = stats.correct;
    document.getElementById('user-total-wrong').innerText = stats.wrong;
    const acc = stats.total === 0 ? 0 : Math.round((stats.correct / stats.total) * 100);
    document.getElementById('user-total-acc').innerText = `${acc}%`;
}

document.getElementById('btn-reset-user-stats').onclick = () => {
    if(confirm(`Bạn có chắc muốn làm mới dữ liệu của [${currentUser}] không?`)) {
        sessionStats = { total: 0, correct: 0, wrong: 0 };
        saveUserStats(sessionStats);
        renderUserStatsView();
        updateStatsUI();
        alert('Đã xóa dữ liệu thành công!');
    }
};

function filterAndLoadData() {
    if (isReviewingMistakes) return;

    let filtered = allData.filter(item => item.category === currentCategory);
    if(currentLevel !== 'ALL') {
        filtered = filtered.filter(item => item.level === currentLevel);
    }
    
    let prioritized = shuffleArray(filtered);
    if (currentBatchSize !== 'ALL' && prioritized.length > currentBatchSize) {
        currentList = prioritized.slice(0, currentBatchSize);
    } else {
        currentList = prioritized;
    }
    
    currentIndex = 0;
    loadStudyCard();
}

function loadStudyCard() {
    const container = document.getElementById('flashcard-container');
    const counterElem = document.getElementById('study-progress-counter');
    if (counterElem) {
        counterElem.innerText = `Tiến độ: ${currentList.length === 0 ? 0 : (currentIndex + 1)} / ${currentList.length}`;
    }

    updateStatsUI();

    if(currentList.length === 0 || currentIndex >= currentList.length) {
        container.innerHTML = `<h3 style='text-align:center; padding:30px; color:#15803d;'>🎉 Bạn đã hoàn thành danh sách học tập này!</h3>`;
        document.getElementById('btn-check').classList.add('hidden');
        document.getElementById('btn-next').classList.add('hidden');
        return;
    }

    const item = currentList[currentIndex];
    container.innerHTML = `
        <div class="card-front">
            <div class="card-top-info">
                <span id="level-badge" class="level-badge">${item.level}</span>
                <div class="question-header">${currentCategory === 'word' ? 'HÃY GÕ HÁN TỰ CHO TỪ:' : 'HÃY DỊCH HOẶC GÕ CÂU:'}</div>
            </div>
            <p class="meaning-text">${item.meaning_vn}</p>
            
            <div class="tools-wrapper">
                <button id="btn-hint" class="btn-tool">💡 Gợi ý Pinyin</button>
                <button id="btn-audio" class="btn-tool">🔊 Nghe phát âm</button>
                <span id="hint-display" class="hint-text hidden">(${item.pinyin})</span>
            </div>

            <div class="input-container">
                <input type="text" id="user-input" placeholder="Nhập câu trả lời..." autocomplete="off">
            </div>
            
            <div id="answer-reveal-box" class="hidden">
                <div id="hanzi-display" class="hanzi-large">${item.hanzi}</div>
                <div id="pinyin-display" class="pinyin-sub">${item.pinyin}</div>
            </div>
        </div>
        
        <div id="explanation-box" class="hidden">
            <div class="academic-info">
                <span class="info-badge">Hán Việt: <strong>${item.han_viet || 'N/A'}</strong></span>
                <span class="info-badge">Bộ thủ: <strong>${item.radical || 'N/A'}</strong></span>
                <span class="info-badge">Từ loại: <strong>${item.word_type || 'N/A'}</strong></span>
            </div>
            <div class="expansion-box">
                <strong>🌐 Mở rộng ý nghĩa:</strong>
                <p>${item.expansion || 'Đang cập nhật...'}</p>
            </div>
            <div class="explanation-grid">
                <div class="example-box">
                    <strong>📖 Ví dụ:</strong>
                    <div>${(item.examples && item.examples.length) ? item.examples.map(ex => `${ex.cn} (${ex.py}) - <em>${ex.vn}</em>`).join('<br>') : 'Chưa có ví dụ.'}</div>
                </div>
                <div class="teacher-corner">
                    <strong>👨‍🏫 Góc Lão Sư:</strong>
                    <p>${item.goc_lao_su || 'Chú ý ngữ cảnh sử dụng.'}</p>
                </div>
            </div>
        </div>
    `;

    document.getElementById('btn-hint').onclick = () => {
        document.getElementById('hint-display').classList.remove('hidden');
    };

    document.getElementById('btn-audio').onclick = () => {
        const utterance = new SpeechSynthesisUtterance(item.hanzi);
        utterance.lang = 'zh-CN';
        utterance.rate = 0.8;
        window.speechSynthesis.speak(utterance);
    };

    const userInput = document.getElementById('user-input');
    userInput.focus();
    userInput.onkeydown = (e) => {
        if(e.key === 'Enter') {
            const checkBtn = document.getElementById('btn-check');
            const nextBtn = document.getElementById('btn-next');
            if(!checkBtn.classList.contains('hidden')) checkBtn.click();
            else if(!nextBtn.classList.contains('hidden')) nextBtn.click();
        }
    };

    document.getElementById('btn-check').classList.remove('hidden');
    document.getElementById('btn-next').classList.add('hidden');
    document.getElementById('progress-fill').style.width = `${((currentIndex + 1) / currentList.length) * 100}%`;
}

document.getElementById('btn-check').addEventListener('click', () => {
    const item = currentList[currentIndex];
    const inputElem = document.getElementById('user-input');
    if(!inputElem) return;
    const val = inputElem.value.trim().toLowerCase();
    
    sessionStats.total++;
    let isCorrect = (val === item.hanzi.toLowerCase() || val === item.pinyin.toLowerCase());
    
    triggerDuckReaction(isCorrect);

    if(isCorrect) {
        sessionStats.correct++;
        document.getElementById('hanzi-display').style.color = "#16a34a";
        playSound('correct');
    } else {
        sessionStats.wrong++;
        document.getElementById('hanzi-display').style.color = "#dc2626";
        playSound('wrong');
        if (!mistakeList.some(m => m.id === item.id)) mistakeList.push(item);
    }

    updateStatsUI();
    document.getElementById('answer-reveal-box').classList.remove('hidden');
    document.getElementById('explanation-box').classList.remove('hidden');
    document.getElementById('btn-check').classList.add('hidden');
    document.getElementById('btn-next').classList.remove('hidden');
    document.getElementById('btn-next').focus();
});

document.getElementById('btn-next').addEventListener('click', () => {
    currentIndex++;
    loadStudyCard();
});

document.getElementById('btn-inline-review').onclick = () => {
    if (mistakeList.length === 0) {
        alert("Tuyệt vời! Bạn chưa có câu nào làm sai để ôn tập.");
        return;
    }
    isReviewingMistakes = true;
    currentList = shuffleArray([...mistakeList]);
    currentIndex = 0;
    loadStudyCard();
};

function initModalEvents() {
    document.getElementById('btn-config-session').onclick = () => document.getElementById('session-config-modal').classList.remove('hidden');
    
    document.querySelectorAll('.batch-btn').forEach(b => {
        b.onclick = (e) => {
            const v = e.target.getAttribute('data-batch');
            currentBatchSize = v === 'ALL' ? 'ALL' : parseInt(v);
            document.getElementById('session-config-modal').classList.add('hidden');
            filterAndLoadData();
        };
    });

    document.getElementById('btn-shuffle').onclick = () => {
        if (currentList.length > 0) {
            currentList = shuffleArray(currentList);
            currentIndex = 0;
            loadStudyCard();
        }
    };
}