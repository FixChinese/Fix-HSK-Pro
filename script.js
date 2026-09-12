let allData = [];
let currentList = [];
let currentIndex = 0;
let currentCategory = 'word';
let currentLevel = 'HSK 1';
let currentBatchSize = 50;
let hanziiWriters = []; 

let mistakeList = [];
let isReviewingMistakes = false;

let currentUser = localStorage.getItem('hsk_current_user') || 'Fix Chinese';

let currentWorkoutSet = [];
let workoutConfig = { level: 'HSK 1', format: 'dialogue', topic: 'daily', mode: 'V2C', count: 10 };
let workoutNotesData = null;
let workoutContextData = null;

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

function stripAllPunctuation(str) {
    if (!str) return '';
    return str.toString().toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?"'，。！？、“”‘’（）]/g, '').replace(/\s+/g, '').trim();
}

function evaluateAnswerQuality(userInput, targetHanzi, targetPinyin) {
    const rawInput = (userInput || '').trim();
    const cleanInput = stripAllPunctuation(rawInput);
    const cleanTarget = stripAllPunctuation(targetHanzi);
    const cleanPinyin = stripAllPunctuation(targetPinyin);

    const isBaseCorrect = (cleanInput === cleanTarget || (cleanPinyin && cleanInput === cleanPinyin));
    if (!isBaseCorrect) return { isCorrect: false, warning: null };

    let warningMsg = null;
    if (/[?？]/.test(targetHanzi) && !/[?？]/.test(rawInput)) warningMsg = "Bạn nên thêm dấu chấm hỏi <strong>？</strong> ở cuối câu.";
    if (/[,，]/.test(targetHanzi) && !/[,，]/.test(rawInput) && !warningMsg) warningMsg = "Bạn nên thêm dấu phẩy <strong>，</strong> để ngắt nhịp câu chuẩn xác hơn.";

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

let lifetimeStats = JSON.parse(localStorage.getItem(`hsk_stats_${currentUser}`)) || { total: 0, correct: 0, wrong: 0 };
let sessionStats = { total: 0, correct: 0, wrong: 0 };

function saveLifetimeStats() { localStorage.setItem(`hsk_stats_${currentUser}`, JSON.stringify(lifetimeStats)); }

function updateSessionStatsUI() {
    const totalElem = document.getElementById('stat-total'); if (totalElem) totalElem.innerText = sessionStats.total;
    const corElem = document.getElementById('stat-correct'); if (corElem) corElem.innerText = sessionStats.correct;
    const wrgElem = document.getElementById('stat-wrong'); if (wrgElem) wrgElem.innerText = sessionStats.wrong;
    
    const accElem = document.getElementById('stat-accuracy');
    const acc = sessionStats.total === 0 ? 0 : Math.round((sessionStats.correct / sessionStats.total) * 100);
    if (accElem) accElem.innerText = `${acc}%`;

    const btnReview = document.getElementById('btn-inline-review');
    if (btnReview) {
        if (mistakeList.length > 0) {
            btnReview.classList.remove('hidden');
            document.getElementById('inline-mistake-count').innerText = mistakeList.length;
        } else {
            btnReview.classList.add('hidden');
        }
    }
}

function renderUserStatsView() {
    document.getElementById('user-total-learned').innerText = lifetimeStats.total;
    document.getElementById('user-total-correct').innerText = lifetimeStats.correct;
    document.getElementById('user-total-wrong').innerText = lifetimeStats.wrong;
    const acc = lifetimeStats.total === 0 ? 0 : Math.round((lifetimeStats.correct / lifetimeStats.total) * 100);
    document.getElementById('user-total-acc').innerText = `${acc}%`;
}

// TẢI TOÀN BỘ 11 TỆP TỪ THƯ MỤC data/
async function loadAllSystemData() {
    try {
        const levels = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        let fetchedData = [];

        for (let lvl of levels) {
            try {
                const res = await fetch(`data/hsk${lvl}.json`);
                if (res.ok) {
                    const jsonArr = await res.json();
                    fetchedData = fetchedData.concat(jsonArr);
                }
            } catch (e) {
                console.warn(`Không thể tải tệp data/hsk${lvl}.json`, e);
            }
        }

        allData = fetchedData;

        // Tải 2 tệp phụ trợ
        try {
            const resNotes = await fetch('data/vietnamese_notes.json');
            if (resNotes.ok) workoutNotesData = await resNotes.json();
        } catch (e) { console.warn('Không tải được vietnamese_notes.json', e); }

        try {
            const resWorkout = await fetch('data/context_workout.json');
            if (resWorkout.ok) workoutContextData = await resWorkout.json();
        } catch (e) { console.warn('Không tải được context_workout.json', e); }

        initSmartMenu(); 
        initUserManagement(); 
        initWorkoutModule(); 
        initModalEvents();
    } catch (err) {
        console.error("Lỗi khởi tạo hệ thống dữ liệu:", err);
    }
}

loadAllSystemData();

function initSmartMenu() {
    const menuWrapper = document.getElementById('menu-wrapper');
    const floatingMenu = document.getElementById('floating-nav-card');
    let hoverTimeout = null;

    function openDesktop() { if (window.innerWidth > 768) { clearTimeout(hoverTimeout); floatingMenu.classList.remove('hidden'); } }
    function closeDesktop() { if (window.innerWidth > 768) { hoverTimeout = setTimeout(() => { floatingMenu.classList.add('hidden'); }, 1500); } }

    if (menuWrapper) {
        menuWrapper.addEventListener('mouseenter', openDesktop);
        menuWrapper.addEventListener('mouseleave', closeDesktop);
    }

    const toggleBtn = document.getElementById('btn-toggle-menu');
    const closeBtn = document.getElementById('btn-close-floating-menu');
    const backdrop = document.getElementById('menu-overlay-backdrop');

    if (toggleBtn) {
        toggleBtn.onclick = (e) => {
            e.stopPropagation();
            const isHidden = floatingMenu.classList.contains('hidden');
            if (isHidden) {
                floatingMenu.classList.remove('hidden');
                setTimeout(() => floatingMenu.classList.add('mobile-active'), 10);
                if (backdrop) backdrop.classList.add('active');
            } else {
                floatingMenu.classList.remove('mobile-active');
                setTimeout(() => floatingMenu.classList.add('hidden'), 350);
                if (backdrop) backdrop.classList.remove('active');
            }
        };
    }

    if (closeBtn) {
        closeBtn.onclick = () => {
            floatingMenu.classList.remove('mobile-active');
            setTimeout(() => floatingMenu.classList.add('hidden'), 350);
            if (backdrop) backdrop.classList.remove('active');
        };
    }

    if (backdrop) {
        backdrop.onclick = () => {
            floatingMenu.classList.remove('mobile-active');
            setTimeout(() => floatingMenu.classList.add('hidden'), 350);
            backdrop.classList.remove('active');
        };
    }

    document.querySelectorAll('.sub-flyout-panel a').forEach(link => {
        link.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            currentCategory = link.getAttribute('data-cat');
            currentLevel = link.getAttribute('data-level');
            isReviewingMistakes = false;
            showView('view-study');
            document.getElementById('view-title').innerText = `${currentCategory === 'word' ? 'Học từ vựng' : 'Học ngữ pháp & câu văn'} ${currentLevel}`;
            filterAndLoadData();
            if (window.innerWidth <= 768) {
                floatingMenu.classList.remove('mobile-active');
                setTimeout(() => floatingMenu.classList.add('hidden'), 350);
                if (backdrop) backdrop.classList.remove('active');
            } else {
                floatingMenu.classList.add('hidden');
            }
        };
    });

    const brandBtn = document.getElementById('brand-logo-btn');
    if (brandBtn) brandBtn.onclick = () => showView('view-home');
    
    const cardHome = document.getElementById('card-home');
    if (cardHome) cardHome.onclick = () => { 
        showView('view-home'); 
        floatingMenu.classList.remove('mobile-active');
        floatingMenu.classList.add('hidden'); 
        if (backdrop) backdrop.classList.remove('active'); 
    };
    
    const cardWorkout = document.getElementById('card-workout');
    if (cardWorkout) cardWorkout.onclick = () => { 
        showView('view-daily'); 
        document.getElementById('daily-setup-panel').classList.remove('hidden'); 
        document.getElementById('daily-quiz-panel').classList.add('hidden'); 
        floatingMenu.classList.remove('mobile-active');
        floatingMenu.classList.add('hidden'); 
        if (backdrop) backdrop.classList.remove('active'); 
    };
    
    const cardStats = document.getElementById('card-stats');
    if (cardStats) cardStats.onclick = () => { 
        renderUserStatsView(); 
        showView('view-stats'); 
        floatingMenu.classList.remove('mobile-active');
        floatingMenu.classList.add('hidden'); 
        if (backdrop) backdrop.classList.remove('active'); 
    };
}

