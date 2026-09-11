let allData = [];
let currentList = [];
let currentIndex = 0;
let currentCategory = 'word';
let currentLevel = 'HSK 3';
let currentBatchSize = 50;

let mistakeList = [];
let isReviewingMistakes = false;

let currentUser = localStorage.getItem('hsk_current_user') || 'Fix Chinese';

let dailyQueue = [];
let dailyIndex = 0;
let dailyMode = 'V2C';

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

function getLearningLog() {
    return JSON.parse(localStorage.getItem(`hsk_log_${currentUser}`)) || {};
}

function saveLearningLog(log) {
    localStorage.setItem(`hsk_log_${currentUser}`, JSON.stringify(log));
}

function updateItemLog(itemId, isCorrect) {
    let log = getLearningLog();
    let now = Date.now();
    if (!log[itemId]) {
        log[itemId] = { status: isCorrect ? 'mastered' : 'learning', streak: isCorrect ? 1 : 0, lastStudied: now };
    } else {
        log[itemId].lastStudied = now;
        if (isCorrect) {
            log[itemId].streak += 1;
            if (log[itemId].streak >= 2) log[itemId].status = 'mastered';
        } else {
            log[itemId].streak = 0;
            log[itemId].status = 'learning';
        }
    }
    saveLearningLog(log);
}

function getPrioritizedList(pool) {
    let log = getLearningLog();
    let now = Date.now();

    let scoredPool = pool.map(item => {
        let itemLog = log[item.id];
        let priorityScore = 0;
        if (!itemLog) {
            priorityScore = 50;
        } else if (itemLog.status === 'learning') {
            priorityScore = 100;
        } else {
            let daysAgo = (now - itemLog.lastStudied) / (1000 * 60 * 60 * 24);
            priorityScore = Math.floor(daysAgo * 10); 
        }
        return { item, score: priorityScore + Math.random() * 20 };
    });

    scoredPool.sort((a, b) => b.score - a.score);
    return scoredPool.map(entry => entry.item);
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
        ensureRichData();
        initUserManagement();
        initMenuEvents();
        initModalOutsideClick();
    });

function ensureRichData() {
    const extraWords = [
        { id: "EX_1", category: "word", level: "HSK 1", topic: "daily", hanzi: "我", pinyin: "wǒ", meaning_vn: "Tôi, mình", han_viet: "Ngã", radical: "戈", word_type: "Đại từ", expansion: "Ngôi thứ nhất.", examples: [], goc_lao_su: "Đại từ cơ bản." },
        { id: "EX_2", category: "word", level: "HSK 1", topic: "daily", hanzi: "你", pinyin: "nǐ", meaning_vn: "Bạn", han_viet: "Nễ", radical: "亻", word_type: "Đại từ", expansion: "Ngôi thứ hai.", examples: [], goc_lao_su: "Xưng hô." },
        { id: "EX_3", category: "word", level: "HSK 1", topic: "daily", hanzi: "他", pinyin: "tā", meaning_vn: "Anh ấy", han_viet: "Tha", radical: "亻", word_type: "Đại từ", expansion: "Ngôi thứ ba nam.", examples: [], goc_lao_su: "Chỉ nam giới." },
        { id: "EX_4", category: "word", level: "HSK 1", topic: "study", hanzi: "老师", pinyin: "lǎoshī", meaning_vn: "Giáo viên", han_viet: "Lão Sư", radical: "老", word_type: "Danh từ", expansion: "Thầy cô giáo.", examples: [], goc_lao_su: "Kính trọng." },
        { id: "EX_5", category: "word", level: "HSK 1", topic: "study", hanzi: "学生", pinyin: "xuésheng", meaning_vn: "Học sinh", han_viet: "Học Sinh", radical: "子", word_type: "Danh từ", expansion: "Người học.", examples: [], goc_lao_su: "Học tập." },
        { id: "EX_6", category: "word", level: "HSK 1", topic: "daily", hanzi: "书", pinyin: "shū", meaning_vn: "Sách", han_viet: "Thư", radical: "曰", word_type: "Danh từ", expansion: "Tài liệu đọc.", examples: [], goc_lao_su: "Vật dụng." },
        { id: "EX_7", category: "word", level: "HSK 1", topic: "daily", hanzi: "水", pinyin: "shuǐ", meaning_vn: "Nước", han_viet: "Thủy", radical: "水", word_type: "Danh từ", expansion: "Thức uống.", examples: [], goc_lao_su: "Bộ thủy." },
        { id: "EX_8", category: "word", level: "HSK 1", topic: "daily", hanzi: "吃", pinyin: "chī", meaning_vn: "Ăn", han_viet: "Cật", radical: "口", word_type: "Động từ", expansion: "Hành động ăn.", examples: [], goc_lao_su: "Động từ miệng." },
        { id: "EX_9", category: "word", level: "HSK 1", topic: "daily", hanzi: "看", pinyin: "kàn", meaning_vn: "Nhìn, xem", han_viet: "Khán", radical: "目", word_type: "Động từ", expansion: "Quan sát.", examples: [], goc_lao_su: "Bộ mục." },
        { id: "EX_10", category: "word", level: "HSK 1", topic: "daily", hanzi: "好", pinyin: "hǎo", meaning_vn: "Tốt", han_viet: "Hảo", radical: "女", word_type: "Tính từ", expansion: "Tích cực.", examples: [], goc_lao_su: "Tốt đẹp." }
    ];
    if (allData.filter(i => i.level === 'HSK 1' && i.category === 'word').length < 15) {
        allData = allData.concat(extraWords);
    }
}

