/* ==========================================================================
   BIẾN TOÀN CỤC & TRẠNG THÁI HỆ THỐNG
   ========================================================================== */
let currentData = [];
let currentList = [];
let currentIndex = 0;
let currentCategory = 'word';
let currentLevel = 1;
let currentBatchSize = 50;

// Trạng thái hệ thống
let isAudioEnabled = true;
let isVi2Zh = false; // Mặc định: Trung -> Việt
let hanziWriters = [];

// Trạng thái bài Test (Đọc/Nghe Đa câu hỏi)
let currentTestItem = null;
let testUserAnswers = {}; // Lưu đáp án người dùng { q_id: 'A' }

// Trạng thái Đồng hồ chiến thuật
let chronoTimer = null;
let chronoSeconds = 0;
let isChronoRunning = false;
let totalTimer = null;
let totalSeconds = 0; // Chạy ngầm từ lúc mở web

/* ==========================================================================
   KHỞI TẠO & ĐIỀU HƯỚNG GIAO DIỆN (UI/UX ROUTING)
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    initMenu();
    initAudioToggle();
    initChronometer();
    initStudyControls();
    startTotalTimer(); // Bắt đầu tính giờ tổng ngay khi vào web
});

// Chuyển đổi View Single-Page
function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(view => {
        view.classList.remove('active-view');
    });
    document.getElementById(viewId).classList.add('active-view');
    window.scrollTo(0, 0);
}

// Hệ thống Menu Điều hướng
function initMenu() {
    const btnToggle = document.getElementById('btn-toggle-menu');
    const navCard = document.getElementById('floating-nav-card');
    const overlay = document.getElementById('menu-overlay-backdrop');
    const closeBtn = document.getElementById('close-menu-btn');
    const logoBtn = document.getElementById('logo-home-btn');

    const openMenu = () => {
        navCard.classList.add('active');
        overlay.classList.add('active');
    };

    const closeMenu = () => {
        navCard.classList.remove('active');
        overlay.classList.remove('active');
    };

    btnToggle.addEventListener('click', openMenu);
    closeBtn.addEventListener('click', closeMenu);
    overlay.addEventListener('click', closeMenu);
    logoBtn.addEventListener('click', () => switchView('view-home'));

    // Menu Accordion Độc quyền (Mở thẻ này, đóng thẻ kia)
    const navItems = document.querySelectorAll('.nav-item.has-submenu');
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            // Ngăn chặn click vào submenu làm đóng/mở
            if(e.target.classList.contains('sub-item')) return;
            
            const isOpen = this.classList.contains('open');
            navItems.forEach(nav => nav.classList.remove('open')); // Đóng tất cả
            if (!isOpen) this.classList.add('open'); // Mở thẻ hiện tại
        });
    });

    // Bắt sự kiện Click vào các mục Menu chính
    document.querySelectorAll('[data-target]').forEach(item => {
        item.addEventListener('click', function() {
            const target = this.getAttribute('data-target');
            if(target === 'view-workout') {
                loadModule('workout', 'workout');
            } else {
                switchView(target);
            }
            setTimeout(closeMenu, 200); // Đóng trễ 200ms tối ưu UX
        });
    });

    // Bắt sự kiện Click vào các Menu con (HSK Level)
    document.querySelectorAll('.sub-item').forEach(subItem => {
        subItem.addEventListener('click', function() {
            const level = this.getAttribute('data-level');
            const type = this.getAttribute('data-type');
            loadModule(level, type);
            setTimeout(closeMenu, 200); // Đóng trễ 200ms
        });
    });
}

// Nút tắt/bật âm thanh
function initAudioToggle() {
    const audioBtn = document.getElementById('audio-toggle-btn');
    audioBtn.addEventListener('click', () => {
        isAudioEnabled = !isAudioEnabled;
        if (isAudioEnabled) {
            audioBtn.classList.remove('sound-off');
            audioBtn.innerHTML = '<span class="icon-sound">🔊</span>';
            playSound('correct'); // Test sound
        } else {
            audioBtn.classList.add('sound-off');
            audioBtn.innerHTML = '<span class="icon-sound">🔇</span>';
        }
    });
}

/* ==========================================================================
   TẢI DỮ LIỆU THÔNG MINH (LAZY FETCHING) & VÁ LỖI BATCH SIZE
   ========================================================================== */
