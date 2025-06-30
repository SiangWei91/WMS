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
    let date;
    // Check if timestamp is a Firestore Timestamp object, an ISO string, or a number
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
    const year = String(date.getFullYear()).slice(-2); // Get last two digits of the year
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function getTransactionTypeText(type) {
    const types = { inbound: 'Stock In', outbound: 'Stock Out', initial: 'Initial Stock' };
    return types[type] || type;
}

function getTransactionBadgeClass(type) {
    const classes = { inbound: 'badge-success', outbound: 'badge-danger', initial: 'badge-info' };
    return classes[type] || 'badge-secondary';
}

export async function loadInventory(contentElement) { // Added export, accept contentElement
    const content = contentElement || document.getElementById('content'); // Use passed element or fallback
    if (!content) {
        console.error("Content element not found. Cannot load inventory page.");
        return;
    }
    content.innerHTML = `
        <div class="inventory">
            <div class="page-header"><h1>Inventory Management</h1></div>
            <div class="controls-container">
                <button id="expand-collapse-btn" class="btn btn-info">Expand Details</button>
                <div class="search-box">
                    <i class="fas fa-search"></i>
                    <input type="text" id="inventory-search" placeholder="Search by Item Code/Desc...">
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
        <div id="internal-transfer-modal" class="modal" style="display:none;">
            <div class="modal-content">
                <span id="close-internal-transfer-modal-btn" class="close-button">&times;</span>
                <h2 style="margin-top:0;">Internal Stock Transfer</h2>
                
                <p><strong>Product Code:</strong> <span id="transfer-product-code"></span></p>
                <p><strong>Product Name:</strong> <span id="transfer-product-name"></span></p>
                <p><strong>Packaging:</strong> <span id="transfer-product-packaging"></span></p>
                <p><strong>From Warehouse:</strong> <span id="transfer-source-warehouse"></span></p>
                <p><strong>Available Quantity (Total):</strong> <span id="transfer-available-qty"></span></p>
                
                <hr>
                
                <div class="form-group">
                    <label for="transfer-quantity">Quantity to Transfer:</label>
                    <input type="number" id="transfer-quantity" class="form-control" min="1">
                </div>
                
                <div class="form-group">
                    <label for="transfer-destination-warehouse">To Warehouse:</label>
                    <select id="transfer-destination-warehouse" class="form-control">
                        <option value="">-- Select Destination --</option>
                        <!-- Options will be populated by JS -->
                    </select>
                </div>
                
                {/* Batch details container will be inserted here by showInternalTransferMemo if not present */}
                
                <div id="internal-transfer-error-message" style="color: red; margin-bottom: 10px;"></div>
                
                <div style="text-align: right;">
                    <button id="cancel-internal-transfer-btn" class="btn btn-secondary" style="margin-right: 10px;">Cancel</button>
                    <button id="submit-internal-transfer-btn" class="btn btn-primary">Submit Transfer</button>
                </div>
            </div>
        </div>
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

    const productCode = row.dataset.productCode; // This uses data-product-code which will be set with product_code
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
            showInternalTransferMemo({
                productCode, // This will be product_code from the dataset
                productName,
                packaging,
                // productId, 
                sourceWarehouseId: warehouseId,
                sourceWarehouseName: warehouseName,
                availableQuantity: currentQtyInCell
            });
        } else {
            displayProductTransactions(productCode, productName, packaging);
        }
    } else {
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
            // Ensure quantities_by_warehouse_id is an object
            if (typeof item.quantities_by_warehouse_id !== 'object' || item.quantities_by_warehouse_id === null) {
                item.quantities_by_warehouse_id = {};
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
            (item.product_code && item.product_code.toLowerCase().includes(lowerSearchTerm)) ||
            (item.productName && item.productName.toLowerCase().includes(lowerSearchTerm))
        );
    }

    const warehousesForDisplay = currentWarehouses.filter(wh => 
        ALLOWED_WAREHOUSE_NAMES_FOR_EXPANDED_VIEW.includes(wh.name)
    );
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
        warehousesForHeader.forEach(wh => { 
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
        row.setAttribute('data-product-code', item.product_code || ''); 
        row.setAttribute('data-product-name', item.productName || 'N/A');
        row.setAttribute('data-packaging', item.packaging || '-');

        const cellProductCode = row.insertCell();
        cellProductCode.textContent = item.product_code || '-'; 
        cellProductCode.classList.add('cell-product-code'); 

        const cellProductName = row.insertCell();
        cellProductName.textContent = item.productName || 'N/A';
        cellProductName.classList.add('cell-product-name');
        
        const totalQtyCell = row.insertCell();
        totalQtyCell.textContent = item.total_quantity !== undefined ? item.total_quantity : '-'; 
        totalQtyCell.style.textAlign = 'center';
        totalQtyCell.classList.add('cell-total-qty');

        if (isExpanded) {
            warehousesForHeader.forEach(wh => {
                // CORRECTED THIS LINE:
                const qty = (item.quantities_by_warehouse_id && item.quantities_by_warehouse_id[wh.id] !== undefined) ? item.quantities_by_warehouse_id[wh.id] : 0;
                const cell = row.insertCell();
                cell.textContent = qty === 0 ? '' : qty;
                cell.style.textAlign = 'center';
                cell.classList.add('warehouse-qty-cell'); 
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
window.closeProductTransactionsModal = closeProductTransactionsModal; 

async function displayProductTransactions(productCode, productName, packaging) {
    if (typeof window.clearAllPageMessages === 'function') {
        // window.clearAllPageMessages(); 
    }
    if (!productCode) { 
        if (typeof window.displayPageMessage === 'function') {
            window.displayPageMessage("Product code is missing for viewing transactions.", 'error');
        } else {
            alert("Product code is missing.");
        }
        return; 
    }

    document.getElementById('modal-product-name').textContent = productName || 'N/A';
    document.getElementById('modal-packaging-size').textContent = packaging || 'N/A';
    const transactionsContentDiv = document.getElementById('modal-transactions-content');
    transactionsContentDiv.innerHTML = '<p class="text-center">Loading transactions...</p>';
    openProductTransactionsModal();

    try {
        console.log(`[displayProductTransactions] Fetching transactions for productCode: ${productCode}`); 
        const response = await window.transactionAPI.getTransactions({ product_code: productCode, limit: 1000 }); 
        const allTransactions = response.data || [];
        console.log(`[displayProductTransactions] Received ${allTransactions.length} transactions raw:`, JSON.parse(JSON.stringify(allTransactions)));

        if (allTransactions.length === 0) {
            console.log(`[displayProductTransactions] No transactions found for product: ${productName} (Code: ${productCode})`);
            transactionsContentDiv.innerHTML = `<p class="text-center">No transactions found for ${productName}.</p>`;
            return;
        }
        transactionsContentDiv.innerHTML = ''; 
        const transactionsByWarehouse = allTransactions.reduce((acc, tx) => {
            const whId = tx.warehouse_id || 'unknown_warehouse'; 
            if (!acc[whId]) acc[whId] = [];
            acc[whId].push(tx);
            return acc;
        }, {});
        const warehouseNameMap = currentWarehouses.reduce((map, wh) => { map[wh.id] = wh.name; return map; }, {});

        console.log(`[displayProductTransactions] Transactions grouped by warehouse:`, JSON.parse(JSON.stringify(transactionsByWarehouse)));

        for (const warehouseId in transactionsByWarehouse) {
            const warehouseTransactions = transactionsByWarehouse[warehouseId];
            const warehouseName = warehouseNameMap[warehouseId] || `Unknown (ID: ${warehouseId})`;
            console.log(`[displayProductTransactions] Processing transactions for warehouse: ${warehouseName} (ID: ${warehouseId})`, JSON.parse(JSON.stringify(warehouseTransactions)));

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
                
                let batchNoDisplay = '-'; 
                if (tx.product_batch_no) { 
                    batchNoDisplay = tx.product_batch_no;
                } else if (tx.batch_no) { 
                    if (tx.batch_no.startsWith('TRANSFER-')) {
                        batchNoDisplay = 'Internal Transfer'; 
                    } else {
                        batchNoDisplay = tx.batch_no; 
                    }
                }
                row.insertCell().textContent = batchNoDisplay;
                row.insertCell().textContent = currentBalance;
            });
        }
    } catch (error) {
        console.error(`[displayProductTransactions] Error fetching transactions for product ${productCode}:`, error);
        transactionsContentDiv.innerHTML = `<p class="text-center text-danger">Error loading transactions.</p>`;
    }
}

// --- Internal Transfer Memo UI Logic ---

let currentTransferData = {}; // To store data for the active transfer

function showInternalTransferMemo(data) {
    if (typeof window.clearAllPageMessages === 'function') {
        window.clearAllPageMessages(); 
    }
    console.log("showInternalTransferMemo called with data:", data);
    currentTransferData = data; // Store for submission

    const modal = document.getElementById('internal-transfer-modal');
    if (!modal) {
        console.error("Internal Transfer Modal not found in DOM.");
        if (typeof window.displayPageMessage === 'function') {
            window.displayPageMessage("Error: Transfer UI component is missing. Cannot proceed.", 'error');
        } else {
            alert("Error: Transfer UI component is missing.");
        }
        return;
    }

    document.getElementById('transfer-product-code').textContent = data.productCode || 'N/A'; 
    document.getElementById('transfer-product-name').textContent = data.productName || 'N/A';
    document.getElementById('transfer-product-packaging').textContent = data.packaging || 'N/A';
    document.getElementById('transfer-source-warehouse').textContent = data.sourceWarehouseName ? `${data.sourceWarehouseName} (ID: ${data.sourceWarehouseId})` : data.sourceWarehouseId;
    document.getElementById('transfer-available-qty').textContent = data.availableQuantity !== undefined ? data.availableQuantity : 'N/A';
    
    const quantityInput = document.getElementById('transfer-quantity');
    quantityInput.value = ''; 
    quantityInput.max = data.availableQuantity; 

    const destinationSelect = document.getElementById('transfer-destination-warehouse');
    destinationSelect.innerHTML = '<option value="">-- Select Destination --</option>'; 
    
    currentWarehouses.forEach(wh => {
        if (wh.id !== data.sourceWarehouseId) { 
            const option = document.createElement('option');
            option.value = wh.id;
            option.textContent = wh.name;
            destinationSelect.appendChild(option);
        }
    });

    document.getElementById('internal-transfer-error-message').textContent = ''; 
    
    const errorMessageDiv = document.getElementById('internal-transfer-error-message');
    let batchDetailsContainer = document.getElementById('transfer-batch-details-container');

    if (!batchDetailsContainer && errorMessageDiv && errorMessageDiv.parentNode) {
        const hr = document.createElement('hr');
        hr.style.marginTop = '15px';
        hr.style.marginBottom = '15px';
        const title = document.createElement('h5');
        title.style.marginBottom = '5px';
        title.textContent = 'Available Batches for Transfer:';
        batchDetailsContainer = document.createElement('div');
        batchDetailsContainer.id = 'transfer-batch-details-container';
        batchDetailsContainer.style.marginBottom = '15px';
        batchDetailsContainer.style.maxHeight = '150px'; 
        batchDetailsContainer.style.overflowY = 'auto';
        batchDetailsContainer.style.border = '1px solid #ddd';
        batchDetailsContainer.style.padding = '10px';
        batchDetailsContainer.style.borderRadius = '4px';
        const loadingMessage = document.createElement('p');
        loadingMessage.id = 'transfer-batch-loading-message';
        loadingMessage.className = 'text-muted';
        loadingMessage.textContent = 'Loading batch details...';
        batchDetailsContainer.appendChild(loadingMessage);
        errorMessageDiv.parentNode.insertBefore(hr, errorMessageDiv);
        errorMessageDiv.parentNode.insertBefore(title, errorMessageDiv);
        errorMessageDiv.parentNode.insertBefore(batchDetailsContainer, errorMessageDiv);
    } else if (batchDetailsContainer) {
        batchDetailsContainer.innerHTML = '<p id="transfer-batch-loading-message" class="text-muted">Loading batch details...</p>';
    }

    if (window.inventoryAPI && typeof window.inventoryAPI.getBatchDetailsForProduct === 'function') {
        const finalBatchDetailsContainer = document.getElementById('transfer-batch-details-container');
        const finalLoadingMessage = document.getElementById('transfer-batch-loading-message');

        window.inventoryAPI.getBatchDetailsForProduct(data.productCode, data.sourceWarehouseId) 
            .then(batches => {
                if (!finalBatchDetailsContainer) {
                    console.error("Batch details container not found when trying to display batches.");
                    return;
                }
                finalBatchDetailsContainer.innerHTML = ''; 

                if (batches && batches.length > 0) {
                    const batchSelectionGroup = document.createElement('div');
                    batchSelectionGroup.className = 'form-group';
                    const selectLabel = document.createElement('label');
                    selectLabel.setAttribute('for', 'transfer-select-batch');
                    selectLabel.textContent = 'Select Batch to Transfer From:';
                    batchSelectionGroup.appendChild(selectLabel);
                    const selectBatch = document.createElement('select');
                    selectBatch.id = 'transfer-select-batch';
                    selectBatch.className = 'form-control';
                    const defaultOption = document.createElement('option');
                    defaultOption.value = "";
                    defaultOption.textContent = "-- Select a Batch --";
                    selectBatch.appendChild(defaultOption);
                    batches.forEach(batch => {
                        const option = document.createElement('option');
                        option.value = batch.batchNo; 
                        option.textContent = `Batch: ${batch.batchNo || 'N/A'} (Available: ${batch.quantity})`;
                        option.dataset.batchNo = batch.batchNo;
                        option.dataset.availableQty = batch.quantity;
                        option.dataset.batchId = batch.id; 
                        selectBatch.appendChild(option);
                    });
                    batchSelectionGroup.appendChild(selectBatch);
                    finalBatchDetailsContainer.appendChild(batchSelectionGroup);
                    selectBatch.addEventListener('change', function() {
                        const selectedOption = this.options[this.selectedIndex];
                        const availableQty = selectedOption.dataset.availableQty;
                        const mainQtyInput = document.getElementById('transfer-quantity');
                        if (availableQty) {
                            mainQtyInput.max = availableQty;
                            mainQtyInput.value = ''; 
                            mainQtyInput.placeholder = `Max: ${availableQty}`;
                        } else {
                            mainQtyInput.max = data.availableQuantity; 
                            mainQtyInput.placeholder = '';
                        }
                    });
                } else {
                    finalBatchDetailsContainer.innerHTML = '<p class="text-muted">No specific batches found or available for this item in this warehouse.</p>';
                }
            })
            .catch(error => {
                console.error("Error fetching batch details:", error);
                if (finalBatchDetailsContainer) {
                    finalBatchDetailsContainer.innerHTML = `<p class="text-danger">Error loading batch details: ${error.message}</p>`;
                } else if (finalLoadingMessage) {
                    finalLoadingMessage.textContent = 'Error loading batch details. ' + error.message;
                    finalLoadingMessage.className = 'text-danger';
                }
            });
    } else {
        console.error("inventoryAPI.getBatchDetailsForProduct function not found.");
        const finalBatchDetailsContainer = document.getElementById('transfer-batch-details-container');
        if (finalBatchDetailsContainer) {
            finalBatchDetailsContainer.innerHTML = '<p class="text-danger">Error: Batch details API not available.</p>';
        }
    }

    modal.style.display = 'block';
    const submitBtn = document.getElementById('submit-internal-transfer-btn');
    const cancelBtn = document.getElementById('cancel-internal-transfer-btn');
    const closeModalBtn = document.getElementById('close-internal-transfer-modal-btn');
    submitBtn.replaceWith(submitBtn.cloneNode(true)); 
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
        const batchDetailsContainer = document.getElementById('transfer-batch-details-container');
        if (batchDetailsContainer) {
             batchDetailsContainer.innerHTML = '';
        }
        const mainQtyInput = document.getElementById('transfer-quantity');
        if(mainQtyInput) {
            mainQtyInput.placeholder = ''; 
        }
    }
    currentTransferData = {}; 
}

async function handleInternalTransferSubmit() {
    if (typeof window.clearAllPageMessages === 'function') {
        window.clearAllPageMessages();
    }
    const quantityInput = document.getElementById('transfer-quantity');
    const destinationSelect = document.getElementById('transfer-destination-warehouse');
    const errorMessageDiv = document.getElementById('internal-transfer-error-message'); 
    const batchSelect = document.getElementById('transfer-select-batch'); 

    const quantityToTransfer = parseInt(quantityInput.value, 10);
    const destinationWarehouseId = destinationSelect.value;
    const { productCode, productName, packaging, sourceWarehouseId, availableQuantity } = currentTransferData; 
    
    let selectedBatchNo = null;
    let selectedBatchDocId = null; 
    let selectedBatchAvailableQty = availableQuantity; 

    if (batchSelect && batchSelect.value) {
        const selectedOption = batchSelect.options[batchSelect.selectedIndex];
        selectedBatchNo = selectedOption.dataset.batchNo;
        selectedBatchDocId = selectedOption.dataset.batchId; 
        selectedBatchAvailableQty = parseInt(selectedOption.dataset.availableQty, 10);
    } else if (batchSelect) { 
        errorMessageDiv.textContent = 'Please select a batch to transfer from.';
        batchSelect.focus();
        return;
    }

    errorMessageDiv.textContent = ''; 

    if (isNaN(quantityToTransfer) || quantityToTransfer <= 0) {
        errorMessageDiv.textContent = 'Please enter a valid quantity greater than 0.';
        quantityInput.focus();
        return;
    }
    if (batchSelect && batchSelect.value && quantityToTransfer > selectedBatchAvailableQty) {
         errorMessageDiv.textContent = `Quantity to transfer cannot exceed selected batch's available quantity (${selectedBatchAvailableQty}).`;
        quantityInput.focus();
        return;
    } else if (!batchSelect && quantityToTransfer > availableQuantity) { 
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
    const productId = currentTransferData.productId || null; 

    const transferPayload = {
        productId, 
        product_code: productCode, 
        productName,
        packaging, 
        sourceWarehouseId,
        destinationWarehouseId,
        quantity: quantityToTransfer,
        operatorId,
        batchNo: selectedBatchNo, 
        sourceBatchDocId: selectedBatchDocId 
    };

    console.log("[handleInternalTransferSubmit] Submitting internal transfer with payload:", JSON.parse(JSON.stringify(transferPayload)));
    console.log("[handleInternalTransferSubmit] Current transfer data context:", JSON.parse(JSON.stringify(currentTransferData)));

    const submitBtn = document.getElementById('submit-internal-transfer-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';

    try {
        if (!window.transactionAPI || typeof window.transactionAPI.performInternalTransfer !== 'function') {
            throw new Error("Internal transfer API function is not available.");
        }
        await window.transactionAPI.performInternalTransfer(transferPayload); 
        if (typeof window.displayPageMessage === 'function') {
            window.displayPageMessage('Internal transfer submitted successfully!', 'success', 3000);
        } else {
            alert('Internal transfer submitted successfully!');
        }
        closeInternalTransferModal();
        console.log("[handleInternalTransferSubmit] Transfer attempt complete, refreshing inventory view.");
        fetchDataAndDisplayInventory(); 
    } catch (error) {
        console.error("[handleInternalTransferSubmit] Error performing internal transfer:", error);
        errorMessageDiv.textContent = `Transfer Error: ${error.message || 'Unknown error'}`;
        if (typeof window.displayPageMessage === 'function') {
            window.displayPageMessage(`Transfer Error: ${error.message || 'Unknown error'}`, 'error');
        }
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Transfer';
    }
}

console.log("Inventory JS loaded for aggregated view with product transaction modal (warehouse grouping).");
