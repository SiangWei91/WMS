// Inventory Management Logic (Aggregated View)

const ALLOWED_WAREHOUSE_NAMES_FOR_EXPANDED_VIEW = [
    "Blk 15", "Coldroom 1", "Coldroom 2", "Coldroom 5", "Coldroom 6", 
    "Jordon", "Lineage", "Sing Long"
];

let currentAggregatedInventory = [];
let currentWarehouses = []; 
let isInventoryExpanded = false;
let currentSearchTerm = '';

const WAREHOUSE_ABBREVIATIONS = {
    "Jordon": "JD", "Lineage": "LG", "Sing Long": "SL",
    "Coldroom 1": "CR1", "Coldroom 2": "CR2", "Blk 15": "B15",
    "Coldroom 5": "CR5", "Coldroom 6": "CR6"
};

function formatTransactionDate(timestamp) {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
}

function getTransactionTypeText(type) {
    const types = { inbound: 'Stock In', outbound: 'Stock Out', initial: 'Initial Stock' };
    return types[type] || type;
}

function getTransactionBadgeClass(type) {
    const classes = { inbound: 'badge-success', outbound: 'badge-danger', initial: 'badge-info' };
    return classes[type] || 'badge-secondary';
}

async function loadInventory() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="inventory">
            <div class="page-header"><h1>Inventory Management</h1></div>
            <div class="controls-container" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding: 10px; background-color: #f8f9fa; border-radius: 5px;">
                <button id="expand-collapse-btn" class="btn btn-info">Expand Details</button>
                <div class="search-box" style="margin-left: auto;">
                    <i class="fas fa-search" style="position: absolute; margin-left: 10px; margin-top: 11px; color: #aaa;"></i>
                    <input type="text" id="inventory-search" placeholder="Search by Item Code/Desc..." style="padding-left: 30px; height: 38px; border-radius: 0.25rem; border: 1px solid #ced4da;">
                </div>
            </div>
            <div class="table-container">
                <table class="table table-striped table-hover">
                    <thead></thead>
                    <tbody id="inventory-table-body"><tr><td colspan="3">Loading inventory data...</td></tr></tbody>
                </table>
            </div>
            <div class="pagination" id="inventory-pagination"></div>
        </div>
        <div id="product-transactions-modal" class="modal">
            <div class="modal-content">
                <span class="close-button">&times;</span>
                <h2 id="modal-title" style="margin-top:0;">Product Transactions</h2>
                <p><strong>Product:</strong> <span id="modal-product-name"></span></p>
                <p><strong>Packing Size:</strong> <span id="modal-packaging-size"></span></p>
                <div id="modal-transactions-content" class="table-container" style="max-height: 450px; overflow-y: auto;"></div>
                <button onclick="closeProductTransactionsModal()" style="margin-top: 15px;" class="btn btn-secondary">Close</button>
            </div>
        </div>
        <!-- Placeholder for Internal Transfer Modal - to be added in next step -->
    `;

    document.getElementById('inventory-search').addEventListener('input', handleInventorySearch);
    document.getElementById('expand-collapse-btn').addEventListener('click', toggleExpandView);
    
    const productModal = document.getElementById('product-transactions-modal');
    const closeButton = productModal.querySelector('.close-button');
    if (closeButton) closeButton.addEventListener('click', closeProductTransactionsModal);
    window.addEventListener('click', function(event) {
        if (event.target === productModal) closeProductTransactionsModal();
    });

    // Event delegation for table row clicks
    const tableBody = document.getElementById('inventory-table-body');
    if(tableBody) {
        tableBody.removeEventListener('click', handleInventoryTableClick); // Remove if already exists
        tableBody.addEventListener('click', handleInventoryTableClick);
    }
    
    updateExpandCollapseButtonText(); 
    await fetchDataAndDisplayInventory();
}

function handleInventoryTableClick(event) {
    const row = event.target.closest('tr');
    if (!row || !row.dataset.productCode) return; // Clicked outside a valid row or header

    const productCode = row.dataset.productCode;
    const productName = row.dataset.productName;
    const packaging = row.dataset.packaging;
    // const productId = row.dataset.productId; // If we add productId to row dataset later

    if (isInventoryExpanded) {
        const clickedCell = event.target.closest('td');
        if (clickedCell && clickedCell.classList.contains('warehouse-qty-cell')) {
            const warehouseId = clickedCell.dataset.warehouseId;
            const warehouseName = clickedCell.dataset.warehouseName; // We'll add this to cell dataset
            const currentQtyInCell = parseInt(clickedCell.textContent || '0', 10);

            console.log(`Clicked on qty cell: Product ${productCode}, Warehouse ${warehouseId} (${warehouseName}), Qty: ${currentQtyInCell}`);
            // Call function to show internal transfer memo (to be implemented)
            showInternalTransferMemo({
                productCode,
                productName,
                packaging,
                // productId, 
                sourceWarehouseId: warehouseId,
                sourceWarehouseName: warehouseName,
                availableQuantity: currentQtyInCell
            });
        } else {
            // Clicked on other parts of the row in expanded view (e.g., product code, name)
            // Optionally, could still show product transactions, or do nothing.
            // For now, let's make it consistent with collapsed view if not a qty cell.
            displayProductTransactions(productCode, productName, packaging);
        }
    } else {
        // Collapsed view: always show product transactions
        displayProductTransactions(productCode, productName, packaging);
    }
}


async function fetchDataAndDisplayInventory() {
    const tableBody = document.getElementById('inventory-table-body');
    if (tableBody) { 
        const currentCols = isInventoryExpanded ? 3 + ALLOWED_WAREHOUSE_NAMES_FOR_EXPANDED_VIEW.length : 3;
        tableBody.innerHTML = `<tr><td colspan="${currentCols || 3}" class="text-center">Fetching and processing data...</td></tr>`;
    }

    try {
        const response = await window.inventoryAPI.getInventory();
        currentAggregatedInventory = response.aggregatedInventory || [];
        currentAggregatedInventory.forEach(item => {
            if (item.packaging === undefined) item.packaging = '-';
            // Ensure quantitiesByWarehouseId exists
            if (typeof item.quantitiesByWarehouseId !== 'object' || item.quantitiesByWarehouseId === null) {
                item.quantitiesByWarehouseId = {};
            }
        });
        currentWarehouses = response.warehouses || []; 
        currentWarehouses.sort((a, b) => (WAREHOUSE_ABBREVIATIONS[a.name] || a.name).localeCompare(WAREHOUSE_ABBREVIATIONS[b.name] || b.name));
        
        displayInventory(); 
    } catch (error) {
        console.error('Error fetching and aggregating inventory data:', error);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="3" class="text-center text-danger">Error loading inventory: ${error.message}</td></tr>`;
        }
    }
}

