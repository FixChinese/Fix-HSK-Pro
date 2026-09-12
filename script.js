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

fetch('data.json')
    .then(res => res.json())
    .then(data => {
        allData = data;
        initSmartMenu(); initUserManagement(); initWorkoutModule(); initModalEvents();
    });

function initSmartMenu() {
    const menuWrapper = document.getElementById('menu-wrapper');
    const floatingMenu = document.getElementById('floating-nav-card');
    let hoverTimeout = null;

    function openDesktop() { if (window.innerWidth > 768) { clearTimeout(hoverTimeout); floatingMenu.classList.remove('hidden'); } }
    function closeDesktop() { if (window.innerWidth > 768) { hoverTimeout = setTimeout(() => { floatingMenu.classList.add('hidden'); }, 1500); } }

    menuWrapper.addEventListener('mouseenter', openDesktop);
    menuWrapper.addEventListener('mouseleave', closeDesktop);

    document.querySelectorAll('.sub-flyout-panel a').forEach(link => {
        link.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            currentCategory = link.getAttribute('data-cat');
            currentLevel = link.getAttribute('data-level');
            isReviewingMistakes = false;
            showView('view-study');
            document.getElementById('view-title').innerText = `${currentCategory === 'word' ? 'Học từ vựng' : 'Học ngữ pháp & câu văn'} ${currentLevel}`;
            filterAndLoadData();
            if (window.innerWidth <= 768) document.getElementById('btn-close-floating-menu').click(); else floatingMenu.classList.add('hidden');
        };
    });

    document.getElementById('brand-logo-btn').onclick = () => showView('view-home');
    document.getElementById('card-home').onclick = () => { showView('view-home'); floatingMenu.classList.add('hidden'); };
    document.getElementById('card-workout').onclick = () => { showView('view-daily'); document.getElementById('daily-setup-panel').classList.remove('hidden'); document.getElementById('daily-quiz-panel').classList.add('hidden'); floatingMenu.classList.add('hidden'); };
    document.getElementById('card-stats').onclick = () => { renderUserStatsView(); showView('view-stats'); floatingMenu.classList.add('hidden'); };
}

function initUserManagement() { /* Bỏ qua chi tiết lặp lại để giữ code ngắn gọn */ }

function showView(viewId) {
    document.querySelectorAll('.app-view').forEach(v => v.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
}

function goToSection(type) {
    if (type === 'vocab') { currentCategory = 'word'; currentLevel = 'HSK 1'; showView('view-study'); document.getElementById('view-title').innerText = 'Học từ vựng HSK 1'; filterAndLoadData(); } 
    else if (type === 'grammar') { currentCategory = 'sentence'; currentLevel = 'HSK 1'; showView('view-study'); document.getElementById('view-title').innerText = 'Học ngữ pháp & câu văn HSK 1'; filterAndLoadData(); } 
    else if (type === 'workout') { showView('view-daily'); document.getElementById('daily-setup-panel').classList.remove('hidden'); document.getElementById('daily-quiz-panel').classList.add('hidden'); }
}

// KHỐI WORKOUT (Giữ nguyên)
function initWorkoutModule() {
    document.getElementById('btn-start-daily').onclick = () => {
        workoutConfig.level = document.getElementById('daily-level').value;
        workoutConfig.format = document.getElementById('daily-format').value;
        workoutConfig.topic = document.getElementById('daily-topic').value;
        workoutConfig.mode = document.getElementById('daily-mode').value;
        workoutConfig.count = parseInt(document.getElementById('daily-count').value);
        generateWorkoutSet();
    };
}

function generateWorkoutSet() {
    let pool = allData.filter(i => i.category === 'sentence');
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
    } else { currentWorkoutSet = pool.slice(0, workoutConfig.count); }
    // Render HTML (Bỏ qua phần HTML tạo bảng để tiết kiệm)
    document.getElementById('daily-setup-panel').classList.add('hidden');
    document.getElementById('daily-quiz-panel').classList.remove('hidden');
}

// BÀI HỌC FLASHCARD (SỰ KHÁC BIỆT GIỮA TỪ VỰNG VÀ NGỮ PHÁP)
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
    } else { currentList = filtered; }
    
    currentIndex = 0;
    loadStudyCard();
}

