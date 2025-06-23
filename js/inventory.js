// Inventory Management Logic (Aggregated View)

const ALLOWED_WAREHOUSE_NAMES_FOR_EXPANDED_VIEW = [
    "Blk 15", "Coldroom 1", "Coldroom 2", "Coldroom 5", "Coldroom 6", 
    "Jordon", "Lineage", "Sing Long"
];

let currentAggregatedInventory = [];
let currentWarehouses = [];
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
    // Add more mappings if warehouse names from Firestore need specific abbreviations
};

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
    `;

    document.getElementById('inventory-search').addEventListener('input', handleInventorySearch);
    document.getElementById('expand-collapse-btn').addEventListener('click', toggleExpandView);
    
    // Set initial button text before fetching data
    updateExpandCollapseButtonText(); 
    await fetchDataAndDisplayInventory();
}

async function fetchDataAndDisplayInventory() {
    const tableBody = document.getElementById('inventory-table-body');
    if (tableBody) { // Show loading message in table body
        const currentCols = isInventoryExpanded ? 3 + currentWarehouses.length : 3;
        tableBody.innerHTML = `<tr><td colspan="${currentCols || 3}" class="text-center">Fetching and processing data...</td></tr>`;
    }

    try {
        // window.inventoryAPI.getInventory now returns { aggregatedInventory, warehouses }
        const response = await window.inventoryAPI.getInventory();
        currentAggregatedInventory = response.aggregatedInventory || [];
        currentWarehouses = response.warehouses || [];
        currentWarehouses.sort((a, b) => (WAREHOUSE_ABBREVIATIONS[a.name] || a.name).localeCompare(WAREHOUSE_ABBREVIATIONS[b.name] || b.name)); // Sort warehouses for consistent column order
        
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

    // Filter warehouses to only include allowed ones for display
    const warehousesForDisplay = currentWarehouses.filter(wh => 
        ALLOWED_WAREHOUSE_NAMES_FOR_EXPANDED_VIEW.includes(wh.name)
    );
    // Sort the filtered warehouses for consistent column order in the expanded view
    // This sorting was previously in fetchDataAndDisplayInventory, moving it here to act on the filtered list.
    warehousesForDisplay.sort((a, b) => {
        const nameA = WAREHOUSE_ABBREVIATIONS[a.name] || a.name; // Use abbreviation for sorting if available
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
    // When toggling, we re-render with the full (unfiltered) data or current filtered data.
    // If a search term exists, displayInventory will apply it.
    displayInventory();
}

function handleInventorySearch(e) {
    currentSearchTerm = e.target.value.trim();
    displayInventory(); // Re-filter and re-render the current data
}

// The renderInventoryTable function will be implemented in the next step (Step 3).
// For now, to avoid errors, we can add a placeholder if this file were to be run independently.
// However, since this is part of a sequence, we'll implement it fully in the next step.
function renderInventoryTable(aggregatedItems, warehouses, isExpanded) {
    const table = document.querySelector('.inventory table');
    if (!table) {
        console.error("Inventory table element not found for rendering.");
        return;
    }
    let thead = table.querySelector('thead');
    if (!thead) {
        thead = document.createElement('thead');
        table.insertBefore(thead, table.querySelector('tbody') || null); // ensure tbody exists or append thead
    }
    let tbody = table.querySelector('tbody#inventory-table-body');
    if (!tbody) {
        tbody = document.createElement('tbody');
        tbody.id = 'inventory-table-body';
        table.appendChild(tbody);
    }

    thead.innerHTML = ''; 
    tbody.innerHTML = ''; 

    // Dynamically create warehouse ID to abbreviation map for efficient lookup
    // This uses the actual names from the fetched `warehouses` data.
    const warehouseIdToAbbreviation = {};
    const sortedWarehousesForDisplay = [...warehouses].sort((a, b) => {
        const nameA = WAREHOUSE_ABBREVIATIONS[a.name] || a.name;
        const nameB = WAREHOUSE_ABBREVIATIONS[b.name] || b.name;
        return nameA.localeCompare(nameB);
    });


    sortedWarehousesForDisplay.forEach(wh => {
        warehouseIdToAbbreviation[wh.id] = WAREHOUSE_ABBREVIATIONS[wh.name] || wh.name; // Fallback to full name if no abbreviation
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
            th.style.textAlign = 'center'; // Center align header for warehouse columns
        });
    }
    
    const colCount = headerRow.cells.length;

    if (!aggregatedItems || aggregatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colCount}" class="text-center">No inventory records found${currentSearchTerm ? ' for "' + currentSearchTerm + '"' : ''}.</td></tr>`;
        return;
    }

    aggregatedItems.forEach(item => {
        const row = tbody.insertRow();
        row.insertCell().textContent = item.productCode || '-';
        row.insertCell().textContent = item.productName || '-';
        const totalQtyCell = row.insertCell();
        totalQtyCell.textContent = item.totalQuantity !== undefined ? item.totalQuantity : '-';
        totalQtyCell.style.textAlign = 'center';


        if (isExpanded) {
            sortedWarehousesForDisplay.forEach(wh => {
                const qty = item.quantitiesByWarehouseId[wh.id] || 0;
                const cell = row.insertCell();
                cell.textContent = qty === 0 ? '' : qty; // Display empty string if qty is 0
                cell.style.textAlign = 'center'; // Center align quantity
            });
        }
    });
}
// formatDate function is no longer used by renderInventoryTable in this new structure.
// If other parts of the application might need it, it can be kept or moved to a utility file.
// For now, it's removed to keep js/inventory.js focused on the current task.
/*
function formatDate(timestamp) {
    if (!timestamp) return '-';
    if (timestamp.toDate) { // Check if it's a Firestore Timestamp
        return timestamp.toDate().toLocaleString();
    } else if (timestamp.seconds) { // Fallback for old structure if any
         const date = new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
         return date.toLocaleString();
    }
    // If it's already a string or number, try to parse it
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '-'; // Check if parsing resulted in a valid date
    return d.toLocaleString();
}
*/
console.log("Inventory JS loaded for aggregated view.");
