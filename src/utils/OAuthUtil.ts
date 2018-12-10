import * as queryString from 'query-string';
import iframeUtil from './IframeUtil/index';
import postMessageUtil from './PostMessageUtil';
import * as q from 'q';
import * as _ from 'lodash';
import jwtHelper from './JwtHelper';
import AuthenticationService from '../AuthenticationService';

// VARS
const tokens = {};
let nonceValue = '';
let stateValue = '';
let tokensSetDeferred = q.defer();
let tokenRefreshTimer: any;
let oAuthConfig: any;
const refreshTimeOffset = 100e3; // 100 seconds prior to token expiration we want to request a new token

const ERRORS = {// Errors which can be used to detect the reason
    notLoggedIn: 'notLoggedIn',
    loginError: 'checkIfLoggedInError',
    fullPageRedirectRequired: 'fullPageRedirectRequired'
};

// METHODS
/**
 * Leaves only guidewire.edge authorities
 *
 * @param {Array} authorities
 * @returns {Array.<String>}
 */
function filterScopeAuthorities(authorities: string[]) {
    // some auth servers (e.g. Auth0) pass authorities as an array rather than as a string (e.g. UAA)
    if (!Array.isArray(authorities)) {
        authorities = authorities.split(' ');
    }
    return authorities.filter((authority) => {
        return authority.includes('guidewire.edge');
    });
}

function scheduleTokenRefreshReq(stateParam, currentToken) {
    const currentTokenExpiryWindowSecs = currentToken.exp - currentToken.iat;
    const currentTokenExpiryWindowMilliSecs = currentTokenExpiryWindowSecs * 1000;
    if (tokenRefreshTimer) {
        window.clearTimeout(tokenRefreshTimer);
    }
    tokenRefreshTimer = window.setTimeout(() => {
        requestAccessToken(oAuthConfig.clientId, stateParam).catch(() => {
            AuthenticationService(oAuthConfig).logout();
        });
    }, currentTokenExpiryWindowMilliSecs - refreshTimeOffset);

}

function setTokensFromUrlHash(parsedHash) {
    // uaa validates using nonce
    if (oAuthConfig.validate === 'nonce' && parsedHash.nonce !== nonceValue) {
        throw new Error('nonce value of token does not match the value used in request');
    }
    // auth0 validates using nonce
    if (oAuthConfig.validate === 'state' && parsedHash.state !== stateValue) {
        throw new Error('state value of token does not match the value used in request');
    }
    tokens.accessToken = parsedHash.access_token;
    const scopeAuthorities = filterScopeAuthorities(parsedHash.scope.split(' '));

    if (!tokens.accessToken && !scopeAuthorities.length) {
        tokensSetDeferred.reject(tokens);
        throw new Error('Expecting to set an access token or authorities or both');
    }
    tokensSetDeferred.resolve(tokens);
    return tokens;
}

function getAuthorizeUrl(stateParam) {
    function generateNonce() {
        let nonce = '';
        const nonceLength = 16;
        const possibleChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < nonceLength; i++) {
            nonce += possibleChars.charAt(Math.floor(Math.random() * possibleChars.length));
        }
        return nonce;
    }

    nonceValue = generateNonce();

    const params = {
        response_type: 'token',
        client_id: oAuthConfig.clientId,
        nonce: nonceValue
    };

    if (oAuthConfig.redirectUrl) {
        let currentOrigin = window.location.origin;
        if (!currentOrigin) {
            const port = window.location.port ? (`:${window.location.port}`) : '';
            currentOrigin = `${window.location.protocol}//${window.location.hostname}${port}`;
        }
        params.redirect_uri = `${currentOrigin}${oAuthConfig.redirectUrl}`;
    }
    if (oAuthConfig.audience) {
        params.audience = oAuthConfig.audience;
    }
    if (oAuthConfig.scope) {
        params.scope = oAuthConfig.scope;
    }

    stateValue = nonceValue;
    if (stateParam) {
        stateValue = `|${stateParam}`;
    }
    params.state = stateValue;

    const serializedParams = queryString.stringify(params);

    return `${oAuthConfig.url}${oAuthConfig.endpoints.authorize}?${serializedParams}`;
}