function initModalOutsideClick() {
    const modalOverlay = document.getElementById('session-config-modal');
    const modalContent = document.getElementById('modal-inner-content');

    modalOverlay.onclick = (e) => {
        if (!modalContent.contains(e.target)) {
            modalOverlay.classList.add('hidden');
        }
    };
}

function initUserManagement() {
    const userinput = document.getElementById('current-username');
    userinput.value = currentUser;
    document.getElementById('stats-username-display').innerText = currentUser;

    userinput.onchange = (e) => {
        const val = e.target.value.trim();
        if(val) {
            currentUser = val;
            localStorage.setItem('hsk_current_user', currentUser);
            document.getElementById('stats-username-display').innerText = currentUser;
            sessionStats = getUserStats();
            updateStatsUI();
        }
    };
}

function initMenuEvents() {
    document.getElementById('brand-home-btn').onclick = (e) => {
        e.preventDefault();
        document.querySelectorAll('.app-view').forEach(v => v.classList.add('hidden'));
        document.getElementById('view-home').classList.remove('hidden');
        document.querySelectorAll('.sidebar-btn').forEach(m => m.classList.remove('active'));
    };

    document.querySelectorAll('.mega-dropdown a').forEach(link => {
        link.onclick = (e) => {
            e.preventDefault();
            const cat = e.target.getAttribute('data-cat');
            const lvl = e.target.getAttribute('data-level');
            
            currentCategory = cat;
            currentLevel = lvl;
            isReviewingMistakes = false;
            mistakeList = [];

            document.querySelectorAll('.app-view').forEach(v => v.classList.add('hidden'));
            document.getElementById('view-study').classList.remove('hidden');

            document.querySelectorAll('.sidebar-btn').forEach(m => m.classList.remove('active'));
            if(cat === 'sentence') {
                document.getElementById('btn-grammar').classList.add('active');
            } else {
                document.getElementById('btn-vocab').classList.add('active');
            }

            const prefix = cat === 'word' ? 'Học từ vựng' : 'Học ngữ pháp & câu văn';
            document.getElementById('view-title').innerText = `${prefix} ${lvl}`;

            sessionStats = getUserStats();
            updateStatsUI();
            filterAndLoadData();
        };
    });

    document.querySelectorAll('.sidebar-btn[data-target]').forEach(item => {
        item.onclick = (e) => {
            e.preventDefault();
            const target = item.getAttribute('data-target');
            document.querySelectorAll('.sidebar-btn').forEach(m => m.classList.remove('active'));
            item.classList.add('active');
            document.querySelectorAll('.app-view').forEach(v => v.classList.add('hidden'));
            document.getElementById(target).classList.remove('hidden');

            if(target === 'view-daily') {
                document.getElementById('daily-setup-panel').classList.remove('hidden');
                document.getElementById('daily-quiz-panel').classList.add('hidden');
            }

            if(target === 'view-stats') {
                renderUserStatsView();
            }
        };
    });
}