function displayInventory() {
    let filteredInventory = currentAggregatedInventory;
    if (currentSearchTerm) {
        const lowerSearchTerm = currentSearchTerm.toLowerCase();
        filteredInventory = currentAggregatedInventory.filter(item =>
            (item.productCode && item.productCode.toLowerCase().includes(lowerSearchTerm)) ||
            (item.productName && item.productName.toLowerCase().includes(lowerSearchTerm))
        );
    }

    const warehousesForDisplay = currentWarehouses.filter(wh => 
        ALLOWED_WAREHOUSE_NAMES_FOR_EXPANDED_VIEW.includes(wh.name)
    );
    // This sort is already applied to currentWarehouses in fetchDataAndDisplayInventory
    // warehousesForDisplay.sort((a, b) => (WAREHOUSE_ABBREVIATIONS[a.name] || a.name).localeCompare(WAREHOUSE_ABBREVIATIONS[b.name] || b.name));

    renderInventoryTable(filteredInventory, warehousesForDisplay, isInventoryExpanded);
    updateExpandCollapseButtonText();
}

function updateExpandCollapseButtonText() {
    const btn = document.getElementById('expand-collapse-btn');
    if (btn) btn.textContent = isInventoryExpanded ? 'Collapse Details' : 'Expand Details';
}

function toggleExpandView() {
    isInventoryExpanded = !isInventoryExpanded;
    displayInventory();
}

function handleInventorySearch(e) {
    currentSearchTerm = e.target.value.trim();
    displayInventory();
}

