// Navigation module: handles sidebar navigation logic and dynamic menu items.

// HTML Templates for dynamic navigation items
const NAV_ITEM_JORDON_HTML = `
    <li data-page="jordon" id="nav-jordon" class="dynamic-nav-item">
        <i class="fas fa-box"></i> 
        <span>Jordon</span>
    </li>`;
const NAV_ITEM_LINEAGE_HTML = `
    <li data-page="lineage" id="nav-lineage" class="dynamic-nav-item">
        <i class="fas fa-box"></i> 
        <span>Lineage</span>
    </li>`;
const NAV_ITEM_SINGLONG_HTML = `
    <li data-page="singlong" id="nav-singlong" class="dynamic-nav-item">
        <i class="fas fa-box"></i> 
        <span>Sing Long</span>
    </li>`;

function createNavItem(htmlString) {
    const div = document.createElement('div');
    div.innerHTML = htmlString.trim();
    return div.firstChild;
}

export function initNavigation(mainNavList, publicWarehouseMenuItem, loadPageCallback) {
    if (!mainNavList || !publicWarehouseMenuItem) {
        console.error('Essential navigation elements not found for initNavigation.');
        return;
    }
    if (typeof loadPageCallback !== 'function') {
        console.error('loadPageCallback is not a function in initNavigation.');
        return;
    }


    const DYNAMIC_NAV_ITEM_IDS = ['nav-jordon', 'nav-lineage', 'nav-singlong'];

    function removeDynamicNavItems() {
        DYNAMIC_NAV_ITEM_IDS.forEach(id => {
            const item = document.getElementById(id);
            if (item) item.remove();
        });
        if (publicWarehouseMenuItem) { // Check if it exists before manipulating
            publicWarehouseMenuItem.classList.remove('expanded');
        }
    }

    mainNavList.addEventListener('click', function (event) {
        const clickedLi = event.target.closest('li');
        if (!clickedLi) return;

        const isPublicWarehouseParentClicked = clickedLi.id === 'public-warehouse-menu';
        const isDynamicSubItemClicked = clickedLi.classList.contains('dynamic-nav-item');
        const pageToLoad = clickedLi.getAttribute('data-page');

        mainNavList.querySelectorAll('li').forEach(li => li.classList.remove('active'));

        if (isPublicWarehouseParentClicked && !pageToLoad) {
            event.stopPropagation();
            const isCurrentlyExpanded = publicWarehouseMenuItem.classList.contains('expanded');
            if (isCurrentlyExpanded) {
                removeDynamicNavItems();
            } else {
                publicWarehouseMenuItem.classList.add('expanded', 'active');
                const singlongItem = createNavItem(NAV_ITEM_SINGLONG_HTML);
                const lineageItem = createNavItem(NAV_ITEM_LINEAGE_HTML);
                const jordonItem = createNavItem(NAV_ITEM_JORDON_HTML);
                let currentLastItem = publicWarehouseMenuItem;
                [jordonItem, lineageItem, singlongItem].forEach(item => {
                    currentLastItem.insertAdjacentElement('afterend', item);
                    currentLastItem = item;
                });
            }
        } else if (pageToLoad) {
            clickedLi.classList.add('active');
            if (isDynamicSubItemClicked && publicWarehouseMenuItem) { // Ensure publicWarehouseMenuItem exists
                publicWarehouseMenuItem.classList.add('expanded', 'active');
            } else {
                removeDynamicNavItems();
            }
            loadPageCallback(pageToLoad); // Use the provided callback to load pages
        }
    });

    // Initial state: remove dynamic items and ensure parent is not active unless a sub-item is loaded
    removeDynamicNavItems();
    if (publicWarehouseMenuItem) { // Check if it exists
         // Only remove 'active' if no child is active; this is complex, so for now,
         // rely on page load to set the correct active state.
         // Consider if 'active' should be removed from parent if no sub-item is initially active.
    }
}
