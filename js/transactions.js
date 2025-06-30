// 交易记录逻辑
let transactionsCurrentPage = 1;
const transactionsRowsPerPage = 10;
let currentTransactionFilters = {}; // Store current filters

export async function loadTransactions(contentElement) {
    console.log('[transactions.js] loadTransactions CALLED for the main page setup.'); // Log
    const content = contentElement || document.getElementById('content');
    if (!content) {
        console.error("[transactions.js] Content element not found. Cannot load transactions page."); // Log
        return;
    }
    content.innerHTML = `
        <div class="transactions">
            <div class="page-header">
                <h1>Transaction Record</h1>
                <div class="filters">
                    <div class="filter-group">
                        <label for="transaction-type">Type:</label>
                        <select id="transaction-type">
                            <option value="">All</option>
                            <option value="inbound">Inbound</option>
                            <option value="outbound">Outbound</option>
                            <option value="initial">Initial</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label for="start-date">Start Date:</label>
                        <input type="date" id="start-date">
                    </div>
                    <div class="filter-group">
                        <label for="end-date">End Date:</label>
                        <input type="date" id="end-date">
                    </div>
                    <button id="apply-filters-btn" class="btn btn-primary">Apply Filters</button>
                </div>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Product Code</th>
                            <th>Product Description</th>
                            <th>Warehouse</th>
                            <th>Quantity</th>
                            <th>Operator</th>
                        </tr>
                    </thead>
                    <tbody id="transactions-table-body">
                        <!-- 交易数据将在这里动态加载 -->
                    </tbody>
                </table>
                <div class="pagination" id="transactions-pagination">
                    <!-- 分页控件将在这里动态加载 -->
                </div>
            </div>
        </div>
    `;

    const applyFiltersButton = document.getElementById('apply-filters-btn');
    if (applyFiltersButton) {
        applyFiltersButton.addEventListener('click', () => applyTransactionFilters(true));
    }
    
    currentTransactionFilters = {}; 
    transactionsCurrentPage = 1; 
    await fetchTransactions(); // Initial fetch

    // Re-adding event listener setup
    if (!window.handleDataStoreTransactionsUpdated) {
        window.handleDataStoreTransactionsUpdated = function(event) {
            console.log('[transactions.js] Global event "datastore-transactions-updated" received.', event.detail);
            // Simple check: if the transactions div is on the page, assume it's active.
            if (document.querySelector('.transactions')) {
                 console.log('[transactions.js] Transactions page seems active, calling fetchTransactions().');
                 fetchTransactions();
            } else {
                console.log('[transactions.js] Transactions page does not seem active, not fetching.');
            }
        };
    }
    
    document.removeEventListener('datastore-transactions-updated', window.handleDataStoreTransactionsUpdated);
    document.addEventListener('datastore-transactions-updated', window.handleDataStoreTransactionsUpdated);
    console.log("[transactions.js] Event listener for 'datastore-transactions-updated' (re-)attached.");
}