function initUserManagement() {
    const nameInput = document.getElementById('current-username');
    const userDisplay = document.getElementById('top-user-display');
    const statsDisplay = document.getElementById('stats-username-display');

    if (nameInput) {
        nameInput.value = currentUser;
        nameInput.onchange = (e) => {
            const val = e.target.value.trim();
            if (val) {
                currentUser = val;
                localStorage.setItem('hsk_current_user', currentUser);
                if (userDisplay) userDisplay.innerText = currentUser;
                if (statsDisplay) statsDisplay.innerText = currentUser;
                lifetimeStats = JSON.parse(localStorage.getItem(`hsk_stats_${currentUser}`)) || { total: 0, correct: 0, wrong: 0 };
                updateSessionStatsUI();
            }
        };
    }
    if (userDisplay) userDisplay.innerText = currentUser;
    if (statsDisplay) statsDisplay.innerText = currentUser;

    const resetBtn = document.getElementById('btn-reset-user-stats');
    if (resetBtn) {
        resetBtn.onclick = () => {
            if (confirm(`Bạn có chắc chắn muốn làm mới toàn bộ thống kê của tài khoản "${currentUser}" không?`)) {
                lifetimeStats = { total: 0, correct: 0, wrong: 0 };
                saveLifetimeStats();
                renderUserStatsView();
                alert("Đã đặt lại thống kê thành công!");
            }
        };
    }
}

