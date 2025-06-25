// State variables for pagination
let productFetchController = null; // To abort previous fetches
let currentProductSearchTerm = '';
const PRODUCTS_PER_PAGE = 10; 

// New pagination state variables for client-side pagination
let currentPageNum = 1; 
let totalNumPages = 1;
let totalNumItems = 0;
let globalHasNextPage = false; // This will now be set from api response.pagination.hasNextPage

async function loadProducts() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="products">
            <div class="page-header">
                <h1>Product List</h1>
                <div class="actions">
                    <div class="search-box">
                        <i class="fas fa-search"></i>
                        <input type="text" id="product-search" placeholder="Search Product..." value="${escapeHtml(currentProductSearchTerm)}">
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
                        <!-- Product data will be dynamically loaded here -->
                    </tbody>
                </table>
                <div class="pagination" id="pagination">
                    <!-- Pagination controls will be dynamically loaded here -->
                </div>
            </div>
        </div>
    `;

    document.getElementById('add-product-btn').addEventListener('click', loadAddProductForm);
    document.getElementById('product-search').addEventListener('input', handleProductSearch);
    
    // Initial fetch - fetch page 1
    currentPageNum = 1; // Ensure we start at page 1
    await fetchProducts({
        searchTerm: currentProductSearchTerm,
        limit: PRODUCTS_PER_PAGE,
        page: currentPageNum 
    });
}

// Updated to accept 'page' instead of 'startAfterDoc' and 'isPrev'
async function fetchProducts({ searchTerm = '', limit = PRODUCTS_PER_PAGE, page = 1 } = {}) {
    const tbody = document.getElementById('products-table-body');
    tbody.innerHTML = `<tr><td colspan="5" class="text-center">Loading products...</td></tr>`;

    if (productFetchController) {
        productFetchController.abort();
    }
    productFetchController = new AbortController();
    const signal = productFetchController.signal;

    try {
        const params = {
            searchTerm: searchTerm,
            limit: limit,
            page: page 
        };
        
        // API now returns { data: [], pagination: { currentPage, totalPages, hasNextPage, ... } }
        const response = await window.productAPI.getProducts(params); 
        
        if (signal.aborted) {
            console.log("Product fetch aborted");
            return;
        }

        renderProductsTable(response.data);
        
        // Update pagination state from the response
        currentPageNum = response.pagination.currentPage;
        totalNumPages = response.pagination.totalPages;
        totalNumItems = response.pagination.totalItems;
        globalHasNextPage = response.pagination.hasNextPage; // Use hasNextPage from API

        renderPagination(); 

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Fetch aborted by user.');
        } else {
            console.error('Failed to fetch product list:', error);
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error loading products: ${error.message}</td></tr>`;
            // Potentially clear pagination display on error too, or show an error state there
            document.getElementById('pagination').innerHTML = '<p class="text-danger text-center">Pagination unavailable.</p>';
        }
    } finally {
        productFetchController = null; 
    }
}

