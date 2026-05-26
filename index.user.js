// ==UserScript==
// @name         Stockhouse 全能小幫手
// @namespace    https://openuserjs.org/users/ssarcandy
// @version      2.4
// @description  整合：非阻塞系統通知、新增「展開全部」按鈕、增加 1000 筆顯示選項、一鍵複製所有通知紀錄、子帳戶持股一鍵切換
// @author       ssarcandy
// @license      MIT
// @match        https://www.stockhouse.com.tw/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=stockhouse.com.tw
// @grant        GM_addStyle
// @grant        unsafeWindow
// @grant        GM_setClipboard
// @require      https://cdn.jsdelivr.net/npm/simple-notify@1.0.4/dist/simple-notify.min.js
// ==/UserScript==

(function () {
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
    unsafeWindow.alert = function (message) {
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
    // 工具函數
    // ==========================================

    function sendXHR(method, url, body = null) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open(method, url, true);
            if (method === 'POST') {
                xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
            }
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(xhr.responseText);
                } else {
                    reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
                }
            };
            xhr.onerror = () => reject(new Error('Network Error'));
            xhr.send(body);
        });
    }

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

    // ==========================================
    // 全站通用優化
    // ==========================================

    // 在下拉選單新增「1000」筆選項
    waitForElement('select', null, (selectEl) => {
        if (!selectEl.querySelector('option[value="1000"]')) {
            const newOption = document.createElement('option');
            newOption.value = '1000';
            newOption.textContent = '1000';
            selectEl.appendChild(newOption);
        }
    });

    // ==========================================
    // 模組 B：僅在 viewlog 頁面執行的表格優化
    // ==========================================
    if (window.location.pathname.includes('viewlog.php')) {
        // 新增「展開全部」按鈕
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

            expandBtn.addEventListener('click', function () {
                const tdElements = Array.from(document.querySelectorAll('td.details-control'));
                for (let element of tdElements) {
                    element.click();
                }
            });

            excelBtn.insertAdjacentElement('afterend', expandBtn);
        });
    }

    // ==========================================
    // 模組 C：子帳戶持股狀態切換 (僅 z=5)
    // ==========================================
    if (window.location.search.includes('z=5')) {

        let subaccountMapping = {};
        let mappingLoaded = false;

        // 獲取子帳戶名稱與 ID 的對照表
        async function fetchSubaccountMapping() {
            try {
                const text = await sendXHR('GET', 'https://www.stockhouse.com.tw/action.php');
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, 'text/html');

                doc.querySelectorAll('a[href*="keep_id="]').forEach(a => {
                    const url = new URL(a.href, window.location.origin);
                    const keepId = url.searchParams.get('keep_id');
                    const name = url.searchParams.get('name') || a.textContent.trim();
                    if (keepId && name) {
                        subaccountMapping[name] = keepId;
                    }
                });
                mappingLoaded = true;
                console.log('[Stockhouse Helper] 子帳戶對照表已載入:', subaccountMapping);

                // 載入完成後，檢查頁面上是否已有按鈕
                document.querySelectorAll('h2').forEach(h => {
                    if (h.textContent.includes('持有該公司的子帳號如下')) {
                        handleInjectedContent(h.parentElement);
                    }
                });
            } catch (err) {
                console.error('[Stockhouse Helper] 無法獲取子帳戶對照表:', err);
            }
        }

        fetchSubaccountMapping();

        // 監控 DOM 變化，捕捉 getkeepac.php 載入的內容
        const observer = new MutationObserver((mutations) => {
            if (!mappingLoaded) return;
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) {
                        handleInjectedContent(node);
                    }
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        function handleInjectedContent(container) {
            // 檢查是否包含 getkeepac.php 的標題
            const headers = container.querySelectorAll('h2');
            let targetHeader = null;
            for (const h of headers) {
                if (h.textContent.includes('持有該公司的子帳號如下')) {
                    targetHeader = h;
                    break;
                }
            }

            if (!targetHeader) {
                if (container.tagName === 'H2' && container.textContent.includes('持有該公司的子帳號如下')) {
                    targetHeader = container;
                } else {
                    return;
                }
            }

            const parent = targetHeader.parentElement;
            const buttons = parent.querySelectorAll('a.ui-btn');
            if (buttons.length === 0) return;

            const expandedTr = targetHeader.closest('tr');
            if (!expandedTr) return;
            const mainTr = expandedTr.previousElementSibling;
            if (!mainTr) return;

            let stockId = null;
            const link = mainTr.querySelector('a[href*="stock="], a[href*="id="]');
            if (link) {
                try {
                    const url = new URL(link.href, window.location.origin);
                    stockId = url.searchParams.get('stock') || url.searchParams.get('id');
                } catch (e) { }
            }

            if (!stockId) {
                const cells = mainTr.querySelectorAll('td');
                for (const td of cells) {
                    const text = td.textContent.trim();
                    if (/^\d{4,6}$/.test(text)) {
                        stockId = text;
                        break;
                    }
                }
            }

            if (!stockId) return;

            buttons.forEach(btn => {
                const name = btn.textContent.trim();
                const keepId = subaccountMapping[name];

                if (keepId) {
                    btn.style.cursor = 'pointer';
                    if (btn.dataset.helperHandled) return;
                    btn.dataset.helperHandled = 'true';

                    btn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        try {
                            await sendXHR('POST', 'https://www.stockhouse.com.tw/setaddtolist.php', `id=${stockId}&keep_id=${keepId}`);

                            // 重新獲取最新狀態並更新介面
                            try {
                                const refreshText = await sendXHR('POST', 'https://www.stockhouse.com.tw/getkeepac.php', `stockcode=${stockId}`);
                                const parser = new DOMParser();
                                const refreshDoc = parser.parseFromString(refreshText, 'text/html');
                                
                                // 找到展開列中的容器（通常是包含 targetHeader 的父層）
                                const containerToUpdate = targetHeader.parentElement;
                                if (containerToUpdate) {
                                    containerToUpdate.innerHTML = refreshDoc.body.innerHTML;
                                    // 重新處理新插入的內容（綁定事件）
                                    handleInjectedContent(containerToUpdate);
                                }
                            } catch (refreshErr) {
                                console.error('[Stockhouse Helper] Refresh error:', refreshErr);
                                // 備案：點擊兩次 details-control
                                const control = mainTr.querySelector('td.details-control');
                                if (control) {
                                    control.click();
                                    setTimeout(() => control.click(), 200);
                                }
                            }
                        } catch (err) {
                            console.error('[Stockhouse Helper] Toggle error:', err);
                            unsafeWindow.alert('發生錯誤: ' + err.message);
                        }
                    });
                }
            });
        }
    }


})();