function renderInventoryTable(aggregatedItems, warehousesForHeader, isExpanded) {
    const table = document.querySelector('.inventory table');
    if (!table) return;
    let thead = table.querySelector('thead');
    if (!thead) { thead = document.createElement('thead'); table.insertBefore(thead, table.querySelector('tbody')); }
    let tbody = table.querySelector('tbody#inventory-table-body');
    if (!tbody) { tbody = document.createElement('tbody'); tbody.id = 'inventory-table-body'; table.appendChild(tbody); }

    thead.innerHTML = ''; tbody.innerHTML = ''; 

    const headerRow = thead.insertRow();
    headerRow.insertCell().textContent = 'Item Code';
    headerRow.insertCell().textContent = 'Product Description';
    const totalQtyHeaderCell = headerRow.insertCell();
    totalQtyHeaderCell.textContent = 'Total Qty';
    totalQtyHeaderCell.style.textAlign = 'center';

    if (isExpanded) {
        warehousesForHeader.forEach(wh => { // warehousesForHeader is already sorted
            const th = headerRow.insertCell();
            th.textContent = WAREHOUSE_ABBREVIATIONS[wh.name] || wh.name;
            th.style.textAlign = 'center';
        });
    }
    
    const colCount = headerRow.cells.length;
    if (!aggregatedItems || aggregatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colCount}" class="text-center">No inventory records found${currentSearchTerm ? ' for "' + currentSearchTerm + '"' : ''}.</td></tr>`;
        return;
    }

    aggregatedItems.forEach(item => {
        const row = tbody.insertRow();
        // Common data attributes for both views
        row.setAttribute('data-product-code', item.productCode || '');
        row.setAttribute('data-product-name', item.productName || 'N/A');
        row.setAttribute('data-packaging', item.packaging || '-');
        // Potentially add data-product-id if available and needed: item.productId

        // Product Code cell
        const cellProductCode = row.insertCell();
        cellProductCode.textContent = item.productCode || '-';
        cellProductCode.classList.add('cell-product-code'); // For easier targeting if needed

        // Product Name cell
        const cellProductName = row.insertCell();
        cellProductName.textContent = item.productName || 'N/A';
        cellProductName.classList.add('cell-product-name');
        
        const totalQtyCell = row.insertCell();
        totalQtyCell.textContent = item.totalQuantity !== undefined ? item.totalQuantity : '-';
        totalQtyCell.style.textAlign = 'center';
        totalQtyCell.classList.add('cell-total-qty');

        if (isExpanded) {
            warehousesForHeader.forEach(wh => {
                const qty = (item.quantitiesByWarehouseId && item.quantitiesByWarehouseId[wh.id] !== undefined) ? item.quantitiesByWarehouseId[wh.id] : 0;
                const cell = row.insertCell();
                cell.textContent = qty === 0 ? '' : qty;
                cell.style.textAlign = 'center';
                cell.classList.add('warehouse-qty-cell'); // Class to identify these cells
                cell.setAttribute('data-warehouse-id', wh.id);
                cell.setAttribute('data-warehouse-name', wh.name);
                cell.setAttribute('data-current-qty', qty);
            });
        }
    });
}

function openProductTransactionsModal() {
    const modal = document.getElementById('product-transactions-modal');
    if (modal) modal.style.display = 'block';
}

function closeProductTransactionsModal() {
    const modal = document.getElementById('product-transactions-modal');
    if (modal) modal.style.display = 'none';
    const transactionsContentDiv = document.getElementById('modal-transactions-content');
    if (transactionsContentDiv) transactionsContentDiv.innerHTML = '';
}

