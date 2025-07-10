// js/app/initialCsvImport.js

/**
 * Initializes the CSV import functionality.
 * Sets up event listeners for the import button and file input.
 */
export function initInitialCsvImport() {
    const importCsvButton = document.getElementById('dropdown-import-csv-button');
    const csvFileInput = document.getElementById('csv-file-input');

    if (!importCsvButton) {
        console.error('Import CSV button (#dropdown-import-csv-button) not found.');
        return;
    }
    if (!csvFileInput) {
        console.error('CSV file input (#csv-file-input) not found.');
        return;
    }

    importCsvButton.addEventListener('click', (event) => {
        event.preventDefault();
        // Show CSV format guidance when the import process is initiated
        if (window.clearAllPageMessages) window.clearAllPageMessages();
        showCsvFormatGuidance(); 
        
        csvFileInput.click(); // Trigger click on the hidden file input
        
        // Hide the dropdown after clicking
        const avatarDropdown = document.getElementById('avatar-dropdown');
        if (avatarDropdown && avatarDropdown.classList.contains('show')) {
            avatarDropdown.classList.remove('show');
        }
    });

    csvFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            handleCsvFile(file);
        }
        // Reset file input to allow importing the same file again if needed
        csvFileInput.value = '';
    });

    console.log('Initial CSV Import functionality initialized.');
}

/**
 * Provides user guidance on the expected CSV format.
 */
function showCsvFormatGuidance() {
    const guidanceMessage = `
Expected CSV Format:
--------------------------
product_code (Required): Unique item code.
warehouse_id (Required): e.g., "jordon", "lineage", "blk15".
quantity (Required): Numeric stock quantity.
product_name (Optional/Required if new): Product description.
packaging_size (Optional/Required if new): E.g., "250g x 40p".
batch_no (Optional): Batch number.
container_number (Optional): Container number.
date_stored (Optional): YYYY-MM-DD or DD/MM/YYYY. Defaults to today if blank.
3pl_pallet_type (Optional): For 3PL warehouses (e.g., "LC", "JD").
3pl_location (Optional): Location in 3PL warehouse.
3pl_lot_number (Optional): Lot number from 3PL.
3pl_pallets (Optional): Number of pallets in 3PL.
3pl_llm_item_code (Optional): LLM item code (primarily for Lineage).
chinese_name (Optional): Chinese name of the product.
group (Optional): Product group.
brand (Optional): Product brand.
--------------------------
Ensure the first row of your CSV contains these exact header names.
    `;
    if (window.displayPageMessage) {
        // Displaying as a pre-formatted block for readability
        const pre = document.createElement('pre');
        pre.textContent = guidanceMessage;
        const container = document.createElement('div');
        container.appendChild(pre);
        window.displayPageMessage(container, 'info', 0); // Display indefinitely until cleared
    } else {
        alert(guidanceMessage);
    }
}

/**
 * Handles the selected CSV file.
 * Parses the CSV and processes each row for initial data import.
 * @param {File} file The CSV file selected by the user.
 */
async function handleCsvFile(file) {
    if (typeof Papa === 'undefined') {
        console.error('PapaParse library is not loaded. Cannot parse CSV.');
        if (window.displayPageMessage) {
            window.displayPageMessage('CSV parsing library not loaded. Please refresh.', 'error');
        } else {
            alert('CSV parsing library not loaded. Please refresh.');
        }
        return;
    }

    if (window.clearAllPageMessages) window.clearAllPageMessages();
    if (window.displayPageMessage) {
        window.displayPageMessage('Processing CSV file... Please wait.', 'info');
    } else {
        console.log('Processing CSV file... Please wait.');
    }

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function(results) {
            if (results.errors.length > 0) {
                console.error('CSV parsing errors:', results.errors);
                let errorMessages = results.errors.map(err => `Row ${err.row}: ${err.message}`).join('\\n');
                if (window.displayPageMessage) {
                    window.displayPageMessage(`CSV parsing errors:\\n${errorMessages}`, 'error');
                } else {
                    alert(`CSV parsing errors:\\n${errorMessages}`);
                }
                return;
            }

            const dataRows = results.data;
            if (dataRows.length === 0) {
                if (window.displayPageMessage) {
                    window.displayPageMessage('CSV file is empty or contains no data rows.', 'warning');
                } else {
                    alert('CSV file is empty or contains no data rows.');
                }
                return;
            }

            console.log(`CSV parsed successfully. Processing ${dataRows.length} rows.`);
            await processCsvData(dataRows);
        },
        error: function(error) {
            console.error('PapaParse error:', error);
            if (window.displayPageMessage) {
                window.displayPageMessage(`Error parsing CSV file: ${error.message}`, 'error');
            } else {
                alert(`Error parsing CSV file: ${error.message}`);
            }
        }
    });
}