function showView(viewId) {
    document.querySelectorAll('.app-view').forEach(v => v.classList.add('hidden'));
    const target = document.getElementById(viewId);
    if (target) target.classList.remove('hidden');
}

function goToSection(type) {
    if (type === 'vocab') { currentCategory = 'word'; currentLevel = 'HSK 1'; showView('view-study'); document.getElementById('view-title').innerText = 'Học từ vựng HSK 1'; filterAndLoadData(); } 
    else if (type === 'grammar') { currentCategory = 'sentence'; currentLevel = 'HSK 1'; showView('view-study'); document.getElementById('view-title').innerText = 'Học ngữ pháp & câu văn HSK 1'; filterAndLoadData(); } 
    else if (type === 'workout') { showView('view-daily'); document.getElementById('daily-setup-panel').classList.remove('hidden'); document.getElementById('daily-quiz-panel').classList.add('hidden'); }
}

function initWorkoutModule() {
    const startBtn = document.getElementById('btn-start-daily');
    if (startBtn) {
        startBtn.onclick = () => {
            workoutConfig.level = document.getElementById('daily-level').value;
            workoutConfig.format = document.getElementById('daily-format').value;
            workoutConfig.topic = document.getElementById('daily-topic').value;
            workoutConfig.mode = document.getElementById('daily-mode').value;
            workoutConfig.count = parseInt(document.getElementById('daily-count').value);
            generateWorkoutSet();
        };
    }

    const reconfBtn = document.getElementById('btn-workout-reconfigure');
    if (reconfBtn) {
        reconfBtn.onclick = () => {
            document.getElementById('daily-setup-panel').classList.remove('hidden');
            document.getElementById('daily-quiz-panel').classList.add('hidden');
        };
    }
}