async function loadModule(level, type) {
    currentLevel = level;
    currentCategory = type;
    
    // Đổi Tiêu đề
    const titleElem = document.getElementById('study-title');
    if(titleElem) {
        if(type === 'word') titleElem.innerText = `Từ Vựng HSK ${level}`;
        else if(type === 'grammar') titleElem.innerText = `Ngữ Pháp HSK ${level}`;
        else if(type === 'reading') titleElem.innerText = `Đọc Hiểu HSK ${level}`;
        else if(type === 'listening') titleElem.innerText = `Nghe Hiểu HSK ${level}`;
        else if(type === 'workout') titleElem.innerText = `Workout Ngữ Cảnh`;
    }

    // Lazy Fetching: Xác định file cần tải
    let fileName = `data/hsk${level}.json`;
    if(type === 'workout') fileName = `data/context_workout.json`;

    try {
        const response = await fetch(fileName);
        if (!response.ok) throw new Error('Network response was not ok');
        const rawData = await response.json();
        
        // Lọc dữ liệu theo category
        currentData = rawData.filter(item => item.category === type);
        
        // Bắt đầu xử lý nạp bài
        if(type === 'reading' || type === 'listening') {
            switchView('view-test');
            loadTestMultiQuestions();
        } else {
            switchView('view-study');
            filterAndLoadData();
        }

    } catch (error) {
        console.error('Lỗi tải dữ liệu:', error);
        showToast(`Không tìm thấy dữ liệu cho tệp ${fileName}. Vui lòng tạo tệp này trong thư mục data/`);
    }
}

// Hàm nạp bài (Vá lỗi lặp từ và cắt mảng)
function filterAndLoadData() {
    // Trộn ngẫu nhiên mảng
    let shuffled = [...currentData].sort(() => Math.random() - 0.5);
    
    // THUẬT TOÁN BẮT BUỘC: Cắt mảng chuẩn xác, không dùng while
    let limit = (currentBatchSize === 'ALL') ? shuffled.length : Math.min(currentBatchSize, shuffled.length);
    currentList = shuffled.slice(0, limit);
    
    // Cảnh báo nếu dữ liệu ít hơn lựa chọn
    if (currentList.length < currentBatchSize && currentBatchSize !== 'ALL') {
        showToast(`Lưu ý: Chỉ tìm thấy ${currentList.length} câu trong CSDL cấp độ này.`);
    }

    if (currentList.length === 0) {
        document.getElementById('main-prompt-text').innerText = "Chưa có dữ liệu cho phần này.";
        return;
    }

    currentIndex = 0;
    // Reset Live Stats
    document.getElementById('stat-total').innerText = currentList.length;
    document.getElementById('stat-correct').innerText = "0";
    document.getElementById('stat-wrong').innerText = "0";
    
    renderStudyCard();
}

/* ==========================================================================
   MODULE 1 & 2: TỪ VỰNG, NGỮ PHÁP & WORKOUT (CHẤM ĐIỂM 1 CHẠM)
   ========================================================================== */
function initStudyControls() {
    // Toggle Ngôn ngữ (Trung->Việt / Việt->Trung)
    const langToggle = document.getElementById('lang-toggle-btn');
    if(langToggle) {
        langToggle.addEventListener('change', (e) => {
            isVi2Zh = e.target.checked;
            renderStudyCard();
        });
    }

    // Nút Trộn bài
    const btnShuffle = document.getElementById('btn-shuffle');
    if(btnShuffle) btnShuffle.addEventListener('click', filterAndLoadData);

    // Ô nhập liệu - Lắng nghe phím Enter
    const inputField = document.getElementById('user-answer-input');
    if(inputField) {
        inputField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('btn-submit-answer').click();
            }
        });
    }

    // Nút Kiểm tra và Tiếp tục
    document.getElementById('btn-submit-answer').addEventListener('click', submitAnswer);
    document.getElementById('btn-next-question').addEventListener('click', () => {
        currentIndex++;
        if (currentIndex < currentList.length) {
            renderStudyCard();
        } else {
            showToast("🎉 Bạn đã hoàn thành phiên học!");
            filterAndLoadData(); // Quay vòng lại
        }
    });

    // Nút Xem nét vẽ chữ Hán
    document.getElementById('btn-draw-hanzi').addEventListener('click', animateHanzi);
}