async function fetchTransactions() {
    console.log('[transactions.js] fetchTransactions START. Current Page:', transactionsCurrentPage, 'Filters:', JSON.stringify(currentTransactionFilters)); // Log
    try {
        const params = {
            currentPage: transactionsCurrentPage, // Corrected: use currentPage
            limit: transactionsRowsPerPage,
            ...currentTransactionFilters
        };
        
        if (!window.transactionAPI || typeof window.transactionAPI.getTransactions !== 'function') {
            console.error("[transactions.js] transactionAPI.getTransactions is not available."); // Log
            throw new Error("transactionAPI.getTransactions is not available.");
        }
        const response = await transactionAPI.getTransactions(params);
        console.log('[transactions.js] Data RECEIVED from transactionAPI.getTransactions:', JSON.parse(JSON.stringify(response))); // Log

        renderTransactionsTable(response.data);
        renderTransactionsPagination(response.pagination);
        console.log('[transactions.js] fetchTransactions END - Table and pagination rendered.'); // Log
    } catch (error) {
        console.error('[transactions.js] 获取交易记录失败 (Error fetching transactions):', error); // Log
        const tbody = document.getElementById('transactions-table-body');
        if(tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">获取交易记录失败: ${error.message}</td></tr>`;
        const paginationDiv = document.getElementById('transactions-pagination');
        if(paginationDiv) paginationDiv.innerHTML = '';
    }
}

function renderTransactionsTable(transactions) {
    const tbody = document.getElementById('transactions-table-body');
    if (!tbody) {
        console.error("[transactions.js] renderTransactionsTable: tbody not found!"); // Log
        return;
    }
    tbody.innerHTML = ''; 

    console.log('[transactions.js] renderTransactionsTable: Received transactions data:', JSON.parse(JSON.stringify(transactions))); // Log

    if (!transactions || transactions.length === 0) {
        console.log('[transactions.js] renderTransactionsTable: No transactions to render. Displaying "没有找到交易记录".'); // Log
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="no-data text-center">没有找到交易记录</td>
            </tr>
        `;
        return;
    }

    console.log(`[transactions.js] renderTransactionsTable: About to render ${transactions.length} transaction rows.`); // Log
    transactions.forEach(tx => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(tx.transactionDate)}</td>
            <td>
                <span class="badge ${getTransactionBadgeClass(tx.type)}">
                    ${getTransactionTypeText(tx.type)}
                </span>
            </td>
            <td>${tx.product_code || '-'}</td>
            <td>${tx.product_name || '-'}</td>
            <td>${tx.warehouse_id || '-'}</td>
            <td class="${(tx.type === 'inbound' || tx.type === 'initial') ? 'text-success' : 'text-danger'}">
                ${(tx.type === 'inbound' || tx.type === 'initial') ? '+' : '-'}${tx.quantity}
            </td>
            <td>${tx.operatorId || '系统'}</td>
        `;
        tbody.appendChild(row);
    });
    console.log('[transactions.js] renderTransactionsTable: Finished rendering rows.'); // Log
}

function renderTransactionsPagination(pagination) {
    const paginationDiv = document.getElementById('transactions-pagination');
    if (!paginationDiv) return;
    paginationDiv.innerHTML = '';

    if (!pagination || typeof pagination.totalPages === 'undefined' || typeof pagination.currentPage === 'undefined') {
        console.warn("[transactions.js] Pagination data is incomplete.", pagination); // Log
        return; 
    }

    const currentPage = pagination.currentPage;
    const totalPages = pagination.totalPages;

    if (totalPages <= 1) return; 

    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn-pagination';
    prevBtn.disabled = currentPage === 1;
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            transactionsCurrentPage = currentPage - 1;
            fetchTransactions(); 
        }
    });
    paginationDiv.appendChild(prevBtn);

    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `btn-pagination ${i === currentPage ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.addEventListener('click', () => {
            transactionsCurrentPage = i;
            fetchTransactions();
        });
        paginationDiv.appendChild(pageBtn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn-pagination';
    nextBtn.disabled = currentPage === totalPages || !pagination.hasNextPage;
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages && pagination.hasNextPage) {
            transactionsCurrentPage = currentPage + 1;
            fetchTransactions();
        }
    });
    paginationDiv.appendChild(nextBtn);
}

function applyTransactionFilters(resetPage = true) {
    const typeInput = document.getElementById('transaction-type');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');

    currentTransactionFilters = {}; 
    if (typeInput && typeInput.value) currentTransactionFilters.type = typeInput.value;
    if (startDateInput && startDateInput.value) currentTransactionFilters.startDate = startDateInput.value;
    if (endDateInput && endDateInput.value) currentTransactionFilters.endDate = endDateInput.value;
    
    if (resetPage) {
        transactionsCurrentPage = 1;
    }
    fetchTransactions();
}

function getTransactionTypeText(type) {
    const types = {
        inbound: 'Inbound',
        outbound: 'Outbound',
        initial: 'Initial'
    };
    return types[type] || type;
}

function getTransactionBadgeClass(type) {
    const classes = {
        inbound: 'badge-success',
        outbound: 'badge-danger',
        initial: 'badge-info'
    };
    return classes[type] || 'badge-secondary';
}

function formatDate(timestamp) {
    if (!timestamp) return '-';
    let date;
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
    } else {
        date = new Date(timestamp); 
    }

    if (isNaN(date.getTime())) { 
        return 'Invalid Date';
    }

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}`;
}
