import q from 'q';
import OAuthUtil from './OAuthUtil';
import EventEmitter from 'eventemitter2';
import BaseTransportService from 'gw-portals-transport-js';
import _ from 'lodash';
import iframeUtil from './IframeUtil/index';

let loginResult = q.defer();

const authStatusListeners = [];
// an alternative to registering a listener with AuthenticationService is to listen for loginState::change events
const authUtilEmitter = new EventEmitter.EventEmitter2({
    wildcard: true,
    delimiter: '::',
    maxListeners: 0
});

const ERRORS = {// Errors which can be used to detect the reason
    notLoggedIn: 'notLoggedIn',
    loginError: 'checkIfLoggedInError',
    invalidTokenOrEmail: 'checkIfLoggedInError',
    autoLoginError: 'autoLoginError',
    userAlreadyExists: 'userAlreadyExists',
    emailNotFound: 'emailNotFound'
};

function _emitLoginStateChangeEvent(authData) {
    authUtilEmitter.emit('loginState::change', authData);
    authStatusListeners.forEach(listener => listener(authData));
}

// METHODS
function emitLoginEvent(userData) {
    // auth0 and uaa use a different property for user name
    userData.user_name = userData.user_name || userData.name;
    const authData = {
        isLoggedIn: true,
        userData: userData
    };
    _emitLoginStateChangeEvent(authData);
}

function emitLogoutEvent(evtData) {
    const authData = {
        isLoggedIn: false,
        userData: null,
        evtData
    };
    loginResult = q.defer();
    loginResult.reject();
    _emitLoginStateChangeEvent(authData);
}

function addLoginStateChangeListener(listener) {
    authStatusListeners.push(listener);
}

function testForOAuthToken(oAuthUtil) {
    return oAuthUtil.requestAccessToken();
}

function getUserInfo(oAuthUtil, oAuthConfig) {
    return oAuthUtil.waitTokensSet()
        .then(tokens => {
            return fetch(oAuthConfig.url + oAuthConfig.endpoints.userinfo, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${tokens.accessToken}`
                }
            })
                .then((response) => response.json());
        });
}

function loginWithCurrentCookies(oAuthUtil, oAuthConfig) {
    loginResult = q.defer();
    return testForOAuthToken(oAuthUtil)
        .then(_.partial(getUserInfo, oAuthUtil, oAuthConfig))
        .then(data => {
            emitLoginEvent(data);
            return data;
        })
        .then(res => {
            loginResult.resolve(res);
            return res;
        })
        .catch(err => {
            if (err && err.redirect) {
                // go to external login page
                window.location.href = err.redirect;
                return;
            }
            loginResult.reject(err);
            throw err;
        });
}

function forgotPassword(email) {
    const deferred = q.defer();
    const authResetPath = '#/auth/resetpassword';
    const newPasswordEntryUrl = `${window.location.origin}${window.location.pathname}${authResetPath}`;
    const headers = {
        'Content-Type': 'application/json'
    };
    const params = [{
        email,
        newPasswordEntryUrl
    }];

    BaseTransportService.send('/resetpassword', headers, 'sendPasswordToken', params)
        .then((res) => {
            deferred.resolve({
                res: res
            });
        })
        .catch(error => {
            const errorCode = error.error.message.match(/[0-9]+/);
            // email does not exists when error message return code 404
            if (errorCode && errorCode[0] === '404') {
                deferred.reject({
                    error: ERRORS.emailNotFound
                });
            } else {
                deferred.reject(error);
            }
        });
    return deferred.promise;
}

function changePassword({code, new_password}) { // eslint-disable-line camelcase
    const deferred = q.defer();
    const headers = {
        'Content-Type': 'application/json'
    };
    const params = [{
        code,
        new_password
    }];

    BaseTransportService.send('/resetpassword', headers, 'newPassword', params)
        .then((data) => {
            deferred.resolve(data);
        })
        .catch((error) => {
            const errorCode = error.error.message.match(/[0-9]+/);
            // invalid token or password returns error message code 422
            if (errorCode && errorCode[0] === '422') {
                deferred.reject({
                    error: ERRORS.invalidTokenOrEmail
                });
            } else {
                deferred.reject(error);
            }
        });

    return deferred.promise;
}

function signUp({
    givenName, familyName, userName, email, password
}) {
    const deferred = q.defer();
    const headers = {
        'Content-Type': 'application/json'
    };
    const params = [{
        'name': {
            givenName,
            familyName
        },
        'emails': [{
            'value': email,
            'primary': true
        }],
        userName,
        password
    }];

    BaseTransportService.send('/signup', headers, 'createUser', params)
        .then(res => {
            deferred.resolve({
                res: res
            });
        })
        .catch(error => {
            const errorCode = error.error.message.match(/[0-9]+/);
            // user already exists if error message return code 409
            if (errorCode && errorCode[0] === '409') {
                deferred.reject({
                    error: ERRORS.userAlreadyExists
                });
            } else {
                deferred.reject(error);
            }
        });

    return deferred.promise;
}

function verifyResetCode(code) {
    const deferred = q.defer();

    iframeUtil.loadIframe({
        src: `/reset_password?code=${code}`
    }).then((iframeData) => {
        const codeIframeInput = iframeData.iframeDoc.querySelector('[name="code"]');
        const newCode = codeIframeInput.value;
        iframeData.clearIframeArtifacts();// cleaning
        deferred.resolve({
            res: newCode
        });
    }).catch(() => {
        deferred.reject();
    });

    return deferred.promise;
}

// EXPORT'
export default (oAuthConfig) => {
    const oAuthUtil = OAuthUtil(oAuthConfig);
    return {
        ERRORS,
        testForOAuthToken: _.partial(testForOAuthToken, oAuthUtil),
        emitLoginEvent,
        emitLogoutEvent,
        addLoginStateChangeListener,
        loginWithCurrentCookies: _.partial(loginWithCurrentCookies, oAuthUtil, oAuthConfig),
        waitForLoginRequestComplete: loginResult.promise,
        forgotPassword: forgotPassword,
        changePassword: changePassword,
        signUp,
        verifyResetCode
    };
};