async function displayProductTransactions(productCode, productName, packaging) {
    if (!productCode) { alert("Product code is missing."); return; }

    document.getElementById('modal-product-name').textContent = productName || 'N/A';
    document.getElementById('modal-packaging-size').textContent = packaging || 'N/A';
    const transactionsContentDiv = document.getElementById('modal-transactions-content');
    transactionsContentDiv.innerHTML = '<p class="text-center">Loading transactions...</p>';
    openProductTransactionsModal();

    try {
        const response = await window.transactionAPI.getTransactions({ productCode: productCode, limit: 1000 }); 
        const allTransactions = response.data || [];
        if (allTransactions.length === 0) {
            transactionsContentDiv.innerHTML = `<p class="text-center">No transactions found for ${productName}.</p>`;
            return;
        }
        transactionsContentDiv.innerHTML = ''; 
        const transactionsByWarehouse = allTransactions.reduce((acc, tx) => {
            const whId = tx.warehouseId || 'unknown_warehouse';
            if (!acc[whId]) acc[whId] = [];
            acc[whId].push(tx);
            return acc;
        }, {});
        const warehouseNameMap = currentWarehouses.reduce((map, wh) => { map[wh.id] = wh.name; return map; }, {});

        for (const warehouseId in transactionsByWarehouse) {
            const warehouseTransactions = transactionsByWarehouse[warehouseId];
            const warehouseName = warehouseNameMap[warehouseId] || `Unknown (ID: ${warehouseId})`;
            const heading = document.createElement('h4');
            heading.className = 'warehouse-transaction-heading'; 
            heading.textContent = `Warehouse: ${warehouseName}`;
            transactionsContentDiv.appendChild(heading);
            const table = document.createElement('table');
            table.className = 'table table-striped table-hover table-sm'; 
            const thead = table.createTHead(); const tbody = table.createTBody();
            const headerRow = thead.insertRow();
            ['Date', 'Type', 'Quantity', 'Batch No', 'Balance'].forEach(text => {
                const th = document.createElement('th'); th.textContent = text; headerRow.appendChild(th);
            });
            transactionsContentDiv.appendChild(table);
            let currentBalance = 0;
            warehouseTransactions.forEach(tx => {
                const row = tbody.insertRow();
                const quantity = Number(tx.quantity) || 0;
                if (tx.type === 'inbound' || tx.type === 'initial') currentBalance += quantity;
                else if (tx.type === 'outbound') currentBalance -= quantity;
                row.insertCell().textContent = formatTransactionDate(tx.transactionDate);
                const typeCell = row.insertCell();
                const typeSpan = document.createElement('span');
                typeSpan.className = `badge ${getTransactionBadgeClass(tx.type)}`;
                typeSpan.textContent = getTransactionTypeText(tx.type);
                typeCell.appendChild(typeSpan);
                const quantityCell = row.insertCell();
                quantityCell.textContent = (tx.type === 'inbound' || tx.type === 'initial' ? '+' : '-') + quantity;
                quantityCell.className = (tx.type === 'inbound' || tx.type === 'initial') ? 'text-success' : 'text-danger';
                row.insertCell().textContent = tx.batchNo || '-';
                row.insertCell().textContent = currentBalance;
            });
        }
    } catch (error) {
        console.error(`Error fetching transactions for product ${productCode}:`, error);
        transactionsContentDiv.innerHTML = `<p class="text-center text-danger">Error loading transactions.</p>`;
    }
}

// --- Internal Transfer Memo UI Logic ---

let currentTransferData = {}; // To store data for the active transfer

