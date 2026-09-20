export interface User {
  id: string;
  name: string;
  email: string;
  role: {
    id: string;
    name: string;
  };
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface LoginCredentials {
  email: string;
  password: string;
}