function goToSection(type) {
    document.querySelectorAll('.app-view').forEach(v => v.classList.add('hidden'));
    document.querySelectorAll('.sidebar-btn').forEach(m => m.classList.remove('active'));
    isReviewingMistakes = false;
    mistakeList = [];

    if (type === 'vocab') {
        currentCategory = 'word';
        currentLevel = 'HSK 3';
        document.getElementById('view-study').classList.remove('hidden');
        document.getElementById('btn-vocab').classList.add('active');
        document.getElementById('view-title').innerText = 'Học từ vựng HSK 3';
        filterAndLoadData();
    } else if (type === 'grammar') {
        currentCategory = 'sentence';
        currentLevel = 'HSK 3';
        document.getElementById('view-study').classList.remove('hidden');
        document.getElementById('btn-grammar').classList.add('active');
        document.getElementById('view-title').innerText = 'Học ngữ pháp & câu văn HSK 3';
        filterAndLoadData();
    } else if (type === 'workout') {
        document.getElementById('view-daily').classList.remove('hidden');
        document.getElementById('btn-workout').classList.add('active');
        document.getElementById('daily-setup-panel').classList.remove('hidden');
        document.getElementById('daily-quiz-panel').classList.add('hidden');
    }
}

function updateStatsUI() {
    document.getElementById('stat-total').innerText = sessionStats.total;
    document.getElementById('stat-correct').innerText = sessionStats.correct;
    document.getElementById('stat-wrong').innerText = sessionStats.wrong;
    document.getElementById('inline-mistake-count').innerText = mistakeList.length;
    const acc = sessionStats.total === 0 ? 0 : Math.round((sessionStats.correct / sessionStats.total) * 100);
    document.getElementById('stat-accuracy').innerText = `${acc}%`;
    saveUserStats(sessionStats);
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
    if(confirm(`Bạn có muốn làm mới dữ liệu thống kê của user [${currentUser}] không?`)) {
        sessionStats = { total: 0, correct: 0, wrong: 0 };
        saveUserStats(sessionStats);
        localStorage.removeItem(`hsk_log_${currentUser}`);
        renderUserStatsView();
        updateStatsUI();
        alert('Đã làm mới thành công!');
    }
};

function filterAndLoadData() {
    if (isReviewingMistakes) return;

    // RÀ SOÁT CHUẨN XÁC: Xáo trộn và phân cấp toàn diện cho MỌI PHẦN HỌC (Từ vựng, Ngữ pháp & câu văn)
    let filtered = allData.filter(item => item.category === currentCategory);
    if(currentLevel !== 'ALL') {
        filtered = filtered.filter(item => item.level === currentLevel);
    }
    
    let prioritizedPool = getPrioritizedList(filtered);
    
    let activeList = [...prioritizedPool];
    if (activeList.length > 0) {
        while (activeList.length < currentBatchSize && activeList.length < 500) {
            activeList = activeList.concat(shuffleArray(filtered));
        }
    }

    if(currentBatchSize !== 'ALL' && activeList.length > currentBatchSize) {
        currentList = activeList.slice(0, currentBatchSize);
    } else {
        currentList = activeList;
    }
    
    currentIndex = 0;
    loadStudyCard();
}