function renderStudyCard() {
    const item = currentList[currentIndex];
    if (!item) return;

    // Reset UI
    const inputField = document.getElementById('user-answer-input');
    inputField.value = '';
    inputField.disabled = false;
    inputField.focus();

    document.getElementById('compact-result-panel').classList.add('hidden');
    document.getElementById('scroll-for-more-area').classList.add('hidden');
    document.getElementById('btn-submit-answer').classList.remove('hidden');
    document.getElementById('btn-next-question').classList.add('hidden');

    // Hiển thị đề bài theo ngôn ngữ
    const promptText = document.getElementById('main-prompt-text');
    if (currentCategory === 'workout') {
        promptText.innerText = item.prompt_vn || item.meaning_vn;
        inputField.placeholder = "Nhập đáp án Tiếng Trung...";
    } else {
        if (isVi2Zh) {
            promptText.innerText = (item.meaning_vn_array && item.meaning_vn_array.length > 0) ? item.meaning_vn_array[0] : (item.meaning_vn || "");
            inputField.placeholder = "Nhập chữ Hán hoặc Pinyin...";
        } else {
            promptText.innerText = item.hanzi;
            inputField.placeholder = "Nhập nghĩa Tiếng Việt...";
        }
    }
}

// Thuật toán làm sạch chuỗi
function sanitizeString(str) {
    if (!str) return "";
    return str.toString().toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?"'，。！？、“”‘’（）\s]/g, '');
}

// Logic Chấm điểm Đa nghĩa
function evaluateAnswerQuality(userInput, item) {
    const cleanInput = sanitizeString(userInput);
    
    // Nếu là luyện Việt -> Trung hoặc Workout
    if (isVi2Zh || currentCategory === 'workout') {
        const targetHanzi = sanitizeString(item.hanzi || item.textbook_cn || "");
        const targetPinyin = sanitizeString(item.pinyin || item.textbook_py || "");
        const nativeHanzi = sanitizeString(item.native_cn || "");
        
        return (cleanInput === targetHanzi || cleanInput === targetPinyin || (nativeHanzi && cleanInput === nativeHanzi));
    } 
    // Nếu là luyện Trung -> Việt
    else {
        if (item.meaning_vn_array && Array.isArray(item.meaning_vn_array)) {
            return item.meaning_vn_array.some(meaning => sanitizeString(meaning) === cleanInput);
        } else {
            const targetVn = sanitizeString(item.meaning_vn || "");
            return cleanInput === targetVn;
        }
    }
}