function showInternalTransferMemo(data) {
    console.log("showInternalTransferMemo called with data:", data);
    currentTransferData = data; // Store for submission

    const modal = document.getElementById('internal-transfer-modal');
    if (!modal) {
        console.error("Internal Transfer Modal not found in DOM.");
        alert("Error: Transfer UI component is missing.");
        return;
    }

    // Populate modal fields
    document.getElementById('transfer-product-code').textContent = data.productCode || 'N/A';
    document.getElementById('transfer-product-name').textContent = data.productName || 'N/A';
    document.getElementById('transfer-product-packaging').textContent = data.packaging || 'N/A';
    document.getElementById('transfer-source-warehouse').textContent = data.sourceWarehouseName ? `${data.sourceWarehouseName} (ID: ${data.sourceWarehouseId})` : data.sourceWarehouseId;
    document.getElementById('transfer-available-qty').textContent = data.availableQuantity !== undefined ? data.availableQuantity : 'N/A';
    
    const quantityInput = document.getElementById('transfer-quantity');
    quantityInput.value = ''; // Clear previous value
    quantityInput.max = data.availableQuantity; // Set max based on availability

    const destinationSelect = document.getElementById('transfer-destination-warehouse');
    destinationSelect.innerHTML = '<option value="">-- Select Destination --</option>'; // Clear previous options
    
    currentWarehouses.forEach(wh => {
        if (wh.id !== data.sourceWarehouseId) { // Exclude source warehouse
            const option = document.createElement('option');
            option.value = wh.id;
            option.textContent = wh.name;
            destinationSelect.appendChild(option);
        }
    });

    document.getElementById('internal-transfer-error-message').textContent = ''; // Clear previous errors
    modal.style.display = 'block';

    // Attach event listeners for this instance of the modal
    const submitBtn = document.getElementById('submit-internal-transfer-btn');
    const cancelBtn = document.getElementById('cancel-internal-transfer-btn');
    const closeModalBtn = document.getElementById('close-internal-transfer-modal-btn');

    // Remove old listeners before adding new ones to prevent multiple triggers
    submitBtn.replaceWith(submitBtn.cloneNode(true)); // Clone to remove listeners
    document.getElementById('submit-internal-transfer-btn').addEventListener('click', handleInternalTransferSubmit);
    
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    document.getElementById('cancel-internal-transfer-btn').addEventListener('click', closeInternalTransferModal);

    closeModalBtn.replaceWith(closeModalBtn.cloneNode(true));
    document.getElementById('close-internal-transfer-modal-btn').addEventListener('click', closeInternalTransferModal);
}

function closeInternalTransferModal() {
    const modal = document.getElementById('internal-transfer-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    currentTransferData = {}; // Clear stored data
}

async function handleInternalTransferSubmit() {
    const quantityInput = document.getElementById('transfer-quantity');
    const destinationSelect = document.getElementById('transfer-destination-warehouse');
    const errorMessageDiv = document.getElementById('internal-transfer-error-message');

    const quantityToTransfer = parseInt(quantityInput.value, 10);
    const destinationWarehouseId = destinationSelect.value;
    const { productCode, productName, packaging, sourceWarehouseId, availableQuantity /*, productId */ } = currentTransferData;
    
    errorMessageDiv.textContent = ''; // Clear previous errors

    if (isNaN(quantityToTransfer) || quantityToTransfer <= 0) {
        errorMessageDiv.textContent = 'Please enter a valid quantity greater than 0.';
        quantityInput.focus();
        return;
    }
    if (quantityToTransfer > availableQuantity) {
        errorMessageDiv.textContent = `Quantity to transfer cannot exceed available quantity (${availableQuantity}).`;
        quantityInput.focus();
        return;
    }
    if (!destinationWarehouseId) {
        errorMessageDiv.textContent = 'Please select a destination warehouse.';
        destinationSelect.focus();
        return;
    }
    if (destinationWarehouseId === sourceWarehouseId) {
        errorMessageDiv.textContent = 'Destination warehouse cannot be the same as the source.';
        destinationSelect.focus();
        return;
    }

    const operatorId = sessionStorage.getItem('loggedInUser') || 'unknown_operator'; 
    // Assuming productId is part of currentTransferData if available from aggregated source or product lookup
    const productId = currentTransferData.productId || null; 
    // If productId is strictly required by API, ensure it's fetched and passed to showInternalTransferMemo

    const transferPayload = {
        productId, // May be null if not available from aggregated view
        productCode,
        productName,
        sourceWarehouseId,
        destinationWarehouseId,
        quantity: quantityToTransfer,
        operatorId
    };

    console.log("Submitting internal transfer:", transferPayload);
    const submitBtn = document.getElementById('submit-internal-transfer-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';

    try {
        if (!window.transactionAPI || typeof window.transactionAPI.performInternalTransfer !== 'function') {
            throw new Error("Internal transfer API function is not available.");
        }
        await window.transactionAPI.performInternalTransfer(transferPayload);
        alert('Internal transfer submitted successfully!');
        closeInternalTransferModal();
        fetchDataAndDisplayInventory(); // Refresh inventory view
    } catch (error) {
        console.error("Error performing internal transfer:", error);
        errorMessageDiv.textContent = `Error: ${error.message}`;
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Transfer';
    }
}

console.log("Inventory JS loaded for aggregated view with product transaction modal (warehouse grouping).");