function loadStudyCard() {
    if(effectTimeout) clearTimeout(effectTimeout);
    const container = document.getElementById('flashcard-container');
    
    const counterElem = document.getElementById('study-progress-counter');
    if (counterElem) {
        const total = currentList.length;
        const currentNum = total === 0 ? 0 : (currentIndex + 1);
        counterElem.innerText = `Tiến độ: ${currentNum} / ${total}`;
    }

    updateStatsUI();

    if(currentList.length === 0) {
        container.innerHTML = `<h3 style='text-align:center; padding:30px; color:#15803d;'>🎉 Chưa có dữ liệu cho mục <strong>${currentLevel}</strong>! Hãy chọn cấp độ khác hoặc bổ sung thêm.</h3>`;
        document.getElementById('btn-check').classList.add('hidden');
        document.getElementById('btn-next').classList.add('hidden');
        return;
    }

    container.innerHTML = `
        <div class="card-front">
            <div class="card-top-info">
                <span id="level-badge" class="level-badge">${currentLevel} ${isReviewingMistakes ? '(Đang Ôn tập Từ Sai)' : ''}</span>
                <div id="question-header" class="question-header">${currentCategory === 'word' ? 'HÃY GÕ HÁN TỰ CHO TỪ:' : 'HÃY DỊCH HOẶC GÕ CÂU SAU:'}</div>
            </div>
            <p id="meaning-display" class="meaning-text"></p>
            
            <div class="tools-wrapper">
                <button id="btn-hint" class="btn-tool">💡 Gợi ý Pinyin</button>
                <button id="btn-audio" class="btn-tool">🔊 Nghe phát âm</button>
                <span id="hint-display" class="hint-text hidden"></span>
            </div>

            <div class="input-container" id="input-section">
                <input type="text" id="user-input" placeholder="Nhập câu trả lời..." autocomplete="off">
            </div>
            
            <div id="answer-reveal-box" class="hidden">
                <div id="hanzi-display" class="hanzi-large"></div>
                <div id="pinyin-display" class="pinyin-sub"></div>
            </div>
        </div>
        
        <div id="explanation-box" class="hidden">
            <div class="academic-info">
                <span class="info-badge">Hán Việt: <strong id="hanviet-display"></strong></span>
                <span class="info-badge">Bộ thủ: <strong id="radical-display"></strong></span>
                <span class="info-badge">Từ loại: <strong id="wordtype-display"></strong></span>
            </div>
            
            <div class="expansion-box" id="expansion-container">
                <strong>🌐 Mở rộng ý nghĩa & Cấp độ cận kề:</strong>
                <p id="expansion-text"></p>
            </div>

            <div class="explanation-grid">
                <div class="example-box">
                    <strong>📖 Ví dụ:</strong>
                    <div id="example-content"></div>
                </div>
                <div class="teacher-corner">
                    <strong>👨‍🏫 Góc Lão Sư:</strong>
                    <p id="grammar-display"></p>
                </div>
            </div>
        </div>
    `;

    if(currentIndex >= currentList.length) {
        container.innerHTML = `<h3 style='text-align:center; padding:30px; color:#16a34a;'>🎉 Hoàn thành phiên học hiện tại! Nhấn vào ô "Ôn tập" màu cam phía trên để luyện lại chính xác các từ chưa thuộc.</h3>`;
        document.getElementById('btn-check').classList.add('hidden');
        document.getElementById('btn-next').classList.add('hidden');
        return;
    }

    const item = currentList[currentIndex];
    document.getElementById('level-badge').innerText = item.level;
    document.getElementById('meaning-display').innerText = item.meaning_vn;
    document.getElementById('hanzi-display').innerText = item.hanzi;
    document.getElementById('pinyin-display').innerText = item.pinyin;
    document.getElementById('hanviet-display').innerText = item.han_viet || 'N/A';
    document.getElementById('radical-display').innerText = item.radical || 'N/A';
    document.getElementById('wordtype-display').innerText = item.word_type || 'N/A';
    document.getElementById('expansion-text').innerText = item.expansion || 'Đang cập nhật dữ liệu mở rộng...';
    document.getElementById('grammar-display').innerText = item.goc_lao_su;
    
    let exHtml = '';
    if(item.examples) {
        item.examples.forEach(ex => { exHtml += `<div>${ex.cn} (${ex.py}) - <em>${ex.vn}</em></div>`; });
    }
    document.getElementById('example-content').innerHTML = exHtml;

    document.getElementById('btn-hint').onclick = () => {
        const hintSpan = document.getElementById('hint-display');
        hintSpan.innerText = `(${item.pinyin})`;
        hintSpan.classList.remove('hidden');
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
            if(!checkBtn.classList.contains('hidden')) {
                checkBtn.click();
            } else if(!nextBtn.classList.contains('hidden')) {
                nextBtn.click();
            }
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
    const duckContainer = document.getElementById('duck-container');
    const hearts = document.getElementById('hearts-burst');
    const splash = document.getElementById('water-splash');

    // KHẮC PHỤC TRIỆT ĐỂ LỖI VỊT ĐỨNG HÌNH KHI GÕ NHANH LIÊN TIẾP: Reset DOM Reflow & Timeout
    if (effectTimeout) clearTimeout(effectTimeout);
    duckContainer.className = '';
    void duckContainer.offsetWidth;

    let isCorrect = (val === item.hanzi.toLowerCase() || val === item.pinyin.toLowerCase());
    
    updateItemLog(item.id, isCorrect);

    if(isCorrect) {
        sessionStats.correct++;
        document.getElementById('hanzi-display').style.color = "#16a34a";
        duckContainer.className = "duck-happy";
        hearts.classList.remove('hidden');
        splash.classList.add('hidden');
        playSound('correct');
    } else {
        sessionStats.wrong++;
        document.getElementById('hanzi-display').style.color = "#dc2626";
        duckContainer.className = "duck-sad";
        splash.classList.remove('hidden');
        hearts.classList.add('hidden');
        playSound('wrong');

        if (!mistakeList.some(m => m.id === item.id)) {
            mistakeList.push(item);
        }
    }

    // Đảm bảo chính xác 1.5 giây (1500ms) rồi tự động đưa về trạng thái bình thường duck-idle
    effectTimeout = setTimeout(() => {
        hearts.classList.add('hidden');
        splash.classList.add('hidden');
        duckContainer.className = "duck-idle";
    }, 1500);

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
        alert("Tuyệt vời! Hiện tại chưa có từ nào trả lời sai trong tiến trình này để ôn tập.");
        return;
    }
    isReviewingMistakes = true;
    currentList = shuffleArray([...mistakeList]);
    currentIndex = 0;
    loadStudyCard();
};

