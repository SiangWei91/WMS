// 主应用逻辑
document.addEventListener('DOMContentLoaded', function () {
  // Firebase Auth State Change Listener
  firebase.auth().onAuthStateChanged(async user => { // Made async
      if (user) {
          // User is signed in.
          console.log('onAuthStateChanged (app.js): User signed in:', user.uid);

          let displayName = user.uid; // Default to UID
          try {
              const idTokenResult = await user.getIdTokenResult(true); // Force refresh to get latest claims
              if (idTokenResult.claims.name) {
                  displayName = idTokenResult.claims.name;
                  console.log('User display name from claims:', displayName);
              } else {
                  console.log('Name claim not found, using UID.');
              }
          } catch (error) {
              console.error('Error getting ID token result:', error);
              // displayName remains user.uid in case of error
          }

          // Set session storage items
          sessionStorage.setItem('isAuthenticated', 'true'); 
          sessionStorage.setItem('loggedInUser', displayName); // Use displayName from claims or UID

          // --- APPLICATION INITIALIZATION LOGIC ---
          const sidebar = document.querySelector('.sidebar');
          const sidebarToggle = document.querySelector('.sidebar-toggle');
          const mainContent = document.querySelector('.main-content'); 

          if (sidebarToggle && sidebar && mainContent) { 
            sidebarToggle.addEventListener('click', function () {
              sidebar.classList.toggle('sidebar-collapsed');
            });
          }

          // Initialize navigation and load initial page
          initNavigation(); // Defined below
          loadDashboard();  // Defined below

          // Avatar Dropdown Logic
          const avatarMenuTrigger = document.getElementById('avatar-menu-trigger');
          const avatarDropdown = document.getElementById('avatar-dropdown');
          
          if (avatarMenuTrigger && avatarDropdown) {
              avatarMenuTrigger.addEventListener('click', function(event) {
                  event.stopPropagation(); // Prevent click from immediately bubbling to window
                  avatarDropdown.classList.toggle('show');
              });
          }

          // Optional: Close dropdown if clicked outside
          window.addEventListener('click', function(event) {
              const currentAvatarDropdown = document.getElementById('avatar-dropdown'); 
              const currentAvatarMenuTrigger = document.getElementById('avatar-menu-trigger'); 
              
              if (currentAvatarDropdown && currentAvatarDropdown.classList.contains('show')) {
                  if (currentAvatarMenuTrigger && !currentAvatarMenuTrigger.contains(event.target) && !currentAvatarDropdown.contains(event.target)) {
                      currentAvatarDropdown.classList.remove('show');
                  }
              }
          });

          // Display logged-in user's name
          const usernameDisplay = document.getElementById('username-display');
          if (usernameDisplay) {
              usernameDisplay.textContent = displayName; // Use displayName from claims or UID
          }
          // --- END OF APPLICATION INITIALIZATION LOGIC ---

      } else {
          // User is signed out.
          console.log('onAuthStateChanged (app.js): User signed out. Redirecting to login.');
          sessionStorage.removeItem('isAuthenticated'); 
          sessionStorage.removeItem('loggedInUser');
          window.location.href = 'login.html';
      }
  });

  // Setup Logout Button (outside onAuthStateChanged so it's always configured if present)
  const dropdownLogoutButton = document.getElementById('dropdown-logout-button');
  if (dropdownLogoutButton) {
      dropdownLogoutButton.addEventListener('click', function(event) {
          event.preventDefault();
          console.log('Logout button clicked. Signing out...');
          firebase.auth().signOut().then(() => {
              console.log('Firebase sign-out successful. onAuthStateChanged will handle redirect.');
          }).catch(error => {
              console.error('Firebase sign-out error:', error);
          });
      });
  }
});

// 初始化导航
function initNavigation() {
const navItems = document.querySelectorAll('.sidebar li');

navItems.forEach((item) => {
  item.addEventListener('click', function () {
    navItems.forEach((nav) => nav.classList.remove('active'));
    this.classList.add('active');
    const page = this.getAttribute('data-page');
    loadPage(page); // Defined below
  });
});
}

// 加载页面内容
function loadPage(page) {
const content = document.getElementById('content');

switch (page) {
  case 'dashboard':
    loadDashboard(); // Defined below
    break;
  case 'products':
    loadProducts(); 
    break;
  case 'inventory':
    loadInventory(); 
    break;
  case 'transactions':
    loadTransactions(); 
    break;
  case 'inbound':
    loadInboundForm(); 
    break;
  case 'outbound':
    loadOutboundForm(); 
    break;
  default:
    loadDashboard();
}
}