function submitAnswer() {
    const item = currentList[currentIndex];
    const inputField = document.getElementById('user-answer-input');
    const userInput = inputField.value.trim();
    
    if (userInput === '') return; // Yêu cầu nhập

    inputField.disabled = true; // Khóa input

    const isCorrect = evaluateAnswerQuality(userInput, item);
    triggerDuckReaction(isCorrect);
    playSound(isCorrect ? 'correct' : 'wrong');

    // Cập nhật thống kê
    if (isCorrect) {
        const correctEl = document.getElementById('stat-correct');
        correctEl.innerText = parseInt(correctEl.innerText) + 1;
    } else {
        const wrongEl = document.getElementById('stat-wrong');
        wrongEl.innerText = parseInt(wrongEl.innerText) + 1;
    }

    // Hiển thị Panel Kết quả Compact
    document.getElementById('user-typed-display').innerText = userInput;
    
    const badge = document.getElementById('result-status-badge');
    if(isCorrect) {
        badge.className = 'result-badge is-correct';
        badge.innerHTML = '✅ CHÍNH XÁC';
    } else {
        badge.className = 'result-badge is-wrong';
        badge.innerHTML = '❌ CHƯA CHÍNH XÁC';
    }

    if(currentCategory === 'workout') {
        document.getElementById('hanzi-mega-display').innerText = item.textbook_cn || item.native_cn || item.hanzi;
        document.getElementById('pinyin-mega-display').innerText = item.textbook_py || item.native_py || item.pinyin;
    } else {
        document.getElementById('hanzi-mega-display').innerText = item.hanzi;
        document.getElementById('pinyin-mega-display').innerText = item.pinyin;
    }

    document.getElementById('compact-result-panel').classList.remove('hidden');
    
    // Khởi tạo bảng vẽ chữ nhưng ẩn đi
    document.getElementById('hanzi-drawing-board').innerHTML = '';
    document.getElementById('hanzi-drawing-board').classList.add('hidden');
    
    // Nạp dữ liệu vào không gian mở rộng (Scroll for more)
    let hanvietHtml = `<strong>Hán Việt:</strong> ${item.han_viet || 'N/A'}<br><strong>Bộ thủ:</strong> ${item.radical || 'N/A'}`;
    document.getElementById('hanviet-radical-display').innerHTML = hanvietHtml;
    
    let nativeHtml = currentCategory === 'workout' ? `<strong>Bản xứ hay nói:</strong> ${item.native_cn || 'N/A'}` : (item.native_usage || item.expansion || 'Không có ghi chú');
    document.getElementById('native-usage-display').innerHTML = nativeHtml;
    
    document.getElementById('laosu-display').innerHTML = item.goc_lao_su || 'Hãy chú ý ngữ cảnh sử dụng.';

    document.getElementById('scroll-for-more-area').classList.remove('hidden');

    // Chuyển nút
    document.getElementById('btn-submit-answer').classList.add('hidden');
    const nextBtn = document.getElementById('btn-next-question');
    nextBtn.classList.remove('hidden');
    nextBtn.focus();

    // CUỘN TRUNG TÂM (Tối ưu UI 1 chạm)
    document.getElementById('compact-result-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Khởi tạo Web Audio Synthesizer đơn giản để không cần file mp3
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (!isAudioEnabled) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;
    if (type === 'correct') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    }
}

// Điều khiển Mascot & Pháo Giấy
function triggerDuckReaction(isCorrect) {
    const duckSvg = document.getElementById('duck-svg');
    const confetti = document.getElementById('confetti-container');
    const splash = document.getElementById('water-splash-container');
    
    duckSvg.className = ''; 
    void duckSvg.offsetWidth; // Force reflow
    
    if (isCorrect) {
        duckSvg.className = 'duck-happy';
        confetti.classList.remove('hidden');
        splash.classList.add('hidden');
    } else {
        duckSvg.className = 'duck-sad';
        splash.classList.remove('hidden');
        confetti.classList.add('hidden');
    }

    // Trả về trạng thái Idle sau 1.5s
    setTimeout(() => {
        duckSvg.className = 'duck-idle';
        confetti.classList.add('hidden');
        splash.classList.add('hidden');
    }, 1500);
}

// Vẽ Hanzi
function animateHanzi() {
    const item = currentList[currentIndex];
    const targetHanzi = (currentCategory === 'workout') ? (item.textbook_cn || item.native_cn || item.hanzi) : item.hanzi;
    if(!targetHanzi) return;

    const board = document.getElementById('hanzi-drawing-board');
    board.innerHTML = '';
    board.classList.remove('hidden');
    hanziWriters = [];

    // Chỉ vẽ tối đa 5 ký tự đầu để tránh vỡ giao diện
    const maxChars = Math.min(targetHanzi.length, 5);
    for(let i=0; i<maxChars; i++) {
        const char = targetHanzi.charAt(i);
        // Bỏ qua dấu câu
        if (/[，。！？、?.,!]/.test(char)) continue;

        const charDiv = document.createElement('div');
        charDiv.id = `hanzi-target-${i}`;
        charDiv.className = 'hanzi-char-box';
        board.appendChild(charDiv);

        let writer = HanziWriter.create(`hanzi-target-${i}`, char, {
            width: 70, height: 70, padding: 5, strokeColor: '#15803d', 
            radicalColor: '#16a34a', delayBetweenStrokes: 50
        });
        hanziWriters.push(writer);
    }

    // Chạy animation liên tiếp
    const animateSeq = async () => {
        for (let writer of hanziWriters) {
            await writer.animateCharacter();
        }
    };
    animateSeq();
}

