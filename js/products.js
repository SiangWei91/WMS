// 产品管理逻辑
let currentPage = 1;
const rowsPerPage = 10;

async function loadProducts() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="products">
            <div class="page-header">
                <h1>产品管理</h1>
                <div class="actions">
                    <div class="search-box">
                        <i class="fas fa-search"></i>
                        <input type="text" id="product-search" placeholder="搜索产品...">
                    </div>
                    <button id="add-product-btn" class="btn btn-primary">
                        <i class="fas fa-plus"></i> 添加产品
                    </button>
                </div>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>产品代码</th>
                            <th>产品名称</th>
                            <th>类别</th>
                            <th>单位</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody id="products-table-body">
                        <!-- 产品数据将在这里动态加载 -->
                    </tbody>
                </table>
                <div class="pagination" id="pagination">
                    <!-- 分页控件将在这里动态加载 -->
                </div>
            </div>
        </div>
    `;

    // 添加事件监听器
    document.getElementById('add-product-btn').addEventListener('click', loadAddProductForm);
    document.getElementById('product-search').addEventListener('input', handleProductSearch);

    // 加载产品数据
    await fetchProducts();
}

async function fetchProducts(searchTerm = '') {
    try {
        const params = {
            page: currentPage,
            limit: rowsPerPage,
            productCode: searchTerm
        };
        
        const response = await productAPI.getProducts(params);
        renderProductsTable(response.data);
        renderPagination(response.pagination);
    } catch (error) {
        console.error('获取产品列表失败:', error);
        alert('获取产品列表失败: ' + error.message);
    }
}

function renderProductsTable(products) {
    const tbody = document.getElementById('products-table-body');
    tbody.innerHTML = '';

    if (products.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="no-data">没有找到产品</td>
            </tr>
        `;
        return;
    }

    products.forEach(product => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${product.productCode}</td>
            <td>${product.productName}</td>
            <td>${product.category}</td>
            <td>${product.unit}</td>
            <td class="actions">
                <button class="btn-icon view-btn" data-id="${product.id}">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn-icon edit-btn" data-id="${product.id}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon delete-btn" data-id="${product.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // 添加按钮事件监听器
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => viewProduct(e.target.closest('button').dataset.id));
    });
    
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => editProduct(e.target.closest('button').dataset.id));
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => deleteProduct(e.target.closest('button').dataset.id));
    });
}

function renderPagination(pagination) {
    const paginationDiv = document.getElementById('pagination');
    paginationDiv.innerHTML = '';

    const { page, totalPages } = pagination;

    // 上一页按钮
    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn-pagination';
    prevBtn.disabled = page === 1;
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevBtn.addEventListener('click', () => {
        if (page > 1) {
            currentPage = page - 1;
            fetchProducts();
        }
    });
    paginationDiv.appendChild(prevBtn);

    // 页码按钮
    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `btn-pagination ${i === page ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.addEventListener('click', () => {
            currentPage = i;
            fetchProducts();
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
            currentPage = page + 1;
            fetchProducts();
        }
    });
    paginationDiv.appendChild(nextBtn);
}

function handleProductSearch(e) {
    const searchTerm = e.target.value.trim();
    currentPage = 1;
    fetchProducts(searchTerm);
}

function loadAddProductForm() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="form-container">
            <h1>添加新产品</h1>
            <form id="product-form">
                <div class="form-group">
                    <label for="productCode">产品代码*</label>
                    <input type="text" id="productCode" name="productCode" required>
                </div>
                <div class="form-group">
                    <label for="productName">产品名称*</label>
                    <input type="text" id="productName" name="productName" required>
                </div>
                <div class="form-group">
                    <label for="description">产品描述</label>
                    <textarea id="description" name="description" rows="3"></textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="category">类别*</label>
                        <select id="category" name="category" required>
                            <option value="">请选择...</option>
                            <option value="电子产品">电子产品</option>
                            <option value="办公用品">办公用品</option>
                            <option value="家居用品">家居用品</option>
                            <option value="食品饮料">食品饮料</option>
                            <option value="服装鞋帽">服装鞋帽</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="unit">单位*</label>
                        <select id="unit" name="unit" required>
                            <option value="">请选择...</option>
                            <option value="个">个</option>
                            <option value="件">件</option>
                            <option value="箱">箱</option>
                            <option value="包">包</option>
                            <option value="千克">千克</option>
                            <option value="升">升</option>
                        </select>
                    </div>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" id="cancel-btn">取消</button>
                    <button type="submit" class="btn btn-primary">保存</button>
                </div>
            </form>
        </div>
    `;

    // 添加事件监听器
    document.getElementById('cancel-btn').addEventListener('click', loadProducts);
    document.getElementById('product-form').addEventListener('submit', handleAddProduct);
}

async function handleAddProduct(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    const productData = Object.fromEntries(formData.entries());
    
    // 添加额外字段
    productData.warehouseId = 'WH01';
    productData.initialQuantity = 0;
    productData.minStockLevel = 0;
    productData.maxStockLevel = 1000;
    
    try {
        await productAPI.addProduct(productData);
        alert('产品添加成功!');
        loadProducts();
    } catch (error) {
        console.error('添加产品失败:', error);
        alert('添加产品失败: ' + error.message);
    }
}

function viewProduct(productId) {
    // 实现查看产品详情逻辑
    console.log('查看产品:', productId);
}

function editProduct(productId) {
    // 实现编辑产品逻辑
    console.log('编辑产品:', productId);
}

function deleteProduct(productId) {
    // 实现删除产品逻辑
    if (confirm('确定要删除这个产品吗？')) {
        console.log('删除产品:', productId);
    }
}