document.addEventListener('DOMContentLoaded', () => {
    const calendarEl = document.getElementById('calendar-container');
    const locationInput = document.getElementById('location-input');
    const infoSourceInput = document.getElementById('info-source-input');
    const startTimeInput = document.getElementById('start-time');
    const endTimeInput = document.getElementById('end-time');
    const btnSubmit = document.getElementById('btn-submit');
    const presetButtons = document.querySelectorAll('.preset-btn');
    // 712 Status Elements
    const status712Text = document.getElementById('status-712-text');
    const status712Time = document.getElementById('status-712-time');
    const status712Buttons = document.querySelectorAll('.status-btn');

    const API_STATUS_URL = '/api/status';
    const API_UPDATE_URL = '/api/update';

    function toLocalISOString(date) {
        const tzoffset = (new Date()).getTimezoneOffset() * 60000;
        const localISOTime = (new Date(date - tzoffset)).toISOString().slice(0, -1);
        return localISOTime.substring(0, 16);
    }

    function setDefaultTimes() {
        const now = new Date();
        const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000); // Add 1 hour
        startTimeInput.value = toLocalISOString(now);
        endTimeInput.value = toLocalISOString(oneHourLater);
    }

    function formatInTimeZone(dateString) {
        if (!dateString) return '';
        // IMPORTANT: The string from SQLite is timezone-naive.
        // We must append 'Z' to make it explicitly UTC before parsing.
        // '2025-06-30 03:04:45' -> '2025-06-30T03:04:45Z'
        const isoUtcString = dateString.replace(' ', 'T') + 'Z';
        const date = new Date(isoUtcString);

        return date.toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        }).replace(/\//g, '-');
    }
    
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'timeGridWeek',
        editable: true,
        height: '100%',
        timeZone: 'Asia/Shanghai',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        events: async function(fetchInfo, successCallback, failureCallback) {
            try {
                const response = await fetch(API_STATUS_URL);
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                const rawEvents = await response.json();

                // Conflict detection
                const processedEvents = detectConflicts(rawEvents);
                
                successCallback(processedEvents.map(item => ({
                    id: item.id,
                    title: item.location,
                    start: item.start_time,
                    end: item.end_time,
                    extendedProps: {
                        info_source: item.info_source
                    },
                    className: item.isConflicting ? 'fc-event-conflict' : ''
                })));
            } catch (error) {
                console.error('Fetch error:', error);
                failureCallback(error);
            }
        },
        eventClick: function(info) {
            Toastify({
                text: "确定要删除这个行程吗?",
                duration: 5000,
                close: true,
                gravity: "top",
                position: "center",
                style: {
                  background: "var(--danger-color)",
                },
                stopOnFocus: true,
                onClick: async function(){
                    try {
                        const response = await fetch(`/api/delete/${info.event.id}`, { method: 'DELETE' });
                        if (!response.ok) throw new Error('删除失败');
                        info.event.remove();
                        Toastify({ text: "删除成功!", style: { background: "var(--success-color)" } }).showToast();
                    } catch (error) {
                        Toastify({ text: "删除失败: " + error.message, style: { background: "var(--danger-color)" } }).showToast();
                    }
                }
            }).showToast();
        },
        eventDrop: function(info) {
            updateEventTime(info);
        },
        eventResize: function(info) {
            updateEventTime(info);
        },
        eventDidMount: function(info) {
            if (info.event.extendedProps.info_source) {
                const eventMain = info.el.querySelector('.fc-event-main');
                if (eventMain) {
                    const infoEl = document.createElement('div');
                    infoEl.style.fontStyle = 'italic';
                    infoEl.innerText = info.event.extendedProps.info_source;
                    eventMain.appendChild(infoEl);
                }
            }
        }
    });

    function detectConflicts(events) {
        const sortedEvents = events.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        for (let i = 0; i < sortedEvents.length; i++) {
            for (let j = i + 1; j < sortedEvents.length; j++) {
                const eventA = sortedEvents[i];
                const eventB = sortedEvents[j];
                const startA = new Date(eventA.start_time);
                const endA = new Date(eventA.end_time);
                const startB = new Date(eventB.start_time);

                if (startB < endA) { // Overlap detected
                    eventA.isConflicting = true;
                    eventB.isConflicting = true;
                }
            }
        }
        return sortedEvents;
    }

    async function fetch712Status() {
        try {
            const response = await fetch('/api/status_712');
            if (!response.ok) throw new Error('查询状态失败');
            const data = await response.json();

            status712Text.textContent = data.status;
            status712Text.className = ''; // Reset class
            if (data.status === '在') {
                status712Text.classList.add('status-in');
            } else if (data.status === '不在') {
                status712Text.classList.add('status-out');
            } else if (data.status === '背包走了') {
                status712Text.classList.add('status-gone');
            } else {
                status712Text.classList.add('status-unknown');
            }

            if (data.created_at) {
                status712Time.textContent = `(更新于: ${formatInTimeZone(data.created_at)})`;
            } else {
                status712Time.textContent = '';
            }
        } catch (error) {
            status712Text.textContent = '查询失败';
            status712Text.className = 'status-unknown';
            console.error(error);
        }
    }

    async function update712Status(status) {
        try {
            const response = await fetch('/api/status_712', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: status })
            });
            if (!response.ok) throw new Error('更新失败');
            Toastify({ text: `状态已更新为: ${status}`, style: { background: "var(--success-color)" } }).showToast();
            // fetch712Status(); // No longer needed, update will come via SSE
        } catch (error) {
            Toastify({ text: "更新失败!", style: { background: "var(--danger-color)" } }).showToast();
            console.error(error);
        }
    }

    async function updateEventTime(info) {
        const savingToast = Toastify({
            text: "正在保存...",
            gravity: "top",
            position: "right",
            style: { background: "var(--primary-color)" },
            close: true
        }).showToast();

        try {
            const response = await fetch(`/api/update/${info.event.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start_time: info.event.start.toISOString(),
                    end_time: info.event.end.toISOString()
                })
            });

            if(!response.ok) throw new Error('保存失败');

            calendar.refetchEvents(); // Refetch to check for new conflicts
            Toastify({ text: "更新成功!", style: { background: "var(--success-color)" } }).showToast();
        } catch (error) {
            Toastify({ text: `更新失败: ${error.message}`, style: { background: "var(--danger-color)" } }).showToast();
            info.revert(); // Revert the change on failure
        } finally {
             // Find a way to dismiss the "saving" toast. Toastify doesn't have a built-in dismiss by ID.
             // For now, it will auto-dismiss or the user can close it.
            btnSubmit.disabled = false;
            btnSubmit.textContent = '提交';
        }
    }

    async function updateStatus(location, infoSource, startTime, endTime) {
        if (!location) {
            Toastify({ text: "请输入位置信息!", style: { background: "#e74c3c" } }).showToast();
            return;
        }

        btnSubmit.disabled = true;
        btnSubmit.textContent = '提交中...';

        try {
            const response = await fetch('/api/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    location: location,
                    info_source: infoSource,
                    start_time: startTime || null,
                    end_time: endTime || null
                }),
            });
            if (!response.ok) throw new Error('提交失败');
            
            locationInput.value = '';
            infoSourceInput.value = '';
            setDefaultTimes();
            calendar.refetchEvents();
            Toastify({ text: "添加成功!", style: { background: "var(--success-color)" } }).showToast();
        } catch (error) {
            Toastify({ text: error.message, style: { background: "#e74c3c" } }).showToast();
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.textContent = '提交';
        }
    }

    // 创建引导对话框
    const notificationGuideHTML = `
        <div id="notification-guide" class="modal-overlay" style="display: none;">
            <div class="modal-content">
                <h2>开启通知提醒</h2>
                <p>及时获取老板状态更新，永不错过重要信息！</p>
                
                <div class="guide-steps">
                    <div class="step">
                        <div class="step-number">1</div>
                        <div class="step-content">
                            <h3>点击"允许"</h3>
                            <p>在浏览器弹出的通知请求对话框中，点击"允许"按钮来开启通知功能。</p>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-number">2</div>
                        <div class="step-content">
                            <h3>确认系统通知已开启</h3>
                            <p>开启后，您将收到Windows系统通知，即使浏览器在后台运行也能及时获知老板状态更新。</p>
                        </div>
                    </div>
                </div>

                <div class="guide-buttons">
                    <button id="enable-notification-btn" class="primary-btn">开启通知</button>
                    <button id="skip-notification-btn" class="secondary-btn">暂不开启</button>
                </div>

                <div id="permission-denied-guide" style="display: none;">
                    <h3>如何手动开启通知？</h3>
                    <div class="manual-steps">
                        <p>1. 点击浏览器地址栏左侧的🔒图标</p>
                        <p>2. 在弹出的菜单中找到"通知"选项</p>
                        <p>3. 将通知权限设置为"允许"</p>
                        <p>4. 刷新页面以使设置生效</p>
                    </div>
                    <button id="retry-notification-btn" class="primary-btn">重新检查权限</button>
                </div>
            </div>
        </div>
    `;

    // 添加样式
    const styleSheet = document.createElement("style");
    styleSheet.textContent = `
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
        }

        .modal-content {
            background: white;
            padding: 2rem;
            border-radius: 12px;
            max-width: 600px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .guide-steps {
            margin: 2rem 0;
        }

        .step {
            display: flex;
            margin-bottom: 1.5rem;
            align-items: flex-start;
        }

        .step-number {
            width: 32px;
            height: 32px;
            background: var(--primary-color, #3498db);
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            margin-right: 1rem;
            flex-shrink: 0;
        }

        .step-content {
            flex: 1;
        }

        .guide-img {
            max-width: 100%;
            height: auto;
            margin: 1rem 0;
            border: 1px solid #ddd;
            border-radius: 8px;
        }

        .guide-buttons {
            display: flex;
            gap: 1rem;
            justify-content: center;
            margin-top: 2rem;
        }

        .primary-btn, .secondary-btn {
            padding: 0.75rem 1.5rem;
            border-radius: 6px;
            border: none;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.3s ease;
        }

        .primary-btn {
            background: var(--primary-color, #3498db);
            color: white;
        }

        .primary-btn:hover {
            background: var(--primary-color-dark, #2980b9);
        }

        .secondary-btn {
            background: #f1f1f1;
            color: #666;
        }

        .secondary-btn:hover {
            background: #e1e1e1;
        }

        .manual-steps {
            background: #f8f9fa;
            padding: 1rem;
            border-radius: 8px;
            margin: 1rem 0;
        }

        #permission-denied-guide {
            margin-top: 2rem;
            padding-top: 2rem;
            border-top: 1px solid #eee;
        }
    `;
    document.head.appendChild(styleSheet);

    // 添加引导对话框到页面
    document.body.insertAdjacentHTML('beforeend', notificationGuideHTML);

    // 获取引导对话框元素
    const notificationGuide = document.getElementById('notification-guide');
    const enableNotificationBtn = document.getElementById('enable-notification-btn');
    const skipNotificationBtn = document.getElementById('skip-notification-btn');
    const permissionDeniedGuide = document.getElementById('permission-denied-guide');
    const retryNotificationBtn = document.getElementById('retry-notification-btn');

    // 检查并存储通知设置状态
    function getNotificationSetting() {
        return localStorage.getItem('notificationSetting') || 'unset';
    }

    function setNotificationSetting(value) {
        localStorage.setItem('notificationSetting', value);
    }

    // 显示引导对话框
    function showNotificationGuide() {
        notificationGuide.style.display = 'flex';
        permissionDeniedGuide.style.display = 'none';
    }

    // 隐藏引导对话框
    function hideNotificationGuide() {
        notificationGuide.style.display = 'none';
    }

    // 显示权限被拒绝的引导
    function showPermissionDeniedGuide() {
        permissionDeniedGuide.style.display = 'block';
        enableNotificationBtn.style.display = 'none';
        skipNotificationBtn.style.display = 'none';
    }

    // 处理通知权限请求
    async function handleNotificationPermission() {
        console.log("🔄 检查通知权限状态...");
        
        if (!("Notification" in window)) {
            console.warn("⚠️ 此浏览器不支持通知功能");
            Toastify({
                text: "您的浏览器不支持通知功能，建议使用 Chrome 或 Edge",
                duration: 5000,
                style: { background: "var(--warning-color, #f1c40f)" }
            }).showToast();
            setNotificationSetting('unsupported');
            return;
        }

        const permission = Notification.permission;
        console.log("📢 当前通知权限:", permission);

        if (permission === "granted") {
            console.log("✅ 已获得通知权限");
            setNotificationSetting('granted');
            hideNotificationGuide();
            return true;
        }

        if (permission === "denied") {
            console.warn("⚠️ 通知权限已被拒绝");
            showPermissionDeniedGuide();
            setNotificationSetting('denied');
            return false;
        }

        // 如果权限状态是 "default"，显示引导
        if (getNotificationSetting() === 'unset') {
            showNotificationGuide();
        }

        return false;
    }

    // 请求通知权限
    async function requestNotificationPermission() {
        try {
            console.log("🔄 正在请求通知权限...");
            const permission = await Notification.requestPermission();
            console.log("📝 用户响应:", permission);

            if (permission === "granted") {
                console.log("✅ 通知权限已授予");
                setNotificationSetting('granted');
                hideNotificationGuide();
                // 发送测试通知
                sendSystemNotification("测试通知", {
                    body: "通知功能已成功开启！您将收到老板状态更新提醒。",
                    tag: 'test-notification'
                });
                return true;
            } else if (permission === "denied") {
                console.warn("❌ 用户拒绝了通知权限");
                showPermissionDeniedGuide();
                setNotificationSetting('denied');
            }
        } catch (error) {
            console.error("❌ 请求通知权限时出错:", error);
        }
        return false;
    }

    // 绑定事件处理
    enableNotificationBtn.addEventListener('click', requestNotificationPermission);
    skipNotificationBtn.addEventListener('click', () => {
        hideNotificationGuide();
        setNotificationSetting('skipped');
    });
    retryNotificationBtn.addEventListener('click', async () => {
        const result = await handleNotificationPermission();
        if (!result) {
            Toastify({
                text: "通知权限仍未开启，请按照指引手动开启",
                duration: 5000,
                style: { background: "var(--warning-color, #f1c40f)" }
            }).showToast();
        }
    });

    function sendSystemNotification(title, options = {}) {
        console.log("🔔 尝试发送系统通知:", { title, options });
        
        // 再次检查通知支持
        if (!("Notification" in window)) {
            console.warn("⚠️ 无法发送通知：浏览器不支持");
            return;
        }

        // 检查权限
        if (Notification.permission !== "granted") {
            console.warn("⚠️ 无法发送通知：没有权限");
            return;
        }

        // 如果页面在前台，记录但继续发送
        if (document.visibilityState === 'visible') {
            console.log("📝 页面在前台，但仍将发送系统通知");
        }

        try {
            // 使用 favicon.ico 作为通知图标
            const iconUrl = document.querySelector('link[rel="icon"]')?.href || '/static/favicon.ico';

            // 创建通知
            const notification = new Notification(title, {
                icon: iconUrl,
                ...options,
                requireInteraction: true,  // 通知将持续显示直到用户交互
                timestamp: Date.now()  // 添加时间戳
            });

            console.log("✅ 系统通知已创建");

            // 通知事件处理
            notification.onclick = function() {
                console.log("👆 用户点击了通知");
                window.focus();
                notification.close();
            };

            notification.onshow = function() {
                console.log("👀 通知已显示");
            };

            notification.onclose = function() {
                console.log("🚪 通知已关闭");
            };

            notification.onerror = function(error) {
                console.error("❌ 通知显示出错:", error);
            };

        } catch (error) {
            console.error("❌ 创建系统通知时出错:", error);
            // 如果系统通知失败，回退到 Toastify
            Toastify({
                text: `${title}: ${options.body || ''}`,
                duration: 5000,
                close: true,
                style: { background: "var(--warning-color, #f1c40f)" }
            }).showToast();
        }
    }

    function connectToSSE() {
        console.log("🔄 正在建立 SSE 连接...");
        const evtSource = new EventSource("/api/events");

        evtSource.onmessage = function(event) {
            console.log("📨 收到 SSE 消息:", event.data);
            const data = JSON.parse(event.data);

            // Update status display
            status712Text.textContent = data.status;
            status712Text.className = ''; // Reset class
            if (data.status === '在') {
                status712Text.classList.add('status-in');
            } else if (data.status === '不在') {
                status712Text.classList.add('status-out');
            } else if (data.status === '背包走了') {
                status712Text.classList.add('status-gone');
            } else {
                status712Text.classList.add('status-unknown');
            }

            if (data.created_at) {
                status712Time.textContent = `(更新于: ${formatInTimeZone(data.created_at)})`;
            } else {
                status712Time.textContent = '';
            }
            
            // 显示 Toastify 通知
            Toastify({
                text: `老板状态已更新: ${data.status}`,
                duration: 5000,
                close: true,
                gravity: "top",
                position: "right",
                style: {
                    background: "var(--info-color, #3498db)",
                }
            }).showToast();

            // 发送系统通知
            console.log("🔔 准备发送状态更新系统通知");
            sendSystemNotification("老板状态更新", {
                body: `最新状态: ${data.status}\n更新时间: ${formatInTimeZone(data.created_at)}`,
                tag: 'boss-status-update',  // 使用tag避免重复通知堆积
                renotify: true,  // 允许重复通知
                requireInteraction: true,  // 通知将持续显示直到用户交互
                silent: false  // 允许通知声音
            });
        };

        evtSource.onopen = function() {
            console.log("✅ SSE 连接已建立");
        };

        evtSource.onerror = function(err) {
            console.error("❌ SSE 连接错误:", err);
            evtSource.close();
            console.log("🔄 5秒后尝试重新连接...");
            setTimeout(connectToSSE, 5000);
        };

        // 保持页面在后台时依然活跃
        if ('wakeLock' in navigator) {
            console.log("📱 尝试获取 WakeLock...");
            navigator.wakeLock.request('screen')
                .then(wakeLock => {
                    console.log("✅ WakeLock 已获取");
                    document.addEventListener('visibilitychange', () => {
                        if (document.visibilityState === 'visible' && !wakeLock.active) {
                            console.log("🔄 页面可见，重新请求 WakeLock");
                            navigator.wakeLock.request('screen')
                                .then(() => console.log("✅ WakeLock 已重新获取"))
                                .catch(err => console.warn("⚠️ WakeLock 重新获取失败:", err));
                        }
                    });
                })
                .catch(err => console.warn("⚠️ WakeLock 不支持或获取失败:", err));
        } else {
            console.warn("⚠️ 此浏览器不支持 WakeLock API");
        }
    }

    status712Buttons.forEach(button => {
        button.addEventListener('click', () => {
            const status = button.dataset.status;
            update712Status(status);
        });
    });

    btnSubmit.addEventListener('click', () => {
        updateStatus(
            locationInput.value.trim(),
            infoSourceInput.value.trim(),
            startTimeInput.value,
            endTimeInput.value
        );
    });

    presetButtons.forEach(button => {
        button.addEventListener('click', () => {
            locationInput.value = button.textContent;
        });
    });

    setDefaultTimes();
    fetch712Status();
    handleNotificationPermission();  // 替换原来的 requestNotificationPermission
    connectToSSE();
    calendar.render();
}); 