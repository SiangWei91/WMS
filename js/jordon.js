// js/jordon.js

function formatDateToDDMMYYYY(dateString) {
  if (!dateString || typeof dateString !== 'string') {
      return ""; 
  }
  // Handles YYYY-MM-DD from input type="date" or Firestore string
  // Handles Firestore Timestamps by converting to ISO string first if needed (though already handled by toLocaleDateString)
  // For this specific use case, we expect YYYY-MM-DD from item.dateStored or item.expiryDate
  const parts = dateString.split('-'); 
  if (parts.length === 3) { // YYYY, MM, DD
      const [year, month, day] = parts;
      // Basic validation for parts
      if (year.length === 4 && month.length >= 1 && month.length <= 2 && day.length >= 1 && day.length <=2) {
           return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
      }
  }
  // Fallback for dates that might already be in a different format or if parsing failed
  // If it's from a Firestore timestamp that became a JS Date, toLocaleDateString might be acceptable
  // but the goal is DD/MM/YYYY. If it's not YYYY-MM-DD, it might be better to return original or empty.
  if (dateString.includes('/') || dateString.length < 8) return dateString; // Likely already formatted or not a full date string

  return dateString; // Return original if not in YYYY-MM-DD or if parts don't match
}


async function loadInventorySummaryData() {
  console.log('loadInventorySummaryData: Function called.');
  const summaryTableBody = document.getElementById('jordon-inventory-summary-tbody');
  const totalCartonsCell = document.getElementById('summary-total-cartons');
  const totalPalletsCell = document.getElementById('summary-total-pallets');

  if (!summaryTableBody || !totalCartonsCell || !totalPalletsCell) {
      console.error('Required elements for inventory summary not found.');
      return;
  }

  summaryTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center;">Loading data...</td></tr>'; // Show loading indicator

  try {
      if (!window.jordonAPI || typeof window.jordonAPI.getJordonInventoryItems !== 'function') {
          summaryTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center; color: red;">Error: API not available.</td></tr>';
          console.error('window.jordonAPI.getJordonInventoryItems is not available.');
          return;
      }
      // console.log('loadInventorySummaryData: About to call getJordonInventoryItems.'); // This log should already exist from previous debugging
      
      // NEW DIAGNOSTIC LOGS:
      console.log('loadInventorySummaryData: PRE-CALL CHECK - window.jordonAPI object:', window.jordonAPI);
      if (window.jordonAPI) {
          console.log('loadInventorySummaryData: PRE-CALL CHECK - window.jordonAPI.getJordonInventoryItems:', window.jordonAPI.getJordonInventoryItems);
          console.log('loadInventorySummaryData: PRE-CALL CHECK - typeof window.jordonAPI.getJordonInventoryItems:', typeof window.jordonAPI.getJordonInventoryItems);
      } else {
          console.error('loadInventorySummaryData: PRE-CALL CHECK - CRITICAL - window.jordonAPI is NOT defined at point of call.');
      }
      // END OF NEW DIAGNOSTIC LOGS

      // The existing API call line:
      const items = await window.jordonAPI.getJordonInventoryItems(); 
      console.log('loadInventorySummaryData: Items fetched from API:', items);
      summaryTableBody.innerHTML = ''; // Clear loading indicator or previous data

      if (!items || items.length === 0) {
          console.log('loadInventorySummaryData: No items found or API error (items array empty/null).');
          summaryTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center;">No inventory items found.</td></tr>';
          totalCartonsCell.textContent = '0';
          totalPalletsCell.textContent = '0';
          return;
      }

      let overallTotalCartons = 0;
      let overallTotalPallets = 0;
      
      let mixedPalletGroupClasses = {}; // Stores group ID to CSS class mapping
      let nextHighlightClassIndex = 0;
      const highlightClasses = ['mixed-pallet-group-1', 'mixed-pallet-group-2'];
      let firstItemProcessed = false;

      items.forEach(item => {
          if (!firstItemProcessed) {
              console.log('loadInventorySummaryData: Processing first item for row creation:', item);
              firstItemProcessed = true;
          }
          const row = summaryTableBody.insertRow();
          row.insertCell().textContent = item.itemCode || '';
          row.insertCell().textContent = item.product || item.productName || ''; // product or productName from data
          row.insertCell().textContent = item.packingSize || '';
          row.insertCell().textContent = item.palletType || '';
          row.insertCell().textContent = item.location || '';
          row.insertCell().textContent = item.lotNumber || '';
          row.insertCell().textContent = item.batchNumber || '';
          
          // Date Stored
          // Prioritize item.dateStored (YYYY-MM-DD string), then item.stockInTimestamp
          let formattedDateStored = '';
          if (item.dateStored) {
              formattedDateStored = formatDateToDDMMYYYY(item.dateStored);
          } else if (item.stockInTimestamp && item.stockInTimestamp.toDate) {
              try {
                  // Convert Firestore Timestamp to YYYY-MM-DD string first for consistent formatting
                  const tsDate = item.stockInTimestamp.toDate();
                  const year = tsDate.getFullYear();
                  const month = String(tsDate.getMonth() + 1).padStart(2, '0');
                  const day = String(tsDate.getDate()).padStart(2, '0');
                  formattedDateStored = formatDateToDDMMYYYY(`${year}-${month}-${day}`);
              } catch (e) { console.warn("Error formatting stockInTimestamp: ", e); }
          }
          row.insertCell().textContent = formattedDateStored;
          
          row.insertCell().textContent = item.containerNumber || '';

          // Expiry Date
          row.insertCell().textContent = formatDateToDDMMYYYY(item.expiryDate); 

          const totalCartonsTd = row.insertCell();
          totalCartonsTd.textContent = item.totalCartons || 0;
          const physicalPalletsTd = row.insertCell();
          physicalPalletsTd.textContent = item.physicalPallets || 0;

          overallTotalCartons += Number(item.totalCartons || 0);
          overallTotalPallets += Number(item.physicalPallets || 0);

          if (item.mixedPalletGroupId && item.mixedPalletGroupId.trim() !== "") {
              if (!mixedPalletGroupClasses[item.mixedPalletGroupId]) {
                  mixedPalletGroupClasses[item.mixedPalletGroupId] = highlightClasses[nextHighlightClassIndex % highlightClasses.length];
                  nextHighlightClassIndex++;
              }
              const highlightClass = mixedPalletGroupClasses[item.mixedPalletGroupId];
              totalCartonsTd.classList.add(highlightClass);
              physicalPalletsTd.classList.add(highlightClass);
          }
      });

      console.log('loadInventorySummaryData: Finished processing items. OverallTotalCartons:', overallTotalCartons, 'OverallTotalPallets:', overallTotalPallets);
      totalCartonsCell.textContent = overallTotalCartons;
      totalPalletsCell.textContent = overallTotalPallets;
      console.log('loadInventorySummaryData: Updating footer totals.');
      console.log('loadInventorySummaryData: Successfully completed rendering data.');

  } catch (error) {
      console.error('loadInventorySummaryData: Detailed error during execution:', error, error.stack);
      // Add one more specific log for the "not available" case if error message matches
      if (error.message && (error.message.includes("is not a function") || error.message.includes("is not available") || error.message.includes("undefined"))) {
           console.error('loadInventorySummaryData: ERROR DETAILS - The function call to getJordonInventoryItems failed. This often means it was undefined or not a function at the time of calling, despite what api.js might have set up.');
      }
      summaryTableBody.innerHTML = `<tr><td colspan="12" style="text-align:center; color:red;">Error loading data: ${error.message}</td></tr>`;
      totalCartonsCell.textContent = 'Error';
      totalPalletsCell.textContent = 'Error';
  }
}