/* ==========================================================================
   MODULE 3 & 4: ĐỌC HIỂU & NGHE HIỂU (MULTI-QUESTIONS)
   ========================================================================== */
function loadTestMultiQuestions() {
    // Trộn mảng bài test và lấy bài đầu tiên
    let shuffled = [...currentData].sort(() => Math.random() - 0.5);
    currentTestItem = shuffled[0];
    testUserAnswers = {}; // Xóa đáp án cũ

    if(!currentTestItem) {
        document.getElementById('test-passage').innerText = "Chưa có dữ liệu bài thi.";
        return;
    }

    // Hiển thị Đoạn văn hoặc Audio
    if(currentCategory === 'listening' && currentTestItem.audio_file && currentTestItem.audio_file !== "null") {
        document.getElementById('test-passage').classList.add('hidden');
        const audioBox = document.getElementById('test-audio-player');
        audioBox.classList.remove('hidden');
        audioBox.querySelector('audio').src = currentTestItem.audio_file;
    } else {
        document.getElementById('test-audio-player').classList.add('hidden');
        const passageBox = document.getElementById('test-passage');
        passageBox.classList.remove('hidden');
        passageBox.innerText = currentTestItem.passage_cn || currentTestItem.content_cn || "Lỗi hiển thị văn bản.";
    }

    // Render danh sách câu hỏi
    const qContainer = document.getElementById('test-questions-container');
    qContainer.innerHTML = '';
    
    if (currentTestItem.questions && Array.isArray(currentTestItem.questions)) {
        currentTestItem.questions.forEach((q, index) => {
            let html = `
                <div class="q-item" id="q-block-${q.q_id}">
                    <div class="q-title">Câu ${index + 1}: ${q.question_cn}</div>
                    <div class="options-grid">
            `;
            q.options.forEach(opt => {
                const optLetter = opt.charAt(0); // Lấy A, B, C, D
                html += `<button class="opt-btn" onclick="selectTestOption('${q.q_id}', '${optLetter}')" id="btn-${q.q_id}-${optLetter}">${opt}</button>`;
            });
            html += `
                    </div>
                    <div class="goc-lao-su-box hidden" id="goc-laosu-${q.q_id}" style="margin-top:15px;">
                        <h4>👨‍🏫 Góc Lão Sư</h4>
                        <p>${q.goc_lao_su || 'Không có giải thích.'}</p>
                    </div>
                </div>
            `;
            qContainer.innerHTML += html;
        });
    }

    // Nút Nộp Bài
    const btnSubmit = document.getElementById('btn-submit-test');
    btnSubmit.disabled = true;
    btnSubmit.innerText = "Nộp bài hoàn chỉnh";
    btnSubmit.onclick = submitMultiQuestionsTest;
}

// Bắt sự kiện chọn đáp án (A, B, C, D)
window.selectTestOption = function(q_id, option) {
    testUserAnswers[q_id] = option;
    
    // Cập nhật UI (xóa active cũ, thêm active mới)
    const block = document.getElementById(`q-block-${q_id}`);
    block.querySelectorAll('.opt-btn').forEach(btn => btn.classList.remove('selected'));
    document.getElementById(`btn-${q_id}-${option}`).classList.add('selected');

    // Kiểm tra xem đã chọn đủ chưa để bật nút Nộp Bài
    const totalQuestions = currentTestItem.questions.length;
    const answeredCount = Object.keys(testUserAnswers).length;
    
    if(answeredCount === totalQuestions) {
        document.getElementById('btn-submit-test').disabled = false;
    }
}