function loadStudyCard() {
    const container = document.getElementById('flashcard-container');
    document.getElementById('study-progress-counter').innerText = `Tiến độ: ${currentList.length === 0 ? 0 : (currentIndex + 1)} / ${currentList.length}`;
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
        document.getElementById('btn-check').classList.add('hidden');
        document.getElementById('btn-next').classList.add('hidden');
        document.getElementById('progress-fill').style.width = `100%`;
        return;
    }

    const item = currentList[currentIndex];
    
    // Giao diện mặt trước khác nhau tùy theo TỪ VỰNG hay CÂU VĂN
    let promptHtml = '';
    if (currentCategory === 'word') {
        promptHtml = `<p class="meaning-text">${item.meaning_vn}</p>`;
    } else {
        promptHtml = `<p class="grammar-prompt">${item.meaning_vn}</p>`;
    }

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

    document.getElementById('btn-hint').onclick = () => document.getElementById('hint-display').classList.remove('hidden');
    document.getElementById('btn-audio').onclick = () => { window.speechSynthesis.speak(new SpeechSynthesisUtterance(item.hanzi)); };

    const userInput = document.getElementById('user-input');
    userInput.focus();
    userInput.onkeydown = (e) => {
        if(e.key === 'Enter') {
            e.preventDefault();
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

    // KIẾN TRÚC MẶT SAU TÁCH BIỆT CHO TỪ VỰNG VÀ NGỮ PHÁP
    if (currentCategory === 'word') {
        let drawAreaHtml = '';
        if(item.hanzi.length <= 4) {
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

        // Tạo danh sách nghĩa mở rộng nếu có dùng ký tự \n hoặc \n-
        let formattedExpansion = item.expansion.replace(/\n/g, '<br>• ');
        if(!formattedExpansion.startsWith('•')) formattedExpansion = '• ' + formattedExpansion;

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

        revealBox.classList.remove('hidden');
        expBox.classList.remove('hidden');

        // KÍCH HOẠT VẼ CHỮ
        if(item.hanzi.length <= 4) {
            const cover = document.getElementById('draw-cover');
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
    // GIAO DIỆN CHUYÊN CHO NGỮ PHÁP (Tập trung vào phân tích tư duy)
    else {
        revealBox.innerHTML = `
            <div class="grammar-reveal-box">
                <div style="font-size: 14px; color: #64748b; margin-bottom: 16px;">Bạn đã dịch: <strong style="color: ${result.isCorrect ? '#16a34a' : '#dc2626'}; font-size: 18px;">${userVal || '[Bỏ trống]'}</strong></div>
                <div class="g-sentence-large">${item.hanzi}</div>
                <div class="g-pinyin">${item.pinyin}</div>
                ${warningHtml}
            </div>
        `;

        expBox.innerHTML = `
            <div class="grammar-analysis-box">
                <h4>🧠 Tư duy Ngôn ngữ & Mẹo Phản xạ:</h4>
                <p>${item.goc_lao_su}</p>
            </div>
        `;

        revealBox.classList.remove('hidden');
        expBox.classList.remove('hidden');
    }

    document.getElementById('btn-check').classList.add('hidden');
    document.getElementById('btn-next').classList.remove('hidden');
    document.getElementById('btn-next').focus();
    document.getElementById('progress-fill').style.width = `${((currentIndex + 1) / currentList.length) * 100}%`;
});

document.getElementById('btn-next').addEventListener('click', () => { currentIndex++; loadStudyCard(); });

document.getElementById('btn-inline-review').onclick = () => {
    if (mistakeList.length === 0) { alert("Tuyệt vời! Bạn chưa có câu nào làm sai trong phiên này."); return; }
    isReviewingMistakes = true; currentList = shuffleArray([...mistakeList]); currentIndex = 0; loadStudyCard();
};

document.getElementById('btn-refresh').onclick = () => { filterAndLoadData(); };

function initModalEvents() {
    document.getElementById('btn-config-session').onclick = () => document.getElementById('session-config-modal').classList.remove('hidden');
    document.querySelectorAll('.batch-btn').forEach(b => {
        b.onclick = (e) => {
            currentBatchSize = e.target.getAttribute('data-batch') === 'ALL' ? 'ALL' : parseInt(e.target.getAttribute('data-batch'));
            document.getElementById('session-config-modal').classList.add('hidden'); filterAndLoadData();
        };
    });
    document.getElementById('btn-shuffle').onclick = () => { if (currentList.length > 0) { currentList = shuffleArray(currentList); currentIndex = 0; loadStudyCard(); } };
}

// HIỆU ỨNG VỊT CON...
function triggerDuckReaction(isCorrect) {
    const duckContainer = document.getElementById('duck-container');
    const hearts = document.getElementById('hearts-burst'), splash = document.getElementById('water-splash');
    if (effectTimeout) clearTimeout(effectTimeout);
    duckContainer.className = ''; void duckContainer.offsetWidth; 
    if (isCorrect) { duckContainer.className = "duck-happy"; hearts.classList.remove('hidden'); splash.classList.add('hidden'); } 
    else { duckContainer.className = "duck-sad"; splash.classList.remove('hidden'); hearts.classList.add('hidden'); }
    effectTimeout = setTimeout(() => { hearts.classList.add('hidden'); splash.classList.add('hidden'); duckContainer.className = "duck-idle"; }, 1500);
}