function generateWorkoutSet() {
    let pool = allData.filter(i => i.category === 'sentence');
    if (pool.length === 0) pool = allData;

    let topicPool = pool.filter(i => i.topic === workoutConfig.topic);
    if (topicPool.length > 0) pool = topicPool;

    if (workoutConfig.level !== 'ALL') {
        const targetRank = workoutConfig.level.includes('Cao cấp') ? 7 : parseInt(workoutConfig.level.match(/\d+/)[0]);
        let rankPool = pool.filter(i => {
            const r = i.level.includes('Cao cấp') ? 7 : parseInt(i.level.match(/\d+/)[0]);
            return r <= targetRank;
        });
        if (rankPool.length > 0) pool = rankPool;
    }

    pool = shuffleArray(pool);
    if (pool.length > 0 && pool.length < workoutConfig.count) {
        let tempArr = [...pool];
        while (tempArr.length < workoutConfig.count) { tempArr = tempArr.concat(shuffleArray(pool)); }
        currentWorkoutSet = tempArr.slice(0, workoutConfig.count);
    } else { 
        currentWorkoutSet = pool.slice(0, workoutConfig.count); 
    }

    const listContainer = document.getElementById('workout-items-list');
    if (!listContainer) return;

    let html = '';
    currentWorkoutSet.forEach((item, idx) => {
        const promptText = (workoutConfig.mode === 'V2C') ? item.meaning_vn : item.hanzi;
        const placeholderText = (workoutConfig.mode === 'V2C') ? 'Nhập Hán tự hoặc câu tiếng Trung tương ứng...' : 'Nhập nghĩa tiếng Việt hoặc dịch nghĩa...';
        
        html += `
            <div class="workout-item-card" data-index="${idx}" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin-bottom:14px;">
                <div class="wi-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span class="wi-num" style="font-size:12px; font-weight:800; color:#15803d; background:#dcfce7; padding:4px 10px; border-radius:6px;">Câu ${idx + 1} (${item.level})</span>
                    <span class="wi-topic" style="font-size:13px; font-weight:700; color:#64748b;">Chủ đề: ${item.topic}</span>
                </div>
                <div class="wi-prompt" style="font-size:16px; font-weight:800; color:#0f172a; margin-bottom:12px; line-height:1.5;"><strong>Yêu cầu:</strong> ${promptText}</div>
                <div class="wi-input-row">
                    <input type="text" class="workout-user-input form-control" style="width:100%; padding:12px 14px; border:2px solid #cbd5e1; border-radius:8px; font-size:16px; color:#14532d; font-weight:600;" placeholder="${placeholderText}" autocomplete="off">
                </div>
                <div class="wi-feedback hidden" style="margin-top:12px; padding:14px; border-radius:8px; font-size:14.5px; line-height:1.5;"></div>
            </div>
        `;
    });
    listContainer.innerHTML = html;

    document.getElementById('daily-setup-panel').classList.add('hidden');
    document.getElementById('daily-quiz-panel').classList.remove('hidden');

    const submitAllBtn = document.getElementById('btn-workout-submit-all');
    if (submitAllBtn) {
        submitAllBtn.onclick = () => {
            document.getElementById('workout-decision-modal').classList.remove('hidden');
        };
    }
}

