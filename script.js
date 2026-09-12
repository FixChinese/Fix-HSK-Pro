let allData = [];
let currentList = [];
let currentIndex = 0;
let currentCategory = 'word';
let currentLevel = 'HSK 1';
let currentBatchSize = 50;

let mistakeList = [];
let isReviewingMistakes = false;

let currentUser = localStorage.getItem('hsk_current_user') || 'Fix Chinese';

// CẤU HÌNH WORKOUT
let currentWorkoutSet = [];
let workoutConfig = {
    level: 'HSK 1',
    format: 'dialogue',
    topic: 'daily',
    mode: 'V2C',
    count: 10
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
        osc.type = 'sine'; osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.15, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now); osc.stop(now + 0.35);
    } else {
        osc.type = 'triangle'; osc.frequency.setValueAtTime(140, now);
        gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now); osc.stop(now + 0.25);
    }
}

// XÓA DẤU CÂU VÀ KHOẢNG TRẮNG ĐỂ ĐỐI CHIẾU
function stripAllPunctuation(str) {
    if (!str) return '';
    return str.toString()
        .toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'，。！？、“”‘’（）]/g, '')
        .replace(/\s+/g, '')
        .trim();
}

function evaluateAnswerQuality(userInput, targetHanzi, targetPinyin) {
    const rawInput = (userInput || '').trim();
    const cleanInput = stripAllPunctuation(rawInput);
    const cleanTarget = stripAllPunctuation(targetHanzi);
    const cleanPinyin = stripAllPunctuation(targetPinyin);

    const isBaseCorrect = (cleanInput === cleanTarget || (cleanPinyin && cleanInput === cleanPinyin));

    if (!isBaseCorrect) return { isCorrect: false, warning: null };

    let warningMsg = null;
    const targetHasQuestion = /[?？]/.test(targetHanzi);
    const inputHasQuestion = /[?？]/.test(rawInput);
    if (targetHasQuestion && !inputHasQuestion) {
        warningMsg = "Bạn nên thêm dấu chấm hỏi <strong>？</strong> ở cuối câu để hoàn thiện câu nghi vấn chuẩn tiếng Trung.";
    }

    const targetHasComma = /[,，]/.test(targetHanzi);
    const inputHasComma = /[,，]/.test(rawInput);
    if (targetHasComma && !inputHasComma && !warningMsg) {
        warningMsg = "Bạn nên thêm dấu phẩy <strong>，</strong> giữa các vế để ngắt nhịp câu chuẩn xác hơn.";
    }

    return { isCorrect: true, warning: warningMsg };
}