document.getElementById('btn-config-session').onclick = () => document.getElementById('session-config-modal').classList.remove('hidden');
document.querySelectorAll('.batch-btn').forEach(b => {
    b.onclick = (e) => {
        const v = e.target.getAttribute('data-batch');
        currentBatchSize = v === 'ALL' ? 'ALL' : parseInt(v);
        document.getElementById('session-config-modal').classList.add('hidden');
        isReviewingMistakes = false;
        mistakeList = [];
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

// ==========================================
// WORKOUT (MỞ RỘNG XÁO TRỘN TOÀN DIỆN CHO CẢ WORKOUT)
// ==========================================
function getLevelRank(lvlStr) {
    if (!lvlStr) return 0;
    if (lvlStr.includes('Cao cấp')) return 10;
    const match = lvlStr.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
}

document.getElementById('btn-start-daily').onclick = () => {
    const selectedLvl = document.getElementById('daily-level').value;
    dailyMode = document.getElementById('daily-mode').value;
    const topic = document.getElementById('daily-topic').value;
    const count = parseInt(document.getElementById('daily-count').value);

    let pool = allData.filter(i => i.category === 'context_story' && i.topic === topic);
    if(pool.length === 0) {
        pool = allData.filter(i => i.category === 'context_story');
    }

    if (selectedLvl !== 'ALL') {
        const targetRank = getLevelRank(selectedLvl);
        pool = pool.filter(i => getLevelRank(i.level) <= targetRank);
    }

    let activePool = [...pool];
    if (activePool.length > 0) {
        while (activePool.length < count) {
            activePool = activePool.concat(shuffleArray(pool));
        }
    }

    dailyQueue = shuffleArray(activePool).slice(0, count);

    if(dailyQueue.length === 0) {
        alert(`Không tìm thấy dữ liệu ngữ cảnh phù hợp cho cấp độ [${selectedLvl}] trở xuống!`);
        return;
    }

    dailyIndex = 0;
    document.getElementById('daily-setup-panel').classList.add('hidden');
    document.getElementById('daily-quiz-panel').classList.remove('hidden');
    
    const topicTextMap = { 'work': '💼 Đi làm / Công sở', 'outing': '🌳 Dã ngoại / Đi chơi', 'study': '📚 Học tập / Trường lớp', 'daily': '☕ Đời sống hằng ngày' };
    document.getElementById('quiz-context-banner').innerText = `📌 Chủ đề: ${topicTextMap[topic] || 'Tổng hợp'} (Ôn lùi <= ${selectedLvl})`;
    
    loadDailyQuestion();
};

function loadDailyQuestion() {
    if(dailyIndex >= dailyQueue.length) {
        document.getElementById('quiz-question-text').innerText = "🎉 Hoàn thành xuất sắc chuỗi hội thoại ôn lùi!";
        document.getElementById('quiz-btn-submit').classList.add('hidden');
        return;
    }

    const item = dailyQueue[dailyIndex];
    document.getElementById('quiz-progress-text').innerText = `Tiến độ: Câu ${dailyIndex + 1} / ${dailyQueue.length}`;
    
    if(dailyMode === 'V2C') {
        document.getElementById('quiz-direction').innerText = "Dịch từ Tiếng Việt sang Tiếng Trung trong ngữ cảnh:";
        document.getElementById('quiz-question-text').innerText = item.meaning_vn;
    } else {
        document.getElementById('quiz-direction').innerText = "Hiểu nghĩa câu tiếng Trung trong ngữ cảnh sau:";
        document.getElementById('quiz-question-text').innerText = item.hanzi;
    }

    document.getElementById('quiz-text-input').value = '';
    document.getElementById('quiz-feedback').classList.add('hidden');
    document.getElementById('quiz-btn-submit').classList.remove('hidden');
    document.getElementById('quiz-btn-next').classList.add('hidden');
    document.getElementById('quiz-text-input').focus();
}

document.getElementById('quiz-btn-submit').onclick = () => {
    const item = dailyQueue[dailyIndex];
    const textVal = document.getElementById('quiz-text-input').value.trim();
    const target = dailyMode === 'V2C' ? item.hanzi : item.meaning_vn;
    let isCorrect = (textVal.toLowerCase() === target.toLowerCase());

    const fb = document.getElementById('quiz-feedback');
    fb.classList.remove('hidden');

    if(isCorrect) {
        playSound('correct');
        fb.innerHTML = `<span style="color: #16a34a; font-weight: bold;">✅ Chính xác tuyệt đối!</span>`;
    } else {
        playSound('wrong');
        fb.innerHTML = `<span style="color: #dc2626; font-weight: bold;">❌ Chưa chính xác. Đáp án: ${target}</span>`;
    }

    document.getElementById('quiz-btn-submit').classList.add('hidden');
    document.getElementById('quiz-btn-next').classList.remove('hidden');
    document.getElementById('quiz-btn-next').focus();
};

document.getElementById('quiz-btn-next').onclick = () => {
    dailyIndex++;
    loadDailyQuestion();
};