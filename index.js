// ==UserScript==
// @name         Stockhouse 全能小幫手
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  整合：非阻塞系統通知、新增「展開全部」按鈕、增加 1000 筆顯示選項、一鍵複製所有通知紀錄
// @author       You
// @match        https://www.stockhouse.com.tw/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=stockhouse.com.tw
// @grant        GM_addStyle
// @grant        unsafeWindow
// @grant        GM_setClipboard
// @require      https://cdn.jsdelivr.net/npm/simple-notify@1.0.4/dist/simple-notify.min.js
// ==/UserScript==

(function() {
    'use strict';

    // 用來儲存所有被攔截的 alert 訊息
    const alertLogHistory = [];

    // ==========================================
    // 模組 A：全站替換 Alert 與收集紀錄 (使用 simple-notify)
    // ==========================================

    // 1. 載入 simple-notify 的 CSS 樣式
    GM_addStyle(`
        @import url('https://cdn.jsdelivr.net/npm/simple-notify@1.0.4/dist/simple-notify.min.css');
        /* 確保通知不會被原網站的 z-index 蓋住 */
        .notify-container {
            z-index: 999999 !important;
        }
        /* 複製按鈕樣式 */
        #copy-logs-btn {
            position: fixed;
            bottom: 20px;
            left: 20px; /* 放左下角避免擋住右下角可能的東西 */
            z-index: 999999;
            padding: 10px 15px;
            background-color: #28a745;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            box-shadow: 0 4px 6px rgba(0,0,0,0.2);
            font-weight: bold;
            display: none; /* 初始隱藏，有紀錄才顯示 */
            transition: all 0.3s ease;
        }
        #copy-logs-btn:hover {
            background-color: #218838;
            transform: translateY(-2px);
        }
    `);

    // 建立浮動複製按鈕
    const copyLogBtn = document.createElement('button');
    copyLogBtn.id = 'copy-logs-btn';
    document.body.appendChild(copyLogBtn);

    // 點擊複製所有 log
    copyLogBtn.addEventListener('click', () => {
        if (alertLogHistory.length === 0) return;

        // 將所有紀錄用換行符號串接
        const logText = alertLogHistory.join('\n');
        GM_setClipboard(logText, 'text'); // 使用 Tampermonkey 的剪貼簿 API 確保成功率

        new Notify({
            status: 'success',
            title: '複製成功',
            text: `已複製 ${alertLogHistory.length} 筆歷史紀錄！`,
            effect: 'fade',
            speed: 300,
            autoclose: true,
            autotimeout: 2000,
            position: 'x-center'
        });
    });

    // 2. 覆寫 window.alert
    unsafeWindow.alert = function(message) {
        // 顯示通知
        new Notify({
            status: 'warning',
            title: '系統提示',
            text: message,
            effect: 'fade',
            speed: 300,
            showIcon: true,
            showCloseButton: true,
            autoclose: true,
            autotimeout: 3000,
            gap: 20,
            type: 1,
            position: 'x-center'
        });

        // 收集 log 並加上時間戳記
        const now = new Date();
        const timeString = now.toTimeString().split(' ')[0]; // 取得 HH:MM:SS
        alertLogHistory.push(`[${timeString}] ${message}`);

        // 更新按鈕狀態
        copyLogBtn.style.display = 'block';
        copyLogBtn.textContent = `📋 複製通知紀錄 (${alertLogHistory.length})`;
    };


    // ==========================================
    // 模組 B：僅在 viewlog 頁面執行的表格優化
    // ==========================================
    if (!window.location.pathname.includes('viewlog.php')) return;

    // 建立一個通用的等待函數
    function waitForElement(selector, condition, callback) {
        const checkElements = () => {
            const elements = document.querySelectorAll(selector);
            for (let el of elements) {
                if (!condition || condition(el)) return el;
            }
            return null;
        };

        const foundEl = checkElements();
        if (foundEl) {
            callback(foundEl);
            return;
        }

        const observer = new MutationObserver((mutations, obs) => {
            const foundEl = checkElements();
            if (foundEl) {
                obs.disconnect();
                callback(foundEl);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    // 功能 B-1：新增「展開全部」按鈕
    const btnSelector = 'button.dt-button[aria-controls="paper-table"]';
    const btnCondition = (el) => el.textContent.includes('下載成EXCEL檔');

    waitForElement(btnSelector, btnCondition, (excelBtn) => {
        const expandBtn = document.createElement('button');
        expandBtn.className = 'dt-button';
        expandBtn.setAttribute('tabindex', '0');
        expandBtn.setAttribute('aria-controls', 'paper-table');
        expandBtn.setAttribute('type', 'button');
        expandBtn.style.marginLeft = '5px';

        const span = document.createElement('span');
        span.textContent = '展開全部';
        expandBtn.appendChild(span);

        expandBtn.addEventListener('click', function() {
            const tdElements = Array.from(document.querySelectorAll('td.details-control'));
            for (let element of tdElements) {
                element.click();
            }
        });

        excelBtn.insertAdjacentElement('afterend', expandBtn);
    });

    // 功能 B-2：在下拉選單新增「1000」筆選項
    const selectSelector = 'select[name="paper-table_length"]';

    waitForElement(selectSelector, null, (selectEl) => {
        if (!selectEl.querySelector('option[value="1000"]')) {
            const newOption = document.createElement('option');
            newOption.value = '1000';
            newOption.textContent = '1000';
            selectEl.appendChild(newOption);
        }
    });

})();