function shuffleArray(array) {
    let arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// TÁCH BIỆT BỘ ĐẾM
let lifetimeStats = JSON.parse(localStorage.getItem(`hsk_stats_${currentUser}`)) || { total: 0, correct: 0, wrong: 0 };
let sessionStats = { total: 0, correct: 0, wrong: 0 };

function saveLifetimeStats() {
    localStorage.setItem(`hsk_stats_${currentUser}`, JSON.stringify(lifetimeStats));
}

function updateSessionStatsUI() {
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

    // Hiển thị nút ôn tập nếu có câu sai
    const btnReview = document.getElementById('btn-inline-review');
    if (btnReview) {
        if (mistakeList.length > 0) btnReview.classList.remove('hidden');
        else btnReview.classList.add('hidden');
    }
}

function renderUserStatsView() {
    document.getElementById('user-total-learned').innerText = lifetimeStats.total;
    document.getElementById('user-total-correct').innerText = lifetimeStats.correct;
    document.getElementById('user-total-wrong').innerText = lifetimeStats.wrong;
    const acc = lifetimeStats.total === 0 ? 0 : Math.round((lifetimeStats.correct / lifetimeStats.total) * 100);
    document.getElementById('user-total-acc').innerText = `${acc}%`;
}

// KHỞI ĐỘNG HỆ THỐNG
fetch('data.json')
    .then(res => res.json())
    .then(data => {
        allData = data;
        initSmartMenu();
        initUserManagement();
        initWorkoutModule();
        initModalEvents();
    })
    .catch(err => console.error("Lỗi nạp file data.json:", err));

// ==========================================
// MENU THẢ NỔI VÀ KHÓA CUỘN MOBILE
// ==========================================
function initSmartMenu() {
    const menuWrapper = document.getElementById('menu-wrapper');
    const btnToggle = document.getElementById('btn-toggle-menu');
    const floatingMenu = document.getElementById('floating-nav-card');
    const backdrop = document.getElementById('menu-overlay-backdrop');
    const btnCloseMobile = document.getElementById('btn-close-floating-menu');
    let hoverTimeout = null;

    function openDesktop() {
        if (window.innerWidth > 768) {
            clearTimeout(hoverTimeout);
            floatingMenu.classList.remove('hidden');
        }
    }

    function closeDesktop() {
        if (window.innerWidth > 768) {
            hoverTimeout = setTimeout(() => {
                floatingMenu.classList.add('hidden');
            }, 350); // Tăng thời gian chờ an toàn
        }
    }

    function openMobile() {
        floatingMenu.classList.remove('hidden');
        floatingMenu.classList.add('mobile-active');
        backdrop.classList.add('active');
        document.body.classList.add('menu-open-mobile');
    }

    function closeMobile() {
        floatingMenu.classList.remove('mobile-active');
        backdrop.classList.remove('active');
        document.body.classList.remove('menu-open-mobile');
        setTimeout(() => floatingMenu.classList.add('hidden'), 350);
        document.querySelectorAll('.nav-card-item.has-sub').forEach(el => el.classList.remove('mobile-expanded'));
    }

    menuWrapper.addEventListener('mouseenter', openDesktop);
    menuWrapper.addEventListener('mouseleave', closeDesktop);

    btnToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.innerWidth <= 768) {
            if (floatingMenu.classList.contains('mobile-active')) closeMobile();
            else openMobile();
        } else {
            floatingMenu.classList.toggle('hidden');
        }
    });

    if (btnCloseMobile) btnCloseMobile.onclick = closeMobile;
    if (backdrop) backdrop.onclick = closeMobile;

    document.querySelectorAll('.nav-card-item.has-sub').forEach(item => {
        item.addEventListener('click', function(e) {
            if (window.innerWidth <= 768 && e.target.tagName !== 'A') {
                this.classList.toggle('mobile-expanded');
            }
        });
    });

    document.getElementById('card-home').onclick = () => {
        showView('view-home');
        if (window.innerWidth <= 768) closeMobile(); else floatingMenu.classList.add('hidden');
    };

    document.querySelectorAll('.sub-flyout-panel a').forEach(link => {
        link.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            currentCategory = link.getAttribute('data-cat');
            currentLevel = link.getAttribute('data-level');
            isReviewingMistakes = false;
            
            showView('view-study');
            document.getElementById('view-title').innerText = `${currentCategory === 'word' ? 'Học từ vựng' : 'Học ngữ pháp & câu văn'} ${currentLevel}`;
            filterAndLoadData();

            if (window.innerWidth <= 768) closeMobile(); else floatingMenu.classList.add('hidden');
        };
    });

    document.getElementById('card-workout').onclick = () => {
        showView('view-daily');
        document.getElementById('daily-setup-panel').classList.remove('hidden');
        document.getElementById('daily-quiz-panel').classList.add('hidden');
        if (window.innerWidth <= 768) closeMobile(); else floatingMenu.classList.add('hidden');
    };

    document.getElementById('card-stats').onclick = () => {
        renderUserStatsView();
        showView('view-stats');
        if (window.innerWidth <= 768) closeMobile(); else floatingMenu.classList.add('hidden');
    };

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
            
            lifetimeStats = JSON.parse(localStorage.getItem(`hsk_stats_${currentUser}`)) || { total: 0, correct: 0, wrong: 0 };
            sessionStats = { total: 0, correct: 0, wrong: 0 };
            
            updateSessionStatsUI();
            renderUserStatsView();
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
        currentLevel = 'HSK 1';
        showView('view-study');
        document.getElementById('view-title').innerText = 'Học từ vựng HSK 1';
        filterAndLoadData();
    } else if (type === 'grammar') {
        currentCategory = 'sentence';
        currentLevel = 'HSK 1';
        showView('view-study');
        document.getElementById('view-title').innerText = 'Học ngữ pháp & câu văn HSK 1';
        filterAndLoadData();
    } else if (type === 'workout') {
        showView('view-daily');
        document.getElementById('daily-setup-panel').classList.remove('hidden');
        document.getElementById('daily-quiz-panel').classList.add('hidden');
    }
}

