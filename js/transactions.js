// 交易记录逻辑
let transactionsCurrentPage = 1;
const transactionsRowsPerPage = 10;

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
                    <button id="apply-filters" class="btn btn-primary">Apply Filters</button>
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
    document.getElementById('apply-filters').addEventListener('click', applyTransactionFilters);

    // 加载交易数据
    await fetchTransactions();
}

async function fetchTransactions(filters = {}) {
    try {
        const params = {
            page: transactionsCurrentPage,
            limit: transactionsRowsPerPage,
            ...filters
        };
        
        const response = await transactionAPI.getTransactions(params);
        renderTransactionsTable(response.data);
        renderTransactionsPagination(response.pagination);
    } catch (error) {
        console.error('获取交易记录失败:', error);
        alert('获取交易记录失败: ' + error.message);
    }
}

function renderTransactionsTable(transactions) {
    const tbody = document.getElementById('transactions-table-body');
    tbody.innerHTML = '';

    if (transactions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="no-data">没有找到交易记录</td>
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
            <td>${tx.productCode}</td>
            <td>${tx.productName || '-'}</td>
            <td>${tx.warehouseId}</td>
            <td class="${tx.type === 'inbound' ? 'text-success' : 'text-danger'}">
                ${tx.type === 'inbound' ? '+' : '-'}${tx.quantity}
            </td>
            <td>${tx.operatorId || '系统'}</td>
        `;
        tbody.appendChild(row);
    });
}

function renderTransactionsPagination(pagination) {
    const paginationDiv = document.getElementById('transactions-pagination');
    paginationDiv.innerHTML = '';

    const { page, totalPages } = pagination;

    // 上一页按钮
    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn-pagination';
    prevBtn.disabled = page === 1;
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevBtn.addEventListener('click', () => {
        if (page > 1) {
            transactionsCurrentPage = page - 1;
            fetchTransactions();
        }
    });
    paginationDiv.appendChild(prevBtn);

    // 页码按钮
    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `btn-pagination ${i === page ? 'active' : ''}`;
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
    nextBtn.disabled = page === totalPages;
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextBtn.addEventListener('click', () => {
        if (page < totalPages) {
            transactionsCurrentPage = page + 1;
            fetchTransactions();
        }
    });
    paginationDiv.appendChild(nextBtn);
}

function applyTransactionFilters() {
    const type = document.getElementById('transaction-type').value;
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    
    const filters = {};
    if (type) filters.type = type;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    
    transactionsCurrentPage = 1;
    fetchTransactions(filters);
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
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}`;
}
