let currentPage = 1;
const rowsPerPage = 10; // This might be used for client-side pagination or if Firestore pagination is implemented

async function loadProducts() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="products">
            <div class="page-header">
                <h1>Product List</h1>
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
            page: currentPage, // TODO: Implement actual pagination with Firestore (limit, startAfter)
            limit: rowsPerPage,
            searchTerm: searchTerm // TODO: Implement search with Firestore (e.g., using where clauses if searching by specific fields)
        };
        
        // Now calls the Firestore productAPI from window object
        const response = await window.productAPI.getProducts(params); 
        
        renderProductsTable(response.data);
        renderPagination(response.pagination); // Pagination data from API might be simplified for now
    } catch (error) {
        console.error('获取产品列表失败 (Firestore):', error);
        alert('获取产品列表失败: ' + error.message); // User-friendly message
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
        // Ensure product.id is used for data-id, which comes from Firestore document ID
        // Handle Firestore Timestamps for createdAt
        let createdAtDisplay = 'N/A';
        if (product.createdAt && product.createdAt.toDate) {
            createdAtDisplay = product.createdAt.toDate().toLocaleString();
        } else if (product.createdAt) {
            // Fallback if it's already a string or number (less likely with serverTimestamp)
            createdAtDisplay = new Date(product.createdAt).toLocaleString();
        }

        row.innerHTML = `
            <td>${product.productCode || ''}</td>
            <td>${product.name || ''}</td>
            <td>${product.packaging || ''}</td>
            <td>${createdAtDisplay}</td>
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

    // Re-attach event listeners after rendering table
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

    // Note: Firestore pagination is different. This is a simplified version.
    // Actual Firestore pagination would involve query cursors (startAfter, endBefore).
    // For now, assuming pagination object provides page and totalPages.
    const { page = 1, totalPages = 1 } = pagination || {};

    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn-pagination';
    prevBtn.disabled = page === 1;
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevBtn.addEventListener('click', () => {
        if (page > 1) {
            currentPage = page - 1;
            fetchProducts(document.getElementById('product-search').value.trim());
        }
    });
    paginationDiv.appendChild(prevBtn);

    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `btn-pagination ${i === page ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.addEventListener('click', () => {
            currentPage = i;
            fetchProducts(document.getElementById('product-search').value.trim());
        });
        paginationDiv.appendChild(pageBtn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn-pagination';
    nextBtn.disabled = page === totalPages;
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextBtn.addEventListener('click', () => {
        if (page < totalPages) {
            currentPage = page + 1;
            fetchProducts(document.getElementById('product-search').value.trim());
        }
    });
    paginationDiv.appendChild(nextBtn);
}

function handleProductSearch(e) {
    const searchTerm = e.target.value.trim();
    currentPage = 1; // Reset to first page on new search
    fetchProducts(searchTerm);
}

function loadAddProductForm() {
    const content = document.getElementById('content');
    // This form structure is fine.
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
        // createdAt will be handled by Firestore serverTimestamp in productAPI.addProduct
    };
    
    try {
        // Now calls the Firestore productAPI from window object
        await window.productAPI.addProduct(productData);
        alert('产品添加成功!');
        loadProducts(); // Reload products list
    } catch (error) {
        console.error('添加产品失败 (Firestore):', error);
        alert('添加产品失败: ' + error.message);
    }
}

async function viewProduct(productId) {
    try {
        console.log('查看产品 (Firestore):', productId);
        const product = await window.productAPI.getProductById(productId);
        if (product) {
            let createdAtString = 'N/A';
            if (product.createdAt && product.createdAt.toDate) {
                createdAtString = product.createdAt.toDate().toLocaleString();
            } else if (product.createdAt) {
                createdAtString = new Date(product.createdAt).toLocaleString();
            }
            // Simple alert for now. A modal or dedicated view area would be better.
            alert(`产品详情:\nID: ${product.id}\n代码: ${product.productCode}\n名称: ${product.name}\n包装: ${product.packaging}\n创建时间: ${createdAtString}`);
        } else {
            alert('未找到产品');
        }
    } catch (error) {
        console.error('查看产品失败 (Firestore):', error);
        alert('查看产品失败: ' + error.message);
    }
}

async function editProduct(productId) {
    // This is a simplified version for the subtask.
    // A full implementation would load a form pre-filled with product data.
    try {
        console.log('编辑产品 (Firestore):', productId);
        const product = await window.productAPI.getProductById(productId);
        if (product) {
            console.log('Product data for editing:', product);
            // For now, just an alert. TODO: Implement a form for editing.
            alert(`编辑产品 (详细信息见控制台, ID: ${product.id}). 完整编辑功能需表单.`);
            // Example of what might follow:
            // loadEditProductForm(product); 
            // function loadEditProductForm(product) {
            //   // ... similar to loadAddProductForm, but pre-fill fields
            //   // ... and the submit handler would call window.productAPI.updateProduct()
            // }
        } else {
            alert('未找到要编辑的产品');
        }
    } catch (error) {
        console.error('编辑产品失败 (获取数据) (Firestore):', error);
        alert('编辑产品失败 (获取数据): ' + error.message);
    }
}

async function deleteProduct(productId) {
    if (confirm(`确定要删除这个产品 (ID: ${productId}) 吗？`)) {
        try {
            await window.productAPI.deleteProduct(productId);
            alert('产品删除成功!');
            loadProducts(); // Refresh the products list
        } catch (error) {
            console.error('删除产品失败 (Firestore):', error);
            alert('删除产品失败: ' + error.message);
        }
    }
}
