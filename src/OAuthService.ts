import OAuthUtil from './utils/OAuthUtil';
import jwtHelper from './utils/JwtHelper';
import * as q from 'q';

// Injecting "oAuth" here...
// EXPORT
const provider = (oAuth) => {
  const oAuthUtil = OAuthUtil(oAuth);
  return {
    refreshAccessToken: () => {
      oAuthUtil.removeTokens();
      return oAuthUtil.requestAccessToken();
    },

    get accessToken() {
      return oAuthUtil.waitTokensSet()
        .then((tokens) => {
          return tokens.accessToken;
        });
    },

    get accessTokenDecoded() {
      return oAuthUtil.waitTokensSet()
        .then((tokens) => {
          return jwtHelper.decodeToken(tokens.accessToken);
        });
    },

    get grantedAuthorities() {
      const deferred = q.defer();

      oAuthUtil.waitTokensSet()
        .then((tokens) => {
          const isAuthenticated = tokens.accessToken && !jwtHelper.isTokenExpired(tokens.accessToken);

          if (!isAuthenticated) {
            deferred.resolve([]);
            return;
          }

          const scopes = jwtHelper.decodeToken(tokens.accessToken).scope;

          const scopeAuthorities = oAuthUtil.filterScopeAuthorities(scopes);

          deferred.resolve(scopeAuthorities.map(scope => {
            const authorityRegex = /^guidewire\.edge\.(.*)\.(.*)\.(.*)$/g;
            const match = authorityRegex.exec(scope);
            return {
              authorityType: match[1].toUpperCase(),
              value: match[2],
              authorityLevel: match[3]
            };
          }));
        })
        .catch(() => {
          deferred.resolve([]);
        });

      return deferred.promise;
    }
  };
};

export default provider;
