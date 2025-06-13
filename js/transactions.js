// 交易记录逻辑
let transactionsCurrentPage = 1;
const transactionsRowsPerPage = 10;

async function loadTransactions() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="transactions">
            <div class="page-header">
                <h1>交易记录</h1>
                <div class="filters">
                    <div class="filter-group">
                        <label for="transaction-type">类型:</label>
                        <select id="transaction-type">
                            <option value="">全部</option>
                            <option value="inbound">入库</option>
                            <option value="outbound">出库</option>
                            <option value="initial">初始</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label for="start-date">开始日期:</label>
                        <input type="date" id="start-date">
                    </div>
                    <div class="filter-group">
                        <label for="end-date">结束日期:</label>
                        <input type="date" id="end-date">
                    </div>
                    <button id="apply-filters" class="btn btn-primary">应用筛选</button>
                </div>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>日期</th>
                            <th>类型</th>
                            <th>产品代码</th>
                            <th>产品名称</th>
                            <th>仓库</th>
                            <th>数量</th>
                            <th>操作员</th>
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
            <td>${formatDate(tx.date)}</td>
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
        inbound: '入库',
        outbound: '出库',
        initial: '初始'
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
    return date.toLocaleString();
}