window.filterAndLoadData = function() {
    if (isReviewingMistakes) return;
    sessionStats = { total: 0, correct: 0, wrong: 0 };
    mistakeList = [];
    updateSessionStatsUI();

    let filtered = allData.filter(item => item.category === currentCategory && item.level === currentLevel);
    filtered = shuffleArray(filtered);

    if (currentBatchSize !== 'ALL' && filtered.length > 0) {
        let tempArr = [...filtered];
        while (tempArr.length < currentBatchSize) { tempArr = tempArr.concat(shuffleArray(filtered)); }
        currentList = tempArr.slice(0, currentBatchSize);
    } else { 
        currentList = filtered; 
    }
    
    currentIndex = 0;
    loadStudyCard();
}

function loadStudyCard() {
    const container = document.getElementById('flashcard-container');
    if (!container) return;

    const counter = document.getElementById('study-progress-counter');
    if (counter) counter.innerText = `Tiến độ: ${currentList.length === 0 ? 0 : (currentIndex + 1)} / ${currentList.length}`;
    updateSessionStatsUI();

    if(currentList.length === 0 || currentIndex >= currentList.length) {
        container.innerHTML = `
            <div class="end-session-box">
                <div style="font-size: 50px; margin-bottom: 10px;">🎉</div>
                <h3>Bạn đã hoàn thành xuất sắc bài học này!</h3>
                <p style="color: #64748b; margin-bottom: 25px; font-size: 15px;">Hãy chọn bước tiếp theo để duy trì nhịp độ học tập nhé.</p>
                <div class="end-actions">
                    <button onclick="filterAndLoadData()" class="btn" style="width: auto; padding: 12px 24px;">🔄 Học lại bộ mới</button>
                    <button onclick="document.getElementById('session-config-modal').classList.remove('hidden')" class="btn-secondary" style="width: auto; padding: 12px 24px;">⚙️ Đổi số lượng</button>
                </div>
            </div>
        `;
        const btnCheck = document.getElementById('btn-check');
        const btnNext = document.getElementById('btn-next');
        if (btnCheck) btnCheck.classList.add('hidden');
        if (btnNext) btnNext.classList.add('hidden');
        const fill = document.getElementById('progress-fill');
        if (fill) fill.style.width = `100%`;
        return;
    }

    const item = currentList[currentIndex];
    let promptHtml = (currentCategory === 'word') ? `<p class="meaning-text">${item.meaning_vn}</p>` : `<p class="grammar-prompt">${item.meaning_vn}</p>`;

    container.innerHTML = `
        <div class="card-front">
            <div class="card-top-info">
                <span id="level-badge" class="level-badge">${item.level}</span>
                <div class="question-header">${currentCategory === 'word' ? 'TỪ VỰNG - GÕ HÁN TỰ / PINYIN:' : 'NGỮ PHÁP - DỊCH HOẶC GÕ CÂU:'}</div>
            </div>
            ${promptHtml}
            <div class="tools-wrapper">
                <button id="btn-hint" class="btn-tool">💡 Bật mí Pinyin</button>
                <button id="btn-audio" class="btn-tool">🔊 Nghe phát âm</button>
                <span id="hint-display" class="hint-text hidden">(${item.pinyin})</span>
            </div>
            <div class="input-container">
                <input type="text" id="user-input" placeholder="${currentCategory === 'word' ? 'Nhập Hán tự hoặc Pinyin...' : 'Nhập Hán tự...'}" autocomplete="off">
            </div>
            <div id="answer-reveal-box" class="hidden"></div>
            <div id="explanation-box" class="hidden"></div>
        </div>
    `;

    const btnHint = document.getElementById('btn-hint');
    if (btnHint) btnHint.onclick = () => { const hd = document.getElementById('hint-display'); if(hd) hd.classList.remove('hidden'); };

    const btnAudio = document.getElementById('btn-audio');
    if (btnAudio) btnAudio.onclick = () => { window.speechSynthesis.speak(new SpeechSynthesisUtterance(item.hanzi)); };

    const userInput = document.getElementById('user-input');
    if (userInput) {
        userInput.focus();
        userInput.onkeydown = (e) => {
            if(e.key === 'Enter') {
                e.preventDefault();
                const checkBtn = document.getElementById('btn-check');
                const nextBtn = document.getElementById('btn-next');
                if(checkBtn && !checkBtn.classList.contains('hidden')) checkBtn.click();
                else if(nextBtn && !nextBtn.classList.contains('hidden')) nextBtn.click();
            }
        };
    }

    const checkBtn = document.getElementById('btn-check');
    const nextBtn = document.getElementById('btn-next');
    if (checkBtn) checkBtn.classList.remove('hidden');
    if (nextBtn) nextBtn.classList.add('hidden');
    
    const fill = document.getElementById('progress-fill');
    if (fill) fill.style.width = `${((currentIndex) / currentList.length) * 100}%`;
}

