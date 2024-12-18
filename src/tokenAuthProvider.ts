import { AuthProvider, fetchUtils } from 'ra-core';

export interface Options {
  obtainAuthTokenUrl: string;
  obtainUserInfoUrl: string;
}

const fetchAnonymousRouteAccess = (pathname:string)=>{
  const anonymousRoutes = [
    '/verify/token',
    'forgot/password',
  ]
  if(anonymousRoutes.includes(pathname)){
    return true
  }else{
    return false
  }
}

function tokenAuthProvider(options: Options): AuthProvider {
  return {
    login: async ({ username, password }) => {
      const request = new Request(options.obtainAuthTokenUrl, {
        method: 'POST',
        body: JSON.stringify({ username, password }),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      });
      const response = await fetch(request);
      if (response.status < 200 || response.status >= 300) {
        throw new Error(response.statusText);
      }
      const { token, id } = await response.json();
      localStorage.setItem('auth', JSON.stringify({ token, id }));

      // Fetch additional user data
      const authData = await fetchUserData(id, options);

      // Store the auth data in local storage
      localStorage.setItem('auth', JSON.stringify(authData));
    },
    logout: () => {
      localStorage.removeItem('auth');
      localStorage.removeItem('token'); // remove the obsolete 'token' item if it exists
      return Promise.resolve();
    },
    checkAuth: () => {
      const auth = localStorage.getItem('auth');
      localStorage.removeItem('token'); // remove the obsolete 'token' item if it exists
      return auth ? Promise.resolve() : Promise.reject();
    },
    checkError: (error) => {
      const status = error.status;
      if (status === 401 || status === 403) {
        localStorage.removeItem('auth');
        return Promise.reject();
      }
      return Promise.resolve();
    },
    getIdentity: async () => {
      const pathname = window.location.pathname
      if(fetchAnonymousRouteAccess(pathname)){
        return Promise.resolve({id:null, fullName: null, avatar: null});
      }
      try {
        // Fetch auth data from local storage
        const auth = JSON.parse(localStorage.getItem('auth') || '{}');
        const { id, token } = auth;

        // Check if auth data contains an id and a token
        if (!id || !token) {
          throw new Error('User is not logged in');
        }

        // Fetch additional user data
        const authData = await fetchUserData(id, options);
        // Store the auth data in local storage
        localStorage.setItem('auth', JSON.stringify(authData));
        const { fullName, avatar } = authData;
        return Promise.resolve({ id, fullName, avatar });
      } catch (error) {
        // Log the error and return a rejected Promise
        console.error('An error occurred:', error);
        return Promise.reject(error);
      }
    },
    getPermissions: () => {
      try {
        const pathname = window.location.pathname
        if(fetchAnonymousRouteAccess(pathname)){
          return Promise.resolve({ groups: [], user_permissions: [] });
        }
        const auth = localStorage.getItem('auth');
        if (auth) {
          const parsedAuth = JSON.parse(auth);
          if (parsedAuth && parsedAuth.groups && parsedAuth.user_permissions) {
            return Promise.resolve({ groups: parsedAuth.groups, user_permissions: parsedAuth.user_permissions });
          } else {
            throw new Error('Invalid auth data in local storage');
          }
        } else {
          throw new Error('No auth data in local storage');
        }
      } catch (error) {
        return Promise.reject(error);
      }
    },
  };
}

export function createOptionsFromToken() {
  const auth = localStorage.getItem('auth');
  if (!auth) {
    return {};
  }
  const { token } = JSON.parse(auth);
  return {
    user: {
      authenticated: true,
      token: 'Token ' + token,
    },
  };
}
async function fetchUserData(id: string, options: Options) {
  // Fetch the token from local storage
  const auth = JSON.parse(localStorage.getItem('auth') || '{}');
  const token = auth.token;

  // Fetch additional user data
  const userRequest = new Request(`${options.obtainUserInfoUrl}${id}/`, {
    method: 'GET',
    headers: new Headers({
      'Content-Type': 'application/json',
      Authorization: `token ${token}`,
    }),
  });
  const userResponse = await fetch(userRequest);
  const userData = await userResponse.json();

  // Combine the token, id, and user data into a single object
  const authData = {
    token,
    ...userData,
  };

  return authData;
}
export function fetchJsonWithAuthToken(url: string, options: object) {
  const pathname = window.location.pathname
  if(fetchAnonymousRouteAccess(pathname)){
    return true
  }
  return fetchUtils.fetchJson(
    url,
    Object.assign(createOptionsFromToken(), options)
  );
}

export default tokenAuthProvider;
