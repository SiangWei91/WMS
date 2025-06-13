// 库存管理逻辑
let inventoryCurrentPage = 1;
const inventoryRowsPerPage = 10;

async function loadInventory() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="inventory">
            <div class="page-header">
                <h1>库存管理</h1>
                <div class="search-box">
                    <i class="fas fa-search"></i>
                    <input type="text" id="inventory-search" placeholder="搜索库存...">
                </div>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>产品代码</th>
                            <th>产品名称</th>
                            <th>仓库</th>
                            <th>批次号</th>
                            <th>库存数量</th>
                            <th>最后更新</th>
                        </tr>
                    </thead>
                    <tbody id="inventory-table-body">
                        <!-- 库存数据将在这里动态加载 -->
                    </tbody>
                </table>
                <div class="pagination" id="inventory-pagination">
                    <!-- 分页控件将在这里动态加载 -->
                </div>
            </div>
        </div>
    `;

    // 添加事件监听器
    document.getElementById('inventory-search').addEventListener('input', handleInventorySearch);

    // 加载库存数据
    await fetchInventory();
}

async function fetchInventory(searchTerm = '') {
    try {
        const params = {
            page: inventoryCurrentPage,
            limit: inventoryRowsPerPage,
            productCode: searchTerm
        };
        
        const response = await inventoryAPI.getInventory(params);
        renderInventoryTable(response.data);
        renderInventoryPagination(response.pagination);
    } catch (error) {
        console.error('获取库存列表失败:', error);
        alert('获取库存列表失败: ' + error.message);
    }
}

function renderInventoryTable(inventoryItems) {
    const tbody = document.getElementById('inventory-table-body');
    tbody.innerHTML = '';

    if (inventoryItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="no-data">没有找到库存记录</td>
            </tr>
        `;
        return;
    }

    inventoryItems.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.productCode}</td>
            <td>${item.productName || '-'}</td>
            <td>${item.warehouseId}</td>
            <td>${item.batchNo || '-'}</td>
            <td class="${item.quantity < 10 ? 'low-stock' : ''}">${item.quantity}</td>
            <td>${formatDate(item.lastUpdated)}</td>
        `;
        tbody.appendChild(row);
    });
}

function renderInventoryPagination(pagination) {
    const paginationDiv = document.getElementById('inventory-pagination');
    paginationDiv.innerHTML = '';

    const { page, totalPages } = pagination;

    // 上一页按钮
    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn-pagination';
    prevBtn.disabled = page === 1;
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevBtn.addEventListener('click', () => {
        if (page > 1) {
            inventoryCurrentPage = page - 1;
            fetchInventory();
        }
    });
    paginationDiv.appendChild(prevBtn);

    // 页码按钮
    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `btn-pagination ${i === page ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.addEventListener('click', () => {
            inventoryCurrentPage = i;
            fetchInventory();
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
            inventoryCurrentPage = page + 1;
            fetchInventory();
        }
    });
    paginationDiv.appendChild(nextBtn);
}

function handleInventorySearch(e) {
    const searchTerm = e.target.value.trim();
    inventoryCurrentPage = 1;
    fetchInventory(searchTerm);
}

function formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp.seconds * 1000);
    return date.toLocaleString();
}