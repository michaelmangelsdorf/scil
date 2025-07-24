// to_gemini/public/help-modal.js

// Function to initialize the help modal for a given app
export const initializeHelpModal = (appHelpHtmlPath) => {
    const helpAppIcon = document.querySelector('.help-app-icon');
    const appHelpModal = document.getElementById('app-help-modal');
    // Ensure this element exists in your HTML within .app-help-modal-content
    const appHelpModalContentInner = appHelpModal ? appHelpModal.querySelector('.app-help-modal-content-inner') : null; 
    const appHelpCloseButton = appHelpModal ? appHelpModal.querySelector('.app-help-close-button') : null;

    if (!helpAppIcon || !appHelpModal || !appHelpModalContentInner || !appHelpCloseButton) {
        console.error('Help modal elements not found. Ensure help-app-icon, app-help-modal, app-help-modal-content-inner, and app-help-close-button exist in HTML.');
        return;
    }

    let helpContentLoaded = false; // Flag to load content only once

    // Show the modal
    const showModal = async () => {
        if (!helpContentLoaded) {
            try {
                // Fetch content from the app-specific help.html
                const response = await fetch(appHelpHtmlPath);
                if (!response.ok) {
                    throw new Error(`Failed to load help content: ${response.statusText}`);
                }
                const htmlContent = await response.text();
                appHelpModalContentInner.innerHTML = htmlContent;
                helpContentLoaded = true;
            } catch (error) {
                console.error('Error loading help content:', error);
                appHelpModalContentInner.innerHTML = `<p style="color: red;">Error loading help content: ${error.message}</p>`;
            }
        }
        appHelpModal.style.display = 'flex'; // Use flex to show and center
    };

    // Hide the modal
    const hideModal = () => {
        appHelpModal.style.display = 'none';
    };

    // Event listeners
    helpAppIcon.addEventListener('click', showModal);
    appHelpCloseButton.addEventListener('click', hideModal);

    // Close when clicking outside the modal content
    appHelpModal.addEventListener('click', (event) => {
        if (event.target === appHelpModal) {
            hideModal();
        }
    });
};