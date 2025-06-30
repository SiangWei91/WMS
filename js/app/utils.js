// Utility functions shared across the application.

/**
 * Debounce function to limit the rate at which a function can fire.
 * @param {Function} func The function to debounce.
 * @param {number} wait The time to wait before executing the function (in milliseconds).
 * @returns {Function} The debounced function.
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Add other utility functions here as needed.
// For example:
// export function formatDate(dateString) { ... }
// export function sanitizeInput(inputString) { ... }
