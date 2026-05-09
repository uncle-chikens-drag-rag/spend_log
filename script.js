let allData = [];
let currentData = [];
let currentFilter = null;
let storeCounts = {};
let monthlyTotal = 0;
let allTotalAbs = 1;
let selectedRows = new Set(); // indices into currentData of selected rows

let sortCol = null;
let sortAsc = true;

const tableBody = document.getElementById('table-body');
const fileInput = document.getElementById('csv-file');
const totalAmountEl = document.getElementById('total-amount');
const rowCountEl = document.getElementById('row-count');
const filterIndicator = document.getElementById('filter-indicator');
const filterNameEl = document.getElementById('filter-name');
const clearFilterBtn = document.getElementById('clear-filter');
const fileNameDisplay = document.getElementById('file-name-display');
const filteredTotalArea = document.getElementById('filtered-total-area');
const filteredAmountEl = document.getElementById('filtered-amount');
const selectionFloat = document.getElementById('selection-float');
const selAmountEl = document.getElementById('sel-amount');
const selCountEl = document.getElementById('sel-count');

// Number formatter for JPY
const formatJPY = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' });

// Input file change event
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Show filename
    fileNameDisplay.textContent = file.name;
    fileNameDisplay.title = file.name;
    fileNameDisplay.classList.remove('hidden');

    const reader = new FileReader();
    reader.onload = function (evt) {
        try {
            const buffer = new Uint8Array(evt.target.result);
            // Detect encoding (Shift_JIS, UTF-8, etc)
            const encoding = Encoding.detect(buffer) || 'UTF8';

            // Convert to Unicode
            const unicodeArray = Encoding.convert(buffer, {
                to: 'UNICODE',
                from: encoding
            });

            // Convert unicode array to string
            const csvString = Encoding.codeToString(unicodeArray);

            // Re-enable placeholder if parsing fails initially, otherwise handle normally
            tableBody.innerHTML = '<tr><td colspan="3" class="px-6 py-12 text-center text-gray-500 text-sm">Loading...</td></tr>';

            Papa.parse(csvString, {
                header: false,
                skipEmptyLines: true,
                complete: function (results) {
                    processData(results.data);
                },
                error: function (err) {
                    alert("Failed to parse CSV: " + err.message);
                    tableBody.innerHTML = '<tr><td colspan="3" class="px-6 py-12 text-center text-red-500 text-sm">Failed to load data.</td></tr>';
                }
            });
        } catch (error) {
            alert("Error reading file: " + error.message);
        }
    };
    reader.readAsArrayBuffer(file);
});

// Clear filter
clearFilterBtn.addEventListener('click', () => {
    currentFilter = null;
    applyStateAndRender();
});