function initJordonTabs() {
  // console.log('initJordonTabs called'); // For debugging

  const tabItems = document.querySelectorAll('.jordon-page-container .tab-item');
  const tabContents = document.querySelectorAll('.jordon-page-container .tab-content');

  // console.log('Found tabs:', tabItems.length); // For debugging
  // console.log('Found contents:', tabContents.length); // For debugging

  if (tabItems.length === 0 || tabContents.length === 0) {
      // If the Jordon page content isn't loaded yet, or elements are missing,
      // try again after a short delay. This can happen if jordon.js runs before
      // jordon.html is fully loaded into the DOM by app.js.
      // console.warn('Jordon tab elements not found, will retry initialization.');
      // setTimeout(initJordonTabs, 100); // Retry after 100ms
      return; // Exit for now, will be called again by loadJordonPage if needed.
  }

  tabItems.forEach(tab => {
      tab.addEventListener('click', function() {
          console.log('Tab clicked. Data tab: ' + this.dataset.tab);
          tabItems.forEach(item => item.classList.remove('active'));
          tabContents.forEach(content => content.classList.remove('active'));

          this.classList.add('active');
          const targetTabContentId = this.dataset.tab + '-content';
          const targetContent = document.getElementById(targetTabContentId);
          
          if (targetContent) {
              targetContent.classList.add('active');
              if (this.dataset.tab === 'inventory-summary') {
                  console.log('Inventory Summary tab selected, calling loadInventorySummaryData().');
                  loadInventorySummaryData(); // Load data when inventory summary tab is clicked
              }
          }
      });
  });

  console.log('initJordonTabs: Checking initial active tab.');
  const initiallyActiveTab = document.querySelector('.jordon-page-container .tab-item.active');
  if (initiallyActiveTab) {
      const initialContentId = initiallyActiveTab.dataset.tab + '-content';
      const initialContent = document.getElementById(initialContentId);
      if (initialContent && !initialContent.classList.contains('active')) {
          tabContents.forEach(content => content.classList.remove('active')); 
          initialContent.classList.add('active');
      }
      // Load data for initially active tab if it's the inventory summary
      if (initiallyActiveTab.dataset.tab === 'inventory-summary') {
          console.log('Initial active tab is Inventory Summary, calling loadInventorySummaryData().');
          loadInventorySummaryData();
      }
  } else if (tabItems.length > 0) {
      // If no tab is active by default, activate the first one and load its content if it's summary
      console.log('initJordonTabs: No active tab found, activating the first tab.');
      tabItems[0].classList.add('active');
      const firstTabContentId = tabItems[0].dataset.tab + '-content';
      const firstTabContent = document.getElementById(firstTabContentId);
      if (firstTabContent) firstTabContent.classList.add('active');
      if (tabItems[0].dataset.tab === 'inventory-summary') {
          console.log('Initial active tab (first tab) is Inventory Summary, calling loadInventorySummaryData().');
          loadInventorySummaryData();
      }
  }


  // Logic for Stock In tab
  const addStockInRowBtn = document.getElementById('add-stock-in-row-btn');
  const stockInTableBody = document.getElementById('stock-in-table-body');

  if (addStockInRowBtn && stockInTableBody) {
      addStockInRowBtn.addEventListener('click', function() {
          // Determine default container number before adding the new row
          let defaultContainerNumber = "";
          if (stockInTableBody.rows.length > 0) {
              const firstRow = stockInTableBody.rows[0];
              const firstRowContainerInput = firstRow.querySelector('.container-number-input');
              if (firstRowContainerInput) {
                  defaultContainerNumber = firstRowContainerInput.value;
              }
          }

          const newRow = stockInTableBody.insertRow();
          
          // Product (input)
          const productCell = newRow.insertCell();
          productCell.innerHTML = '<input type="text" class="form-control form-control-sm product-input" placeholder="Type product...">';
          const productInput = productCell.querySelector('.product-input');

          // Item Code (span)
          const itemCodeCell = newRow.insertCell(); // Create cell first
          itemCodeCell.innerHTML = '<span class="item-code-display"></span>'; // Add span inside

          // Packing Size (span)
          const packingSizeCell = newRow.insertCell(); // Create cell first
          packingSizeCell.innerHTML = '<span class="packing-size-display"></span>'; // Add span inside
          
          // Event listener for product input
          productInput.addEventListener('input', async function(event) {
              const productInputElem = event.target;
              const searchText = productInputElem.value.trim();
              const currentRow = productInputElem.closest('tr');
              const itemCodeSpan = currentRow.querySelector('.item-code-display');
              const packingSizeSpan = currentRow.querySelector('.packing-size-display');
              const currentCell = productInputElem.parentElement; // The <td> containing the input

              // Remove any existing dropdown from THIS cell first
              const oldDropdown = currentCell.querySelector('.product-search-results-dropdown');
              if (oldDropdown) {
                  oldDropdown.remove();
              }
              
              let resultsDropdown; // Will be assigned when new one is created

              if (searchText.length < 2) { // Minimum characters to trigger search
                  itemCodeSpan.textContent = '';
                  packingSizeSpan.textContent = '';
                  return;
              }

              try {
                  if (!window.productAPI || typeof window.productAPI.searchProductsByName !== 'function') {
                      console.error('productAPI.searchProductsByName function not found.');
                      itemCodeSpan.textContent = 'API Error';
                      packingSizeSpan.textContent = 'API Error';
                      return;
                  }
                  const products = await window.productAPI.searchProductsByName(searchText);
                  
                  resultsDropdown = document.createElement('ul');
                  // Apply classes for styling (from publicwarehouse.css + potentially Bootstrap if available)
                  resultsDropdown.className = 'product-search-results-dropdown list-group'; 
                  
                  // Basic positioning (appended to cell, relative to cell)
                  // Parent cell (productCell) needs position:relative for this to work well.
                  // This was added to TD general styles in publicwarehouse.css
                  resultsDropdown.style.position = 'absolute';
                  resultsDropdown.style.top = productInputElem.offsetHeight + 'px'; // Position below the input
                  resultsDropdown.style.left = '0';
                  resultsDropdown.style.width = productInputElem.offsetWidth + 'px'; // Match input width
                  // z-index, background, border, max-height, overflowY are in CSS but can be reinforced here if needed
                  // resultsDropdown.style.zIndex = '1000';
                  // resultsDropdown.style.backgroundColor = 'white';
                  // resultsDropdown.style.border = '1px solid #ccc';
                  // resultsDropdown.style.maxHeight = '150px';
                  // resultsDropdown.style.overflowY = 'auto';

                  if (products.length > 0) {
                      products.forEach(product => {
                          const li = document.createElement('li');
                          li.className = 'list-group-item list-group-item-action product-search-item';
                          li.textContent = product.name; // Main display text
                          // Store product data on the li element using dataset
                          li.dataset.productName = product.name || 'N/A';
                          li.dataset.itemCode = product.productCode || 'N/A';     // Use product.productCode
                          li.dataset.packingSize = product.packaging || 'N/A'; // Use product.packaging

                          li.addEventListener('click', function() {
                              productInputElem.value = this.dataset.productName;
                              if(itemCodeSpan) itemCodeSpan.textContent = this.dataset.itemCode;
                              if(packingSizeSpan) packingSizeSpan.textContent = this.dataset.packingSize;
                              resultsDropdown.remove();
                          });
                          resultsDropdown.appendChild(li);
                      });
                  } else {
                      const li = document.createElement('li');
                      li.className = 'list-group-item product-search-item-none'; // For styling 'no results'
                      li.textContent = 'No products found';
                      resultsDropdown.appendChild(li);
                  }
                  productCell.appendChild(resultsDropdown); // Append dropdown to the product input's cell

                  // Handle click away to remove dropdown
                  if (resultsDropdown && resultsDropdown.parentElement) { // Only if dropdown was actually added
                      const hideFunc = function(e) {
                          // Check if resultsDropdown is still in the DOM and productCell is still valid
                          if (resultsDropdown && resultsDropdown.parentElement && productCell && !productCell.contains(e.target) && !resultsDropdown.contains(e.target)) {
                              resultsDropdown.remove();
                              document.removeEventListener('click', hideFunc, true);
                          } else if (resultsDropdown && !resultsDropdown.parentElement) {
                              // Dropdown was removed by other means (e.g. item click), just clean up listener
                              document.removeEventListener('click', hideFunc, true);
                          }
                      };
                      document.addEventListener('click', hideFunc, true); 
                  }

              } catch (error) {
                  console.error("Error during product search:", error);
                  if(itemCodeSpan) itemCodeSpan.textContent = 'Error';
                  if(packingSizeSpan) packingSizeSpan.textContent = 'Error';
                  // Optionally remove dropdown if it exists
                  if (resultsDropdown) resultsDropdown.remove();
              }
          });

          // Pallet Type (select)
          newRow.insertCell().innerHTML = '<select class="form-control form-control-sm pallet-type-select"><option value="LC" selected>LC</option><option value="JD">JD</option></select>';
          // Location (select)
          newRow.insertCell().innerHTML = '<select class="form-control form-control-sm location-select"><option value="LC01" selected>LC01</option><option value="Ala Carte">Ala Carte</option></select>';
          
          // Calculate Lot Number for the new row
          let newLotValue = ""; 
          if (stockInTableBody.rows.length > 1) { // Check if there's more than just the current (newly added) row
              // The newRow is already added to stockInTableBody.rows, so length will be at least 1.
              // We need to check the row *before* the newRow.
              const lastPopulatedRowIndex = stockInTableBody.rows.length - 2; // Index of the row before the one we just added
              if (lastPopulatedRowIndex >= 0) {
                  const lastRow = stockInTableBody.rows[lastPopulatedRowIndex];
                  const lastLotInput = lastRow.querySelector('.lot-number-input');
                  if (lastLotInput) {
                      const base = lastLotInput.value.trim();
                      if (base) { // Only increment if there's a base value
                          const match = base.match(/([A-Z])$/i); // Case-insensitive match for trailing letter
                          if (match) {
                              const lastLetter = match[1].toUpperCase();
                              const core = base.substring(0, base.length - 1);
                              if (lastLetter < 'Z') {
                                  newLotValue = core + String.fromCharCode(lastLetter.charCodeAt(0) + 1);
                              } else { // Ends in Z
                                  newLotValue = base + 'A'; 
                              }
                          } else { // Does not end in a letter
                              newLotValue = base + 'A';
                          }
                      }
                      // If base is empty, newLotValue remains "", which is intended.
                  }
              }
          }
          // If it's the very first actual data row (stockInTableBody.rows.length was 1 before this logic, now 2 with newRow)
          // or if the previous lot number was empty, newLotValue remains "". User can type.
          // Or, to default the first ever lot number to "A" if desired:
          // if (stockInTableBody.rows.length === 1 && newLotValue === "") {
          //     newLotValue = "A"; // Default for the very first lot number if no prior data
          // }


          // Lot Number (input)
          const lotNumberCell = newRow.insertCell();
          lotNumberCell.innerHTML = '<input type="text" class="form-control form-control-sm lot-number-input">';
          const lotNumberInput = lotNumberCell.querySelector('.lot-number-input');
          if (lotNumberInput) {
              lotNumberInput.value = newLotValue;
          }

          // Batch Number (input)
          newRow.insertCell().innerHTML = '<input type="text" class="form-control form-control-sm batch-number-input">';
          // Date Stored (date input)
          const dateStoredCell = newRow.insertCell();
          dateStoredCell.innerHTML = '<input type="date" class="form-control form-control-sm date-stored-input">';
          const dateStoredInput = dateStoredCell.querySelector('.date-stored-input');
          const today = new Date();
          dateStoredInput.value = today.getFullYear().toString() + '-' + (today.getMonth() + 1).toString().padStart(2, '0') + '-' + today.getDate().toString().padStart(2, '0');
          
          // Container Number (input)
          const containerCell = newRow.insertCell();
          containerCell.innerHTML = '<input type="text" class="form-control form-control-sm container-number-input">';
          const containerInput = containerCell.querySelector('.container-number-input');
          if (containerInput) {
              containerInput.value = defaultContainerNumber;
          }

          // Expiry Date (date input)
          newRow.insertCell().innerHTML = '<input type="date" class="form-control form-control-sm expiry-date-input">';
          // Total Cartons (number input)
          newRow.insertCell().innerHTML = '<input type="number" class="form-control form-control-sm total-cartons-input" min="0">';
          // Physical Pallets (text input)
          newRow.insertCell().innerHTML = '<input type="text" class="form-control form-control-sm physical-pallets-input">';
          // Mixed Pallet Group ID (text input)
          newRow.insertCell().innerHTML = '<input type="text" class="form-control form-control-sm mixed-pallet-group-id-input">';
          
          // Actions (button)
          const actionsCell = newRow.insertCell();
          actionsCell.innerHTML = '<button class="btn btn-danger btn-sm delete-row-btn"><i class="fas fa-trash"></i></button>';
          const deleteButton = actionsCell.querySelector('.delete-row-btn');

          if (deleteButton) {
              deleteButton.addEventListener('click', function(event) {
                  const rowToRemove = event.target.closest('tr');
                  if (rowToRemove) {
                      rowToRemove.remove();
                      // Optional: Recalculate totals or perform other actions if needed after a row is deleted.
                  }
              });
          }
      });
  }

  const submitStockInBtn = document.getElementById('submit-stock-in-btn');
  if (submitStockInBtn && stockInTableBody) { // stockInTableBody is from the scope above
      submitStockInBtn.addEventListener('click', async function() { // Make listener async
          const allRowsData = [];
          const rows = stockInTableBody.rows;

          for (let i = 0; i < rows.length; i++) {
              const row = rows[i];
              const rowData = {};

              rowData.product = row.querySelector('.product-input')?.value || '';
              rowData.itemCode = row.querySelector('.item-code-display')?.textContent || '';
              rowData.packingSize = row.querySelector('.packing-size-display')?.textContent || '';
              rowData.palletType = row.querySelector('.pallet-type-select')?.value || '';
              rowData.location = row.querySelector('.location-select')?.value || '';
              rowData.lotNumber = row.querySelector('.lot-number-input')?.value || '';
              rowData.batchNumber = row.querySelector('.batch-number-input')?.value || '';
              rowData.dateStored = row.querySelector('.date-stored-input')?.value || '';
              rowData.containerNumber = row.querySelector('.container-number-input')?.value || '';
              rowData.expiryDate = row.querySelector('.expiry-date-input')?.value || '';
              rowData.totalCartons = parseFloat(row.querySelector('.total-cartons-input')?.value) || 0;
              rowData.physicalPallets = parseFloat(row.querySelector('.physical-pallets-input')?.value) || 0;
              rowData.mixedPalletGroupId = row.querySelector('.mixed-pallet-group-id-input')?.value || '';
              
              // Basic validation: Ensure at least a product or item code exists
              if (!rowData.product && !rowData.itemCode) {
                  console.warn(`Skipping empty row at index ${i}`);
                  continue; // Skip this row if it's essentially empty
              }
              allRowsData.push(rowData);
          }

          if (allRowsData.length === 0) {
              alert('No valid items to submit.');
              return;
          }

          submitStockInBtn.disabled = true;
          submitStockInBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

          try {
              // Ensure window.jordonAPI and addJordonStockItems are available
              if (window.jordonAPI && typeof window.jordonAPI.addJordonStockItems === 'function') {
                  const result = await window.jordonAPI.addJordonStockItems(allRowsData);
                  alert(`Stock In data saved successfully: ${result.count} item(s) added.`);
                  
                  // Clear the table body
                  while (stockInTableBody.firstChild) {
                      stockInTableBody.removeChild(stockInTableBody.firstChild);
                  }
                  // Optionally, add one new empty row to start again
                  // if (addStockInRowBtn) addStockInRowBtn.click(); 
              } else {
                  console.error('jordonAPI.addJordonStockItems function not found.');
                  alert('Error: Submission API is not available.');
              }
          } catch (error) {
              console.error("Error submitting stock in data:", error);
              alert(`Error saving Stock In data: ${error.message}`);
          } finally {
              submitStockInBtn.disabled = false;
              submitStockInBtn.innerHTML = 'Submit Stock In';
          }
      });
  }
}

// The initJordonTabs function will be called from app.js after jordon.html is loaded.
// However, if jordon.js is loaded and executed before the DOM content from jordon.html
// is actually available, the querySelectors might not find the elements.
// A common pattern is to ensure initJordonTabs is called *after* the content is loaded.
// For now, we define it. The call will be made from loadJordonPage in app.js.

// Example of how it might be called if this script were loaded at the end of jordon.html:
// document.addEventListener('DOMContentLoaded', initJordonTabs); 
// But since jordon.html is loaded dynamically, app.js will handle calling this.
