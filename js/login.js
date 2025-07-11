// js/login.js
document.addEventListener('DOMContentLoaded', function () {
    const loginForm = document.getElementById('login-form');
    const userIdInput = document.getElementById('userId');
    const passwordInput = document.getElementById('password');
    const errorMessageDiv = document.getElementById('error-message');
  
    const cloudFunctionUrl = 'https://us-central1-inventory-management-sys-b3678.cloudfunctions.net/loginWithCustomToken';
  
    if (typeof firebase === 'undefined' || typeof firebase.auth === 'undefined') {
        displayError('Firebase Auth is not loaded. Please check your setup.');
        if(loginForm) loginForm.querySelector('button[type="submit"]').disabled = true;
        return;
    }
  
    if (loginForm) {
        loginForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            clearError(); 
  
            const userId = userIdInput.value.trim();
            const password = passwordInput.value.trim();
  
            if (userId === '' || password === '') {
                displayError('User ID and Password cannot be empty.');
                return;
            }
  
            const loginButton = loginForm.querySelector('button[type="submit"]');
            loginButton.disabled = true;
            loginButton.textContent = 'Logging in...';
  
            try {
                const response = await fetch(cloudFunctionUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: userId, password: password })
                });
  
                let responseData;
                try {
                    responseData = await response.json();
                } catch (parseError) {
                    console.error('Error parsing response:', parseError);
                    displayError('Server response could not be parsed. Please try again.');
                    loginButton.disabled = false; loginButton.textContent = 'Login';
                    return;
                }
  
                if (!response.ok) {
                    const errorMessage = responseData.error || responseData.details || 'Login request failed. Please try again.';
                    console.error('Cloud Function Error:', responseData, 'Status:', response.status);
                    displayError(errorMessage);
                    loginButton.disabled = false; loginButton.textContent = 'Login';
                    return;
                }
  
                if (responseData.token) {
                    try {
                        console.log('Attempting to sign in with custom token...');
                        const userCredential = await firebase.auth().signInWithCustomToken(responseData.token);
                        console.log('Custom token sign in successful, UID from credential:', userCredential.user.uid);
                        console.log('Setting up onAuthStateChanged listener for redirection...');
  
                        const unsubscribe = firebase.auth().onAuthStateChanged(async user => { // Made async
                            if (user) {
                                console.log('onAuthStateChanged: User signed in:', user.uid);
                                
                                let displayName = user.uid; // Default to UID
                                try {
                                    const idTokenResult = await user.getIdTokenResult(true); 
                                    if (idTokenResult.claims.name) {
                                        displayName = idTokenResult.claims.name;
                                        console.log('Login: User display name from claims:', displayName);
                                    } else {
                                        console.log('Login: Name claim not found, using UID for sessionStorage.');
                                    }
                                } catch (error) {
                                    console.error('Login: Error getting ID token result:', error);
                                }
                                
                                try {
                                    const idToken = await user.getIdToken();
                                    sessionStorage.setItem('supabaseToken', idToken);
                                    console.log('Supabase token stored in sessionStorage.');

                                    sessionStorage.setItem('isAuthenticated', 'true');
                                    sessionStorage.setItem('loggedInUser', displayName); // Use displayName
                                    
                                    unsubscribe(); 
  
                                    console.log('Redirecting to index.html from onAuthStateChanged...');
                                    window.location.href = 'index.html';

                                } catch (idTokenError) {
                                    console.error('Error getting ID token:', idTokenError);
                                    displayError('Failed to retrieve user session token. Please try again.');
                                    unsubscribe();
                                    loginButton.disabled = false;
                                    loginButton.textContent = 'Login';
                                    return; // Stop further execution in this callback
                                }
                            } else {
                                console.error('onAuthStateChanged: User is null, login might have failed post-credential.');
                                unsubscribe(); 
                                displayError('Login confirmation failed. Please try again.'); 
                                loginButton.disabled = false; 
                                loginButton.textContent = 'Login';
                            }
                        });
  
                        // Reduced timeout as getIdToken() should be relatively quick
                        // and we want to catch failures faster if onAuthStateChanged doesn't proceed.
                        const authStateTimeout = setTimeout(() => {
                            unsubscribe(); 
                            if (!sessionStorage.getItem('isAuthenticated')) {
                                console.warn('onAuthStateChanged timeout or did not complete successfully. Login may have failed.');
                                // Ensure error is displayed and button is re-enabled if not already handled by other error paths.
                                if (loginButton && !loginButton.disabled) { // Check if loginButton is accessible and not already enabled
                                    // This case might be redundant if other errors already cover it, but acts as a fallback.
                                    // displayError('Login process timed out. Please try again.'); // Avoid double messaging if possible
                                    // loginButton.disabled = false; 
                                    // loginButton.textContent = 'Login';
                                }
                            }
                        }, 3000); // Reduced timeout to 3 seconds
  
                    } catch (authError) {
                        console.error('Firebase signInWithCustomToken error:', authError);
                        displayError(`Login failed: ${authError.message}`);
                        loginButton.disabled = false;
                        loginButton.textContent = 'Login';
                    }
                } else {
                    displayError(responseData.error || 'Invalid User ID or Password.');
                    loginButton.disabled = false;
                    loginButton.textContent = 'Login';
                }
            } catch (error) {
                console.error('Cloud Function request error:', error);
                displayError('Login request failed. Please try again.');
                loginButton.disabled = false;
                loginButton.textContent = 'Login';
            }
        });
    }
  
    function displayError(message) {
        if (errorMessageDiv) {
            errorMessageDiv.textContent = message;
            errorMessageDiv.style.display = 'block';
        }
    }
  
    function clearError() {
        if (errorMessageDiv && errorMessageDiv.style.display === 'block') {
            errorMessageDiv.textContent = '';
            errorMessageDiv.style.display = 'none';
        }
    }
  
    if (userIdInput) userIdInput.addEventListener('input', clearError);
    if (passwordInput) passwordInput.addEventListener('input', clearError);
  });
