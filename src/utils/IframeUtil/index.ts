import q from 'q';

// VARS
const TIMEOUT_BEFORE_IFRAME_REJECT = 10000;// time before the iframe is expected to be loaded (in ms)

const ERRORS = {// Errors which can be used to detect the reason
    loadTimeout: 'loadTimeout',
    expectedSrcPartOnLoad: 'expectedSrcPartOnLoad',
    iframeLoadError: 'iframeLoadError'
};

// HELPERS
function getIframeData(iframeEl, loadTimeout) {
    const iframeData = {};
    iframeData.iframeEl = iframeEl;
    iframeData.iframeDoc = iframeEl.contentDocument || iframeEl.contentWindow.document;
    iframeData.iframeWin = iframeEl.contentWindow || iframeEl;
    iframeData.iframeWrapper = iframeEl.parentNode;
    iframeData.clearIframeArtifacts = clearIframeArtifacts.bind(null, iframeEl, loadTimeout);// should be used for cleaning
    return iframeData;
}

function removeIframe(iframeEl) {
    const iframeWrapper = iframeEl.parentNode;
    document.body.removeChild(iframeWrapper);// remove appended nodes
}

/**
 * @param {Object} iframeEl
 * @param {Number} loadTimeout
 */
function clearIframeArtifacts(iframeEl, loadTimeout) {
    iframeEl.onload = null;
    iframeEl.onerror = null;
    clearTimeout(loadTimeout);
    removeIframe(iframeEl);
}

// METHODS
/**
 * Loads a new iframe.
 * Iframe artifacts are cleaned on reject, on resolve should be manually removed from the Promise usage
 *
 * @param {String} src
 * @param {String} [expectedSrcPartOnLoad]
 * @returns {q.promise}
 * @returns {String} {q.Promise.error} If present- describes why Promise is rejected
 */
function loadIframe({src, expectedSrcPartOnLoad, failureRedirectUrl}) {
    const deferred = q.defer();

    const iframeEl = document.createElement('iframe');
    const iframeWrapper = document.createElement('div');
    iframeWrapper.classList.add(styles.hiddenIframe);
    iframeWrapper.appendChild(iframeEl);

    // Promise with timeout rejections
    // timeout
    const loadTimeout = setTimeout(() => {
        clearIframeArtifacts(iframeEl, loadTimeout);
        deferred.reject({error: ERRORS.loadTimeout});
    }, TIMEOUT_BEFORE_IFRAME_REJECT);

    // on iframe changes the state
    iframeEl.onload = () => {
        let iframe;
        try {
            iframe = getIframeData(iframeEl, loadTimeout);
        } catch (e) {
            clearIframeArtifacts(iframeEl, loadTimeout);
            if (e instanceof DOMException) {
                deferred.reject({
                    authorizeWithoutIFrame: true
                });
                return;
            }
            console.error(e);
            deferred.reject();
            return;
        }
        if (!iframe.iframeDoc.querySelector('meta[content="Cloud Foundry"],meta[content="Guidewire"]')) {
            // not redirected to a UAA page so must be an external IDP Page
            clearIframeArtifacts(iframeEl, loadTimeout);
            deferred.reject({
                fullPageRedirectRequired: iframe.iframeDoc.URL
            });
            return;
        }
        if (expectedSrcPartOnLoad) {
            // check if the src meets expectations (e.g. iframe was redirected)
            if (!iframe.iframeWin.location.href.includes(expectedSrcPartOnLoad)) {
                clearIframeArtifacts(iframeEl, loadTimeout);
                deferred.reject({error: ERRORS.expectedSrcPartOnLoad});
                return;
            }
            if (iframe.iframeWin.location.href.includes('error')) {
                clearIframeArtifacts(iframeEl, loadTimeout);
                deferred.reject({
                    fullPageRedirectRequired: failureRedirectUrl
                });
                return;
            }
        }

        deferred.resolve(getIframeData(iframeEl, loadTimeout));
    };
    iframeEl.onerror = () => {
        clearIframeArtifacts(iframeEl, loadTimeout);
        deferred.reject({error: ERRORS.iframeLoadError});
    };

    // start loading
    iframeEl.src = src;
    document.body.appendChild(iframeWrapper);

    return deferred.promise;
}

// EXPORT
export default {
    loadIframe,
    ERRORS
};
