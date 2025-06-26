// 交易记录逻辑
let transactionsCurrentPage = 1;
const transactionsRowsPerPage = 10;
let currentTransactionFilters = {}; // Store current filters

async function loadTransactions() {
    const content = document.getElementById('content');
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

    // 添加事件监听器
    const applyFiltersButton = document.getElementById('apply-filters-btn');
    if (applyFiltersButton) {
        applyFiltersButton.addEventListener('click', () => applyTransactionFilters(true));
    }
    
    // Load initial data with no filters
    currentTransactionFilters = {}; // Reset filters
    transactionsCurrentPage = 1; // Reset page
    await fetchTransactions();
}

async function fetchTransactions() {
    try {
        const params = {
            page: transactionsCurrentPage,
            limit: transactionsRowsPerPage,
            ...currentTransactionFilters // Use stored filters
        };
        
        if (!window.transactionAPI || typeof window.transactionAPI.getTransactions !== 'function') {
            throw new Error("transactionAPI.getTransactions is not available.");
        }
        const response = await transactionAPI.getTransactions(params);
        renderTransactionsTable(response.data);
        renderTransactionsPagination(response.pagination);
    } catch (error) {
        console.error('获取交易记录失败:', error);
        const tbody = document.getElementById('transactions-table-body');
        if(tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">获取交易记录失败: ${error.message}</td></tr>`;
        const paginationDiv = document.getElementById('transactions-pagination');
        if(paginationDiv) paginationDiv.innerHTML = ''; // Clear pagination on error
    }
}

function renderTransactionsTable(transactions) {
    const tbody = document.getElementById('transactions-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="no-data text-center">没有找到交易记录</td>
            </tr>
        `;
        return;
    }

    transactions.forEach(tx => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(tx.transactionDate)}</td>
            <td>
                <span class="badge ${getTransactionBadgeClass(tx.type)}">
                    ${getTransactionTypeText(tx.type)}
                </span>
            </td>
            <td>${tx.productCode || '-'}</td>
            <td>${tx.productName || '-'}</td>
            <td>${tx.warehouseId || '-'}</td>
            <td class="${(tx.type === 'inbound' || tx.type === 'initial') ? 'text-success' : 'text-danger'}">
                ${(tx.type === 'inbound' || tx.type === 'initial') ? '+' : '-'}${tx.quantity}
            </td>
            <td>${tx.operatorId || '系统'}</td>
        `;
        tbody.appendChild(row);
    });
}

function renderTransactionsPagination(pagination) {
    const paginationDiv = document.getElementById('transactions-pagination');
    if (!paginationDiv) return;
    paginationDiv.innerHTML = '';

    // Ensure pagination and pagination.totalPages are defined
    if (!pagination || typeof pagination.totalPages === 'undefined' || typeof pagination.currentPage === 'undefined') {
        console.warn("Pagination data is incomplete.", pagination);
        return; 
    }

    const currentPage = pagination.currentPage;
    const totalPages = pagination.totalPages;

    if (totalPages <= 1) return; // No pagination needed for single page or no results

    // 上一页按钮
    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn-pagination';
    prevBtn.disabled = currentPage === 1;
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            transactionsCurrentPage = currentPage - 1;
            fetchTransactions(); // Filters are already stored in currentTransactionFilters
        }
    });
    paginationDiv.appendChild(prevBtn);

    // 页码按钮 (simplified for brevity, could add more complex logic for many pages)
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

    // 下一页按钮
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

    currentTransactionFilters = {}; // Reset before applying new ones
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
    // Check if timestamp is a Firestore Timestamp object or an ISO string/number
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
    } else {
        date = new Date(timestamp); // Handles ISO strings and numbers
    }

    if (isNaN(date.getTime())) { // Check if date is valid
        return 'Invalid Date';
    }

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}`;
}
