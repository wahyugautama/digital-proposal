const LOCAL_APP_URL = 'http://localhost:4321';

export const getPublicAppUrl = () => {
  const configuredUrl = import.meta.env.PUBLIC_APP_URL?.trim();
  if (!configuredUrl) {
    if (import.meta.env.PROD) throw new Error('Missing required environment variable: PUBLIC_APP_URL');
    return LOCAL_APP_URL;
  }

  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error('PUBLIC_APP_URL must be a valid absolute URL.');
  }

  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('PUBLIC_APP_URL must contain only the application origin.');
  }
  if (import.meta.env.PROD && url.protocol !== 'https:') {
    throw new Error('PUBLIC_APP_URL must use HTTPS in production.');
  }

  return url.origin;
};
