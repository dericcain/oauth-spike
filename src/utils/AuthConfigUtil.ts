// TODO: Proprietary - Need to replace
import appFeatures from 'effective-features!';

export default {
    /**
     * Returns clientId (used in Auth server) based on the environment and available features
     * @param {String} clientIdBaseName - the default clientId used for a Portal
     * @param {Boolean} IS_DISTRIBUTION_BUILD - flag to separate /app (Dev) and distribution builds
     * @returns {String} the result clientId which should be matched with Auth server config
     */
    getPortalClientId(clientIdBaseName, IS_DISTRIBUTION_BUILD) {
        let resultClientId = clientIdBaseName; // default value

        const versionName = appFeatures.versionName;
        if (IS_DISTRIBUTION_BUILD && versionName) { // versionName available in dist environment
            resultClientId = `${clientIdBaseName}-${versionName}`;
        }

        return resultClientId;
    }
};