function submitMultiQuestionsTest() {
    let allCorrect = true;

    currentTestItem.questions.forEach(q => {
        const userOpt = testUserAnswers[q.q_id];
        const correctOpt = q.correct_answer || q.correct;
        
        const block = document.getElementById(`q-block-${q.q_id}`);
        const userBtn = document.getElementById(`btn-${q.q_id}-${userOpt}`);
        const correctBtn = document.getElementById(`btn-${q.q_id}-${correctOpt}`);

        // Chấm điểm & Hiển thị
        if (userOpt === correctOpt) {
            userBtn.style.background = '#dcfce7';
            userBtn.style.borderColor = '#16a34a';
            userBtn.style.color = '#15803d';
        } else {
            allCorrect = false;
            userBtn.style.background = '#fee2e2';
            userBtn.style.borderColor = '#dc2626';
            userBtn.style.color = '#991b1b';
            // Khoanh đáp án đúng
            if (correctBtn) {
                correctBtn.style.border = '2px dashed #16a34a';
                correctBtn.style.background = '#dcfce7';
            }
        }

        // Hiện Góc Lão Sư
        document.getElementById(`goc-laosu-${q.q_id}`).classList.remove('hidden');
        
        // Khóa các nút chọn
        block.querySelectorAll('.opt-btn').forEach(btn => btn.disabled = true);
    });

    triggerDuckReaction(allCorrect);
    playSound(allCorrect ? 'correct' : 'wrong');

    // Đổi nút nộp bài thành nút chuyển bài mới
    const btnSubmit = document.getElementById('btn-submit-test');
    btnSubmit.innerText = "Chuyển sang Đề thi tiếp theo ➔";
    btnSubmit.onclick = loadTestMultiQuestions;
}

/* ==========================================================================
   ĐỒNG HỒ CHIẾN THUẬT (CHRONOMETER)
   ========================================================================== */
function initChronometer() {
    const chronoBox = document.getElementById('study-chronometer');
    chronoBox.addEventListener('click', () => {
        if (!isChronoRunning) {
            // Bấm lần 1: Bắt đầu chạy
            isChronoRunning = true;
            chronoBox.classList.add('running');
            chronoTimer = setInterval(() => {
                chronoSeconds++;
                document.getElementById('chrono-display').innerText = formatTime(chronoSeconds);
            }, 1000);
        } else {
            // Bấm lần 2: Hỏi kết thúc
            const confirmStop = confirm(`Bạn muốn kết thúc tính giờ?\nThời gian phiên học: ${formatTime(chronoSeconds)}\nTổng thời gian mở web: ${formatTime(totalSeconds)}`);
            if (confirmStop) {
                clearInterval(chronoTimer);
                isChronoRunning = false;
                chronoBox.classList.remove('running');
                chronoSeconds = 0; // Reset
                document.getElementById('chrono-display').innerText = "00:00:00";
            }
        }
    });
}

function startTotalTimer() {
    totalTimer = setInterval(() => {
        totalSeconds++;
    }, 1000);
}

function formatTime(totalSec) {
    let hours = Math.floor(totalSec / 3600);
    let minutes = Math.floor((totalSec - (hours * 3600)) / 60);
    let seconds = totalSec - (hours * 3600) - (minutes * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/* ==========================================================================
   TOAST NOTIFICATION (THÔNG BÁO GÓC MÀN HÌNH)
   ========================================================================== */
function showToast(message) {
    const toast = document.createElement('div');
    toast.innerText = message;
    toast.style.position = 'fixed';
    toast.style.bottom = '80px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = '#1e293b';
    toast.style.color = '#fff';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '30px';
    toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
    toast.style.zIndex = '10000';
    toast.style.fontSize = '14px';
    toast.style.fontWeight = 'bold';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';

    document.body.appendChild(toast);
    
    // Fade in
    setTimeout(() => { toast.style.opacity = '1'; }, 10);
    
    // Fade out & remove sau 3s
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}