function renderProductsTable(products) {
    const tbody = document.getElementById('products-table-body');
    tbody.innerHTML = '';

    if (!products || products.length === 0) {
        const searchTerm = document.getElementById('product-search').value.trim();
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="no-data text-center">
                    No products found${searchTerm ? ` for "${escapeHtml(searchTerm)}"` : ''}.
                </td>
            </tr>
        `;
        return;
    }

    products.forEach(product => {
        const row = document.createElement('tr');
        let createdAtDisplay = 'N/A';
        // Ensure createdAt is handled correctly, might not be a Firestore Timestamp anymore in cache
        if (product.createdAt) {
            if (product.createdAt.seconds) { // Likely a Firestore Timestamp object from cache
                 createdAtDisplay = new Date(product.createdAt.seconds * 1000).toLocaleString();
            } else if (typeof product.createdAt === 'string' || typeof product.createdAt === 'number') {
                 createdAtDisplay = new Date(product.createdAt).toLocaleString(); // Already converted or just a date string/number
            } else if (product.createdAt.toDate) { // Should have been converted by API, but as fallback
                 createdAtDisplay = product.createdAt.toDate().toLocaleString();
            }
        }


        let productDescription = escapeHtml(product.name || '');
        if (product['Chinese Name']) {
            productDescription += ` ${escapeHtml(product['Chinese Name'])}`;
        }

        row.innerHTML = `
            <td>${escapeHtml(product.productCode || '')}</td>
            <td>${productDescription}</td>
            <td>${escapeHtml(product.packaging || '')}</td>
            <td>${escapeHtml(createdAtDisplay)}</td>
            <td class="actions">
                <button class="btn-icon view-btn" data-id="${escapeHtml(product.id)}">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn-icon edit-btn" data-id="${escapeHtml(product.id)}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon delete-btn" data-id="${escapeHtml(product.id)}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

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

// Updated to use currentPageNum and totalNumPages
function renderPagination() {
    const paginationDiv = document.getElementById('pagination');
    paginationDiv.innerHTML = ''; // Clear previous buttons

    if (totalNumItems === 0 && !currentProductSearchTerm) { // Only show if no items and not searching
        // No pagination needed if no items and not a search result
        return;
    }
    if (totalNumPages <= 1 && currentProductSearchTerm && totalNumItems <= PRODUCTS_PER_PAGE) {
        // No pagination needed if only one page of search results
        return;
    }


    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn-pagination';
    prevBtn.disabled = currentPageNum <= 1;
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i> Previous';
    prevBtn.addEventListener('click', () => {
        if (currentPageNum > 1) {
            fetchProducts({ 
                searchTerm: currentProductSearchTerm, 
                limit: PRODUCTS_PER_PAGE, 
                page: currentPageNum - 1
            });
        }
    });
    paginationDiv.appendChild(prevBtn);

    // Display Page X of Y
    const pageInfo = document.createElement('span');
    pageInfo.className = 'page-info';
    pageInfo.textContent = `Page ${currentPageNum} of ${totalNumPages} (${totalNumItems} items)`;
    paginationDiv.appendChild(pageInfo);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn-pagination';
    nextBtn.disabled = !globalHasNextPage; // Use globalHasNextPage set from API response
    nextBtn.innerHTML = 'Next <i class="fas fa-chevron-right"></i>';
    nextBtn.addEventListener('click', () => {
        if (globalHasNextPage) {
            fetchProducts({ 
                searchTerm: currentProductSearchTerm, 
                limit: PRODUCTS_PER_PAGE, 
                page: currentPageNum + 1
            });
        }
    });
    paginationDiv.appendChild(nextBtn);
}

function handleProductSearch(e) {
    currentProductSearchTerm = e.target.value.trim();
    currentPageNum = 1; // Reset to first page for new search
    // No need to reset other pagination vars like totalPages, they will be updated by fetchProducts
    fetchProducts({ 
        searchTerm: currentProductSearchTerm, 
        limit: PRODUCTS_PER_PAGE, 
        page: currentPageNum 
    });
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

    document.getElementById('cancel-btn').addEventListener('click', () => {
        currentProductSearchTerm = ''; 
        currentPageNum = 1; // Reset to page 1
        loadProducts(); // This will call fetchProducts with page 1
    });
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
        await window.productAPI.addProduct(productData); // This will invalidate cache in api.js
        alert('产品添加成功!');
        currentProductSearchTerm = ''; 
        currentPageNum = 1; // Reset to page 1
        // No need to directly manipulate cache here, api.js handles invalidation
        loadProducts(); // This will trigger a fresh fetch (if cache was invalidated) for page 1
    } catch (error) {
        console.error('添加产品失败 (Firestore):', error);
        alert('添加产品失败: ' + error.message);
    }
}

async function viewProduct(productId) {
    try {
        // console.log('Viewing product (Firestore):', productId); // Commenting out as it's not from Firestore directly anymore
        // Potentially, this could try to get from cache first if we implement getProductById in cache
        const product = await window.productAPI.getProductById(productId); // Assumes getProductById still hits Firestore
        if (product) {
            let createdAtString = 'N/A';
            if (product.createdAt) {
                 if (product.createdAt.seconds) { 
                    createdAtString = new Date(product.createdAt.seconds * 1000).toLocaleString();
                } else if (typeof product.createdAt === 'string' || typeof product.createdAt === 'number') {
                    createdAtString = new Date(product.createdAt).toLocaleString();
                } else if (product.createdAt.toDate) {
                    createdAtString = product.createdAt.toDate().toLocaleString();
                }
            }
            const chineseNameDisplay = product['Chinese Name'] ? `\nChinese Name: ${escapeHtml(product['Chinese Name'])}` : '';
            alert(`Product Details:\nID: ${escapeHtml(product.id)}\nCode: ${escapeHtml(product.productCode)}\nName: ${escapeHtml(product.name)}${chineseNameDisplay}\nPackaging: ${escapeHtml(product.packaging)}\nCreated At: ${escapeHtml(createdAtString)}`);
        } else {
            alert('Product not found.');
        }
    } catch (error) {
        console.error('Failed to view product:', error);
        alert('Failed to view product: ' + error.message);
    }
}

async function editProduct(productId) {
    try {
        // console.log('Editing product (Firestore):', productId);
        const product = await window.productAPI.getProductById(productId); // Assumes getProductById still hits Firestore
        if (product) {
            // console.log('Product data for editing:', product);
            const content = document.getElementById('content');
            content.innerHTML = `
                <div class="form-container">
                    <h1>Edit Product</h1>
                    <form id="edit-product-form" data-product-id="${escapeHtml(product.id)}">
                        <div class="form-group">
                            <label for="edit-productCode">Item Code*</label>
                            <input type="text" id="edit-productCode" name="productCode" value="${escapeHtml(product.productCode || '')}" required>
                        </div>
                        <div class="form-group">
                            <label for="edit-name">Product Description*</label>
                            <input type="text" id="edit-name" name="name" value="${escapeHtml(product.name || '')}" required>
                        </div>
                        <div class="form-group">
                            <label for="edit-chineseName">Chinese Name</label>
                            <input type="text" id="edit-chineseName" name="chineseName" value="${escapeHtml(product['Chinese Name'] || '')}">
                        </div>
                        <div class="form-group">
                            <label for="edit-packaging">Packing Size*</label>
                            <input type="text" id="edit-packaging" name="packaging" value="${escapeHtml(product.packaging || '')}" required 
                                   placeholder="Example: 250g x 40p">
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" id="cancel-edit-product-btn">Cancel</button>
                            <button type="submit" class="btn btn-primary">Save Changes</button>
                        </div>
                    </form>
                </div>
            `;

            document.getElementById('cancel-edit-product-btn').addEventListener('click', () => {
                currentPageNum = 1; // Reset to page 1 before loading products
                loadProducts(); 
            });
            document.getElementById('edit-product-form').addEventListener('submit', handleUpdateProduct);

        } else {
            alert('Product not found for editing.');
            currentPageNum = 1;
            loadProducts(); 
        }
    } catch (error) {
        console.error('Failed to fetch product for editing:', error);
        alert('Failed to fetch product for editing: ' + error.message);
    }
}

async function deleteProduct(productId) {
    if (confirm(`Are you sure you want to delete this product (ID: ${escapeHtml(productId)})?`)) {
        try {
            await window.productAPI.deleteProduct(productId); // This will invalidate cache in api.js
            alert('Product deleted successfully!');
            // No need to change currentPageNum here, try to stay on the same page.
            // If it was the last item on a page, the re-fetch might result in an empty page,
            // or totalPages might decrease. renderPagination will handle the display.
            // If currentPageNum > totalNumPages after delete and re-fetch, fetchProducts
            // should ideally handle this by clamping page to totalNumPages (or API does).
            // For now, just re-fetch current page. API should return correct totalPages.
            loadProducts(); // Re-fetch with current page and search term. 
                           // If cache was invalidated, it'll get fresh data.
        } catch (error) {
            console.error('Failed to delete product:', error);
            alert('Failed to delete product: ' + error.message);
        }
    }
}

async function handleUpdateProduct(e) {
    e.preventDefault();
    const form = e.target;
    const productId = form.dataset.productId;
    const formData = new FormData(form);

    const updatedProductData = {
        productCode: formData.get('productCode'),
        name: formData.get('name'),
        'Chinese Name': formData.get('chineseName'), 
        packaging: formData.get('packaging')
    };

    if (!updatedProductData.productCode || !updatedProductData.name || !updatedProductData.packaging) {
        alert('Product Code, Product Description, and Packing Size are required.');
        return;
    }

    const saveButton = form.querySelector('button[type="submit"]');
    try {
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.textContent = 'Saving...';
        }

        await window.productAPI.updateProduct(productId, updatedProductData); // This invalidates cache
        alert('Product updated successfully!');
        // currentProductSearchTerm and currentPageNum remain the same
        loadProducts(); // Reload the product list to see changes, respecting current page/search
    } catch (error) {
        console.error('Failed to update product:', error);
        alert('Failed to update product: ' + error.message);
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = 'Save Changes';
        }
    }
}

function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}