const checkBtnElem = document.getElementById('btn-check');
if (checkBtnElem) {
    checkBtnElem.addEventListener('click', () => {
        const item = currentList[currentIndex];
        const inputElem = document.getElementById('user-input');
        if(!inputElem) return;
        
        const userVal = inputElem.value.trim();
        inputElem.disabled = true; 
        
        sessionStats.total++; lifetimeStats.total++;
        const result = evaluateAnswerQuality(userVal, item.hanzi, item.pinyin);

        triggerDuckReaction(result.isCorrect);

        if(result.isCorrect) {
            sessionStats.correct++; lifetimeStats.correct++; playSound('correct');
        } else {
            sessionStats.wrong++; lifetimeStats.wrong++; playSound('wrong');
            if (!mistakeList.some(m => m.id === item.id)) mistakeList.push(item);
        }

        saveLifetimeStats(); updateSessionStatsUI();
        
        const revealBox = document.getElementById('answer-reveal-box');
        const expBox = document.getElementById('explanation-box');

        let warningHtml = result.warning ? `<div style="margin-top: 15px; padding: 12px 16px; background: #fffbeb; border: 1px solid #fde047; border-radius: 10px; color: #854d0e; font-size: 14.5px; text-align: left;">💡 <strong>Lời khuyên Lão sư:</strong> ${result.warning}</div>` : '';

        if (currentCategory === 'word') {
            let drawAreaHtml = '';
            if(item.hanzi && item.hanzi.length <= 4) {
                let charDivs = '';
                for(let i=0; i<item.hanzi.length; i++) {
                    charDivs += `<div id="char-target-${i}" class="hanzi-char-box"></div>`;
                }
                drawAreaHtml = `
                    <div class="reveal-right">
                        <div id="draw-cover" class="draw-cover-layer">
                            <span style="font-size:24px; margin-bottom:5px;">✍️</span>
                            <h4>Bạn có biết cách viết?</h4>
                            <p>Bấm để xem bút thuận</p>
                        </div>
                        <div id="hanzi-drawing-board">${charDivs}</div>
                    </div>
                `;
            }

            if (revealBox) {
                revealBox.innerHTML = `
                    <div class="dual-pane-reveal">
                        <div class="reveal-left">
                            <div style="font-size: 14px; color: #64748b; margin-bottom: 12px;">Bạn đã nhập: <strong style="color: ${result.isCorrect ? '#16a34a' : '#dc2626'}; font-size: 18px;">${userVal || '[Bỏ trống]'}</strong></div>
                            <div class="hanzi-large">${item.hanzi}</div>
                            <div class="pinyin-sub">${item.pinyin}</div>
                            ${warningHtml}
                        </div>
                        ${drawAreaHtml}
                    </div>
                `;
                revealBox.classList.remove('hidden');
            }

            let formattedExpansion = item.expansion ? item.expansion.replace(/\n/g, '<br>• ') : '';
            if(formattedExpansion && !formattedExpansion.startsWith('•')) formattedExpansion = '• ' + formattedExpansion;

            if (expBox) {
                expBox.innerHTML = `
                    <div class="academic-info">
                        <span class="info-badge">Hán Việt: <strong>${item.han_viet || 'N/A'}</strong></span>
                        <span class="info-badge">Bộ thủ: <strong>${item.radical || 'N/A'}</strong></span>
                        <span class="info-badge">Từ loại: <strong>${item.word_type || 'N/A'}</strong></span>
                    </div>
                    <div class="expansion-box">
                        <strong style="color: #b45309;">🌐 Đa tầng Nghĩa & Ngữ dụng:</strong>
                        <div style="margin-top: 10px;">${formattedExpansion}</div>
                    </div>
                    <div class="explanation-grid">
                        <div class="example-box">
                            <strong style="color: #1d4ed8;">📖 Ví dụ thực tế:</strong>
                            <div style="margin-top: 8px;">${(item.examples && item.examples.length) ? item.examples.map(ex => `<strong>${ex.cn}</strong> (${ex.py})<br><em>${ex.vn}</em>`).join('<br><br>') : 'Chưa có ví dụ.'}</div>
                        </div>
                        <div class="teacher-corner">
                            <strong style="color: #047857;">👨‍🏫 Góc Lão Sư:</strong>
                            <p style="margin-top: 8px;">${item.goc_lao_su || 'Chú ý trật tự từ.'}</p>
                        </div>
                    </div>
                `;
                expBox.classList.remove('hidden');
            }

            if(item.hanzi && item.hanzi.length <= 4) {
                const cover = document.getElementById('draw-cover');
                if (cover) {
                    cover.onclick = () => {
                        cover.style.display = 'none';
                        hanziiWriters = [];
                        for(let i=0; i<item.hanzi.length; i++) {
                            let char = item.hanzi.charAt(i);
                            let writer = HanziWriter.create(`char-target-${i}`, char, {
                                width: 80, height: 80, padding: 5, strokeColor: '#15803d', delayBetweenStrokes: 100, showOutline: true
                            });
                            hanziiWriters.push(writer);
                        }
                        const animateSequence = async () => { for(let writer of hanziiWriters) { await writer.animateCharacter(); } };
                        animateSequence();
                    };
                }
            }
        } else {
            if (revealBox) {
                revealBox.innerHTML = `
                    <div class="grammar-reveal-box">
                        <div style="font-size: 14px; color: #64748b; margin-bottom: 16px;">Bạn đã dịch: <strong style="color: ${result.isCorrect ? '#16a34a' : '#dc2626'}; font-size: 18px;">${userVal || '[Bỏ trống]'}</strong></div>
                        <div class="g-sentence-large">${item.hanzi}</div>
                        <div class="g-pinyin">${item.pinyin}</div>
                        ${warningHtml}
                    </div>
                `;
                revealBox.classList.remove('hidden');
            }

            if (expBox) {
                expBox.innerHTML = `
                    <div class="grammar-analysis-box">
                        <h4>🧠 Tư duy Ngôn ngữ & Mẹo Phản xạ:</h4>
                        <p>${item.goc_lao_su}</p>
                    </div>
                `;
                expBox.classList.remove('hidden');
            }
        }

        const btnCheckRef = document.getElementById('btn-check');
        const btnNextRef = document.getElementById('btn-next');
        if (btnCheckRef) btnCheckRef.classList.add('hidden');
        if (btnNextRef) {
            btnNextRef.classList.remove('hidden');
            btnNextRef.focus();
        }
        const fill = document.getElementById('progress-fill');
        if (fill) fill.style.width = `${((currentIndex + 1) / currentList.length) * 100}%`;
    });
}

