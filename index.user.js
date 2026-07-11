// ==UserScript==
// @name         Stockhouse 全能小幫手
// @namespace    https://openuserjs.org/users/ssarcandy
// @version      2.11
// @description  整合：非阻塞系統通知、新增「展開全部」按鈕、增加 1000 筆顯示選項、一鍵複製所有通知紀錄、子帳戶持股一鍵切換、帳務交易摘要分析
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
    // 僅針對 DataTables 每頁筆數選單 (name 結尾為 _length)，
    // 避免誤加到其他原生 <select>，例如超商取貨時段選單 (datetime-*)
    waitForElement('select[name$="_length"]', null, (select) => {
      if (!select.querySelector('option[value="1000"]')) {
        const opt = document.createElement('option');
        opt.value = opt.textContent = '1000';
        select.appendChild(opt);
      }
    });
  }

  function initViewlogFixes() {
    if (!window.location.pathname.includes('viewlog.php')) return;

    // 1. 訊息表格：全部已讀 (展開並觸發 API)
    waitForElement('#messagetable_filter', null, (target) => {
      const readBtn = document.createElement('button');
      readBtn.className = 'dt-button';
      readBtn.innerHTML = '<span>全部已讀</span>';
      readBtn.style.marginLeft = '5px';
      readBtn.addEventListener('click', async () => {
        const rows = document.querySelectorAll('#messagetable tbody tr[id]:not(.shown)');
        if (rows.length === 0) return;

        const btnSpan = readBtn.querySelector('span');
        const originalText = btnSpan.textContent;
        btnSpan.textContent = '讀取中...';
        readBtn.disabled = true;

        try {
          for (const row of rows) {
            row.querySelector('td.details-control')?.click();
            await new Promise(r => setTimeout(r, 100));
          }
          new Notify({
            status: 'success', title: '操作完成', text: `已處理 ${rows.length} 筆訊息`,
            autoclose: true, autotimeout: 2000, position: 'x-center'
          });
        } finally {
          btnSpan.textContent = originalText;
          readBtn.disabled = false;
        }
      });
      target.insertAdjacentElement('afterend', readBtn);
    });

    // 2. 其他表格 (如委託單)：展開全部
    const excelSelector = 'button.dt-button[aria-controls="paper-table"]';
    const excelCondition = (el) => el.textContent.includes('下載成EXCEL檔');
    waitForElement(excelSelector, excelCondition, (excelBtn) => {
      const expandBtn = document.createElement('button');
      expandBtn.className = 'dt-button';
      expandBtn.innerHTML = '<span>展開全部</span>';
      expandBtn.style.marginLeft = '5px';
      expandBtn.addEventListener('click', () => {
        document.querySelectorAll('#paper-table td.details-control').forEach(td => {
          if (!td.closest('tr').classList.contains('shown')) td.click();
        });
      });
      excelBtn.insertAdjacentElement('afterend', expandBtn);
    });

    // 3. 帳務查詢 (z=2)：分析交易摘要
    if (window.location.search.includes('z=2')) {
      waitForElement('#money-table_filter', null, (target) => {
        const analyzeBtn = document.createElement('button');
        analyzeBtn.className = 'dt-button';
        analyzeBtn.innerHTML = '<span>分析交易摘要</span>';
        analyzeBtn.style.marginLeft = '5px';
        analyzeBtn.addEventListener('click', analyzeMoneyTransactions);
        target.insertAdjacentElement('afterend', analyzeBtn);
      });
    }
  }

  /**
   * 帳務交易分析邏輯
   */
  function analyzeMoneyTransactions() {
    const table = unsafeWindow.$('#money-table').DataTable();
    const data = table.rows({ search: 'applied' }).data();
    
    const summary = {};
    const itemGroups = {};

    const cleanText = (html) => {
      const div = document.createElement('div');
      div.innerHTML = html;
      return (div.textContent || div.innerText || '').trim();
    };

    data.each((row) => {
      const category = cleanText(row[0]);
      const itemName = cleanText(row[2]);
      const qty = parseInt(cleanText(row[3])) || 0;
      const price = parseFloat(cleanText(row[4])) || 0;
      let total = parseInt(cleanText(row[5])) || 0;

      // 處理特定支出類別的正負號 (確保為負值)
      const outflowCategories = ['支付站內費用', '提款', '超商取貨付款'];
      if (outflowCategories.includes(category) && total > 0) {
        total = -total;
      }

      // 類別統計
      if (!summary[category]) summary[category] = { count: 0, totalAmount: 0 };
      summary[category].count++;
      summary[category].totalAmount += total;

      // 套利分組 (同一品項)
      if (!itemGroups[itemName]) itemGroups[itemName] = { buys: [], sells: [] };
      if (category === '收購付款') {
        itemGroups[itemName].buys.push({ qty, price, total });
      } else if (category === '出售收款') {
        itemGroups[itemName].sells.push({ qty, price, total });
      }
    });

    // 預先計算各類別總金額
    let totalCategoryAmount = 0;
    Object.keys(summary).forEach(cat => {
      totalCategoryAmount += summary[cat].totalAmount;
    });

    // 預先計算套利績效 (先算出各列與總獲利，才能把總和放在最上面)
    let arbitrageFound = false;
    let totalArbitrageProfit = 0;
    let arbitrageRowsHtml = '';
    Object.keys(itemGroups).forEach(item => {
      const group = itemGroups[item];
      if (group.buys.length > 0 && group.sells.length > 0) {
        arbitrageFound = true;
        const totalBuyQty = group.buys.reduce((sum, b) => sum + b.qty, 0);
        const totalBuyAmount = group.buys.reduce((sum, b) => sum + b.total, 0);
        const totalSellQty = group.sells.reduce((sum, s) => sum + s.qty, 0);
        const totalSellAmount = group.sells.reduce((sum, s) => sum + s.total, 0);

        // 套利計算：僅計算 買入與賣出 數量重合的部分
        const matchedQty = Math.min(totalBuyQty, totalSellQty);
        const avgBuyPrice = totalBuyAmount / totalBuyQty;
        const avgSellPrice = totalSellAmount / totalSellQty;
        const profit = Math.round(matchedQty * (avgSellPrice + avgBuyPrice));
        totalArbitrageProfit += profit;

        arbitrageRowsHtml += `<tr>
            <td>${item}</td>
            <td style="text-align:center;">${matchedQty}</td>
            <td style="text-align:right; font-weight:bold;">${profit}</td>
        </tr>`;
      }
    });

    const amountColor = totalCategoryAmount >= 0 ? '#2e7d32' : '#c62828';
    const profitColor = totalArbitrageProfit >= 0 ? '#2e7d32' : '#c62828';

    // 格式化輸出 HTML
    let html = `
      <style>
        .swal-tight-table td, .swal-tight-table th { padding: 4px 8px !important; line-height: 1.2 !important; font-size: 13px; }
        .swal-tight-table h3 { margin: 15px 0 10px 0; }
        .swal-summary-cards { display: flex; gap: 12px; margin-bottom: 18px; }
        .swal-summary-card {
          flex: 1; background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 10px;
          padding: 14px 12px; text-align: center;
        }
        .swal-summary-card .label { font-size: 13px; color: #666; margin-bottom: 6px; }
        .swal-summary-card .value { font-size: 24px; font-weight: bold; line-height: 1.2; }
      </style>
      <div style="text-align: left; font-size: 14px; max-height: 600px; overflow-y: auto; padding: 5px;">
    `;

    // 0. 最上方總和摘要
    html += `
      <div class="swal-summary-cards">
        <div class="swal-summary-card">
          <div class="label">💰 交易總金額</div>
          <div class="value" style="color:${amountColor};">${totalCategoryAmount.toLocaleString()}</div>
        </div>
        <div class="swal-summary-card">
          <div class="label">⚖️ 套利總獲利</div>
          <div class="value" style="color:${profitColor};">${arbitrageFound ? totalArbitrageProfit.toLocaleString() : '—'}</div>
        </div>
      </div>`;

    // 1. 各類別總結
    html += '<h3>📊 交易類別統計</h3>';
    html += '<table id="swal-summary-table" class="display swal-tight-table" style="width:100%; border-collapse: collapse;" border="1">';
    html += '<thead><tr style="background:#f2f2f2;"><th>類別</th><th>筆數</th><th>總金額</th></tr></thead><tbody>';
    Object.keys(summary).sort().forEach(cat => {
      const s = summary[cat];
      html += `<tr><td>${cat}</td><td style="text-align:center;">${s.count}</td><td style="text-align:right;">${s.totalAmount}</td></tr>`;
    });
    html += '</tbody><tfoot><tr style="background:#f2f2f2; font-weight:bold;"><th colspan="2" style="text-align:right;">總計金額：</th><th style="text-align:right;"></th></tr></tfoot></table>';

    // 2. 套利績效
    html += '<h3 style="margin-top:20px;">⚖️ 套利績效分析 (同品項買賣)</h3>';
    if (!arbitrageFound) {
      html += '<p>無符合的買賣套利紀錄</p>';
    } else {
      html += '<table id="swal-arbitrage-table" class="display swal-tight-table" style="width:100%; border-collapse: collapse;" border="1">';
      html += `
      <thead><tr style="background:#f2f2f2;"><th>品項</th><th>套利成交量</th><th>獲利</th></tr></thead>
      <tbody>`;
      html += arbitrageRowsHtml;
      html += '</tbody><tfoot><tr style="background:#f2f2f2; font-weight:bold;"><th colspan="2" style="text-align:right;">總計獲利：</th><th style="text-align:right;"></th></tr></tfoot></table>';
    }

    html += '</div>';

    unsafeWindow.Swal.fire({
      title: '交易分析摘要',
      html: html,
      width: '800px',
      confirmButtonText: '關閉',
      onOpen: () => {
        const $ = unsafeWindow.$;
        $('#swal-summary-table').DataTable({
          paging: false,
          searching: false,
          info: false,
          order: [[2, 'desc']],
          columnDefs: [
            { targets: 0, width: '50%' },
            { targets: 1, width: '20%' },
            {
              targets: 2,
              width: '30%',
              render: (data) => {
                const val = parseInt(data);
                const color = val >= 0 ? 'green' : 'red';
                return `<span style="color:${color}; font-weight:bold;">${val.toLocaleString()}</span>`;
              }
            }
          ],
          footerCallback: function (row, data, start, end, display) {
            const api = this.api();
            const total = api.column(2).data().reduce((a, b) => parseInt(a) + parseInt(b), 0);
            const color = total >= 0 ? 'green' : 'red';

            $(api.column(2).footer()).html(`<span style="color:${color}; font-weight:bold;">${total.toLocaleString()}</span>`);
          }
        });
        if (arbitrageFound) {
          $('#swal-arbitrage-table').DataTable({
            paging: false,
            searching: false,
            info: false,
            order: [[2, 'desc']],
            columnDefs: [
              { targets: 0, width: '50%' },
              { targets: 1, width: '20%' },
              {
                targets: 2,
                width: '30%',
                render: (data) => {
                  const val = parseInt(data);
                  const color = val >= 0 ? 'green' : 'red';
                  return `<span style="color:${color}; font-weight:bold;">${val.toLocaleString()}</span>`;
                }
              }
            ],
            footerCallback: function (row, data, start, end, display) {
              const api = this.api();
              const total = api.column(2).data().reduce((a, b) => parseInt(a) + parseInt(b), 0);
              const color = total >= 0 ? 'green' : 'red';

              $(api.column(2).footer()).html(`<span style="color:${color}; font-weight:bold;">${total.toLocaleString()}</span>`);
            }
          });
        }
      }
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
