import AuthenticationService from '../AuthenticationService';

let inactivityTimerId;
let logoutConfirmationTimerId;

export default ({
    oAuthConfig, logoutWarningCallback, inactivityIntervalMins = 5, logoutConfirmationIntervalMins = 1
}) => {

    const authenticationService = AuthenticationService(oAuthConfig);

    function initializeInActivityTimer() {
        let warningModal;
        const inactivityInterval = inactivityIntervalMins * 1000 * 60;
        // initial timer to check for inactivity
        inactivityTimerId = window.setTimeout(() => {
            const logoutConfirmationInterval = logoutConfirmationIntervalMins * 1000 * 60;

            // second timer to show warning message for a period of time
            logoutConfirmationTimerId = window.setTimeout(() => {
                warningModal.close();
                authenticationService.logout();
            }, logoutConfirmationInterval);
            warningModal = logoutWarningCallback(resetInactivityTimer);

        }, inactivityInterval);
    }

    function resetInactivityTimer() {
        deactivateTimers();
        initializeInActivityTimer();
    }

    function deactivateTimers() {
        if (inactivityTimerId) {
            window.clearTimeout(inactivityTimerId);
            inactivityTimerId = null;
        }
        if (logoutConfirmationTimerId) {
            window.clearTimeout(logoutConfirmationTimerId);
            logoutConfirmationTimerId = null;
        }
    }

    authenticationService.onLoginStateChange((authData) => {
        const authtenticatedFlag = authData.isLoggedIn;
        if (authtenticatedFlag) {
            // kick off a timer when user logs in
            resetInactivityTimer();
        } else {
            // if user has logged out then deactive the timers
            deactivateTimers();
        }
    });

    return {
        // this method is called by the transport service, called every time the user makes an XHR call to the backend -
        resetInactivityTimer: resetInactivityTimer
    };
};