// ==========================================
// WORKOUT THỰC CHIẾN
// ==========================================
function getLevelRank(lvlStr) {
    if (!lvlStr) return 0;
    if (lvlStr.includes('Cao cấp') || lvlStr.includes('7')) return 7;
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
    let pool = allData.filter(i => i.category === 'sentence');

    let topicPool = pool.filter(i => i.topic === workoutConfig.topic);
    if (topicPool.length > 0) pool = topicPool;

    if (workoutConfig.level !== 'ALL') {
        const targetRank = getLevelRank(workoutConfig.level);
        let rankPool = pool.filter(i => getLevelRank(i.level) <= targetRank);
        if (rankPool.length > 0) pool = rankPool;
    }

    pool = shuffleArray(pool);

    if (pool.length > 0 && pool.length < workoutConfig.count) {
        let tempArr = [...pool];
        while (tempArr.length < workoutConfig.count) {
            tempArr = tempArr.concat(shuffleArray(pool));
        }
        currentWorkoutSet = tempArr.slice(0, workoutConfig.count);
    } else {
        currentWorkoutSet = pool.slice(0, workoutConfig.count);
    }

    const formatNames = {
        'dialogue': '💬 Đoạn hội thoại thực tế',
        'paragraph': '📝 Đoạn văn miêu tả bối cảnh',
        'news': '📰 Bản tin bài báo',
        'report': '🎙️ Phóng sự thực tế'
    };
    const topicNames = {
        'daily': 'Đời sống thường nhật',
        'work': 'Công sở & Kinh doanh',
        'outing': 'Du lịch & Dã ngoại',
        'study': 'Học thuật & Giảng đường'
    };

    document.getElementById('workout-theme-badge').innerText = 
        `${formatNames[workoutConfig.format] || 'Ngữ cảnh'} • ${topicNames[workoutConfig.topic] || 'Đời sống'} (Cấp độ ≤ ${workoutConfig.level})`;

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
                <button class="btn-check-single" onclick="checkSingleWorkoutItem(${idx}, this)">✓ Kiểm tra câu này</button>
            </div>
            <div id="workout-feedback-${idx}" class="w-single-feedback hidden"></div>
        `;
        listContainer.appendChild(row);
    });
}

window.checkSingleWorkoutItem = function(index, btnElement) {
    const item = currentWorkoutSet[index];
    const input = document.getElementById(`workout-input-${index}`);
    const fb = document.getElementById(`workout-feedback-${index}`);
    const row = document.getElementById(`workout-row-${index}`);
    const rawVal = input.value.trim();

    if (!rawVal) {
        alert("Vui lòng nhập câu trả lời trước khi kiểm tra!");
        return;
    }

    let result;
    if (workoutConfig.mode === 'V2C') {
        result = evaluateAnswerQuality(rawVal, item.hanzi, item.pinyin);
    } else {
        const cleanVal = stripAllPunctuation(rawVal);
        const cleanVn = stripAllPunctuation(item.meaning_vn);
        const isVnMatch = (cleanVal === cleanVn || cleanVn.includes(cleanVal) || cleanVal.includes(cleanVn));
        result = { isCorrect: isVnMatch, warning: null };
    }

    if (!item.isGraded) {
        lifetimeStats.total++;
        if (result.isCorrect) lifetimeStats.correct++;
        else lifetimeStats.wrong++;
        item.isGraded = true;
        saveLifetimeStats();
        if(btnElement) {
            btnElement.style.opacity = '0.5';
            btnElement.style.pointerEvents = 'none';
        }
    }

    triggerDuckReaction(result.isCorrect);
    fb.classList.remove('hidden');

    if (result.isCorrect) {
        row.className = 'workout-sentence-row correct-row';
        fb.className = 'w-single-feedback correct';
        let feedbackHtml = `<strong>✅ Chính xác!</strong> Đáp án: <strong>${item.hanzi}</strong> (${item.pinyin || ''})`;
        if (result.warning) {
            feedbackHtml += `<div style="margin-top: 8px; padding: 8px 12px; background: #fffbeb; border: 1px solid #fde047; border-radius: 6px; color: #854d0e; font-size: 13px;">
                💡 <strong>Khuyến cáo:</strong> ${result.warning}
            </div>`;
        }
        fb.innerHTML = feedbackHtml;
        playSound('correct');
    } else {
        row.className = 'workout-sentence-row wrong-row';
        fb.className = 'w-single-feedback wrong';
        fb.innerHTML = `<strong>❌ Cần đối chiếu:</strong><br>• Đáp án chuẩn: <strong>${item.hanzi}</strong><br>• Phiên âm: <em>${item.pinyin || ''}</em><br>• Dịch nghĩa: ${item.meaning_vn}<br>• <strong>Góc Lão Sư:</strong> ${item.goc_lao_su || 'Chú ý trật tự từ.'}`;
        playSound('wrong');
    }
};

function gradeEntireWorkout(showExplanations) {
    let correctCount = 0;
    currentWorkoutSet.forEach((item, idx) => {
        const input = document.getElementById(`workout-input-${idx}`);
        const fb = document.getElementById(`workout-feedback-${idx}`);
        const row = document.getElementById(`workout-row-${idx}`);
        const rawVal = input ? input.value.trim() : '';
        const btn = row.querySelector('.btn-check-single');

        let result;
        if (workoutConfig.mode === 'V2C') {
            result = evaluateAnswerQuality(rawVal, item.hanzi, item.pinyin);
        } else {
            const cleanVal = stripAllPunctuation(rawVal);
            const cleanVn = stripAllPunctuation(item.meaning_vn);
            result = { isCorrect: (cleanVal === cleanVn || cleanVn.includes(cleanVal) || cleanVal.includes(cleanVn)), warning: null };
        }

        if (!item.isGraded) {
            lifetimeStats.total++;
            if (result.isCorrect) lifetimeStats.correct++;
            else lifetimeStats.wrong++;
            item.isGraded = true;
            if(btn) { btn.style.opacity = '0.5'; btn.style.pointerEvents = 'none'; }
        }

        if (result.isCorrect) {
            correctCount++;
            if (row) row.className = 'workout-sentence-row correct-row';
            if (fb && showExplanations) {
                fb.classList.remove('hidden');
                fb.className = 'w-single-feedback correct';
                let html = `<strong>✅ Chính xác!</strong> (${item.hanzi})`;
                if(result.warning) html += `<br><small style="color:#854d0e;">💡 ${result.warning}</small>`;
                fb.innerHTML = html;
            }
        } else {
            if (row) row.className = 'workout-sentence-row wrong-row';
            if (fb && showExplanations) {
                fb.classList.remove('hidden');
                fb.className = 'w-single-feedback wrong';
                fb.innerHTML = `<strong>❌ Đáp án:</strong> ${item.hanzi} (${item.pinyin || ''})<br>• <strong>Góc Lão Sư:</strong> ${item.goc_lao_su || 'Lưu ý kết cấu câu.'}`;
            }
        }
    });

    saveLifetimeStats();

    if (showExplanations) {
        alert(`🎉 Bạn đã làm đúng ${correctCount} / ${currentWorkoutSet.length} câu! Hãy kéo lên xuống để xem chi tiết.`);
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
// 4. BÀI HỌC FLASHCARD 
// ==========================================
document.getElementById('btn-reset-user-stats').onclick = () => {
    if(confirm(`Bạn có chắc muốn làm mới dữ liệu thống kê của [${currentUser}] không?`)) {
        lifetimeStats = { total: 0, correct: 0, wrong: 0 };
        saveLifetimeStats();
        renderUserStatsView();
        alert('Dữ liệu thống kê đã được đưa về 0!');
    }
};

document.getElementById('btn-refresh').onclick = () => {
    filterAndLoadData(); // Nút làm mới bài
};

function filterAndLoadData() {
    if (isReviewingMistakes) return;

    // LUÔN RESET BỘ ĐẾM KHI VÀO PHIÊN MỚI
    sessionStats = { total: 0, correct: 0, wrong: 0 };
    mistakeList = [];
    updateSessionStatsUI();

    let filtered = allData.filter(item => item.category === currentCategory && item.level === currentLevel);
    filtered = shuffleArray(filtered);

    if (currentBatchSize !== 'ALL' && filtered.length > 0) {
        let tempArr = [...filtered];
        while (tempArr.length < currentBatchSize) {
            tempArr = tempArr.concat(shuffleArray(filtered));
        }
        currentList = tempArr.slice(0, currentBatchSize);
    } else {
        currentList = filtered;
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

    updateSessionStatsUI();

    if(currentList.length === 0 || currentIndex >= currentList.length) {
        container.innerHTML = `<h3 style='text-align:center; padding:35px; color:#15803d; font-size:19px;'>🎉 Bạn đã hoàn thành toàn bộ danh sách thẻ học này!</h3>`;
        document.getElementById('btn-check').classList.add('hidden');
        document.getElementById('btn-next').classList.add('hidden');
        return;
    }

    const item = currentList[currentIndex];
    container.innerHTML = `
        <div class="card-front">
            <div class="card-top-info">
                <span id="level-badge" class="level-badge">${item.level}</span>
                <div class="question-header">${currentCategory === 'word' ? 'TỪ VỰNG - HÃY GÕ CHỮ HÁN HOẶC PINYIN:' : 'NGỮ PHÁP - HÃY DỊCH HOẶC GÕ CÂU:'}</div>
            </div>
            <p class="meaning-text">${item.meaning_vn}</p>
            
            <div class="tools-wrapper">
                <button id="btn-hint" class="btn-tool">💡 Bật mí Pinyin</button>
                <button id="btn-audio" class="btn-tool">🔊 Phát âm bản xứ</button>
                <span id="hint-display" class="hint-text hidden">(${item.pinyin})</span>
            </div>

            <div class="input-container">
                <input type="text" id="user-input" placeholder="Nhập câu trả lời của bạn..." autocomplete="off">
            </div>
            
            <div id="answer-reveal-box" class="hidden"></div>
        </div>
        
        <div id="explanation-box" class="hidden">
            <div class="academic-info">
                <span class="info-badge">Hán Việt: <strong>${item.han_viet || 'N/A'}</strong></span>
                <span class="info-badge">Bộ thủ: <strong>${item.radical || 'N/A'}</strong></span>
                <span class="info-badge">Từ loại: <strong>${item.word_type || 'N/A'}</strong></span>
            </div>
            <div class="expansion-box">
                <strong>🌐 Mở rộng ý nghĩa & Ngữ dụng:</strong>
                <p style="margin-top: 6px;">${item.expansion || 'Đang cập nhật...'}</p>
            </div>
            <div class="explanation-grid">
                <div class="example-box">
                    <strong>📖 Câu ví dụ thực tế:</strong>
                    <div style="margin-top: 8px;">${(item.examples && item.examples.length) ? item.examples.map(ex => `<strong>${ex.cn}</strong> (${ex.py})<br><em>${ex.vn}</em>`).join('<br><br>') : 'Chưa có ví dụ.'}</div>
                </div>
                <div class="teacher-corner">
                    <strong>👨‍🏫 Góc Lão Sư:</strong>
                    <p style="margin-top: 8px;">${item.goc_lao_su || 'Chú ý trật tự từ.'}</p>
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
        utterance.rate = 0.85;
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
    document.getElementById('progress-fill').style.width = `${((currentIndex) / currentList.length) * 100}%`;
}

