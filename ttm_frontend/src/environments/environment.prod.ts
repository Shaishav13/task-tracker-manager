export const environment = {
  production: true,
  apiUrl: (typeof window !== 'undefined' && (window as any)?.__env?.apiUrl) || 'http://localhost:3000',
  analyticsUrl: (typeof window !== 'undefined' && (window as any)?.__env?.analyticsUrl) || 'http://localhost:8000',
};