/**
 * Processes the parsed CSV data rows.
 * @param {Array<Object>} rows Array of objects, where each object represents a row from the CSV.
 */
async function processCsvData(rows) {
    let successCount = 0;
    let errorCount = 0;
    const errorDetails = [];

    // Show a persistent processing message
    if (window.displayPageMessage) {
        // Assuming displayPageMessage can return a handle to the message for later removal,
        // or we simply add a new one at the end. For now, just display.
        window.displayPageMessage(`Processing ${rows.length} items... This may take a while.`, 'info', 0); // 0 duration = persistent
    }


    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // CSV data row number (assuming header is row 1)

        try {
            // 1. Validate required fields
            const productCode = row.product_code ? String(row.product_code).trim() : null;
            const warehouseId = row.warehouse_id ? String(row.warehouse_id).trim() : null;
            const quantity = row.quantity ? parseFloat(row.quantity) : null;

            if (!productCode) {
                throw new Error('Missing required field: product_code.');
            }
            if (!warehouseId) {
                throw new Error('Missing required field: warehouse_id.');
            }
            if (quantity === null || isNaN(quantity) || quantity < 0) {
                throw new Error('Invalid or missing required field: quantity (must be a non-negative number).');
            }

            // 2. Product Lookup/Creation
            let product = await window.productAPI.getProductByCode(productCode);
            if (!product) {
                const productName = row.product_name ? String(row.product_name).trim() : `Product ${productCode}`;
                const packagingSize = row.packaging_size ? String(row.packaging_size).trim() : 'N/A';
                console.log(`Product ${productCode} not found, creating... Name: ${productName}, Packaging: ${packagingSize}`);
                product = await window.productAPI.addProduct({
                    product_code: productCode,
                    name: productName,
                    packaging: packagingSize,
                    // Add other product fields if available in CSV: Chinese Name, group, brand
                    'Chinese Name': row.chinese_name ? String(row.chinese_name).trim() : '',
                    group: row.group ? String(row.group).trim() : '',
                    brand: row.brand ? String(row.brand).trim() : ''
                });
                if (!product) throw new Error(`Failed to create product ${productCode}.`);
                console.log(`Product ${productCode} created with ID ${product.id}.`);
            }

            // 3. Prepare Inventory Item for Supabase `inventory` table
            const inventoryItemPayload = {
                product_code: product.product_code, // Use the confirmed product_code
                warehouse_id: warehouseId,
                quantity: quantity,
                batch_no: row.batch_no ? String(row.batch_no).trim() : null,
                container: row.container_number ? String(row.container_number).trim() : null,
                // date_stored is handled by _3pl_details if applicable, or could be a direct column
            };

            // Populate _3pl_details if warehouse is 3PL (e.g., Jordon, Lineage)
            // This requires knowing which warehouses are 3PL. For now, we'll check for specific 3PL fields in CSV.
            // A more robust way is to fetch warehouse type from `warehouses` table.
            const threePLPalletType = row['3pl_pallet_type'] ? String(row['3pl_pallet_type']).trim() : null;
            const threePLLocation = row['3pl_location'] ? String(row['3pl_location']).trim() : null;
            const threePLLotNumber = row['3pl_lot_number'] ? String(row['3pl_lot_number']).trim() : null;
            const threePLPallets = row['3pl_pallets'] ? parseFloat(row['3pl_pallets']) : null;
            const threePLLlmItemCode = row['3pl_llm_item_code'] ? String(row['3pl_llm_item_code']).trim() : null;
            const dateStored = row.date_stored ? String(row.date_stored).trim() : new Date().toISOString().split('T')[0]; // Default to today if not provided


            // Basic check: if any 3PL field is present, assume it's for _3pl_details
            if (threePLPalletType || threePLLocation || threePLLotNumber || (threePLPallets !== null && !isNaN(threePLPallets)) || threePLLlmItemCode) {
                inventoryItemPayload._3pl_details = {
                    status: 'Complete', // Initial stock is considered complete
                    palletType: threePLPalletType,
                    location: threePLLocation,
                    lotNumber: threePLLotNumber,
                    dateStored: dateStored, // Assuming YYYY-MM-DD or DD/MM/YYYY - needs robust parsing or specific format
                    pallet: (threePLPallets !== null && !isNaN(threePLPallets)) ? threePLPallets : 0,
                    llm_item_code: threePLLlmItemCode // For Lineage
                };
            }
             // If direct date_stored column exists and no _3pl_details, use it (if your schema supports it)
            else if (dateStored && !inventoryItemPayload._3pl_details) {
                 // Assuming direct 'date_stored' column on 'inventory' table if not 3PL. Adjust if schema differs.
                 // inventoryItemPayload.date_stored = parseDate(dateStored); // Needs a robust parseDate function
            }


            // 4. Insert into Supabase `inventory` table
            const { data: newInventoryItem, error: invError } = await window.supabaseClient
                .from('inventory')
                .insert(inventoryItemPayload)
                .select()
                .single();

            if (invError) {
                console.error('Supabase inventory insert error:', invError);
                throw new Error(`Supabase inventory insert failed: ${invError.message}`);
            }
            if (!newInventoryItem) {
                throw new Error('Supabase inventory insert did not return the new item.');
            }

            // 5. Log an "initial_import" transaction
            await window.transactionAPI.inboundStock({
                product_code: product.product_code,
                productName: product.name,
                warehouseId: warehouseId,
                batchNo: inventoryItemPayload.batch_no,
                quantity: quantity,
                operatorId: sessionStorage.getItem('loggedInUser') || 'csv_import_user',
                description: `Initial CSV data import. Inventory ID: ${newInventoryItem.id}`,
                // type: 'initial_import' // If transactionAPI.inboundStock can accept a custom type
            });

            successCount++;
        } catch (error) {
            errorCount++;
            console.error(`Error processing CSV row ${rowNum}:`, row, error);
            errorDetails.push(`Row ${rowNum} (Product Code: ${row.product_code || 'N/A'}): ${error.message}`);
        }
    }

    // Final feedback message
    if (window.clearAllPageMessages) window.clearAllPageMessages(); // Clear "Processing..." message

    let finalMessage = `CSV Import Complete. Successful: ${successCount}. Failed: ${errorCount}.`;
    let messageType = 'success';

    if (errorCount > 0) {
        finalMessage += '\\nErrors:\\n' + errorDetails.slice(0, 5).join('\\n'); // Show first 5 errors
        if (errorDetails.length > 5) {
            finalMessage += '\\n(More errors in console)';
        }
        messageType = successCount > 0 ? 'warning' : 'error';
    }
    
    if (window.displayPageMessage) {
        window.displayPageMessage(finalMessage, messageType, errorCount > 0 ? 0 : 5000); // Longer display if errors
    } else {
        alert(finalMessage.replace(/\\n/g, '\n'));
    }

    // Optionally, refresh current page if it's inventory or products
    const activePageLi = document.querySelector('.sidebar nav ul li.active');
    const activePage = activePageLi ? activePageLi.dataset.page : null;
    if (activePage === 'inventory' && typeof window.loadInventory === 'function') {
        window.loadInventory(document.getElementById('content'));
    } else if (activePage === 'products' && typeof window.loadProducts === 'function') {
        window.loadProducts(document.getElementById('content'));
    }
}

// Helper to parse date strings (DD/MM/YYYY or YYYY-MM-DD) to ISO Date string (YYYY-MM-DD)
// This is a simplified parser. For production, a robust date library is better.
function parseDateToISO(dateStr) {
    if (!dateStr) return null;
    // Try DD/MM/YYYY
    let parts = dateStr.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (parts) {
        return `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
    // Try YYYY-MM-DD (already ISO format for date part)
    parts = dateStr.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if (parts) {
        return `${parts[1]}-${parts[2].padStart(2, '0')}-${parts[3].padStart(2, '0')}`;
    }
    // Basic check for ISO string already
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        return dateStr.split('T')[0];
    }
    console.warn(`Could not parse date string: ${dateStr}. Returning null.`);
    return null; 
}