function requestAccessToken(stateParam) {
    const authorizeUrl = getAuthorizeUrl(stateParam);
    const deferred = q.defer();
    const LOGIN_POSTMESSAGE_CHANNEL_NAME = 'login-redirect-data';// used on both login-redirect page as well
    const LOGGED_USER_REDIRECT_URL = 'login-redirect.html';// expected URL to be redirected when user is logged in

    const iframeConfig = {
        src: authorizeUrl,
        expectedSrcPartOnLoad: LOGGED_USER_REDIRECT_URL
    };

    // Some auth solutions will always redirect to the login page unless a parameter is added to the url.
    // If so we attempt to call with the parameter. If that fails (user not logged in) then we will use the url without the parameter (i.e. the failureRedirectUrl)
    if (oAuthConfig.silentLoginParam) {
        const authorizeUrlWithoutPrompt = `${getAuthorizeUrl(stateParam)}&${oAuthConfig.silentLoginParam}`; // call the function again to get a different nonce
        iframeConfig.src = authorizeUrlWithoutPrompt;
        iframeConfig.failureRedirectUrl = authorizeUrl;
    }
    const loadIframeForTokens = iframeUtil.loadIframe(iframeConfig).then((iframeData) => {
        iframeData.clearIframeArtifacts();// cleaning
        return iframeData;
    });

    const setTokensFromIframe = postMessageUtil
        .waitForPostMessage(LOGIN_POSTMESSAGE_CHANNEL_NAME)
        .then((loginRedirectHash) => {
            return setTokensFromUrlHash(queryString.parse(loginRedirectHash));
        });

    // waits till the Auth page is loaded
    // in iframe with possible redirect if user is logged in,
    // which in turn triggers postmessage with tokens,
    // so the promise waits till the postmessage is received as well.
    // After that tokens are assigned
    q.all([
        loadIframeForTokens,
        setTokensFromIframe
    ]).then(([, oAuthToken]) => {
        deferred.resolve({
            res: oAuthToken
        });
        scheduleTokenRefreshReq(stateParam, jwtHelper.decodeToken(oAuthToken.accessToken));
    }, (err) => {
        let resultError = {// default
            error: ERRORS.loginError
        };
        if (err) {
            if (err.authorizeWithoutIFrame) {
                resultError = {
                    error: ERRORS.notLoggedIn,
                    redirect: getAuthorizeUrl(stateParam)
                };
            } else if (err.fullPageRedirectRequired) {
                resultError = {
                    error: ERRORS.notLoggedIn,
                    redirect: err.fullPageRedirectRequired
                };
            } else if (err.error && err.error === iframeUtil.ERRORS.expectedSrcPartOnLoad) {
                resultError = {
                    error: ERRORS.notLoggedIn
                };
            }
        }
        deferred.reject(resultError);
    });

    return deferred.promise;
}

function removeTokens() {
    const tokenOrigin = jwtHelper.decodeToken(tokens.accessToken).origin;
    delete tokens.accessToken;
    delete tokens.authorities;
    nonceValue = '';
    stateValue = '';
    tokensSetDeferred = q.defer();
    if (tokenRefreshTimer) {
        window.clearTimeout(tokenRefreshTimer);
    }
    return tokenOrigin;
}

function waitTokensSet() {
    return tokensSetDeferred.promise;
}


// EXPORT
export default (oAuth: any) => {
    oAuthConfig = oAuth;
    return {
        requestAccessToken: _.partial(requestAccessToken, oAuth.refreshRedirectPage),
        removeTokens,
        waitTokensSet,
        filterScopeAuthorities
    };
};
