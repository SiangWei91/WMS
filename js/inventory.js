// Inventory Management Logic (Aggregated View)

const ALLOWED_WAREHOUSE_NAMES_FOR_EXPANDED_VIEW = [
    "Blk 15", "Coldroom 1", "Coldroom 2", "Coldroom 5", "Coldroom 6", 
    "Jordon", "Lineage", "Sing Long"
];

let currentAggregatedInventory = [];
let currentWarehouses = []; // This global variable will store warehouse data {id, name}
let isInventoryExpanded = false;
let currentSearchTerm = '';

// Warehouse name to abbreviation mapping
const WAREHOUSE_ABBREVIATIONS = {
    "Jordon": "JD",
    "Lineage": "LG",
    "Sing Long": "SL",
    "Coldroom 1": "CR1",
    "Coldroom 2": "CR2",
    "Blk 15": "B15",
    "Coldroom 5": "CR5",
    "Coldroom 6": "CR6"
};

// Helper functions for transaction display (adapted from js/transactions.js)
function formatTransactionDate(timestamp) {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
}

function getTransactionTypeText(type) {
    const types = {
        inbound: 'Stock In',
        outbound: 'Stock Out',
        initial: 'Initial Stock'
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


async function loadInventory() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="inventory">
            <div class="page-header">
                <h1>Inventory Management</h1>
            </div>
            <div class="controls-container" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding: 10px; background-color: #f8f9fa; border-radius: 5px;">
                <button id="expand-collapse-btn" class="btn btn-info">Expand Details</button>
                <div class="search-box" style="margin-left: auto;">
                    <i class="fas fa-search" style="position: absolute; margin-left: 10px; margin-top: 11px; color: #aaa;"></i>
                    <input type="text" id="inventory-search" placeholder="Search by Item Code/Desc..." style="padding-left: 30px; height: 38px; border-radius: 0.25rem; border: 1px solid #ced4da;">
                </div>
            </div>
            <div class="table-container">
                <table class="table table-striped table-hover">
                    <thead>
                        <!-- Headers will be dynamically rendered by renderInventoryTable -->
                    </thead>
                    <tbody id="inventory-table-body">
                        <tr><td colspan="3">Loading inventory data...</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="pagination" id="inventory-pagination">
                <!-- Pagination controls are removed for now as we load all data for client-side aggregation -->
            </div>
        </div>

        <!-- Modal for Product Transactions -->
        <div id="product-transactions-modal" class="modal">
            <div class="modal-content">
                <span class="close-button">&times;</span>
                <h2 id="modal-title" style="margin-top:0;">Product Transactions</h2>
                <p><strong>Product:</strong> <span id="modal-product-name"></span></p>
                <p><strong>Packing Size:</strong> <span id="modal-packaging-size"></span></p>
                <div id="modal-transactions-content" class="table-container" style="max-height: 450px; overflow-y: auto;">
                    <!-- Transactions grouped by warehouse will be inserted here -->
                </div>
                <button onclick="closeProductTransactionsModal()" style="margin-top: 15px;" class="btn btn-secondary">Close</button>
            </div>
        </div>
    `;

    document.getElementById('inventory-search').addEventListener('input', handleInventorySearch);
    document.getElementById('expand-collapse-btn').addEventListener('click', toggleExpandView);
    
    const closeButton = document.querySelector('#product-transactions-modal .close-button');
    if (closeButton) {
        closeButton.addEventListener('click', closeProductTransactionsModal);
    }
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('product-transactions-modal');
        if (event.target == modal) {
            closeProductTransactionsModal();
        }
    });
    
    updateExpandCollapseButtonText(); 
    await fetchDataAndDisplayInventory();
}

async function fetchDataAndDisplayInventory() {
    const tableBody = document.getElementById('inventory-table-body');
    if (tableBody) { 
        const currentCols = isInventoryExpanded ? 3 + currentWarehouses.length : 3;
        tableBody.innerHTML = `<tr><td colspan="${currentCols || 3}" class="text-center">Fetching and processing data...</td></tr>`;
    }

    try {
        const response = await window.inventoryAPI.getInventory();
        currentAggregatedInventory = response.aggregatedInventory || [];
        currentAggregatedInventory.forEach(item => {
            if (item.packaging === undefined) item.packaging = '-';
        });
        // Store warehouses globally for use in displayProductTransactions
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
    warehousesForDisplay.sort((a, b) => {
        const nameA = WAREHOUSE_ABBREVIATIONS[a.name] || a.name;
        const nameB = WAREHOUSE_ABBREVIATIONS[b.name] || b.name;
        return nameA.localeCompare(nameB);
    });

    renderInventoryTable(filteredInventory, warehousesForDisplay, isInventoryExpanded);
    updateExpandCollapseButtonText();
}

function updateExpandCollapseButtonText() {
    const btn = document.getElementById('expand-collapse-btn');
    if (btn) {
        btn.textContent = isInventoryExpanded ? 'Collapse Details' : 'Expand Details';
    }
}

function toggleExpandView() {
    isInventoryExpanded = !isInventoryExpanded;
    displayInventory();
}

function handleInventorySearch(e) {
    currentSearchTerm = e.target.value.trim();
    displayInventory();
}

function renderInventoryTable(aggregatedItems, warehouses, isExpanded) {
    const table = document.querySelector('.inventory table');
    if (!table) return;
    let thead = table.querySelector('thead');
    if (!thead) {
        thead = document.createElement('thead');
        table.insertBefore(thead, table.querySelector('tbody') || null);
    }
    let tbody = table.querySelector('tbody#inventory-table-body');
    if (!tbody) {
        tbody = document.createElement('tbody');
        tbody.id = 'inventory-table-body';
        table.appendChild(tbody);
    }

    thead.innerHTML = ''; 
    tbody.innerHTML = ''; 

    const warehouseIdToAbbreviation = {};
    const sortedWarehousesForDisplay = [...warehouses].sort((a, b) => 
        (WAREHOUSE_ABBREVIATIONS[a.name] || a.name).localeCompare(WAREHOUSE_ABBREVIATIONS[b.name] || b.name)
    );
    sortedWarehousesForDisplay.forEach(wh => {
        warehouseIdToAbbreviation[wh.id] = WAREHOUSE_ABBREVIATIONS[wh.name] || wh.name;
    });

    const headerRow = thead.insertRow();
    headerRow.insertCell().textContent = 'Item Code';
    headerRow.insertCell().textContent = 'Product Description';
    const totalQtyHeaderCell = headerRow.insertCell();
    totalQtyHeaderCell.textContent = 'Total Qty';
    totalQtyHeaderCell.style.textAlign = 'center';

    if (isExpanded) {
        sortedWarehousesForDisplay.forEach(wh => {
            const th = headerRow.insertCell();
            th.textContent = warehouseIdToAbbreviation[wh.id];
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
        row.style.cursor = 'pointer';
        row.setAttribute('data-product-code', item.productCode);
        row.setAttribute('data-product-name', item.productName);
        row.setAttribute('data-packaging', item.packaging || '-');
        row.onclick = function() {
            displayProductTransactions(
                this.getAttribute('data-product-code'),
                this.getAttribute('data-product-name'),
                this.getAttribute('data-packaging')
            );
        };
        
        row.insertCell().textContent = item.productCode || '-';
        row.insertCell().textContent = item.productName || '-';
        const totalQtyCell = row.insertCell();
        totalQtyCell.textContent = item.totalQuantity !== undefined ? item.totalQuantity : '-';
        totalQtyCell.style.textAlign = 'center';

        if (isExpanded) {
            sortedWarehousesForDisplay.forEach(wh => {
                const qty = item.quantitiesByWarehouseId[wh.id] || 0;
                const cell = row.insertCell();
                cell.textContent = qty === 0 ? '' : qty;
                cell.style.textAlign = 'center';
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
    if (transactionsContentDiv) transactionsContentDiv.innerHTML = ''; // Clear previous content
}

async function displayProductTransactions(productCode, productName, packaging) {
    if (!productCode) {
        alert("Product code is missing. Cannot display transactions.");
        return;
    }

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

        transactionsContentDiv.innerHTML = ''; // Clear loading message

        // Group transactions by warehouseId
        const transactionsByWarehouse = allTransactions.reduce((acc, tx) => {
            const whId = tx.warehouseId || 'unknown_warehouse';
            if (!acc[whId]) {
                acc[whId] = [];
            }
            acc[whId].push(tx);
            return acc;
        }, {});

        // Create a map for quick lookup of warehouse names
        const warehouseNameMap = currentWarehouses.reduce((map, wh) => {
            map[wh.id] = wh.name;
            return map;
        }, {});

        for (const warehouseId in transactionsByWarehouse) {
            const warehouseTransactions = transactionsByWarehouse[warehouseId];
            const warehouseName = warehouseNameMap[warehouseId] || `Unknown Warehouse (ID: ${warehouseId})`;

            // Add Warehouse Sub-heading
            const heading = document.createElement('h4');
            heading.className = 'warehouse-transaction-heading'; // For styling
            heading.textContent = `Warehouse: ${warehouseName}`;
            transactionsContentDiv.appendChild(heading);

            // Create table for this warehouse
            const table = document.createElement('table');
            table.className = 'table table-striped table-hover table-sm'; // Added table-sm for denser packing
            const thead = table.createTHead();
            const tbody = table.createTBody();
            
            const headerRow = thead.insertRow();
            ['Date', 'Type', 'Quantity', 'Batch No', 'Balance'].forEach(text => {
                const th = document.createElement('th');
                th.textContent = text;
                headerRow.appendChild(th);
            });
            transactionsContentDiv.appendChild(table);

            let currentBalance = 0;
            // Transactions are already sorted by date from API
            warehouseTransactions.forEach(tx => {
                const row = tbody.insertRow();
                const quantity = Number(tx.quantity) || 0;

                if (tx.type === 'inbound' || tx.type === 'initial') {
                    currentBalance += quantity;
                } else if (tx.type === 'outbound') {
                    currentBalance -= quantity;
                }

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

console.log("Inventory JS loaded for aggregated view with product transaction modal (warehouse grouping).");
