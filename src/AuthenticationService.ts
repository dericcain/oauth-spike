import * as q from 'q';
import * as queryString from 'query-string';
import * as _ from 'lodash';
import BaseTransportService from 'gw-portals-transport-js';
import iframeUtil from './utils/IframeUtil/index';
import OAuthUtil from './utils/OAuthUtil';
import AuthUtil from './utils/AuthenticationUtil';

const ERRORS = {// Errors which can be used to detect the reason
    login_failure: 'login_failure',
    account_locked: 'account_locked'
};

// METHODS
/**
 * If user is not logged in and iframe is loaded properly-
 * returns an XUaaCsrf value and sets a "XUaaCsrf" cookie
 *
 * @returns {Promise}
 */
function _getXUaaCsrf() {
    const deferred = q.defer();
    iframeUtil.loadIframe({
        src: '/login',
        expectedSrcPartOnLoad: '/login' // detect isn't redirected (not logged in already)
    }).then((iframeData) => {
        const XUaaCsrfIframeInput = iframeData.iframeDoc.querySelector('[name="X-Uaa-Csrf"]');
        const XUaaCsrf = XUaaCsrfIframeInput.value;
        deferred.resolve({
            res: XUaaCsrf
        });
        iframeData.clearIframeArtifacts();// cleaning

    }).catch(() => {
        deferred.reject();
    });

    return deferred.promise;
}

function _sendLoginRequest(XUaaCsrf, username, password) {
    return fetch('/login.do', {
        method: 'POST',
        credentials: 'same-origin', // add cookies
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `username=${username}&password=${password}&X-Uaa-Csrf=${XUaaCsrf}`
    }).then((res) => {
        const urlQueryString = queryString.extract(res.url);
        const urlQueryParams = queryString.parse(urlQueryString);
        const urlQueryError = urlQueryParams.error;

        if (!urlQueryError) { // if there is no errors
            return res;
        }

        // noinspection UnnecessaryLocalVariableJS
        const loginError = {
            error: urlQueryError // reflected in the ERRORS variable
        };

        throw loginError;// trigger the Promise reject
    });
}

// METHODS
function logout(authUtil, oAuthUtil, oAuthConfig) {
    // singlelogout and logout.do are related but independent.
    oAuthUtil.waitTokensSet()
        .then((tokens) => {
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokens.accessToken}`
            };
            // TODO: What is this base transport service?
            BaseTransportService.send('/singlelogout', headers, 'logout'); // destroy all user's tokens (if enabled in backend).
        });
    return fetch(oAuthConfig.url + oAuthConfig.endpoints.logout, { // call logout endpoint to signal that auth session should be destroyed
        mode: oAuthConfig.logoutMode,
        credentials: 'same-origin'// add cookies
    }).then((res) => {
        const origin = oAuthUtil.removeTokens();
        authUtil.emitLogoutEvent({origin});
        return {
            res: res
        };
    });
}

function loginWithGoogle(authUtil) {
    // first try to retrieve a token so that we will be redirected back to the correct page after authentication
    return authUtil.testForOAuthToken().catch(() => {
        // not authenticated so load the login page and get the 'login with google' link
        return iframeUtil.loadIframe({
            src: '/login',
            expectedSrcPartOnLoad: '/login' // detect isn't redirected (not logged in already)
        }).then((iframeData) => {
            // go to the google authorize url
            const googleLoginLink = iframeData.iframeDoc.querySelector('a[href^="https://accounts.google.com/o/oauth2"]');
            window.top.location.href = googleLoginLink.href;
            iframeData.clearIframeArtifacts();// cleaning
        });
    });

}

function login(authUtil, {username, password}) {
    return _getXUaaCsrf()
        .then((data) => {
            return _sendLoginRequest(data.res, username, password);
        })
        .then(authUtil.loginWithCurrentCookies);
}

// EXPORT
export default (oAuthConfig) => {
    const authUtil = AuthUtil(oAuthConfig);
    const oAuthUtil = OAuthUtil(oAuthConfig);
    return {
        logout: _.partial(logout, authUtil, oAuthUtil, oAuthConfig),
        login: _.partial(login, authUtil),
        loginWithGoogle: _.partial(loginWithGoogle, authUtil),
        forgotPassword: authUtil.forgotPassword,
        changePassword: authUtil.changePassword,
        signUp: authUtil.signUp,
        verifyResetCode: authUtil.verifyResetCode,
        testForOAuthToken: authUtil.testForOAuthToken,
        onLoginStateChange: authUtil.addLoginStateChangeListener,
        loginWithCurrentCookies: authUtil.loginWithCurrentCookies,
        waitForLoginRequestComplete: authUtil.waitForLoginRequestComplete,
        ERRORS: {
            tokens: authUtil.ERRORS,
            auth: ERRORS
        }
    };
};
