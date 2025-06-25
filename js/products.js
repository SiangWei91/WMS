// State variables for pagination
let productFetchController = null; // To abort previous fetches
let lastVisibleDocSnapshot = null; // Stores the snapshot for the last document of the current page
let firstVisibleDocSnapshots = [null]; // Stack to keep track of first docs of pages for "previous"
let currentProductSearchTerm = ''; // Renamed to avoid conflict with function params
const PRODUCTS_PER_PAGE = 10; 
let globalHasNextPage = false; // Keep track of hasNextPage globally

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
    
    // Initial fetch
    await fetchProducts({
        searchTerm: currentProductSearchTerm,
        limit: PRODUCTS_PER_PAGE,
        startAfterDoc: null // Explicitly null for first page
    });
}

async function fetchProducts({ searchTerm = '', limit = PRODUCTS_PER_PAGE, startAfterDoc = null, isPrev = false } = {}) {
    const tbody = document.getElementById('products-table-body');
    tbody.innerHTML = `<tr><td colspan="5" class="text-center">Loading products...</td></tr>`;

    // Abort any ongoing fetch
    if (productFetchController) {
        productFetchController.abort();
    }
    productFetchController = new AbortController();
    const signal = productFetchController.signal;

    try {
        const params = {
            limit: limit,
            searchTerm: searchTerm,
            lastVisibleDocSnapshot: startAfterDoc // API expects lastVisibleDocSnapshot
        };
        
        const response = await window.productAPI.getProducts(params); // Signal can be added if API supports it
        
        if (signal.aborted) {
            console.log("Product fetch aborted");
            return;
        }

        renderProductsTable(response.data);
        
        // Update pagination state
        lastVisibleDocSnapshot = response.lastVisibleDocSnapshot;
        globalHasNextPage = response.hasNextPage;

        if (!isPrev) { // If going next or first page
            if (startAfterDoc) { // Means it was a "next" click
                firstVisibleDocSnapshots.push(startAfterDoc); // The start of the current page was the previous page's last doc
            } else { // Means it was a "first" page load (new search or initial)
                firstVisibleDocSnapshots = [null]; // Reset for first page
            }
        }
        // For "prev", the calling function will pop from firstVisibleDocSnapshots

        renderPagination(); 

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Fetch aborted by user.');
        } else {
            console.error('Failed to fetch product list (Firestore):', error);
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error loading products: ${error.message}</td></tr>`;
            alert('Failed to fetch product list: ' + error.message);
        }
    } finally {
        productFetchController = null; // Clear controller
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
        if (product.createdAt && product.createdAt.toDate) {
            createdAtDisplay = product.createdAt.toDate().toLocaleString();
        } else if (product.createdAt) {
            createdAtDisplay = new Date(product.createdAt).toLocaleString();
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

function renderPagination() {
    const paginationDiv = document.getElementById('pagination');
    paginationDiv.innerHTML = '';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn-pagination';
    // Disable "Previous" if we are on the first page (firstVisibleDocSnapshots has only one element: null)
    prevBtn.disabled = firstVisibleDocSnapshots.length <= 1;
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i> Previous';
    prevBtn.addEventListener('click', () => {
        if (firstVisibleDocSnapshots.length > 1) {
            lastVisibleDocSnapshot = null; // Clear lastVisible, as we are going back
            const previousPageStartSnapshot = firstVisibleDocSnapshots.pop(); // Remove current page's start
                                                                          // Now the top is previous page's start
            fetchProducts({ 
                searchTerm: currentProductSearchTerm, 
                limit: PRODUCTS_PER_PAGE, 
                startAfterDoc: firstVisibleDocSnapshots[firstVisibleDocSnapshots.length -1], // The one now at the top
                isPrev: true 
            });
        }
    });
    paginationDiv.appendChild(prevBtn);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn-pagination';
    nextBtn.disabled = !globalHasNextPage;
    nextBtn.innerHTML = 'Next <i class="fas fa-chevron-right"></i>';
    nextBtn.addEventListener('click', () => {
        if (globalHasNextPage && lastVisibleDocSnapshot) {
            fetchProducts({ 
                searchTerm: currentProductSearchTerm, 
                limit: PRODUCTS_PER_PAGE, 
                startAfterDoc: lastVisibleDocSnapshot,
                isPrev: false 
            });
        }
    });
    paginationDiv.appendChild(nextBtn);
}

function handleProductSearch(e) {
    currentProductSearchTerm = e.target.value.trim();
    // Reset pagination state for new search
    lastVisibleDocSnapshot = null;
    firstVisibleDocSnapshots = [null]; 
    globalHasNextPage = false;

    fetchProducts({ 
        searchTerm: currentProductSearchTerm, 
        limit: PRODUCTS_PER_PAGE, 
        startAfterDoc: null // Fetch first page of search results
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
        // Reset search term and reload products (first page)
        currentProductSearchTerm = ''; 
        lastVisibleDocSnapshot = null;
        firstVisibleDocSnapshots = [null];
        globalHasNextPage = false;
        loadProducts();
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
        // Note: AddProduct form doesn't have Chinese Name yet. 
        // If it should, this function and loadAddProductForm need updating.
    };
    
    try {
        await window.productAPI.addProduct(productData);
        alert('产品添加成功!');
        // Reset search and pagination, then reload to see the new product (likely on first page)
        currentProductSearchTerm = ''; 
        lastVisibleDocSnapshot = null;
        firstVisibleDocSnapshots = [null];
        globalHasNextPage = false;
        loadProducts(); 
    } catch (error) {
        console.error('添加产品失败 (Firestore):', error);
        alert('添加产品失败: ' + error.message);
    }
}

async function viewProduct(productId) {
    try {
        console.log('Viewing product (Firestore):', productId);
        const product = await window.productAPI.getProductById(productId);
        if (product) {
            let createdAtString = 'N/A';
            if (product.createdAt && product.createdAt.toDate) {
                createdAtString = product.createdAt.toDate().toLocaleString();
            } else if (product.createdAt) {
                createdAtString = new Date(product.createdAt).toLocaleString();
            }
            // Include Chinese Name in view alert
            const chineseNameDisplay = product['Chinese Name'] ? `\nChinese Name: ${escapeHtml(product['Chinese Name'])}` : '';
            alert(`Product Details:\nID: ${escapeHtml(product.id)}\nCode: ${escapeHtml(product.productCode)}\nName: ${escapeHtml(product.name)}${chineseNameDisplay}\nPackaging: ${escapeHtml(product.packaging)}\nCreated At: ${escapeHtml(createdAtString)}`);
        } else {
            alert('Product not found.');
        }
    } catch (error) {
        console.error('Failed to view product (Firestore):', error);
        alert('Failed to view product: ' + error.message);
    }
}

async function editProduct(productId) {
    try {
        console.log('Editing product (Firestore):', productId);
        const product = await window.productAPI.getProductById(productId);
        if (product) {
            console.log('Product data for editing:', product);
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
                loadProducts(); // Reload main product list
            });
            document.getElementById('edit-product-form').addEventListener('submit', handleUpdateProduct);

        } else {
            alert('Product not found for editing.');
            loadProducts(); // Optionally redirect to product list if product not found
        }
    } catch (error) {
        console.error('Failed to fetch product for editing (Firestore):', error);
        alert('Failed to fetch product for editing: ' + error.message);
    }
}

async function deleteProduct(productId) {
    if (confirm(`Are you sure you want to delete this product (ID: ${escapeHtml(productId)})?`)) {
        try {
            await window.productAPI.deleteProduct(productId);
            alert('Product deleted successfully!');
            // After deletion, reload current page of products
            let currentViewStart = null;
            if (firstVisibleDocSnapshots.length > 0) {
                 currentViewStart = firstVisibleDocSnapshots[firstVisibleDocSnapshots.length -1];
            }
             fetchProducts({ 
                searchTerm: currentProductSearchTerm, 
                limit: PRODUCTS_PER_PAGE, 
                startAfterDoc: currentViewStart
            });
        } catch (error) {
            console.error('Failed to delete product (Firestore):', error);
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
        'Chinese Name': formData.get('chineseName'), // Field name for Firestore
        packaging: formData.get('packaging')
    };

    // Basic validation
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

        await window.productAPI.updateProduct(productId, updatedProductData);
        alert('Product updated successfully!');
        loadProducts(); // Reload the product list to see changes
    } catch (error) {
        console.error('Failed to update product (Firestore):', error);
        alert('Failed to update product: ' + error.message);
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = 'Save Changes';
        }
    }
}

// Helper to escape HTML to prevent XSS - good practice for displaying user/DB data
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}