function processData(rawData) {
    // Date pattern: YYYY/MM/DD, YYYY-MM-DD, or YY/MM etc.
    const datePattern = /^\d{2,4}[\/\-]\d{1,2}([\/\-]\d{1,2})?/;

    allData = [];

    rawData.forEach(row => {
        try {
            // 1. Must have at least 3 columns
            if (!row || row.length < 3) return;

            // 2. Column 0 must look like a date — skip headers, name rows, etc.
            const dateStr = row[0] ? row[0].trim() : '';
            if (!datePattern.test(dateStr)) return;

            // 3. Store name from column 1
            const storeStr = row[1] ? row[1].trim() : 'Unknown';

            // 4. Find amount: scan all columns for the largest parseable integer
            //    (ignoring commas), fallback to col 2
            let amount = NaN;
            let maxVal = NaN;
            for (let i = 2; i < row.length; i++) {
                const raw = row[i] ? row[i].trim().replace(/,/g, '') : '';
                if (raw === '') continue;
                const parsed = parseFloat(raw);
                if (!isNaN(parsed)) {
                    if (isNaN(maxVal) || Math.abs(parsed) > Math.abs(maxVal)) {
                        maxVal = parsed;
                    }
                }
            }
            amount = isNaN(maxVal) ? 0 : Math.round(maxVal);

            // 5. Notes: last column, skip if it's a number, date-like, or empty
            const lastCell = row[row.length - 1] ? row[row.length - 1].trim() : '';
            const isDateLike = datePattern.test(lastCell);
            const isNumericLike = lastCell !== '' && !isNaN(parseFloat(lastCell.replace(/,/g, '')));
            const notes = (lastCell === '' || isDateLike || isNumericLike) ? '' : lastCell;

            // 6. Parse date for sorting
            const dateVal = new Date(dateStr.replace(/\//g, '-')).getTime() || 0;

            allData.push({
                dateStr,
                dateVal,
                store: storeStr,
                amount,
                notes
            });
        } catch (e) {
            // Skip malformed rows silently
        }
    });

    // Build store visit count map (from ALL data, before any filter)
    storeCounts = {};
    allData.forEach(item => {
        storeCounts[item.store] = (storeCounts[item.store] || 0) + 1;
    });

    // Save fixed monthly total and bar baseline from ALL rows
    monthlyTotal = allData.reduce((s, d) => s + d.amount, 0);
    allTotalAbs = allData.reduce((s, d) => s + Math.abs(d.amount), 0) || 1;

    // Update fixed Monthly Total display
    totalAmountEl.textContent = formatJPY.format(monthlyTotal);
    totalAmountEl.style.color = monthlyTotal < 0 ? '#ea4335' : '#202124';

    // Reset selection
    selectedRows.clear();
    updateSelectionCounter();

    // Reset states
    currentFilter = null;
    sortCol = null;
    sortAsc = true;

    applyStateAndRender();
}

function sortData(col) {
    if (sortCol === col) {
        sortAsc = !sortAsc;
    } else {
        sortCol = col;
        sortAsc = true;
    }
    applyStateAndRender();
}

function filterByStore(storeName) {
    if (currentFilter === storeName) return; // already filtered
    currentFilter = storeName;
    applyStateAndRender();
}

function applyStateAndRender() {
    // Filter
    if (currentFilter) {
        currentData = allData.filter(item => item.store === currentFilter);
        filterIndicator.classList.remove('hidden');
        filterNameEl.textContent = currentFilter;
    } else {
        currentData = [...allData];
        filterIndicator.classList.add('hidden');
    }

    // Sort
    if (sortCol) {
        currentData.sort((a, b) => {
            let valA, valB;
            if (sortCol === 'date') {
                valA = a.dateVal;
                valB = b.dateVal;
            } else if (sortCol === 'store') {
                valA = a.store.toLowerCase();
                valB = b.store.toLowerCase();
            } else if (sortCol === 'amount') {
                valA = a.amount;
                valB = b.amount;
            }

            if (valA < valB) return sortAsc ? -1 : 1;
            if (valA > valB) return sortAsc ? 1 : -1;
            return 0;
        });
    }

    // Update Sort Icons
    ['date', 'store', 'amount'].forEach(col => {
        const iconId = `sort-icon-${col}`;
        const el = document.getElementById(iconId);
        if (el) {
            if (sortCol === col) {
                el.textContent = sortAsc ? '▲' : '▼';
            } else {
                el.textContent = '';
            }
        }
    });

    renderTable();
}

function renderTable() {
    tableBody.innerHTML = '';

    let total = 0;

    if (currentData.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="px-6 py-16 text-center text-gray-400 text-sm">
                    <div class="flex flex-col items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8 opacity-50">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        No matching data found.
                    </div>
                </td>
            </tr>
        `;
    } else {
        const fragment = document.createDocumentFragment();

        // Use allData total abs for bar scaling (always shows proportion vs full month)
        const totalAbsAmount = allTotalAbs;

        // Clear selection when re-rendering (sort/filter changes row indices)
        selectedRows.clear();
        updateSelectionCounter();

        currentData.forEach((item, index) => {
            total += item.amount;

            const tr = document.createElement('tr');
            tr.className = 'table-row-hover transition-colors cursor-pointer';
            tr.dataset.idx = index;

            // Row click: toggle selection (skip if click came from store cell)
            tr.addEventListener('click', (e) => {
                if (e.target.closest('[data-store-click]')) return;
                const idx = parseInt(tr.dataset.idx);
                if (selectedRows.has(idx)) {
                    selectedRows.delete(idx);
                    tr.style.backgroundColor = '';
                    tr.style.boxShadow = '';
                } else {
                    selectedRows.add(idx);
                    tr.style.backgroundColor = '#eff6ff';
                    tr.style.boxShadow = 'inset 3px 0 0 #1a73e8';
                }
                updateSelectionCounter();
            });

            // Amount color formatting (Google Red for negatives)
            const isNegative = item.amount < 0;
            const amountColor = isNegative ? '#ea4335' : '#202124';
            const formattedAmount = formatJPY.format(item.amount);

            // Visit count badge (only shown when 2 or more visits)
            const visitCount = storeCounts[item.store] || 0;
            const badgeHTML = visitCount >= 2
                ? `<span class="flex-shrink-0 bg-gray-500 text-white text-[9px] sm:text-[10px] leading-none px-1.5 sm:px-2 py-0.5 rounded-full ml-1 sm:ml-1.5 font-semibold whitespace-nowrap">${visitCount}</span>`
                : '';

            // Day of week & Format Date (MM/DD)
            const DAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];
            const dateObj = new Date(item.dateStr.replace(/\//g, '-'));
            let dayLabel = '';
            let dayColor = '#6b7280'; // weekday = muted gray
            let displayDate = item.dateStr;
            if (!isNaN(dateObj.getTime())) {
                const m = (dateObj.getMonth() + 1).toString().padStart(2, '0');
                const d = dateObj.getDate().toString().padStart(2, '0');
                displayDate = `${m}/${d}`;

                const dow = dateObj.getDay(); // 0=Sun, 6=Sat
                dayLabel = DAYS_JA[dow];
                if (dow === 6) dayColor = '#3b82f6';   // Sat = blue-500
                else if (dow === 0) dayColor = '#f472b6'; // Sun = pink-400
            }
            const dayHTML = dayLabel
                ? `<span class="text-[9px] sm:text-[0.7rem] ml-0.5 sm:ml-1 font-medium" style="color:${dayColor};">(${dayLabel})</span>`
                : '';

            // Notes cell HTML (empty = blank)
            const notesHTML = item.notes
                ? `<span class="text-gray-600 text-[10px] sm:text-xs" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px">${escapeHTML(item.notes)}</span>`
                : '';

            // Impact bar: share of total spend (capped at 100%)
            const barPct = Math.min(Math.round((Math.abs(item.amount) / totalAbsAmount) * 100), 100);
            const barColor = isNegative ? 'rgba(234,67,53,0.08)' : 'rgba(26,115,232,0.08)';
            const barHTML = `<div style="position:absolute;top:0;right:0;bottom:0;width:${barPct}%;background:${barColor};pointer-events:none;"></div>`;

            tr.innerHTML = `
                <td class="px-2 py-2.5 sm:px-5 sm:py-3.5 text-gray-500 text-[10px] sm:text-xs tracking-wide" style="font-feature-settings: 'tnum';white-space:nowrap;">${escapeHTML(displayDate)}${dayHTML}</td>
                <td class="px-2 py-2.5 sm:px-5 sm:py-3.5 cursor-pointer transition-colors" data-store-click="1" style="overflow:hidden" title="Filter by ${escapeHTML(item.store)}" onclick="filterByStore('${escapeHTML(item.store)}')">
                    <span style="display:inline-flex;align-items:center;max-width:100%;overflow:hidden;">
                        <span class="font-medium text-xs sm:text-sm text-gray-800 hover:text-google-blue transition-colors" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(item.store)}</span>${badgeHTML}
                    </span>
                </td>
                <td class="px-2 py-2.5 sm:px-5 sm:py-3.5" style="overflow:hidden">${notesHTML}</td>
                <td class="px-2 py-2.5 sm:px-5 sm:py-3.5 text-right font-medium text-sm sm:text-base tracking-tight" style="position:relative;font-feature-settings: 'tnum'; color:${amountColor}">
                    ${barHTML}
                    <span style="position:relative;z-index:1;">${formattedAmount}</span>
                </td>
            `;
            fragment.appendChild(tr);
        });

        tableBody.appendChild(fragment);
    }

    // Update row count
    rowCountEl.textContent = currentData.length;

    // Update Filtered Total (show only when filter is active)
    if (currentFilter) {
        const filteredSum = currentData.reduce((s, d) => s + d.amount, 0);
        filteredAmountEl.textContent = formatJPY.format(filteredSum);
        filteredAmountEl.style.color = filteredSum < 0 ? '#ea4335' : '#f9ab00';

        // Progress bar: filtered / monthly total ratio (capped 0-100)
        const sharePct = monthlyTotal !== 0
            ? Math.min(Math.max(Math.round((Math.abs(filteredSum) / Math.abs(monthlyTotal)) * 100), 0), 100)
            : 0;
        const shareBar = document.getElementById('filter-share-bar');
        const sharePctEl = document.getElementById('filter-share-pct');
        // Defer width update by 1 frame so CSS transition fires after display
        requestAnimationFrame(() => {
            shareBar.style.width = sharePct + '%';
            shareBar.style.background = filteredSum < 0 ? '#ea4335' : '#f9ab00';
        });
        sharePctEl.textContent = sharePct + '%';
        sharePctEl.style.color = filteredSum < 0 ? '#ea4335' : '#f9ab00';

        filteredTotalArea.classList.remove('hidden');
    } else {
        // Reset bar to 0 instantly when filter cleared
        const shareBar = document.getElementById('filter-share-bar');
        shareBar.style.width = '0%';
        filteredTotalArea.classList.add('hidden');
    }
}

function updateSelectionCounter() {
    if (selectedRows.size === 0) {
        selectionFloat.classList.add('hidden');
        return;
    }
    let selTotal = 0;
    selectedRows.forEach(idx => {
        if (currentData[idx]) selTotal += currentData[idx].amount;
    });
    selAmountEl.textContent = formatJPY.format(selTotal);
    selAmountEl.style.color = selTotal < 0 ? '#ea4335' : '#202124';
    selCountEl.textContent = selectedRows.size + ' item' + (selectedRows.size !== 1 ? 's' : '');
    selectionFloat.classList.remove('hidden');
}

function clearSelection() {
    selectedRows.clear();
    // Remove visual selection from all rows
    tableBody.querySelectorAll('tr[data-idx]').forEach(tr => {
        tr.style.backgroundColor = '';
        tr.style.boxShadow = '';
    });
    updateSelectionCounter();
}

function escapeHTML(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
