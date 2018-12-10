import * as q from 'q';
import * as _ from 'lodash';
import AuthUtil from './utils/AuthenticationUtil';
import OAuthUtil from './utils/OAuthUtil';

const ERRORS = {// Errors which can be used to detect the reason
    login_failure: 'login_failure',
    account_locked: 'account_locked'
};

let portalName = '';

// METHODS
function login(authUtil, {username, password}) {
    const deferred = q.defer();
    fetch(`${portalName}/sso/oauth/authorize`, {
        method: 'POST',
        credentials: 'same-origin', // add cookies
        headers: {
            'Accept': 'text/html',
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `username=${username}&password=${password}&client_id=uaa`
    })
        .then((res) => {
            if (res.status === 403 && res.statusText.includes('locked')) {
                deferred.reject({
                    error: ERRORS.account_locked
                });
                return;
            }

            return authUtil.loginWithCurrentCookies(res);
        })
        .then((data) => {
            deferred.resolve(data);
        })
        .catch(() => {
            deferred.reject({
                error: ERRORS.login_failure
            });
        });

    return deferred.promise;
}

function logout(authUtil, oAuthUtil, oAuthConfig) {
    const xCenterSSOLogoutUrl = '/sso/logout';
    const authSolutionLogoutUrl = `${oAuthConfig.url}${oAuthConfig.endpoints.logout}?redirect=${encodeURIComponent(xCenterSSOLogoutUrl)}`;
    return fetch(authSolutionLogoutUrl, {
        mode: oAuthConfig.logoutMode,
        credentials: 'same-origin'// add cookies
    }).then((res) => {
        oAuthUtil.removeTokens();
        authUtil.emitLogoutEvent();
        return {
            res: res
        };
    });
}

// EXPORT
export default (oAuthConf) => {
    const authUtil = AuthUtil(oAuthConf);
    const oAuthUtil = OAuthUtil(oAuthConf);
    portalName = oAuthConf.portalName.toString();
    return {
        logout: _.partial(logout, authUtil, oAuthUtil, oAuthConf),
        login: _.partial(login, authUtil),
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
