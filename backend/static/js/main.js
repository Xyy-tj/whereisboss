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
            fetch712Status(); // Refresh status display
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
    calendar.render();
}); 