import q from 'q';

// VARS
const TIMEOUT_BEFORE_LISTENER_REJECT = 10000;// time before the postmessage is expected to be sent (in ms)

// METHODS
/**
 * Waits till the post message is sent to the channel name
 * @param {String} channelName
 * @returns {q.Promise}
 */
function waitForPostMessage(channelName) {
    const deferred = q.defer();

    // timeout
    const waitTimeout = setTimeout(() => {
        removePostMessageListener();// remove the listener (cleaning)
        deferred.reject();
    }, TIMEOUT_BEFORE_LISTENER_REJECT);

    // HELPERS
    function removePostMessageListener() {
        window.removeEventListener('message', onPostMessage);// cleaning
    }

    function onPostMessage(event) {
        if (event.data && event.data[channelName]) {
            const postmessageData = event.data[channelName];

            clearTimeout(waitTimeout);// clear the timeout (cleaning)
            removePostMessageListener();// remove the listener (cleaning)
            deferred.resolve(postmessageData);
        }
    }

    // INIT
    window.addEventListener('message', onPostMessage);// start listening

    return deferred.promise;
}

// EXPORT
export default {
    waitForPostMessage
};