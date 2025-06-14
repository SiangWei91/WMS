// js/login.js
document.addEventListener('DOMContentLoaded', function () {
  const loginForm = document.getElementById('login-form');
  const userIdInput = document.getElementById('userId');
  const passwordInput = document.getElementById('password');
  const errorMessageDiv = document.getElementById('error-message');

  const cloudFunctionUrl = 'https://us-central1-inventory-management-sys-b3678.cloudfunctions.net/loginWithCustomToken';

  // Ensure Firebase Auth is available
  if (typeof firebase === 'undefined' || typeof firebase.auth === 'undefined') {
      displayError('Firebase Auth is not loaded. Please check your setup.');
      // Disable form submission if Firebase is not ready
      if(loginForm) loginForm.querySelector('button[type="submit"]').disabled = true;
      return;
  }

  if (loginForm) {
      loginForm.addEventListener('submit', async function (event) {
          event.preventDefault();
          clearError(); // Clear previous errors

          const userId = userIdInput.value.trim();
          const password = passwordInput.value.trim();

          if (userId === '' || password === '') {
              displayError('User ID and Password cannot be empty.');
              return;
          }

          // Disable button during submission
          const loginButton = loginForm.querySelector('button[type="submit"]');
          loginButton.disabled = true;
          loginButton.textContent = 'Logging in...';

          try {
              const response = await fetch(cloudFunctionUrl, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ userId: userId, password: password })
              });

              // 修复：先读取响应内容，然后根据状态处理
              let responseData;
              try {
                  responseData = await response.json();
              } catch (parseError) {
                  console.error('Error parsing response:', parseError);
                  displayError('Server response could not be parsed. Please try again.');
                  return;
              }

              if (!response.ok) {
                  const errorMessage = responseData.error || responseData.details || 'Login request failed. Please try again.';
                  console.error('Cloud Function Error:', responseData);
                  console.error('Response status:', response.status);
                  displayError(errorMessage);
                  return;
              }

              if (responseData.token) {
                  // Step 2: Sign in with the custom token
                  try {
                      console.log('Attempting to sign in with custom token...');
                      const userCredential = await firebase.auth().signInWithCustomToken(responseData.token);
                      console.log('Custom token sign in successful:', userCredential.user.uid);
                      
                      // 等待一下确保状态更新
                      setTimeout(() => {
                          console.log('Redirecting to index.html...');
                          window.location.href = 'index.html';
                      }, 1000);
                  } catch (authError) {
                      console.error('Firebase signInWithCustomToken error:', authError);
                      displayError(`Login failed: ${authError.message}`);
                  }
              } else {
                  // Handle errors from the cloud function (e.g., invalid credentials)
                  displayError(responseData.error || 'Invalid User ID or Password.');
              }
          } catch (error) {
              // Handle network errors or other issues with the fetch call
              console.error('Cloud Function request error:', error);
              displayError('Login request failed. Please try again.');
          } finally {
              // Re-enable button
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
