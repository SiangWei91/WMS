
let currentPage = 1;
const rowsPerPage = 10;

async function loadProducts() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="products">
            <div class="page-header">
                <h1>Product Management</h1>
                <div class="actions">
                    <div class="search-box">
                        <i class="fas fa-search"></i>
                        <input type="text" id="product-search" placeholder="Search Product...">
                    </div>
                    <button id="add-product-btn" class="btn btn-primary">
                        <i class="fas fa-plus"></i> Add Product
                    </button>
                </div>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Item Code</th>
                            <th>Product Description</th>
                            <th>Packing Size</th>
                            <th>Create Time</th>
                            <th>Action</th>
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

    document.getElementById('add-product-btn').addEventListener('click', loadAddProductForm);
    document.getElementById('product-search').addEventListener('input', handleProductSearch);
    await fetchProducts();
}

async function fetchProducts(searchTerm = '') {
    try {
        const params = {
            page: currentPage,
            limit: rowsPerPage,
            productCode: searchTerm
        };
        
        const response = await fetch(`${API_BASE_URL}/getProducts?${new URLSearchParams(params)}`, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        // 检查响应内容类型
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            throw new Error(`预期JSON响应，但收到: ${text.substring(0, 100)}...`);
        }
        
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.message || '获取产品失败');
        
        renderProductsTable(data.data);
        renderPagination(data.pagination);
    } catch (error) {
        console.error('获取产品列表失败:', error);
        alert('获取产品列表失败: ' + error.message);
    }
}

function renderProductsTable(products) {
    const tbody = document.getElementById('products-table-body');
    tbody.innerHTML = '';

    if (!products || products.length === 0) {
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
            <td>${product.productCode || ''}</td>
            <td>${product.name || ''}</td>
            <td>${product.packaging || ''}</td>
            <td>${product.createdAt ? new Date(product.createdAt).toLocaleString() : ''}</td>
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
            <h1>Add Product</h1>
            <form id="product-form">
                <div class="form-group">
                    <label for="productCode">Item Code*</label>
                    <input type="text" id="productCode" name="productCode" required>
                </div>
                <div class="form-group">
                    <label for="name">Product Description*</label>
                    <input type="text" id="name" name="name" required>
                </div>
                <div class="form-group">
                    <label for="packaging">Packing Size*</label>
                    <input type="text" id="packaging" name="packaging" required 
                           placeholder="Example: 250g x 40p">
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" id="cancel-btn">Cancel</button>
                    <button type="submit" class="btn btn-primary">Save</button>
                </div>
            </form>
        </div>
    `;

    document.getElementById('cancel-btn').addEventListener('click', loadProducts);
    document.getElementById('product-form').addEventListener('submit', handleAddProduct);
}

async function handleAddProduct(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    const productData = {
        productCode: formData.get('productCode'),
        name: formData.get('name'),
        packaging: formData.get('packaging')
    };
    
    try {
        const response = await fetch(`${API_BASE_URL}/addProduct`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // 如果需要认证
                // 'Authorization': 'Bearer ' + getAuthToken()
            },
            body: JSON.stringify(productData)
        });

        // 检查响应内容类型
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('服务器返回非JSON响应:', text);
            throw new Error(`服务器响应异常: ${text.substring(0, 100)}...`);
        }

        const result = await response.json();
        
        if (response.ok) {
            alert('产品添加成功!');
            loadProducts();
        } else {
            throw new Error(result.message || '添加产品失败');
        }
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