document.getElementById('btn-check').addEventListener('click', () => {
    const item = currentList[currentIndex];
    const inputElem = document.getElementById('user-input');
    if(!inputElem) return;
    
    const userVal = inputElem.value;
    inputElem.disabled = true; // Khóa ô nhập liệu lại
    
    sessionStats.total++;
    lifetimeStats.total++;
    
    const result = evaluateAnswerQuality(userVal, item.hanzi, item.pinyin);

    triggerDuckReaction(result.isCorrect);

    if(result.isCorrect) {
        sessionStats.correct++;
        lifetimeStats.correct++;
        playSound('correct');
    } else {
        sessionStats.wrong++;
        lifetimeStats.wrong++;
        playSound('wrong');
        if (!mistakeList.some(m => m.id === item.id)) mistakeList.push(item);
    }

    saveLifetimeStats();
    updateSessionStatsUI();
    
    // BUILD KHU VỰC HIỂN THỊ ĐÁP ÁN SO SÁNH
    let hanziiBtn = '';
    if(currentCategory === 'word') {
        hanziiBtn = `<a href="https://hanzii.net/search/word/${encodeURIComponent(item.hanzi)}" target="_blank" class="btn-tool" style="display:inline-block; margin-top:12px; text-decoration:none;">✍️ Xem hướng dẫn viết nét trên Hanzii</a>`;
    }

    let warningHtml = result.warning ? `<div style="margin-top: 12px; padding: 10px 14px; background: #fffbeb; border: 1px solid #fde047; border-radius: 8px; color: #854d0e; font-size: 14px; text-align: left;">💡 <strong>Lời khuyên Lão sư:</strong> ${result.warning}</div>` : '';

    const revealBox = document.getElementById('answer-reveal-box');
    revealBox.innerHTML = `
        <div style="font-size: 15px; color: #64748b; margin-bottom: 8px;">
            Bạn đã nhập: <strong style="color: ${result.isCorrect ? '#16a34a' : '#dc2626'}; font-size: 18px;">${userVal || '[Trống]'}</strong>
        </div>
        <div class="hanzi-large">${item.hanzi}</div>
        <div class="pinyin-sub">${item.pinyin}</div>
        ${warningHtml}
        ${hanziiBtn}
    `;

    revealBox.classList.remove('hidden');
    document.getElementById('explanation-box').classList.remove('hidden');
    document.getElementById('btn-check').classList.add('hidden');
    document.getElementById('btn-next').classList.remove('hidden');
    document.getElementById('btn-next').focus();
    
    document.getElementById('progress-fill').style.width = `${((currentIndex + 1) / currentList.length) * 100}%`;
});

document.getElementById('btn-next').addEventListener('click', () => {
    currentIndex++;
    loadStudyCard();
});

document.getElementById('btn-inline-review').onclick = () => {
    if (mistakeList.length === 0) {
        alert("Tuyệt vời! Bạn chưa có câu nào làm sai trong phiên này.");
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