// 加载仪表盘
async function loadDashboard() {
const content = document.getElementById('content');
content.innerHTML = `
  <div class="dashboard">
      <h1>Welcome to Li Chuan Inventory Management System</h1>
      <div class="stats">
          <div class="stat-card">
              <i class="fas fa-boxes"></i>
              <div>
                  <h3>Total Product</h3>
                  <p id="total-products">0</p>
              </div>
          </div>
          <div class="stat-card">
              <i class="fas fa-warehouse"></i>
              <div>
                  <h3>Total Quantity</h3>
                  <p id="total-inventory">0</p>
              </div>
          </div>
          <div class="stat-card">
              <i class="fas fa-exchange-alt"></i>
              <div>
                  <h3>Transaction</h3>
                  <p id="today-transactions">0</p>
              </div>
          </div>
      </div>
  </div>
`;

try {
  if (window.dashboardAPI && typeof window.dashboardAPI.getStats === 'function') {
    const stats = await window.dashboardAPI.getStats();
    document.getElementById('total-products').textContent = stats.totalProducts;
    document.getElementById('total-inventory').textContent = stats.totalInventory;
    document.getElementById('today-transactions').textContent = stats.todayTransactions;
  } else {
    console.warn('dashboardAPI.getStats is not available.');
    document.getElementById('total-products').textContent = 'N/A';
    document.getElementById('total-inventory').textContent = 'N/A';
    document.getElementById('today-transactions').textContent = 'N/A';
  }
} catch (error) {
  console.error('加载仪表盘数据失败:', error);
  document.getElementById('total-products').textContent = 'Error';
  document.getElementById('total-inventory').textContent = 'Error';
  document.getElementById('today-transactions').textContent = 'Error';
}
}

// 入库表单
function loadInboundForm() {
const content = document.getElementById('content');
content.innerHTML = `
  <div class="form-container">
      <h1>Inbound</h1>
      <form id="inbound-form">
          <div class="form-group">
              <label for="inbound-productCode">Item Code*</label>
              <input type="text" id="inbound-productCode" name="productCode" required>
          </div>
          <div class="form-group">
              <label for="inbound-warehouseId">Warehouse ID*</label>
              <input type="text" id="inbound-warehouseId" name="warehouseId" value="WH01" required>
          </div>
          <div class="form-row">
              <div class="form-group">
                  <label for="inbound-batchNo">Batch No</label>
                  <input type="text" id="inbound-batchNo" name="batchNo">
              </div>
              <div class="form-group">
                  <label for="inbound-expiryDate">Exp Date</label>
                  <input type="date" id="inbound-expiryDate" name="expiryDate">
              </div>
          </div>
          <div class="form-group">
              <label for="inbound-quantity">Quantity*</label>
              <input type="number" id="inbound-quantity" name="quantity" min="1" required>
          </div>
          <div class="form-group">
              <label for="inbound-operatorId">User ID*</label>
              <input type="text" id="inbound-operatorId" name="operatorId" required>
          </div>
          <div class="form-actions">
              <button type="button" class="btn btn-secondary" id="inbound-cancel-btn">Cancel</button>
              <button type="submit" class="btn btn-primary">Submit</button>
          </div>
      </form>
  </div>
`;

document.getElementById('inbound-cancel-btn').addEventListener('click', () => loadPage('inventory'));
document.getElementById('inbound-form').addEventListener('submit', handleInboundSubmit);
}

async function handleInboundSubmit(e) {
e.preventDefault();
const form = e.target;
const formData = new FormData(form);
const rawData = Object.fromEntries(formData.entries());

const submitButton = form.querySelector('button[type="submit"]');
submitButton.disabled = true;
submitButton.textContent = 'Submitting...';

try {
  if (!window.productAPI || typeof window.productAPI.getProductByCode !== 'function') {
      alert('Product API is not available. Cannot validate product.');
      submitButton.disabled = false; submitButton.textContent = 'Submit'; return;
  }
  const product = await window.productAPI.getProductByCode(rawData.productCode);
  if (!product) {
    alert(`Product with code "${rawData.productCode}" not found. Please check the code or add the product first.`);
    submitButton.disabled = false; submitButton.textContent = 'Submit'; return;
  }

  const inboundData = {
    productId: product.id,
    productCode: product.productCode,
    productName: product.name,
    warehouseId: rawData.warehouseId,
    batchNo: rawData.batchNo,
    expiryDate: rawData.expiryDate || null,
    quantity: Number(rawData.quantity),
    operatorId: rawData.operatorId,
  };
  
  if (!window.transactionAPI || typeof window.transactionAPI.inboundStock !== 'function') {
      alert('Transaction API is not available. Cannot submit inbound stock.');
      submitButton.disabled = false; submitButton.textContent = 'Submit'; return;
  }
  await window.transactionAPI.inboundStock(inboundData);
  alert('Inbound successful!');
  loadPage('inventory');
} catch (error) {
  console.error('Inbound failed:', error);
  alert('Inbound failed: ' + error.message);
} finally {
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = 'Submit';
  }
}
}