const nextBtnElem = document.getElementById('btn-next');
if (nextBtnElem) {
    nextBtnElem.addEventListener('click', () => { currentIndex++; loadStudyCard(); });
}

const inlineReviewBtn = document.getElementById('btn-inline-review');
if (inlineReviewBtn) {
    inlineReviewBtn.onclick = () => {
        if (mistakeList.length === 0) { alert("Tuyệt vời! Bạn chưa có câu nào làm sai trong phiên này."); return; }
        isReviewingMistakes = true; currentList = shuffleArray([...mistakeList]); currentIndex = 0; loadStudyCard();
    };
}

const refreshBtn = document.getElementById('btn-refresh');
if (refreshBtn) refreshBtn.onclick = () => { filterAndLoadData(); };

function initModalEvents() {
    const configBtn = document.getElementById('btn-config-session');
    if (configBtn) configBtn.onclick = () => document.getElementById('session-config-modal').classList.remove('hidden');

    document.querySelectorAll('.batch-btn').forEach(b => {
        b.onclick = (e) => {
            currentBatchSize = e.target.getAttribute('data-batch') === 'ALL' ? 'ALL' : parseInt(e.target.getAttribute('data-batch'));
            const modal = document.getElementById('session-config-modal');
            if (modal) modal.classList.add('hidden'); 
            filterAndLoadData();
        };
    });

    const shuffleBtn = document.getElementById('btn-shuffle');
    if (shuffleBtn) {
        shuffleBtn.onclick = () => { 
            if (currentList.length > 0) { 
                currentList = shuffleArray(currentList); 
                currentIndex = 0; 
                loadStudyCard(); 
            } 
        };
    }

    const btnGrade = document.getElementById('btn-decide-grade');
    if (btnGrade) {
        btnGrade.onclick = () => {
            document.getElementById('workout-decision-modal').classList.add('hidden');
            const cards = document.querySelectorAll('.workout-item-card');
            cards.forEach((card, idx) => {
                const input = card.querySelector('.workout-user-input');
                const feedback = card.querySelector('.wi-feedback');
                const targetItem = currentWorkoutSet[idx];
                if (input && feedback && targetItem) {
                    const val = input.value.trim();
                    const evalRes = evaluateAnswerQuality(val, targetItem.hanzi, targetItem.pinyin);
                    feedback.classList.remove('hidden');
                    if (evalRes.isCorrect) {
                        feedback.style.background = '#dcfce7';
                        feedback.style.color = '#14532d';
                        feedback.style.border = '1px solid #86efac';
                        feedback.innerHTML = `<span style="color: #16a34a; font-weight: bold;">✅ Chính xác!</span> Đáp án mẫu: <strong>${targetItem.hanzi}</strong> (${targetItem.pinyin}) - <em>${targetItem.meaning_vn}</em>`;
                    } else {
                        feedback.style.background = '#fee2e2';
                        feedback.style.color = '#991b1b';
                        feedback.style.border = '1px solid #fca5a5';
                        feedback.innerHTML = `<span style="color: #dc2626; font-weight: bold;">❌ Chưa chính xác.</span> Đáp án chuẩn: <strong>${targetItem.hanzi}</strong> (${targetItem.pinyin})<br>💡 <em>${targetItem.goc_lao_su || ''}</em>`;
                    }
                }
            });
        };
    }

    const btnContinue = document.getElementById('btn-decide-continue');
    if (btnContinue) {
        btnContinue.onclick = () => {
            document.getElementById('workout-decision-modal').classList.add('hidden');
            generateWorkoutSet();
        };
    }

    const btnReview = document.getElementById('btn-decide-review');
    if (btnReview) {
        btnReview.onclick = () => {
            document.getElementById('workout-decision-modal').classList.add('hidden');
        };
    }
}

function triggerDuckReaction(isCorrect) {
    const duckContainer = document.getElementById('duck-container');
    const hearts = document.getElementById('hearts-burst'), splash = document.getElementById('water-splash');
    if (!duckContainer) return;
    if (effectTimeout) clearTimeout(effectTimeout);
    duckContainer.className = ''; void duckContainer.offsetWidth; 
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