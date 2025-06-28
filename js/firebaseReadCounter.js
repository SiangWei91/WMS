// js/firebaseReadCounter.js

let readCount = 0;
const bubbleReadCountElement = document.getElementById('firebase-read-count');

/**
 * Updates the displayed read count in the floating bubble.
 */
function updateBubbleDisplay() {
  if (bubbleReadCountElement) {
    bubbleReadCountElement.textContent = readCount;
  }
}

/**
 * Increments the Firebase read counter and updates the display.
 * @param {number} count - The number of reads to add (defaults to 1).
 */
export function incrementReadCount(count = 1) {
  readCount += count;
  updateBubbleDisplay();
  // console.log(`Firebase reads: ${readCount}`); // For debugging
}

/**
 * Gets the current read count.
 * @returns {number} The current read count.
 */
export function getReadCount() {
  return readCount;
}

/**
 * Initializes the read counter.
 * (Currently just ensures the display is 0, could be expanded later if needed)
 */
export function initializeReadCounter() {
  readCount = 0;
  updateBubbleDisplay();
}

// Initialize display on script load
// Ensure DOM is ready before trying to access bubbleReadCountElement
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateBubbleDisplay);
} else {
    updateBubbleDisplay();
}
