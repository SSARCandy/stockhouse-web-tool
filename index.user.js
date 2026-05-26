// ==UserScript==
// @name         Stockhouse 全能小幫手
// @namespace    https://openuserjs.org/users/ssarcandy
// @version      2.5
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

    // ==========================================
    // 狀態與設定 (State & Config)
    // ==========================================
    const alertLogHistory = [];
    const subaccountMapping = {};
    let isMappingLoaded = false;

    // ==========================================
    // 工具函數 (Utilities)
    // ==========================================

    /**
     * 發送 XMLHttpRequest 並返回 Promise
     */
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

    /**
     * 等待元素出現後執行回調
     */
    function waitForElement(selector, condition, callback) {
        const check = () => {
            const els = document.querySelectorAll(selector);
            for (let el of els) {
                if (!condition || condition(el)) return el;
            }
            return null;
        };

        const found = check();
        if (found) return callback(found);

        const observer = new MutationObserver((_, obs) => {
            const found = check();
            if (found) {
                obs.disconnect();
                callback(found);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ==========================================
    // 模組 A：全站提示優化 (Alert & Notify)
    // ==========================================

    function initAlertProxy() {
        GM_addStyle(`
            @import url('https://cdn.jsdelivr.net/npm/simple-notify@1.0.4/dist/simple-notify.min.css');
            .notify-container { z-index: 999999 !important; }
            #copy-logs-btn {
                position: fixed; bottom: 20px; left: 20px; z-index: 999999;
                padding: 10px 15px; background-color: #28a745; color: white;
                border: none; border-radius: 8px; cursor: pointer;
                box-shadow: 0 4px 6px rgba(0,0,0,0.2); font-weight: bold;
                display: none; transition: all 0.3s ease;
            }
            #copy-logs-btn:hover { background-color: #218838; transform: translateY(-2px); }
        `);

        const copyBtn = document.createElement('button');
        copyBtn.id = 'copy-logs-btn';
        document.body.appendChild(copyBtn);

        copyBtn.addEventListener('click', () => {
            if (alertLogHistory.length === 0) return;
            GM_setClipboard(alertLogHistory.join('\n'), 'text');
            new Notify({
                status: 'success', title: '複製成功', text: `已複製 ${alertLogHistory.length} 筆紀錄`,
                autoclose: true, autotimeout: 2000, position: 'x-center'
            });
        });

        unsafeWindow.alert = function (msg) {
            new Notify({
                status: 'warning', title: '系統提示', text: msg,
                showIcon: true, showCloseButton: true, autoclose: true,
                autotimeout: 3000, position: 'x-center'
            });

            const time = new Date().toTimeString().split(' ')[0];
            alertLogHistory.push(`[${time}] ${msg}`);
            copyBtn.style.display = 'block';
            copyBtn.textContent = `📋 複製通知紀錄 (${alertLogHistory.length})`;
        };
    }

    // ==========================================
    // 模組 B：表格通用優化 (Table Enhancements)
    // ==========================================

    function initGlobalTableFixes() {
        // 新增 1000 筆選項
        waitForElement('select', null, (select) => {
            if (!select.querySelector('option[value="1000"]')) {
                const opt = document.createElement('option');
                opt.value = opt.textContent = '1000';
                select.appendChild(opt);
            }
        });
    }

    function initViewlogFixes() {
        if (!window.location.pathname.includes('viewlog.php')) return;

        // 展開全部按鈕
        const selector = 'button.dt-button[aria-controls="paper-table"]';
        const condition = (el) => el.textContent.includes('下載成EXCEL檔');

        waitForElement(selector, condition, (excelBtn) => {
            const expandBtn = document.createElement('button');
            expandBtn.className = 'dt-button';
            expandBtn.innerHTML = '<span>展開全部</span>';
            expandBtn.style.marginLeft = '5px';
            expandBtn.addEventListener('click', () => {
                document.querySelectorAll('td.details-control').forEach(td => td.click());
            });
            excelBtn.insertAdjacentElement('afterend', expandBtn);
        });
    }

    // ==========================================
    // 模組 C：子帳戶切換持股狀態 (Subaccount Toggle)
    // ==========================================

    /**
     * 從 action.php 獲取子帳戶 Mapping
     */
    async function loadSubaccountMapping() {
        try {
            const html = await sendXHR('GET', 'https://www.stockhouse.com.tw/action.php');
            const doc = new DOMParser().parseFromString(html, 'text/html');
            
            doc.querySelectorAll('a[href*="keep_id="]').forEach(a => {
                const url = new URL(a.href, window.location.origin);
                const id = url.searchParams.get('keep_id');
                const name = url.searchParams.get('name') || a.textContent.trim();
                if (id && name) subaccountMapping[name] = id;
            });
            
            isMappingLoaded = true;
            console.log('[Helper] Mapping loaded:', subaccountMapping);
            
            // 掃描當前頁面是否已有待處理內容
            document.querySelectorAll('h2').forEach(h => {
                if (h.textContent.includes('持有該公司的子帳號如下')) handleHoldingList(h.parentElement);
            });
        } catch (err) {
            console.error('[Helper] Mapping error:', err);
        }
    }

    /**
     * 處理注入的持股清單
     */
    function handleHoldingList(container) {
        const header = Array.from(container.querySelectorAll('h2'))
            .find(h => h.textContent.includes('持有該公司的子帳號如下')) || 
            (container.tagName === 'H2' && container.textContent.includes('持有該公司的子帳號如下') ? container : null);

        if (!header) return;

        const buttons = container.querySelectorAll('a.ui-btn');
        const expandedTr = header.closest('tr');
        const mainTr = expandedTr?.previousElementSibling;
        const stockId = getStockId(mainTr);

        if (!stockId || buttons.length === 0) return;

        buttons.forEach(btn => {
            const name = btn.textContent.trim();
            const keepId = subaccountMapping[name];
            if (!keepId || btn.dataset.helperHandled) return;

            btn.dataset.helperHandled = 'true';
            btn.style.cursor = 'pointer';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                toggleHolding(stockId, keepId, expandedTr, mainTr);
            });
        });
    }

    /**
     * 從表格列提取股票 ID
     */
    function getStockId(tr) {
        if (!tr) return null;
        // 1. 從連結參數找
        const link = tr.querySelector('a[href*="stock="], a[href*="id="]');
        if (link) {
            const url = new URL(link.href, window.location.origin);
            const id = url.searchParams.get('stock') || url.searchParams.get('id');
            if (id) return id;
        }
        // 2. 找 4-6 位數字單元格
        for (let td of tr.cells) {
            const text = td.textContent.trim();
            if (/^\d{4,6}$/.test(text)) return text;
        }
        return null;
    }

    /**
     * 切換持股狀態並刷新
     */
    async function toggleHolding(stockId, keepId, expandedTr, mainTr) {
        try {
            await sendXHR('POST', 'https://www.stockhouse.com.tw/setaddtolist.php', `id=${stockId}&keep_id=${keepId}`);
            
            // 刷新內容
            try {
                const html = await sendXHR('POST', 'https://www.stockhouse.com.tw/getkeepac.php', `stockcode=${stockId}`);

                if (expandedTr) {
                    expandedTr.innerHTML = `<td colspan="6">${html}</td>`;
                    handleHoldingList(expandedTr); // 重新綁定事件
                }
            } catch (refreshErr) {
                console.error('[Helper] Refresh failed:', refreshErr);
                // 備案：手動開關
                const ctrl = mainTr.querySelector('td.details-control');
                if (ctrl) { ctrl.click(); setTimeout(() => ctrl.click(), 200); }
            }
        } catch (err) {
            console.error('[Helper] Toggle failed:', err);
            unsafeWindow.alert('操作失敗: ' + err.message);
        }
    }

    /**
     * 初始化持股監控
     */
    function initHoldingObserver() {
        if (!window.location.search.includes('z=5')) return;

        loadSubaccountMapping();

        const observer = new MutationObserver((mutations) => {
            if (!isMappingLoaded) return;
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node.nodeType === 1) handleHoldingList(node);
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ==========================================
    // 進入點 (Entry Point)
    // ==========================================

    function main() {
        initAlertProxy();
        initGlobalTableFixes();
        initViewlogFixes();
        initHoldingObserver();
    }

    main();

})();