// 出库表单
function loadOutboundForm() {
const content = document.getElementById('content');
content.innerHTML = `
  <div class="form-container">
      <h1>Out Bound</h1>
      <form id="outbound-form">
          <div class="form-group">
              <label for="outbound-productCode">Item Code*</label>
              <input type="text" id="outbound-productCode" name="productCode" required>
          </div>
          <div class="form-group">
              <label for="outbound-warehouseId">Warehouse ID*</label>
              <input type="text" id="outbound-warehouseId" name="warehouseId" value="WH01" required>
          </div>
          <div class="form-group">
              <label for="outbound-batchNo">Batch No</label>
              <input type="text" id="outbound-batchNo" name="batchNo">
          </div>
          <div class="form-group">
              <label for="outbound-quantity">Quantity*</label>
              <input type="number" id="outbound-quantity" name="quantity" min="1" required>
          </div>
          <div class="form-group">
              <label for="outbound-operatorId">User ID*</label>
              <input type="text" id="outbound-operatorId" name="operatorId" required>
          </div>
          <div class="form-actions">
              <button type="button" class="btn btn-secondary" id="outbound-cancel-btn">Cancel</button>
              <button type="submit" class="btn btn-primary">Submit</button>
          </div>
      </form>
  </div>
`;

document.getElementById('outbound-cancel-btn').addEventListener('click', () => loadPage('inventory'));
document.getElementById('outbound-form').addEventListener('submit', handleOutboundSubmit);
}

async function handleOutboundSubmit(e) {
e.preventDefault();
const form = e.target;
const formData = new FormData(form);
const rawData = Object.fromEntries(formData.entries());

const submitButton = form.querySelector('button[type="submit"]');
submitButton.disabled = true;
submitButton.textContent = 'Submitting...';

try {
  if (!window.productAPI || typeof window.productAPI.getProductByCode !== 'function') {
      alert('Product API is not available. Cannot validate product.');
      submitButton.disabled = false; submitButton.textContent = 'Submit'; return;
  }
  const product = await window.productAPI.getProductByCode(rawData.productCode);
  if (!product) {
    alert(`Product with code "${rawData.productCode}" not found.`);
    submitButton.disabled = false; submitButton.textContent = 'Submit'; return;
  }

  const outboundData = {
    productId: product.id,
    productCode: product.productCode,
    productName: product.name,
    warehouseId: rawData.warehouseId,
    batchNo: rawData.batchNo,
    quantity: Number(rawData.quantity),
    operatorId: rawData.operatorId,
  };

  if (!window.transactionAPI || typeof window.transactionAPI.outboundStock !== 'function') {
      alert('Transaction API is not available. Cannot submit outbound stock.');
      submitButton.disabled = false; submitButton.textContent = 'Submit'; return;
  }
  await window.transactionAPI.outboundStock(outboundData);
  alert('Outbound successful!');
  loadPage('inventory');
} catch (error) {
  console.error('Outbound failed:', error);
  alert('Outbound failed: ' + error.message);
} finally {
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = 'Submit';
  }
}
}

// Placeholder for functions that might not be defined yet
if (typeof loadProducts === 'undefined') {
window.loadProducts = function() {
  document.getElementById('content').innerHTML = '<h1>Products (Not Implemented)</h1>';
  console.warn('loadProducts function was not defined. Using placeholder.');
}
}
if (typeof loadInventory === 'undefined') {
window.loadInventory = function() {
  document.getElementById('content').innerHTML = '<h1>Inventory (Not Implemented)</h1>';
  console.warn('loadInventory function was not defined. Using placeholder.');
}
}
if (typeof loadTransactions === 'undefined') {
window.loadTransactions = function () {
  console.warn('loadTransactions function is not defined yet.');
  document.getElementById('content').innerHTML = '<h1>Transactions (Not Implemented)</h1>';
};
}
